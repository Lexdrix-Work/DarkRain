import { compileStructuralGraph } from './StructuralGraph.ts';

/** Compatibility compiler for procedural wall sections; authored members use the typed schema directly. */
export function compileGeneratedGraph(id,cells,adjacency){
    const indices=new Map(cells.map((c,i)=>[c,i])),members=cells.map((c,i)=>{
        const p=c.pane,s=p.size;
        return{id:'section:'+String(i).padStart(6,'0'),kind:'wall',material:p.density<1100?'wood':p.density>2800?'steel':'concrete',positionM:p.localPosition.toArray(),rotation:p.quaternion.toArray(),dimensionsM:s.toArray(),massKg:s.x*s.y*s.z*p.density,section:{areaM2:Math.max(.035,s.x*s.z),iyM4:s.z*s.x**3/12,izM4:s.x*s.z**3/12,jM4:(s.z*s.x**3+s.x*s.z**3)/12,spanAxisLocal:[0,1,0]},ports:[]};
    }),joints=[],supports=[];
    for(let i=0;i<cells.length;i++){
        const c=cells[i],m=members[i];
        if(c.pane.anchor){m.ports.push({id:'foundation',positionLocalM:[0,-c.pane.size.y/2,0],normalLocal:[0,1,0],tangentLocal:[1,0,0],contactAreaM2:m.section.areaM2,allowedJoints:['embedded']});supports.push({id:'base:'+i,member:m.id,port:'foundation',supportVolumeId:'terrain:'+id+':'+i,kind:'embedded',areaM2:m.section.areaM2,friction:.7,constrainedDofs:63,contactToleranceM:.08});}
        for(const other of adjacency.get(c)||[]){const j=indices.get(other);if(j<=i)continue;
            const n=members[j],port='connection:'+i+':'+j,p=m.positionM.map((v,k)=>(v+n.positionM[k])/2);
            for(const member of [m,n])member.ports.push({id:port,positionLocalM:p.map((v,k)=>v-member.positionM[k]),normalLocal:[0,1,0],tangentLocal:[1,0,0],contactAreaM2:Math.min(m.section.areaM2,n.section.areaM2),allowedJoints:['embedded']});
            const area=Math.min(m.section.areaM2,n.section.areaM2),capacity=Math.min(c.pane.capacity,other.pane.capacity)*9.81*area;
            joints.push({id:port,kind:'embedded',a:{member:m.id,port},b:{member:n.id,port},normalStiffnessNm:1e8*area,tangentStiffnessNm:4e7*area,rotationStiffnessNmRad:1e5*area,compressionCapacityN:capacity,tensionCapacityN:capacity*.12,shearCapacityN:capacity*.2,momentCapacityNm:capacity*.1,friction:.6,preloadN:0,separationToleranceM:.08});
        }
    }
    // Existing procedural sections are axis-aligned except roofs: their port positions
    // are in building space, so use an identity port frame in this compatibility model.
    for(const member of members)member.rotation=[0,0,0,1];
    const graph=compileStructuralGraph({id,revision:1,members,joints,supports});
    graph.nodes.forEach((node,i)=>{node.strength.compressivePa=cells[i].pane.capacity*9.81;});
    return graph;
}
