import { compileStructuralGraph, type AuthorBuilding, type AuthorMember, type JointKind, type MaterialId, type MemberKind, type Vec3 } from './StructuralGraph.ts';

function building(id:string){
    const author:AuthorBuilding={id,revision:1,members:[],joints:[],supports:[]};
    const byId=new Map<string,AuthorMember>();
    function member(id:string,kind:MemberKind,material:MaterialId,positionM:Vec3,dimensionsM:Vec3){
        const [x,y,z]=dimensionsM;
        const node:AuthorMember={id,kind,material,positionM,dimensionsM,rotation:[0,0,0,1],ports:[],section:{areaM2:x*z,iyM4:z*x**3/12,izM4:x*z**3/12,jM4:(z*x**3+x*z**3)/12,spanAxisLocal:[0,1,0]}};
        if(kind==='beam'||kind==='slab'){
            const length=Math.max(x,z),width=Math.min(x,z);node.section={areaM2:width*y,iyM4:width*y**3/12,izM4:y*width**3/12,jM4:(width*y**3+y*width**3)/12,spanAxisLocal:x>=z?[1,0,0]:[0,0,1]};
        }
        if(material==='reinforced-concrete')node.reinforcement={steelAreaM2:.004,yieldPa:450e6,embedLengthM:.7,bondPerimeterM:.3,bondPa:2e6};
        author.members.push(node);byId.set(id,node);return node;
    }
    function port(id:string,name:string,position:Vec3,kind:JointKind){const n=byId.get(id)!;n.ports.push({id:name,positionLocalM:position.map((v,i)=>v-n.positionM[i]!) as Vec3,normalLocal:[0,1,0],tangentLocal:[1,0,0],contactAreaM2:n.section.areaM2,allowedJoints:[kind]});}
    function connect(a:string,b:string,p:Vec3,kind:JointKind='embedded'){
        const id=a+'--'+b;port(a,id,p,kind);port(b,id,p,kind);const concrete=kind==='embedded';
        author.joints.push({id,kind,a:{member:a,port:id},b:{member:b,port:id},normalStiffnessNm:concrete?5e8:8e6,tangentStiffnessNm:concrete?2e8:3e6,rotationStiffnessNmRad:concrete?4e6:4e3,compressionCapacityN:concrete?3e6:150e3,tensionCapacityN:concrete?150e3:30e3,shearCapacityN:concrete?350e3:25e3,momentCapacityNm:concrete?200e3:3e3,friction:.6,preloadN:0,separationToleranceM:.005});
    }
    function ground(id:string,p:Vec3){port(id,'base',p,'embedded');author.supports.push({id:'foundation:'+id,member:id,port:'base',supportVolumeId:'terrain:'+id,kind:'embedded',areaM2:byId.get(id)!.section.areaM2,friction:.7,constrainedDofs:63,contactToleranceM:.02});}
    return{author,member,connect,ground};
}
export function woodenShack():AuthorBuilding{
    const b=building('example:wooden-shack'),corners:Vec3[]=[[-1.8,0,-1.4],[1.8,0,-1.4],[-1.8,0,1.4],[1.8,0,1.4]];
    corners.forEach(([x,,z],i)=>{b.member('post'+i,'column','wood',[x,1.2,z],[.15,2.4,.15]);b.ground('post'+i,[x,0,z]);});
    const rims=[{id:'rimN',p:[0,2.4,-1.4],s:[3.6,.2,.15],ends:[0,1]},{id:'rimS',p:[0,2.4,1.4],s:[3.6,.2,.15],ends:[2,3]},{id:'rimW',p:[-1.8,2.4,0],s:[.15,.2,2.8],ends:[0,2]},{id:'rimE',p:[1.8,2.4,0],s:[.15,.2,2.8],ends:[1,3]}];
    for(const r of rims){b.member(r.id,'beam','wood',r.p as Vec3,r.s as Vec3);for(const i of r.ends)b.connect(r.id,'post'+i,[corners[i]![0],2.4,corners[i]![2]],'bolted');}
    for(const [i,z] of [-.45,.45].entries()){const id='rafter'+i;b.member(id,'beam','wood',[0,2.5,z],[3.6,.24,.08]);b.connect(id,'rimW',[-1.8,2.5,z],'bolted');b.connect(id,'rimE',[1.8,2.5,z],'bolted');}
    b.member('roof','slab','plywood',[0,2.65,0],[3.9,.06,3.1]);for(const [i,z]of[-.45,.45].entries())b.connect('roof','rafter'+i,[0,2.62,z],'bolted');
    for(const [id,pos,dims,ends]of [['wallN',[0,1.2,-1.4],[3.6,2.4,.018],[0,1]],['wallS',[0,1.2,1.4],[3.6,2.4,.018],[2,3]],['wallW',[-1.8,1.2,0],[.018,2.4,2.8],[0,2]]] as [string,Vec3,Vec3,number[]][]){b.member(id,'wall','plywood',pos,dims);for(const i of ends)b.connect(id,'post'+i,[corners[i]![0],1.2,corners[i]![2]],'bolted');}
    return b.author;
}
export function parkingGarage():AuthorBuilding{
    const b=building('example:parking-garage'),corners:Vec3[]=[[-3,0,-3],[3,0,-3],[-3,0,3],[3,0,3]];
    for(let level=0;level<2;level++){
        const y=(level+1)*3;
        corners.forEach(([x,,z],i)=>{const id='column'+level+'_'+i;b.member(id,'column','reinforced-concrete',[x,y-1.5,z],[.45,3,.45]);if(!level)b.ground(id,[x,0,z]);else b.connect(id,'column0_'+i,[x,3,z]);});
        for(const [side,p,s,ends]of [['N',[0,y-.3,-3],[6,.6,.4],[0,1]],['S',[0,y-.3,3],[6,.6,.4],[2,3]],['W',[-3,y-.3,0],[.4,.6,6],[0,2]],['E',[3,y-.3,0],[.4,.6,6],[1,3]]] as [string,Vec3,Vec3,number[]][]){
            const id='beam'+level+side;b.member(id,'beam','reinforced-concrete',p,s);for(const i of ends)b.connect(id,'column'+level+'_'+i,[corners[i]![0],y,corners[i]![2]]);
        }
        const slab='slab'+level;b.member(slab,'slab','reinforced-concrete',[0,y+.15,0],[6.6,.3,6.6]);for(const [side,x,z]of [['N',0,-3],['S',0,3],['W',-3,0],['E',3,0]] as [string,number,number][])b.connect(slab,'beam'+level+side,[x,y,z]);
    }
    return b.author;
}
export const compileExamples=()=>[woodenShack(),parkingGarage()].map(compileStructuralGraph);
