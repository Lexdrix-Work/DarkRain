export type Vec3=[number,number,number];
export type Quaternion=[number,number,number,number];
export type MemberKind='beam'|'wall'|'column'|'slab';
export type JointKind='welded'|'bolted'|'resting'|'embedded';
export type MaterialId='wood'|'plywood'|'concrete'|'reinforced-concrete'|'steel'|'brick'|'glass'|'drywall';
export interface StructuralMaterial {
    id:MaterialId;densityKgM3:number;youngPa:number;poisson:number;
    compressivePa:number;tensilePa:number;shearPa:number;fractureEnergyJm2:number;
    grainAxis?:Vec3;transverseYoungPa?:number;
}
export const STRUCTURAL_MATERIALS:Record<MaterialId,StructuralMaterial>={
    wood:{id:'wood',densityKgM3:550,youngPa:11e9,transverseYoungPa:.6e9,poisson:.3,compressivePa:30e6,tensilePa:70e6,shearPa:7e6,fractureEnergyJm2:450,grainAxis:[0,1,0]},
    plywood:{id:'plywood',densityKgM3:600,youngPa:6e9,poisson:.3,compressivePa:20e6,tensilePa:25e6,shearPa:4e6,fractureEnergyJm2:350},
    concrete:{id:'concrete',densityKgM3:2400,youngPa:25e9,poisson:.2,compressivePa:30e6,tensilePa:2.5e6,shearPa:3.5e6,fractureEnergyJm2:120},
    'reinforced-concrete':{id:'reinforced-concrete',densityKgM3:2450,youngPa:25e9,poisson:.2,compressivePa:30e6,tensilePa:2.5e6,shearPa:3.5e6,fractureEnergyJm2:120},
    steel:{id:'steel',densityKgM3:7850,youngPa:200e9,poisson:.3,compressivePa:355e6,tensilePa:355e6,shearPa:205e6,fractureEnergyJm2:25000},
    brick:{id:'brick',densityKgM3:1800,youngPa:10e9,poisson:.2,compressivePa:15e6,tensilePa:.3e6,shearPa:.5e6,fractureEnergyJm2:100},
    glass:{id:'glass',densityKgM3:2500,youngPa:70e9,poisson:.22,compressivePa:350e6,tensilePa:45e6,shearPa:25e6,fractureEnergyJm2:8},
    drywall:{id:'drywall',densityKgM3:700,youngPa:2.5e9,poisson:.25,compressivePa:5e6,tensilePa:.5e6,shearPa:.5e6,fractureEnergyJm2:30},
};
export interface ConnectionPort {
    id:string;positionLocalM:Vec3;normalLocal:Vec3;tangentLocal:Vec3;
    contactAreaM2:number;allowedJoints:JointKind[];
}
export interface Reinforcement {
    steelAreaM2:number;yieldPa:number;embedLengthM:number;bondPerimeterM:number;bondPa:number;
}
export interface AuthorMember {
    id:string;kind:MemberKind;material:MaterialId;positionM:Vec3;rotation:Quaternion;dimensionsM:Vec3;
    volumeM3?:number;massKg?:number;centerOfMassLocalM?:Vec3;
    section:{areaM2:number;iyM4:number;izM4:number;jM4:number;spanAxisLocal:Vec3};
    ports:ConnectionPort[];reinforcement?:Reinforcement;
    renderRef?:string;collisionRef?:string;fractureRef?:string;
    hullVerticesLocalM?:number[];
    parentMemberId?:string;fractureLevel?:number;
}
export interface AuthorJoint {
    id:string;kind:JointKind;a:{member:string;port:string};b:{member:string;port:string};
    normalStiffnessNm:number;tangentStiffnessNm:number;rotationStiffnessNmRad:number;
    compressionCapacityN:number;tensionCapacityN:number;shearCapacityN:number;momentCapacityNm:number;
    friction:number;preloadN:number;separationToleranceM:number;
    boltGroup?:{count:number;diameterM:number;yieldPa:number;patternLocalM:Vec3[]};
    reinforcement?:Reinforcement;
    breakLimits?:{peakN:number;impulseNs:number;energyJ:number;sustainedN:number};
}
export interface WorldSupport {
    id:string;member:string;port:string;supportVolumeId:string;kind:'resting'|'embedded';
    areaM2:number;friction:number;constrainedDofs:number;contactToleranceM:number;
}
export interface AuthorBuilding {id:string;revision:number;members:AuthorMember[];joints:AuthorJoint[];supports:WorldSupport[]}
export interface GraphMember extends AuthorMember {
    index:number;volumeM3:number;massKg:number;centerOfMassLocalM:Vec3;
    inertiaKgM2:[number,number,number,number,number,number];
    strength:{compressivePa:number;tensilePa:number;shearPa:number};
    body:{shardId:string;initialType:'fixed';collider:{kind:'convexHull';verticesLocalM:number[]}};
}
export interface GraphJoint extends AuthorJoint {
    index:number;nodeA:number;nodeB:number;connectionPointM:Vec3;
    transfer:{compression:boolean;tension:boolean;shear:'bonded'|'friction';moment:boolean;canSeparate:boolean};
}
export interface StructuralGraph {
    format:'darkrain-structure';schemaVersion:1;id:string;revision:number;
    units:{length:'m';mass:'kg';force:'N';stress:'Pa';moment:'Nm'};
    coordinateSpace:'building-local-y-up';materials:StructuralMaterial[];
    nodes:GraphMember[];edges:GraphJoint[];supports:WorldSupport[];
    adjacency:{offsets:number[];edgeIndices:number[]};
}
function finite(value:number,label:string){if(!Number.isFinite(value)||value<0)throw new Error('Invalid '+label);}
function portPosition(member:AuthorMember,port:ConnectionPort):Vec3{
    const[x,y,z,w]=member.rotation,[px,py,pz]=port.positionLocalM;
    const tx=2*(y*pz-z*py),ty=2*(z*px-x*pz),tz=2*(x*py-y*px);
    return[member.positionM[0]+px+w*tx+y*tz-z*ty,member.positionM[1]+py+w*ty+z*tx-x*tz,member.positionM[2]+pz+w*tz+x*ty-y*tx];
}
export function compileStructuralGraph(author:AuthorBuilding):StructuralGraph{
    const ids=new Set<string>();
    const nodes:GraphMember[]=[...author.members].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map((member,index)=>{
        if(ids.has(member.id))throw new Error('Duplicate member '+member.id);ids.add(member.id);
        const material=STRUCTURAL_MATERIALS[member.material];if(!material)throw new Error('Unknown structural material');
        member.dimensionsM.forEach(value=>{finite(value,'member size');if(value===0)throw new Error('Zero member size');});
        if(Math.abs(member.rotation.reduce((s,v)=>s+v*v,0)-1)>1e-5)throw new Error('Invalid member rotation');
        const[x,y,z]=member.dimensionsM,volume=member.volumeM3??x*y*z,mass=member.massKg??volume*material.densityKgM3;finite(mass,'mass');finite(volume,'volume');
        const ports=new Set<string>();for(const port of member.ports){if(ports.has(port.id))throw new Error('Duplicate port');ports.add(port.id);finite(port.contactAreaM2,'contact area');}
        const vertices=member.hullVerticesLocalM??[-1,1].flatMap(a=>[-1,1].flatMap(b=>[-1,1].flatMap(c=>[a*x/2,b*y/2,c*z/2])));
        if(vertices.length<12||vertices.length%3||vertices.some(v=>!Number.isFinite(v)))throw new Error('Invalid convex-hull vertices');
        return{...member,index,volumeM3:volume,massKg:mass,centerOfMassLocalM:member.centerOfMassLocalM??[0,0,0],inertiaKgM2:[mass*(y*y+z*z)/12,mass*(x*x+z*z)/12,mass*(x*x+y*y)/12,0,0,0],strength:{compressivePa:material.compressivePa,tensilePa:material.tensilePa,shearPa:material.shearPa},body:{shardId:author.id+':'+member.id,initialType:'fixed',collider:{kind:'convexHull',verticesLocalM:vertices}}};
    });
    const byId=new Map(nodes.map(node=>[node.id,node]));
    const edges:GraphJoint[]=[...author.joints].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map((joint,index)=>{
        const a=byId.get(joint.a.member),b=byId.get(joint.b.member),pa=a?.ports.find(p=>p.id===joint.a.port),pb=b?.ports.find(p=>p.id===joint.b.port);
        if(!a||!b||!pa||!pb||a===b)throw new Error('Invalid joint '+joint.id);
        if(!pa.allowedJoints.includes(joint.kind)||!pb.allowedJoints.includes(joint.kind))throw new Error('Incompatible joint port');
        const p=portPosition(a,pa),q=portPosition(b,pb);if(Math.hypot(...p.map((v,i)=>v-q[i]!))>Math.max(.03,joint.separationToleranceM))throw new Error('Disconnected authored joint '+joint.id);
        for(const key of ['normalStiffnessNm','tangentStiffnessNm','rotationStiffnessNmRad','compressionCapacityN','tensionCapacityN','shearCapacityN','momentCapacityNm','friction','preloadN','separationToleranceM'] as const)finite(joint[key],key);
        if(joint.kind==='resting'&&(joint.tensionCapacityN!==0||joint.momentCapacityNm!==0))throw new Error('Resting joint cannot carry tension or bonded moment');
        return{...joint,index,nodeA:a.index,nodeB:b.index,connectionPointM:p,transfer:{compression:true,tension:joint.kind!=='resting'&&joint.tensionCapacityN>0,shear:joint.kind==='resting'?'friction':'bonded',moment:joint.kind!=='resting'&&joint.momentCapacityNm>0,canSeparate:joint.kind==='resting'}};
    });
    for(const support of author.supports){const node=byId.get(support.member);if(!node?.ports.some(p=>p.id===support.port)||!support.supportVolumeId)throw new Error('Invalid world support '+support.id);}
    const buckets:number[][]=nodes.map(()=>[]),edgeIds=new Set<string>();
    for(const edge of edges){if(edgeIds.has(edge.id))throw new Error('Duplicate joint '+edge.id);edgeIds.add(edge.id);buckets[edge.nodeA]!.push(edge.index);buckets[edge.nodeB]!.push(edge.index);}
    const offsets=[0],edgeIndices:number[]=[];
    for(const bucket of buckets){edgeIndices.push(...bucket);offsets.push(edgeIndices.length);}
    return{format:'darkrain-structure',schemaVersion:1,id:author.id,revision:author.revision,units:{length:'m',mass:'kg',force:'N',stress:'Pa',moment:'Nm'},coordinateSpace:'building-local-y-up',materials:[...new Set(nodes.map(n=>n.material))].map(id=>STRUCTURAL_MATERIALS[id]),nodes,edges,supports:author.supports,adjacency:{offsets,edgeIndices}};
}
export function structuralECS(graph:StructuralGraph){
    const n=graph.nodes.length,e=graph.edges.length,materials=graph.materials.map(m=>m.id);
    const node={generation:new Uint32Array(n).fill(1),kind:new Uint8Array(n),material:new Uint16Array(n),mass:new Float64Array(n),volume:new Float64Array(n),remainingVolume:new Float64Array(n),compression:new Float64Array(n),tension:new Float64Array(n),shear:new Float64Array(n),position:new Float64Array(n*3),rotation:new Float64Array(n*4),inertia:new Float64Array(n*6),damage:new Float32Array(n),alive:new Uint8Array(n).fill(1)};
    const edge={a:new Uint32Array(e),b:new Uint32Array(e),kind:new Uint8Array(e),normalK:new Float64Array(e),tangentK:new Float64Array(e),rotationK:new Float64Array(e),compression:new Float64Array(e),tension:new Float64Array(e),shear:new Float64Array(e),moment:new Float64Array(e),damage:new Float32Array(e),normalForce:new Float64Array(e),shearForce:new Float64Array(e),momentDemand:new Float64Array(e),active:new Uint8Array(e).fill(1)};
    for(const v of graph.nodes){const i=v.index;node.kind[i]=['beam','wall','column','slab'].indexOf(v.kind);node.material[i]=materials.indexOf(v.material);node.mass[i]=v.massKg;node.volume[i]=node.remainingVolume[i]=v.volumeM3;node.compression[i]=v.strength.compressivePa;node.tension[i]=v.strength.tensilePa;node.shear[i]=v.strength.shearPa;node.position.set(v.positionM,i*3);node.rotation.set(v.rotation,i*4);node.inertia.set(v.inertiaKgM2,i*6);}
    for(const v of graph.edges){const i=v.index;edge.a[i]=v.nodeA;edge.b[i]=v.nodeB;edge.kind[i]=['welded','bolted','resting','embedded'].indexOf(v.kind);edge.normalK[i]=v.normalStiffnessNm;edge.tangentK[i]=v.tangentStiffnessNm;edge.rotationK[i]=v.rotationStiffnessNmRad;edge.compression[i]=v.compressionCapacityN;edge.tension[i]=v.tensionCapacityN;edge.shear[i]=v.shearCapacityN;edge.moment[i]=v.momentCapacityNm;}
    const physics={bodyHandle:new Float64Array(n).fill(NaN),colliderHandle:new Float64Array(n).fill(NaN),jointHandle:new Float64Array(e).fill(NaN),island:new Uint32Array(n),mode:new Uint8Array(n)};
    return{node,edge,physics,adjacencyOffsets:Uint32Array.from(graph.adjacency.offsets),adjacencyEdges:Uint32Array.from(graph.adjacency.edgeIndices),stableNodeIds:graph.nodes.map(n=>n.id),stableEdgeIds:graph.edges.map(e=>e.id),ports:graph.nodes.map(n=>n.ports),supportBindings:graph.supports,graph};
}
