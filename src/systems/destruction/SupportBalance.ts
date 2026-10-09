type Point=[number,number];
export type SupportPatch={minX:number;maxX:number;minZ:number;maxZ:number};
/** Gravity projection against the convex hull of actual bearing patches. A joint
 * may still resist the returned overturning moment; imbalance is not instant deletion. */
export function supportBalance(center:Point,forceN:number,patches:SupportPatch[]){
 const points:Point[]=[];for(const p of patches)if(p.maxX>=p.minX&&p.maxZ>=p.minZ)points.push([p.minX,p.minZ],[p.minX,p.maxZ],[p.maxX,p.minZ],[p.maxX,p.maxZ]);
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const unique=points.filter((p,i)=>!i||p[0]!==points[i-1]![0]||p[1]!==points[i-1]![1]);
 const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const lower:Point[]=[],upper:Point[]=[];
 for(const p of unique){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
 for(let i=unique.length-1;i>=0;i--){const p=unique[i]!;while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
 const hull=unique.length>1?[...lower.slice(0,-1),...upper.slice(0,-1)]:unique;
 if(!hull.length)return {supported:false,leverM:Infinity,momentNm:Infinity,pivot:null as Point|null};
 if(hull.length>=3&&hull.every((p,i)=>cross(p,hull[(i+1)%hull.length]!,center)>=-1e-8))return {supported:true,leverM:0,momentNm:0,pivot:center};
 let distance=Infinity,pivot=hull[0]!;
 for(let i=0;i<hull.length;i++){const a=hull[i]!,b=hull[(i+1)%hull.length]!,dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((center[0]-a[0])*dx+(center[1]-a[1])*dz)/length)):0;const q:Point=[a[0]+t*dx,a[1]+t*dz],d=Math.hypot(center[0]-q[0],center[1]-q[1]);if(d<distance){distance=d;pivot=q;}}
 return {supported:distance<1e-6,leverM:distance,momentNm:Math.max(0,forceN)*distance,pivot};
}
