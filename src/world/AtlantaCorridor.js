import * as THREE from 'three';
import { buildSedanModel } from './VehicleModel.js';
import { StaticBatcher } from './StaticBatcher.js';
import { bridgeApproach } from './BridgeApproach.js';

/** Original transport corridor: divided highway, abandoned traffic, rail yard and viaduct. */
export function buildAtlantaCorridor(world,cfg,width,depth,roadZ) {
    const x=-width/2-55,length=depth+180,group=new THREE.Group();
    const concrete=new THREE.MeshStandardMaterial({color:0x77776c,roughness:.96});
    const steel=new THREE.MeshStandardMaterial({color:0x4e4940,roughness:.78,metalness:.35});
    const paint=new THREE.MeshStandardMaterial({color:0xbdb59b,roughness:.92});
    const box=(size,p,mat,collision=true)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...p);m.castShadow=m.receiveShadow=true;m.userData.isCollidable=collision;group.add(m);return m;};
    for(const side of [-1,1])world.createRoad(x+side*10.8,0,19.8,length,'vertical');
    for(let z=-length/2;z<length/2;z+=12){
        const base=world.getTerrainHeight(x,z);
        box([.6,.85,11.8],[x,base+.425,z+6],concrete);
        for(const side of [-1,1])box([.4,.8,11.8],[x+side*21.5,world.getTerrainHeight(x+side*21.5,z)+.4,z+6],concrete);
        for(const lane of [-15,-8,8,15])box([.13,.018,3.4],[x+lane,world.getTerrainHeight(x+lane,z)+.075,z+4],paint,false);
    }
    // Original sedan geometry is baked once; all abandoned cars share one draw.
    const source=buildSedanModel(),batch=new StaticBatcher();source.updateMatrixWorld(true);
    source.traverse(o=>{if(o.isMesh)batch.add(o.geometry,o.matrixWorld,'cars',{color:o.material.color});});
    const merged=batch.buildBucket('cars',new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.12}));
    const vehicles=new THREE.InstancedMesh(merged.geometry,merged.material,72),transform=new THREE.Object3D();
    for(let i=0;i<72;i++){
        const lane=i%3,z=-length/2+30+Math.floor(i/3)*7.2+(lane===1?1.5:0),cx=x-17+lane*6;
        transform.position.set(cx,world.getTerrainHeight(cx,z)+.035,z);transform.rotation.y=Math.PI/2+(i%9===0?.17:0);transform.updateMatrix();vehicles.setMatrixAt(i,transform.matrix);
        const collider=new THREE.Mesh(new THREE.BoxGeometry(4.55,1.25,1.8),new THREE.MeshBasicMaterial({visible:false}));collider.userData.detachedCollider=true;collider.position.copy(transform.position).y+=.68;collider.rotation.copy(transform.rotation);collider.updateMatrixWorld(true);world.colliders.push(collider);world._cityObjects.push(collider);
    }
    vehicles.castShadow=vehicles.receiveShadow=true;world.scene.add(vehicles);world._cityObjects.push(vehicles);
    source.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    // Parallel freight tracks use ordinary sleepers and rail profiles, with room for weeds.
    const railX=x+32;
    for(let z=-length/2;z<length/2;z+=12)for(const track of [-3,3])for(const rail of [-.72,.72]){
        const start=world.getTerrainHeight(railX+track,z),end=world.getTerrainHeight(railX+track,z+12),segment=box([.065,.12,Math.hypot(12,end-start)],[railX+track+rail,(start+end)/2+.14,z+6],steel);segment.rotation.x=-Math.atan2(end-start,12);
    }
    for(let z=-length/2;z<length/2;z+=1.7)for(const track of [-3,3])box([2.1,.10,.22],[railX+track,world.getTerrainHeight(railX,z)+.05,z],steel,false);
    // Weathered elevated crossing, clear of both traffic and tracks.
    const bridgeZ=roadZ+55,bridgeY=Math.max(world.getTerrainHeight(x,bridgeZ),world.getTerrainHeight(railX,bridgeZ))+6;
    box([86,.55,10],[x+12,bridgeY,bridgeZ],concrete);
    for(const side of [-1,1])box([86,.75,.25],[x+12,bridgeY+.65,bridgeZ+side*4.9],concrete);
    for(const px of [x-30,x,x+23,x+52])for(const side of [-1,1]){const ground=world.getTerrainHeight(px,bridgeZ);box([1.1,bridgeY-ground,1.3],[px,ground+(bridgeY-ground)/2,bridgeZ+side*3.5],concrete);}
    const approaches=[];
    for(const side of [-1,1]) {
        const edgeX=x+12+side*43;
        for(const segment of bridgeApproach(edgeX,bridgeZ,bridgeY+.275,side,(px,pz)=>world.getTerrainHeight(px,pz))) {
            const ramp=box([segment.length,.3,10],[segment.x,segment.y,bridgeZ],concrete);
            ramp.rotation.z=segment.angle;
            for(const curb of [-1,1]) {
                const barrier=box([segment.length,.5,.25],[segment.x,segment.y+.4,bridgeZ+curb*4.9],concrete);barrier.rotation.z=segment.angle;
            }
        }
        approaches.push({minX:Math.min(edgeX,edgeX+side*84),maxX:Math.max(edgeX,edgeX+side*84),z:bridgeZ,width:12});
    }
    group.updateMatrixWorld(true);group.traverse(o=>{if(o.userData.isCollidable)world.colliders.push(o);});world.scene.add(group);world._cityObjects.push(group);
    world.transportCorridor={x,width:44,length,railX,bridgeZ,abandonedCars:72,approaches};
}
