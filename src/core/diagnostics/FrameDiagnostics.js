export const FRAME_BUDGET = Object.freeze({target:1000/60,p95:20,p99:33.4,hitch:50});
export const SYSTEM_BUDGETS = Object.freeze({Input:.3,Simulation:6,Physics:3,FixedSimulation:1,Player:1,World:1.5,Memory:.2,Effects:1,ALife:1,Viewmodel:.5,Audio:.5,Render:8});
const finite = value => Number.isFinite(value) && value >= 0 ? value : 0;
/** Typed frame ring; bounded hitch and one-second logs. Percentiles/export are slow paths. */
export class FrameDiagnostics {
    constructor(capacity=1800,windowSize=600){
        this.capacity=capacity;this.windowSize=Math.min(windowSize,capacity);this.intervals=new Float64Array(capacity);this.cpu=new Float64Array(capacity);this.times=new Float64Array(capacity);this.write=0;this.count=0;this.total=0;this.hitches=0;this.spikes=[];this.log=[];this.lastLog=-Infinity;this.lastSample=null;
    }
    push(interval,cpu,now,systems){
        if(!Number.isFinite(interval)||interval<=0||!Number.isFinite(now))return;
        const i=this.write;this.intervals[i]=interval;this.cpu[i]=finite(cpu);this.times[i]=now;this.write=(i+1)%this.capacity;this.count=Math.min(this.capacity,this.count+1);this.total++;this.lastSample=now;
        if(interval>=FRAME_BUDGET.hitch){
            this.hitches++;let top='unattributed',cost=0;
            for(const [name,ms] of systems||[])if(name!=='Simulation'&&name in SYSTEM_BUDGETS&&ms>cost){top=name;cost=ms;}
            this.spikes.push({atMs:now,intervalMs:interval,cpuMs:finite(cpu),largestCpuSection:top,sectionMs:finite(cost)});if(this.spikes.length>32)this.spikes.shift();
        }
        if(now-this.lastLog>=1000){this.lastLog=now;const sections={};for(const [name,ms] of systems||[])if(name in SYSTEM_BUDGETS)sections[name]=finite(ms);this.log.push({atMs:now,intervalMs:interval,cpuMs:finite(cpu),sections});if(this.log.length>60)this.log.shift();}
    }
    stats(){
        const n=Math.min(this.count,this.windowSize),values=new Array(n);let sum=0,cpu=0,hitches=0;
        for(let j=0;j<n;j++){const i=(this.write-1-j+this.capacity)%this.capacity,v=this.intervals[i];values[j]=v;sum+=v;cpu+=this.cpu[i];if(v>=FRAME_BUDGET.hitch)hitches++;}values.sort((a,b)=>a-b);
        const percentile=p=>values[Math.max(0,Math.ceil(n*p)-1)]||0,avg=n?sum/n:0;
        return {fps:avg?1000/avg:0,avg,p95:percentile(.95),p99:percentile(.99),cpuAvg:n?cpu/n:0,count:n,hitches,totalHitches:this.hitches,totalFrames:this.total};
    }
    health(pressure='normal'){
        const s=this.stats();if(s.count<120)return {state:'waiting',text:'Play for a few seconds to measure performance.'};
        if(pressure==='critical'||s.avg>25||s.p95>33.4||s.p99>50)return {state:'poor',text:'Performance is strained. Try Auto Quality or a lower graphics preset.'};
        if(pressure==='high'||s.avg>17.5||s.p95>20||s.p99>33.4)return {state:'caution',text:'Some uneven frames or memory pressure. Auto Quality may help.'};
        return {state:'good',text:'Recent gameplay is running smoothly.'};
    }
    report(game,now=performance.now()){
        const memory=game.memorySystem?.snapshot||{},render=game.renderer?.info?.render||{},samples=[];
        for(let j=this.count;j>0;j--){const i=(this.write-j+this.capacity)%this.capacity;samples.push([this.times[i],this.intervals[i],this.cpu[i]]);}
        const memoryBytes={};for(const key of ['textureBytes','geometryBytes','appPrivateBytes','workingSetBytes','audioBytes','saveCacheBytes'])memoryBytes[key]=Number.isFinite(memory[key])?memory[key]:null;
        return {schema:1,game:'Dark Rain',metric:'requestAnimationFrame start intervals; CPU submission time is not GPU time',capturedAt:new Date().toISOString(),backend:['WebGPU','WebGL2'].includes(game.renderer?.backendName)?game.renderer.backendName:'unknown',quality:['low','medium','high','ultra'].includes(game.settings?.quality)?game.settings.quality:'unknown',renderScale:finite(game._autoQuality?.effRenderScale),sampleAgeMs:this.lastSample===null?null:Math.max(0,now-this.lastSample),budgets:FRAME_BUDGET,stats:this.stats(),health:this.health(memory.pressure),renderer:{drawCalls:finite(render.drawCalls??render.calls),triangles:finite(render.triangles)},memory:{...memoryBytes,jsHeapBytes:Number.isFinite(globalThis.performance?.memory?.usedJSHeapSize)?globalThis.performance.memory.usedJSHeapSize:null,graphicsBytesAreEstimates:true},startup:game.startup?.snapshot?.()||null,input:game.inputManager?.diagnosticSnapshot?.()||null,columns:['atMs','intervalMs','cpuSubmissionMs'],samples,sections:this.log.slice(),spikes:this.spikes.slice()};
    }
}
