import { structuralECS, type StructuralGraph } from './StructuralGraph.ts';
import { structuralIslands } from './JointConnectivity.ts';
import {supportBalance} from './SupportBalance.ts';

/** Budgeted gravity/load-path solver. All authoritative state remains on the CPU. */
export class IncrementalStressSolver {
    readonly ecs:ReturnType<typeof structuralECS>;
    readonly rank:Int32Array;
    readonly loadN:Float64Array;
    readonly utilization:Float64Array;
    private readonly supports:number[][];
    private readonly dependents:Set<number>[];
    private readonly outgoing:Map<number,number>[];
    private readonly external:Float64Array;
    private readonly pending=new Set<number>();
    private readonly ground=new Set<number>();
    private readonly failed=new Set<number>();
    private topologyChanged=false;
    private batchChanged:Set<number>|null=null;
    beginBatch():void{if(this.batchChanged)throw Error('Nested structural damage batch');this.batchChanged=new Set();}
    endBatch():void{
        const changed=this.batchChanged;if(!changed)throw Error('No structural damage batch');this.batchChanged=null;if(!changed.size)return;
        const region=new Set(changed),queue=[...changed];for(let q=0;q<queue.length;q++)for(const j of this.dependents[queue[q]!]!)if(!region.has(j)){region.add(j);queue.push(j);}
        if(this.topologyChanged)this.connectivity(region);else for(const i of region)this.pending.add(i);
        for(const i of changed)for(const j of this.neighbors(i))this.pending.add(j);
    }
    get hasWork(){return this.pending.size>0||this.topologyChanged;}
    readonly graph:StructuralGraph;
    private readonly onFailure:(indices:number[])=>void;
    constructor(graph:StructuralGraph,onFailure:(indices:number[])=>void){
        this.graph=graph;this.onFailure=onFailure;
        this.ecs=structuralECS(graph);const n=graph.nodes.length;
        this.rank=new Int32Array(n).fill(-1);this.loadN=new Float64Array(n);this.utilization=new Float64Array(n);this.external=new Float64Array(n);
        this.supports=Array.from({length:n},()=>[]);this.dependents=Array.from({length:n},()=>new Set());this.outgoing=Array.from({length:n},()=>new Map());
        for(const binding of graph.supports){const index=graph.nodes.findIndex(node=>node.id===binding.member);if(index>=0)this.ground.add(index);}
        this.connectivity(new Set(graph.nodes.map(n=>n.index)));
        graph.nodes.forEach(node=>this.pending.add(node.index));
    }
    private neighbors(index:number):number[]{
        const result:number[]=[];for(let i=this.graph.adjacency.offsets[index]!;i<this.graph.adjacency.offsets[index+1]!;i++){
            const edge=this.graph.edges[this.graph.adjacency.edgeIndices[i]!]!;if(!this.ecs.edge.active[edge.index])continue;
            result.push(edge.nodeA===index?edge.nodeB:edge.nodeA);
        }return result;
    }
    private joint(i:number,j:number){
        for(let k=this.graph.adjacency.offsets[i]!;k<this.graph.adjacency.offsets[i+1]!;k++){
            const edge=this.graph.edges[this.graph.adjacency.edgeIndices[k]!]!;
            if(this.ecs.edge.active[edge.index]&&(edge.nodeA===j||edge.nodeB===j))return edge;
        }
        return undefined;
    }
    private affected(index:number):Set<number>{
        const region=new Set<number>([index]),queue=[index];
        for(let q=0;q<queue.length;q++)for(const j of this.dependents[queue[q]!]!)if(!region.has(j)){region.add(j);queue.push(j);}
        return region;
    }
    damageConnection(index:number,fraction:number):void{
        const edge=this.graph.edges[index];if(!edge||!Number.isFinite(fraction))throw new Error('Invalid joint damage');
        const next=Math.min(1,Math.max(0,fraction));this.ecs.edge.damage[index]=1-next;
        if(next===0){
            const region=new Set([...this.affected(edge.nodeA),...this.affected(edge.nodeB)]);
            this.ecs.edge.active[index]=0;this.topologyChanged=true;this.connectivity(region);
        }else{this.pending.add(edge.nodeA);this.pending.add(edge.nodeB);}
    }
    private connectivity(region:Set<number>):void{
        const queue:number[]=[];
        for(const i of region){this.rank[i]=-1;if(this.ground.has(i)&&this.ecs.node.alive[i]){this.rank[i]=0;queue.push(i);}}
        for(const i of region)if(this.ecs.node.alive[i]&&this.rank[i]!<0){
            const boundaries=this.neighbors(i).filter(j=>!region.has(j)&&this.ecs.node.alive[j]&&this.rank[j]!>=0);
            if(boundaries.length){this.rank[i]=1+Math.min(...boundaries.map(j=>this.rank[j]!));queue.push(i);}
        }
        queue.sort((a,b)=>this.rank[a]!-this.rank[b]!||a-b);
        for(let q=0;q<queue.length;q++)for(const j of this.neighbors(queue[q]!)){
            if(!region.has(j)||!this.ecs.node.alive[j])continue;
            const rank=this.rank[queue[q]!]!+1;if(this.rank[j]!<0||rank<this.rank[j]!){this.rank[j]=rank;queue.push(j);}
        }
        for(const i of region){
            for(const support of this.supports[i]!)this.dependents[support]!.delete(i);
            this.supports[i]=this.neighbors(i).filter(j=>this.ecs.node.alive[j]&&this.rank[j]!>=0&&this.rank[j]!<this.rank[i]!);
            for(const support of this.supports[i]!)this.dependents[support]!.add(i);
            this.pending.add(i);
        }
    }
    setRemaining(index:number,fraction:number,volumeFraction=fraction):void{
        if(!this.graph.nodes[index]||!Number.isFinite(fraction)||!Number.isFinite(volumeFraction))throw new Error('Invalid member damage');
        const next=Math.min(1,Math.max(0,fraction)),old=1-this.ecs.node.damage[index]!;
        const volume=Math.min(1,Math.max(0,volumeFraction))*this.ecs.node.volume[index]!;
        if(Math.abs(next-old)<1e-6&&Math.abs(volume-this.ecs.node.remainingVolume[index]!)<1e-6)return;
        this.ecs.node.damage[index]=1-next;this.ecs.node.remainingVolume[index]=volume;
        this.ecs.node.alive[index]=next>0?1:0;
        if(next>0)this.failed.delete(index);
        if(this.batchChanged){this.batchChanged.add(index);if(!next)this.topologyChanged=true;return;}
        const region=this.affected(index);
        if(!next){this.topologyChanged=true;this.connectivity(region);}else for(const i of region)this.pending.add(i);
        for(const i of this.neighbors(index))this.pending.add(i);
    }
    setExternalLoad(index:number,massKg:number):void{const value=Math.max(0,massKg)*9.81;if(Math.abs(value-this.external[index]!)>.01){this.external[index]=value;this.pending.add(index);}}
    setWorldSupport(index:number,active:boolean):void{
        active?this.ground.add(index):this.ground.delete(index);
        this.topologyChanged=true;
        this.connectivity(this.affected(index));
    }
    step(budgetMs=1.5):{processed:number;pending:number;failed:number[]}{
        const start=performance.now(),failed:number[]=[];let processed=0;
        if(this.topologyChanged){
            this.topologyChanged=false;
            const detached=structuralIslands(this.graph,this.ecs.node.alive,this.ecs.edge.active,this.ground).filter(island=>!island.grounded).flatMap(island=>island.members);
            // Union-find has already identified the entire disconnected island.
            // Removing its members one-by-one repeats connectivity over the same
            // large tower thousands of times. Apply this topology revision once.
            const region=new Set<number>();
            for(const i of detached)if(!this.failed.has(i)){this.failed.add(i);failed.push(i);region.add(i);this.ecs.node.damage[i]=1;this.ecs.node.remainingVolume[i]=0;this.ecs.node.alive[i]=0;}
            if(region.size)this.connectivity(region);
            this.topologyChanged=false;
        }
        // Each revision is consumed in top-down order. No scan of unaffected buildings.
        const ordered=[...this.pending].sort((a,b)=>this.rank[b]!-this.rank[a]!||a-b);
        for(const i of ordered){
            if(processed&&performance.now()-start>=budgetMs)break;this.pending.delete(i);processed++;
            const member=this.graph.nodes[i]!,remaining=1-this.ecs.node.damage[i]!;
            let load=this.ecs.node.alive[i]?member.massKg*this.ecs.node.remainingVolume[i]!/this.ecs.node.volume[i]!*9.81+this.external[i]!:0;
            let momentX=load*member.positionM[0],momentZ=load*member.positionM[2];
            if(this.ecs.node.alive[i])for(const j of this.dependents[i]!)if(this.ecs.node.alive[j]){const incoming=this.outgoing[j]!.get(i)||0;load+=incoming;momentX+=incoming*this.graph.nodes[j]!.positionM[0];momentZ+=incoming*this.graph.nodes[j]!.positionM[2];}
            this.loadN[i]=load;
            const supports=!this.ecs.node.alive[i]||this.ground.has(i)?[]:this.supports[i]!.filter(j=>this.ecs.node.alive[j]&&this.rank[j]!>=0);
            if(load>0&&supports.length&&member.dimensionsM[1]<Math.max(member.dimensionsM[0],member.dimensionsM[2])*.4){
                const bearings=supports.filter(j=>this.graph.nodes[j]!.positionM[1]<member.positionM[1]-.01);
                const patches=bearings.map(j=>{const b=this.graph.nodes[j]!;return {minX:Math.max(member.positionM[0]-member.dimensionsM[0]/2,b.positionM[0]-b.dimensionsM[0]/2),maxX:Math.min(member.positionM[0]+member.dimensionsM[0]/2,b.positionM[0]+b.dimensionsM[0]/2),minZ:Math.max(member.positionM[2]-member.dimensionsM[2]/2,b.positionM[2]-b.dimensionsM[2]/2),maxZ:Math.min(member.positionM[2]+member.dimensionsM[2]/2,b.positionM[2]+b.dimensionsM[2]/2)};}).filter(p=>p.maxX>=p.minX&&p.maxZ>=p.minZ);
                if(patches.length){const balance=supportBalance([momentX/load,momentZ/load],load,patches),neighbors=this.neighbors(i).filter(j=>this.ecs.node.alive[j]);
                    const resistance=neighbors.reduce((sum,j)=>{const e=this.joint(i,j);return sum+(e?.momentCapacityNm||0)*(1-this.ecs.edge.damage[e?.index??0]!)*remaining;},0);
                    if(!balance.supported&&balance.momentNm>resistance){for(const j of neighbors){const e=this.joint(i,j);if(e)this.damageConnection(e.index,0);}}
                }
            }
            const old=this.outgoing[i]!,next=new Map<number,number>();
            const weight=(j:number)=>{const edge=this.joint(i,j);return Math.max(.001,(edge?.normalStiffnessNm||1)*(1-this.ecs.node.damage[j]!)*(1-this.ecs.edge.damage[edge?.index??0]!));};
            const total=supports.reduce((sum,j)=>sum+weight(j),0);
            for(const j of supports)next.set(j,load*weight(j)/total);
            for(const j of new Set([...old.keys(),...next.keys()]))if(Math.abs((old.get(j)||0)-(next.get(j)||0))>.01)this.pending.add(j);
            this.outgoing[i]=next;
            const area=Math.max(.0001,member.section.areaM2*remaining),compression=load/(member.strength.compressivePa*area);
            const span=Math.max(...member.dimensionsM),rebar=member.reinforcement;
            const steelMoment=rebar?Math.min(rebar.steelAreaM2*rebar.yieldPa,rebar.embedLengthM*rebar.bondPerimeterM*rebar.bondPa)*Math.min(...member.dimensionsM)*.8:0;
            const bendingCapacity=member.strength.tensilePa*Math.max(member.section.iyM4,member.section.izM4)/Math.max(.01,Math.min(...member.dimensionsM)/2)+steelMoment;
            const moment=member.kind==='beam'||member.kind==='slab'?load*span/(supports.length>1?8:2):0;
            let ratio=Math.max(compression,moment/Math.max(1,bendingCapacity*remaining));
            for(const j of supports){
                const edge=this.joint(i,j);
                if(!edge)continue;
                const force=next.get(j)||0,vertical=member.positionM[1]-this.graph.nodes[j]!.positionM[1]>.01;
                this.ecs.edge.normalForce[edge.index]=vertical?force:0;this.ecs.edge.shearForce[edge.index]=vertical?0:force;
                const connectionRemaining=1-this.ecs.edge.damage[edge.index]!;
                const capacity=vertical?edge.compressionCapacityN:edge.kind==='resting'?edge.friction*(edge.preloadN+this.ecs.edge.normalForce[edge.index]!):edge.shearCapacityN;
                if(force>Math.max(1,capacity*connectionRemaining))this.damageConnection(edge.index,0);
            }
            this.utilization[i]=ratio;
            if(this.ecs.node.alive[i]&&(this.rank[i]!<0||ratio>1)&&!this.failed.has(i)){
                this.failed.add(i);failed.push(i);this.setRemaining(i,0);
            }
        }
        if(failed.length)this.onFailure(failed);
        return{processed,pending:this.pending.size,failed};
    }
}
