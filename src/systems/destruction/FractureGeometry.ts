import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

type Point=[number,number];
export interface FracturePiece {geometry:BufferGeometry;size:Vector3;offset:Vector3;volume:number}
export interface GeometryRecord {positions:number[];uv:number[];faces:number[]}

function clip(polygon:Point[],a:number,b:number,c:number):Point[]{
    const output:Point[]=[];
    for(let i=0;i<polygon.length;i++){
        const p=polygon[i]!,q=polygon[(i+1)%polygon.length]!,dp=a*p[0]+b*p[1]-c,dq=a*q[0]+b*q[1]-c;
        if(dp<=1e-9)output.push(p);
        if((dp<0)!==(dq<0)){const t=dp/(dp-dq);output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }return output;
}
function random(seed:number):()=>number{return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function warp([x,y]:Point):Point{
    // Shared coordinates keep adjacent fracture faces connected; outer edges stay fixed.
    const fade=Math.max(0,(.5-Math.abs(x))*(.5-Math.abs(y))*4);
    return[x+Math.sin(x*17+y*11)*.012*fade,y+Math.cos(x*13-y*19)*.012*fade];
}
export function fractureSlab(size:Vector3,count=18,seed=1337,impact?:Vector3,warped=false):FracturePiece[]{
    const axes=[0,1,2].sort((a,b)=>size.getComponent(b)-size.getComponent(a));
    const u=axes[0]!,v=axes[1]!,w=axes[2]!,rng=random(seed),columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns);
    const sites:Point[]=Array.from({length:count},(_,i)=>[(i%columns+.2+rng()*.6)/columns-.5,(Math.floor(i/columns)+.2+rng()*.6)/rows-.5]);
    if(impact){
        // A ring of sites cuts an octagonal plug around the actual strike.
        // Keep the remainder too: every cell is emitted, never subtracted.
        const x=Math.max(-.47,Math.min(.47,impact.getComponent(u)/size.getComponent(u))),y=Math.max(-.47,Math.min(.47,impact.getComponent(v)/size.getComponent(v)));
        const radius=Math.min(.24,size.getComponent(u)*.18,size.getComponent(v)*.18);
        sites[0]=[x,y];
        for(let i=1;i<count;i++){const angle=i<=8?(i-1)*Math.PI*2/8:(i-9)*Math.PI*2/(count-9)+.17,r=i<=8?radius*2:radius*4.5;sites[i]=[x+Math.cos(angle)*r/size.getComponent(u),y+Math.sin(angle)*r/size.getComponent(v)];}
    }
    const pieces:FracturePiece[]=[];
    for(let cell=0;cell<count;cell++){
        let polygon:Point[]=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];const p=sites[cell]!;
        for(let j=0;j<count;j++)if(j!==cell){const q=sites[j]!,a=q[0]-p[0],b=q[1]-p[1],c=(q[0]*q[0]+q[1]*q[1]-p[0]*p[0]-p[1]*p[1])/2;polygon=clip(polygon,a,b,c);}
        if(polygon.length<3)continue;
        const edge:Point[]=[];
        for(let i=0;i<polygon.length;i++){const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!;edge.push(impact||!warped?a:warp(a),impact||!warped?[(a[0]+b[0])/2,(a[1]+b[1])/2]:warp([(a[0]+b[0])/2,(a[1]+b[1])/2]));}
        const minU=Math.min(...edge.map(p=>p[0])),maxU=Math.max(...edge.map(p=>p[0])),minV=Math.min(...edge.map(p=>p[1])),maxV=Math.max(...edge.map(p=>p[1]));
        const offset=new Vector3(),bounds=size.clone();offset.setComponent(u,(minU+maxU)/2*size.getComponent(u));offset.setComponent(v,(minV+maxV)/2*size.getComponent(v));
        bounds.setComponent(u,(maxU-minU)*size.getComponent(u));bounds.setComponent(v,(maxV-minV)*size.getComponent(v));
        const position:number[]=[],uv:number[]=[],faces:number[]=[];
        const point=(p:Point,depth:number)=>{const result=new Vector3();result.setComponent(u,p[0]*size.getComponent(u));result.setComponent(v,p[1]*size.getComponent(v));result.setComponent(w,depth*size.getComponent(w));return result.sub(offset).divide(bounds);};
        const triangle=(a:Vector3,b:Vector3,c:Vector3,interior:number)=>{
            for(const p of [a,b,c]){position.push(...p.toArray());uv.push(p.getComponent(u)+.5,p.getComponent(v)+.5);faces.push(interior);}
        };
        // Edge midpoints can be collinear or slightly warped: their cross product
        // is not a reliable winding test. Use the chosen plane's axis orientation.
        const reverse=new Vector3().setComponent(u,1).cross(new Vector3().setComponent(v,1)).getComponent(w)<0;
        for(let i=1;i<edge.length-1;i++){
            const a=point(edge[0]!,.5),b=point(edge[i]!,.5),c=point(edge[i+1]!,.5);reverse?triangle(a,c,b,0):triangle(a,b,c,0);
            const d=point(edge[0]!,-.5),e=point(edge[i]!,-.5),f=point(edge[i+1]!,-.5);reverse?triangle(d,e,f,0):triangle(d,f,e,0);
        }
        let area=0;
        for(let i=0;i<edge.length;i++){
            const a=edge[i]!,b=edge[(i+1)%edge.length]!;area+=a[0]*b[1]-b[0]*a[1];
            const exterior=(Math.abs(a[0]-.5)<1e-7&&Math.abs(b[0]-.5)<1e-7)||(Math.abs(a[0]+.5)<1e-7&&Math.abs(b[0]+.5)<1e-7)||(Math.abs(a[1]-.5)<1e-7&&Math.abs(b[1]-.5)<1e-7)||(Math.abs(a[1]+.5)<1e-7&&Math.abs(b[1]+.5)<1e-7);
            const p=point(a,-.5),q=point(b,-.5),r=point(b,.5),s=point(a,.5);
            reverse?(triangle(p,r,q,exterior?0:1),triangle(p,s,r,exterior?0:1)):(triangle(p,q,r,exterior?0:1),triangle(p,r,s,exterior?0:1));
        }
        const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(position,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setAttribute('fractureFace',new Float32BufferAttribute(faces,1));geometry.computeVertexNormals();
        const volume=Math.abs(area)/2*size.x*size.y*size.z;geometry.userData.volumeFraction=volume/(bounds.x*bounds.y*bounds.z);
        pieces.push({geometry,size:bounds,offset,volume});
    }return pieces;
}
export function encodeGeometry(geometry:BufferGeometry):GeometryRecord{return{positions:Array.from(geometry.getAttribute('position').array),uv:Array.from(geometry.getAttribute('uv').array),faces:Array.from(geometry.getAttribute('fractureFace')?.array||new Float32Array(geometry.getAttribute('position').count))};}
export function decodeGeometry(record:GeometryRecord):BufferGeometry{
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(record.positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(record.uv,2));geometry.setAttribute('fractureFace',new Float32BufferAttribute(record.faces,1));geometry.computeVertexNormals();return geometry;
}
