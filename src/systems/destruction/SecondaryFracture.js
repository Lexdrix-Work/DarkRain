import * as THREE from 'three';

/** Cut the EXISTING shard mesh, including its old fracture faces. Re-fracturing
 * its bounding box would manufacture concrete in the empty corners. */
export function fractureExisting(geometry,size,count=4){
    const source=geometry.index?geometry.toNonIndexed():geometry,p=source.attributes.position,uv=source.attributes.uv,face=source.attributes.fractureFace;
    const triangles=[];for(let i=0;i<p.count;i+=3)triangles.push([0,1,2].map(j=>({p:new THREE.Vector3().fromBufferAttribute(p,i+j).multiply(size),uv:uv?new THREE.Vector2().fromBufferAttribute(uv,i+j):new THREE.Vector2(),face:face?.getX(i+j)||0})));
    const pieces=[triangles];
    while(pieces.length<count){let largest=0,extent=0;for(let i=0;i<pieces.length;i++){const box=bounds(pieces[i]),v=box.getSize(new THREE.Vector3());const measure=v.x*v.y*v.z;if(measure>extent){extent=measure;largest=i;}}
        const triangles=pieces[largest],box=bounds(triangles),extentVector=box.getSize(new THREE.Vector3()),axis=extentVector.x>=extentVector.y&&extentVector.x>=extentVector.z?0:extentVector.y>=extentVector.z?1:2,cut=box.getCenter(new THREE.Vector3()).getComponent(axis);
        const a=half(triangles,axis,cut,1),b=half(triangles,axis,cut,-1);if(!a.length||!b.length)break;pieces.splice(largest,1,a,b);
    }
    const result=pieces.map(triangles=>{const box=bounds(triangles),offset=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),positions=[],uv=[],faces=[];let signedVolume=0;
        for(const triangle of triangles){signedVolume+=triangle[0].p.dot(triangle[1].p.clone().cross(triangle[2].p))/6;for(const vertex of triangle){positions.push(...vertex.p.clone().sub(offset).divide(size).toArray());uv.push(vertex.uv.x,vertex.uv.y);faces.push(vertex.face);}}
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('fractureFace',new THREE.Float32BufferAttribute(faces,1));geometry.computeVertexNormals();return {geometry,offset,size,volume:Math.abs(signedVolume)};
    });if(source!==geometry)source.dispose();return result;
}
function bounds(triangles){const box=new THREE.Box3();for(const t of triangles)for(const v of t)box.expandByPoint(v.p);return box;}
function half(triangles,axis,cut,sign){
    const result=[],seam=new Map();
    for(const triangle of triangles){const polygon=[];
        for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],da=(a.p.getComponent(axis)-cut)*sign,db=(b.p.getComponent(axis)-cut)*sign;
            if(da<=1e-8)polygon.push(a);
            if(da<0&&db>0||da>0&&db<0){const t=da/(da-db),point={p:a.p.clone().lerp(b.p,t),uv:a.uv.clone().lerp(b.uv,t),face:a.face};polygon.push(point);seam.set(point.p.toArray().map(v=>v.toFixed(7)).join(','),point.p);}
        }
        for(let i=1;i<polygon.length-1;i++)result.push([polygon[0],polygon[i],polygon[i+1]]);
    }
    const points=[...seam.values()];if(points.length>=3){const center=new THREE.Vector3();for(const p of points)center.add(p);center.divideScalar(points.length);const u=(axis+1)%3,v=(axis+2)%3;
        points.sort((a,b)=>Math.atan2(a.getComponent(v)-center.getComponent(v),a.getComponent(u)-center.getComponent(u))-Math.atan2(b.getComponent(v)-center.getComponent(v),b.getComponent(u)-center.getComponent(u)));
        if(sign<0)points.reverse();const vertex=p=>({p,uv:new THREE.Vector2(p.getComponent(u),p.getComponent(v)),face:1});for(let i=0;i<points.length;i++)result.push([vertex(center),vertex(points[i]),vertex(points[(i+1)%points.length])]);
    }return result;
}
