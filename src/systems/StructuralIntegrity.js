import {globalEventBus} from '../core/EventBus.js';
import { compileGeneratedGraph } from './destruction/GeneratedGraph.js';
import { IncrementalStressSolver } from './destruction/IncrementalStress.ts';
/** Cell support graph with approximate gravity loads, not an engineering FEM solver. */
export function evaluateStructure(cells,externalLoads=[],adjacency) {
    const live=cells.filter(c=>!c.pane.broken),links=adjacency||new Map(cells.map(c=>[c,[]]));
    const spatial=new Map(),stride=1.5;
    if(!adjacency)for(const cell of cells){const p=cell.pane.localPosition,key=[p.x,p.y,p.z].map(v=>Math.floor(v/stride)).join(',');let bucket=spatial.get(key);if(!bucket){bucket=[];spatial.set(key,bucket);}bucket.push(cell);}
    if(!adjacency)for(let i=0;i<cells.length;i++) {
        const a=cells[i].pane,origin=[a.localPosition.x,a.localPosition.y,a.localPosition.z].map(v=>Math.floor(v/stride));
        const candidates=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)candidates.push(...(spatial.get([origin[0]+x,origin[1]+y,origin[2]+z].join(','))||[]));
        for(const other of candidates){if(other===cells[i]||links.get(cells[i]).includes(other))continue;const b=other.pane;
        const p=a.localPosition,q=b.localPosition,s=a.supportSize||a.size,t=b.supportSize||b.size;
        const gaps=[Math.abs(p.x-q.x)-(s.x+t.x)/2,Math.abs(p.y-q.y)-(s.y+t.y)/2,Math.abs(p.z-q.z)-(s.z+t.z)/2];
        if(gaps.every(v=>v<.075)&&gaps.filter(v=>v>-.025).length<=1){links.get(cells[i]).push(other);links.get(other).push(cells[i]);}}
    }
    const rank=new Map(),queue=[];
    for(const cell of live)if(cell.pane.anchor&&cell.pane.health>0){rank.set(cell,0);queue.push(cell);}
    for(let i=0;i<queue.length;i++){const a=queue[i];for(const b of links.get(a))if(!b.pane.broken&&b.pane.health>0&&!rank.has(b)){rank.set(b,rank.get(a)+1);queue.push(b);}}
    const unsupported=live.filter(c=>!rank.has(c)),load=new Map(live.map(c=>[c,c.pane.size.x*c.pane.size.y*c.pane.size.z*c.pane.density]));
    for(const {position,mass}of externalLoads) {
        const bearing=live.filter(({pane:p})=>Math.abs(position.x-p.position.x)<p.size.x/2+.1&&Math.abs(position.z-p.position.z)<p.size.z/2+.1&&position.y>=p.position.y&&position.y-p.position.y-p.size.y/2<.35).sort((a,b)=>b.pane.position.y-a.pane.position.y)[0];
        if(bearing)load.set(bearing,load.get(bearing)+mass);
    }
    const overstressed=[];
    for(const cell of [...queue].reverse()) {
        const p=cell.pane,weight=load.get(cell),supports=links.get(cell).filter(c=>rank.get(c)<rank.get(cell));
        const vertical=supports.filter(c=>c.pane.localPosition.y<p.localPosition.y-.05),bearing=vertical.length?vertical:supports;
        const area=Math.max(.035,p.size.x*p.size.z),remaining=Math.max(.2,p.health/p.maxHealth);
        const capacity=p.capacity*area*remaining*(vertical.length?1:.075);
        cell.stress=weight/Math.max(1,capacity);
        if(!p.anchor&&cell.stress>1)overstressed.push(cell);
        for(const support of bearing)load.set(support,load.get(support)+weight/bearing.length);
    }
    return {unsupported,overstressed,adjacency:links};
}

export class StructuralIntegrity {
    constructor(physics){this.physics=physics;this.groups=new Map();this.pending=new Set();this.urgent=new Set();this.cache=new Map();this.solvers=new Map();this.detached=[];this.queued=new Set();this.promotionQueues=new Map();this.promotionOwners=[];this.promotionCursor=0;this.loadTimer=0;}
    queue(cell){if(!cell.pane.broken&&!this.queued.has(cell)){this.queued.add(cell);this.detached.push(cell);const id=cell.mesh.userData.structureId;let queue=this.promotionQueues.get(id);if(!queue){queue={cells:[],head:0};this.promotionQueues.set(id,queue);this.promotionOwners.push(id);}queue.cells.push(cell);}}
    rebuild(){this.groups.clear();this.pending.clear();this.urgent.clear();this.cache.clear();this.solvers.clear();this.detached=[];this.queued.clear();this.promotionQueues.clear();this.promotionOwners.length=0;this.promotionCursor=0;for(const mesh of this.physics.panes.keys())if(mesh.userData.structureId&&!mesh.userData.damageOwned){let cells=this.groups.get(mesh.userData.structureId);if(!cells){cells=[];this.groups.set(mesh.userData.structureId,cells);}mesh.userData.panes.forEach((pane,index)=>cells.push({mesh,pane,index}));}}
    damage(mesh){if(mesh.userData.structureId)this.urgent.add(mesh.userData.structureId);}
    contactForce(mesh,record,force,dt){
        const id=mesh.userData.structureId;if(!id)return;
        this.pending.add(id);
        // Contacts trigger a cached support-load check. Actual collision impulse can
        // also damage the nearest member; ordinary static weight is not fatigue.
        let cell=null,best=Infinity;for(const p of mesh.userData.panes){if(p.broken)continue;const distance=p.position.distanceToSquared(record.mesh.position);if(distance<best){best=distance;cell=p;}}
        if(!cell)return;
        const area=Math.max(.035,cell.size.x*cell.size.z),limit=cell.capacity*9.81*area;
        if(force>limit){cell.health=Math.max(0,cell.health-(force-limit)*dt/Math.max(1,limit)*cell.maxHealth);this.urgent.add(id);}
    }
    update(dt){
        const id=this.urgent.values().next().value||this.pending.values().next().value;
        if(id){this.pending.delete(id);this.urgent.delete(id);const cells=this.groups.get(id)||[];
            let solver=this.solvers.get(id);
            if(!solver){const adjacency=evaluateStructure(cells).adjacency;this.cache.set(id,adjacency);solver=new IncrementalStressSolver(compileGeneratedGraph(id,cells,adjacency),indices=>{for(const i of indices)this.queue(cells[i]);});this.solvers.set(id,solver);}
            solver.beginBatch();
            for(let i=0;i<cells.length;i++){const p=cells[i].pane;if(!p.broken&&(p.health<=0||p.pendingColliderDisabled))this.queue(cells[i]);const strength=p.broken||p.pendingColliderDisabled?0:Math.max(0,p.health/p.maxHealth),volume=p.fragmented?p.fragmented.pieces.reduce((sum,part)=>sum+(part.broken?0:part.volume),0)/(p.size.x*p.size.y*p.size.z):1;solver.setRemaining(i,strength,p.broken||p.pendingColliderDisabled?0:volume);}
            solver.endBatch();
            const loads=new Map();for(const r of this.physics.dynamic.values()){
                if(!['prop','structural','wall-chip','model-fragment','city-fitting'].includes(r.kind))continue;
                const bottom=r.body.translation().y-(r.boundsSize||r.size).y/2;
                const i=cells.findIndex(({pane:p})=>!p.broken&&Math.abs(r.mesh.position.x-p.position.x)<p.size.x/2+.1&&Math.abs(r.mesh.position.z-p.position.z)<p.size.z/2+.1&&bottom>=p.position.y&&bottom-p.position.y-p.size.y/2<.35);
                if(i>=0)loads.set(i,(loads.get(i)||0)+r.body.mass());
            }
            for(let i=0;i<cells.length;i++)solver.setExternalLoad(i,loads.get(i)||0);
        }
        const start=performance.now();for(const solver of this.solvers.values()){
            if(!solver.hasWork)continue;
            const left=1.5-(performance.now()-start);if(left<=0)break;solver.step(left);
        }
        const failed=this.detached;
        const meshes=new Set();
        // Promote connected unsupported sections together. The retained compound
        // replaces all their source instances in the same update; no body cap
        // can leave the upper floors suspended while lower cells trickle out.
        if(this.physics.islands)for(const [owner,queue]of this.promotionQueues){
            const selected=new Set(queue.cells.slice(queue.head).filter(c=>this.queued.has(c)&&!c.pane.broken&&!c.pane.fragmented&&c.pane.health>0));
            const adjacency=this.cache.get(owner);
            while(selected.size){const first=selected.values().next().value,component=[first];selected.delete(first);
                for(let i=0;i<component.length;i++)for(const next of adjacency?.get(component[i])||[])if(selected.delete(next))component.push(next);
                if(component.length<2)continue;
                this.physics.islands.promote(component);for(const cell of component){this.queued.delete(cell);meshes.add(cell.mesh);}
            }
        }
        // Queued unsupported visuals cannot keep acting as invisible scaffolding.
        for(const cell of failed)if(!cell.pane.pendingColliderDisabled){cell.pane.pendingColliderDisabled=true;meshes.add(cell.mesh);if(cell.pane.fragmented){for(const p of cell.pane.fragmented.pieces)p.pendingColliderDisabled=true;meshes.add(cell.pane.fragmented.mesh);}}
        // Share available slots across damaged buildings. A tower's thousands
        // of queued members must not keep every later breached house inert.
        for(let attempt=0;attempt<24&&this.promotionOwners.length;attempt++){
            const ownerIndex=this.promotionCursor%this.promotionOwners.length,id=this.promotionOwners[ownerIndex],queue=this.promotionQueues.get(id);this.promotionCursor=ownerIndex+1;
            while(queue.head<queue.cells.length&&!this.queued.has(queue.cells[queue.head]))queue.head++;
            if(queue.head===queue.cells.length){this.promotionQueues.delete(id);this.promotionOwners.splice(ownerIndex,1);this.promotionCursor=ownerIndex;continue;}
            const cell=queue.cells[queue.head];if(!cell.pane.broken&&cell.pane.health<=0&&!cell.pane.fragmented&&cell.mesh.userData.wallSections)this.physics.masonry?.fragment(cell.mesh,cell.index);if(cell.pane.broken||this.physics.collapseCell(cell)){meshes.add(cell.mesh);this.queued.delete(cell);queue.head++;}
        }
        let kept=0;for(const cell of failed)if(this.queued.has(cell))failed[kept++]=cell;failed.length=kept;
        for(const mesh of meshes){this.physics.rebuildSectionCollider(mesh);const id=mesh.userData.structureId,cells=this.groups.get(id);if(cells?.length&&cells.every(c=>c.pane.broken))globalEventBus.emit('destruction:building-collapsed',{id:String(id)});}
    }
}
