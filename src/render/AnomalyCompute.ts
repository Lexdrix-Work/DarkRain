import { InstancedMesh, IcosahedronGeometry, Matrix4, Vector3 } from 'three';
import { MeshBasicNodeMaterial, StorageInstancedBufferAttribute, type WebGPURenderer } from 'three/webgpu';
import * as N from 'three/tsl';

/** Visual-only field motion; CPU anomaly volumes still own all damage and forces. */
export function createAnomalyCompute(renderer:WebGPURenderer,origin:Vector3,radius:number,quality:string){
    if(!('isWebGPUBackend' in renderer.backend) || !renderer.backend.isWebGPUBackend)return null;
    const count=quality==='low'?128:quality==='medium'?384:768;
    const data=new Float32Array(count*3);
    for(let i=0;i<count;i++){
        const angle=i*2.399963,r=Math.sqrt((i+.5)/count)*radius;
        data[i*3]=Math.cos(angle)*r;data[i*3+1]=((i*37%count)/count-.5)*radius;data[i*3+2]=Math.sin(angle)*r;
    }
    const attribute=new StorageInstancedBufferAttribute(data,3),positions=N.storage(attribute,'vec3',count),dt=N.uniform(0);
    const compute=N.Fn(()=>{
        const p=positions.element(N.instanceIndex),r=p.xz.length(),angle=N.atan(p.z,p.x).add(dt.mul(2));
        p.x.assign(angle.cos().mul(r));p.z.assign(angle.sin().mul(r));
        p.y.addAssign(dt.mul(N.hash(N.instanceIndex.add(1)).mul(1.5).add(.3)));
        N.If(p.y.greaterThan(radius),()=>{p.y.assign(-radius/2);});
    })().compute(count);
    const material=new MeshBasicNodeMaterial({color:0x8295a0,transparent:true,opacity:.55,depthWrite:false});
    material.positionNode=N.positionLocal.add(positions.element(N.instanceIndex));
    const geometry=new IcosahedronGeometry(.045,0);geometry.setAttribute('fieldPosition',attribute);
    const mesh=new InstancedMesh(geometry,material,count),identity=new Matrix4();
    for(let i=0;i<count;i++)mesh.setMatrixAt(i,identity);
    mesh.position.copy(origin);mesh.frustumCulled=false;mesh.raycast=()=>{};
    return{mesh,update(seconds:number){dt.value=Math.min(seconds,.1);renderer.compute(compute);},dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();compute.dispose();}};
}
