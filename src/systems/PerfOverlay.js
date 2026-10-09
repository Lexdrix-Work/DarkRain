import {FrameDiagnostics,FRAME_BUDGET,SYSTEM_BUDGETS} from '../core/diagnostics/FrameDiagnostics.js';
const colors={good:'#9fca92',caution:'#efc571',poor:'#ff8e85',waiting:'#b7bdc4'};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const color=(value,budget)=>value>budget*1.5?colors.poor:value>budget?colors.caution:colors.good;
export class PerfOverlay {
    constructor(game){this.game=game;this.visible=false;this.systemTimes=new Map();this.diagnostics=new FrameDiagnostics();this.createElement();this.setupInput();if(globalThis.window?.darkRainDesktop?.perf)this.toggle();}
    createElement(){this.element=document.createElement('div');this.element.id='perf-overlay';this.element.style.cssText='position:fixed;top:10px;right:10px;background:rgba(0,0,0,.9);color:#d8dfda;font:12px/1.5 monospace;padding:12px;border:1px solid #667366;z-index:10000;display:none;min-width:310px;pointer-events:none;max-height:90vh;overflow:hidden';document.body.appendChild(this.element);}
    setupInput(){this.onKey=e=>{if(e.code==='F3'&&!e.repeat&&!this.game.inputManager?.claimsCode(e)){e.preventDefault();this.toggle();}};document.addEventListener('keydown',this.onKey);this.onExport=()=>this.exportReport();document.getElementById('perf-export-btn')?.addEventListener('click',this.onExport);}
    toggle(){this.visible=!this.visible;this.element.style.display=this.visible?'block':'none';}
    beginFrame(now=performance.now()){
        this.diagnostics ||= new FrameDiagnostics();
        const active=(!this.game||this.game.gameState==='playing'&&!this.game.isLoading&&!this.game.isPaused)&&!globalThis.document?.hidden;
        if(active&&this.previousActive&&this.frameStart!==undefined)this.diagnostics.push(now-this.frameStart,this.cpuMs||0,now,this.systemTimes);
        this.previousActive=active;this.frameStart=now;this.systemTimes.clear();
    }
    endFrame(now=performance.now()){
        if(this.frameStart===undefined)return;this.cpuMs=now-this.frameStart;
        if(this.visible&&(this.lastDisplay===undefined||now-this.lastDisplay>=250)){this.lastDisplay=now;this.update();}
        if(this.game&&(this.lastHealth===undefined||now-this.lastHealth>=1000)){this.lastHealth=now;const element=document.getElementById('performance-health');if(element){const health=this.diagnostics.health(this.game.memorySystem?.snapshot?.pressure);const text=(this.previousActive?'':'Last gameplay: ')+health.text;if(element.textContent!==text)element.textContent=text;element.style.color=colors[health.state];}}
    }
    timeSystem(name,fn){const start=performance.now();try{return fn();}finally{this.systemTimes.set(name,(this.systemTimes.get(name)||0)+performance.now()-start);}}
    updateSystem(name,system,deltaTime){const start=performance.now();try{return system?.update(deltaTime);}finally{this.systemTimes.set(name,(this.systemTimes.get(name)||0)+performance.now()-start);}}
    getStats(){return this.diagnostics?.stats()||{fps:0,avg:0,p95:0,p99:0,count:0};}
    update(){
        const s=this.getStats(),game=this.game,info=game.renderer?.info,memory=game.memorySystem?.snapshot;
        let html='<b>PERFORMANCE · F3 to hide</b><div>Gameplay samples only · target 60 FPS</div>';
        html+=`<div>${s.fps.toFixed(1)} FPS · <span style="color:${color(s.avg,17.5)}">${s.avg.toFixed(2)} ms average</span></div><div><span style="color:${color(s.p95,FRAME_BUDGET.p95)}">p95 ${s.p95.toFixed(2)} ms</span> · <span style="color:${color(s.p99,FRAME_BUDGET.p99)}">p99 ${s.p99.toFixed(2)} ms</span></div><div>${s.count} samples · ${s.hitches} hitches ≥50 ms</div><div>CPU submission ${(this.cpuMs||0).toFixed(2)} ms · GPU time unavailable</div>`;
        if(info)html+=`<div>Draw calls ${info.render.drawCalls??info.render.calls??0} · triangles ${(info.render.triangles/1000).toFixed(1)}k</div><div>Geometries ${info.memory.geometries} · textures ${info.memory.textures}</div>`;
        if(memory){const mb=v=>v==null?'unavailable':(v/1048576).toFixed(1)+' MiB';html+=`<div>Textures (estimate) ${mb(memory.textureBytes)}</div><div>Geometry buffers ${mb(memory.geometryBytes)}</div><div>App private RAM ${mb(memory.appPrivateBytes)}</div><div style="color:${colors[memory.pressure==='critical'?'poor':memory.pressure==='high'?'caution':'good']}">Memory pressure: ${escape(memory.pressure)}</div>`;}
        if(performance.memory)html+=`<div>JS heap ${(performance.memory.usedJSHeapSize/1048576).toFixed(1)} MiB</div>`;
        const stream=game.worldManager?.forestStreaming?.stats();if(stream)html+=`<div>Streaming ${stream.resident} ready / ${stream.pending} pending</div><div style="color:${color(stream.commitMs,stream.budgetMs)}">Commit ${stream.commitMs.toFixed(2)} / ${stream.budgetMs} ms (${stream.overruns} overruns)</div>`;
        html+='<div>CPU sections (Simulation includes child sections):</div>';
        for(const [name,ms] of [...this.systemTimes].sort((a,b)=>b[1]-a[1]))html+=`<div style="color:${color(ms,SYSTEM_BUDGETS[name]||2)}">${escape(name)}: ${ms.toFixed(2)} / ${SYSTEM_BUDGETS[name]||2} ms</div>`;
        this.element.innerHTML=html;
    }
    exportReport(){const blob=new Blob([JSON.stringify(this.diagnostics.report(this.game),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Dark-Rain-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    dispose(){document.removeEventListener('keydown',this.onKey);document.getElementById('perf-export-btn')?.removeEventListener('click',this.onExport);this.element?.remove();}
}
