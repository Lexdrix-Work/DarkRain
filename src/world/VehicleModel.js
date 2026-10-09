import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Metre-scale abandoned sedan, with a shaped roof, lights and wheel rims. */
export function buildSedanModel() {
    const group=new THREE.Group();
    const paint=new THREE.MeshStandardMaterial({color:0x546365,roughness:0.68,metalness:0.4});
    const rubber=new THREE.MeshStandardMaterial({color:0x202121,roughness:0.98});
    const trim=new THREE.MeshStandardMaterial({color:0x888981,roughness:0.5,metalness:0.7});
    const glass=new THREE.MeshStandardMaterial({color:0x263537,roughness:0.25,metalness:0.05,transparent:true,opacity:0.82});
    const box=(w,h,d,m,x,y,z,r=0.05)=>{const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,r),m);mesh.position.set(x,y,z);group.add(mesh);return mesh;};
    box(4.5,0.55,1.82,paint,0,0.65,0,0.12);
    box(1.3,0.12,1.74,paint,1.5,0.97,0,0.03);
    box(0.9,0.12,1.74,paint,-1.7,0.98,0,0.03);
    const profile=new THREE.Shape();profile.moveTo(-1.45,0);profile.lineTo(-0.9,0.68);profile.lineTo(0.65,0.68);profile.lineTo(1.25,0);profile.closePath();
    const roofGeom=new THREE.ExtrudeGeometry(profile,{depth:1.58,bevelEnabled:false});roofGeom.translate(0,0.91,-0.79);
    group.add(new THREE.Mesh(roofGeom,paint));
    for(const z of [-0.802,0.802]) {
        const side=new THREE.Shape();side.moveTo(-1.22,0);side.lineTo(-0.83,0.5);side.lineTo(0.62,0.5);side.lineTo(1.03,0);side.closePath();
        const window=new THREE.Mesh(new THREE.ShapeGeometry(side),glass);window.position.set(0,1.04,z);if(z<0)window.rotation.y=Math.PI;group.add(window);
        box(0.04,0.55,0.035,trim,-0.04,1.29,z,0.008);
        for(const x of [-0.62,0.58]) box(0.14,0.025,0.025,trim,x,0.91,z*1.14,0.005);
    }
    for(const x of [-1.42,1.4]) for(const z of [-0.86,0.86]) {
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.2,20),rubber);wheel.rotation.x=Math.PI/2;wheel.position.set(x,0.32,z);group.add(wheel);
        const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.208,12),trim);rim.rotation.x=Math.PI/2;rim.position.copy(wheel.position);group.add(rim);
    }
    const headlight=new THREE.MeshStandardMaterial({color:0xc6c2aa,roughness:0.4});
    const taillight=new THREE.MeshStandardMaterial({color:0x753c32,roughness:0.4});
    for(const z of [-0.6,0.6]) {box(0.05,0.15,0.38,headlight,2.25,0.73,z,0.012);box(0.05,0.16,0.32,taillight,-2.25,0.73,z,0.012);}
    box(0.07,0.15,1.76,trim,2.25,0.44,0,0.02);box(0.07,0.15,1.76,trim,-2.25,0.44,0,0.02);
    group.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.userData.isCollidable=true;}});
    return group;
}
