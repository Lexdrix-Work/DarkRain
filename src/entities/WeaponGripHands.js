import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Keep the arm surface up to the wrist; replace the open asset hand in a weapon pose. */
export function trimOpenHand(geometry,side) {
    const wrist=new THREE.Vector3(side==='R'?.4527:-.4527,1.115,.1844),tip=new THREE.Vector3(side==='R'?.0496:-.0496,-.1206,.1321).normalize();
    const source=geometry.index?geometry.toNonIndexed():geometry,keep=[],p=source.attributes.position;
    for(let i=0;i<p.count;i+=3){let beyond=0;for(let j=0;j<3;j++)beyond+=new THREE.Vector3().fromBufferAttribute(p,i+j).sub(wrist).dot(tip);if(beyond/3<.006)keep.push(i,i+1,i+2);}
    const result=new THREE.BufferGeometry();
    for(const [key,attribute]of Object.entries(source.attributes)){
        const array=new attribute.array.constructor(keep.length*attribute.itemSize);
        keep.forEach((index,i)=>{for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute.array[index*attribute.itemSize+j];});
        result.setAttribute(key,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
    }
    result.computeBoundingSphere();result.userData.shared=true;if(source!==geometry)source.dispose();return result;
}

export function addGripHand(rig,side,material) {
    const group=new THREE.Group();group.name='closed-grip-'+side;
    const forward=rig.bones['handTip'+side].position.clone().normalize();group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),forward);
    const palm=new THREE.Mesh(new RoundedBoxGeometry(.066,.025,.052,3,.011),material);palm.position.set(0,0,.027);group.add(palm);
    const segment=(a,b,radius)=>{const delta=b.clone().sub(a),m=new THREE.Mesh(new THREE.CapsuleGeometry(radius,Math.max(.001,delta.length()-radius*2),3,6),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(m);};
    for(let i=0;i<4;i++){
        const x=-.024+i*.016,z=.048-(i===3?.007:0);
        const a=new THREE.Vector3(x,0,z),b=new THREE.Vector3(x,-.018,z+.013),c=new THREE.Vector3(x,-.034,z-.004);
        segment(a,b,.0065);segment(b,c,.006);segment(c,new THREE.Vector3(x,-.026,z-.018),.0055);
    }
    segment(new THREE.Vector3(side==='R'?-.031:.031,0,.015),new THREE.Vector3(side==='R'?-.032:.032,-.017,.035),.008);
    segment(new THREE.Vector3(side==='R'?-.032:.032,-.017,.035),new THREE.Vector3(side==='R'?-.014:.014,-.021,.045),.007);
    group.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});rig.bones['hand'+side].add(group);return group;
}
