import * as THREE from 'three';
export const HAIR_STYLES=[{id:'shaved',name:'Shaved'},{id:'crop',name:'Crop'},{id:'short',name:'Short'},{id:'long',name:'Long'}];
export const HAIR_COLORS=[0x251e19,0x473021,0x79634a,0xaaa397,0x824330];
export function createHair(style='short',color=0x251e19) {
    const group=new THREE.Group();group.name='hair';if(style==='shaved')return group;
    const material=new THREE.MeshStandardMaterial({color,roughness:.92});
    const geometry=new THREE.SphereGeometry(.093,32,24,0,Math.PI*2,0,style==='crop'?Math.PI*.46:Math.PI*.62);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,p.getY(i)+Math.sin(x*730+z*400)*.0015);}
    geometry.computeVertexNormals();const crown=new THREE.Mesh(geometry,material);crown.position.set(0,.024,.023);crown.scale.set(1,style==='crop'?1:1.09,1.14);crown.castShadow=true;group.add(crown);
    if(style==='long')for(const side of [-1,1]) {
        const locks=new THREE.Mesh(new THREE.CapsuleGeometry(.026,.11,6,16),material);locks.position.set(side*.073,-.029,-.013);locks.scale.z=1.4;locks.castShadow=true;group.add(locks);
    }
    return group;
}
