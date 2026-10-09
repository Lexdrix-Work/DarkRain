import * as THREE from 'three';
import { atlantaSeed } from './AtlantaGeography.js';

/** Small reclaimed park block; shares the existing city's batching pass. */
export function buildAtlantaPark(world, x, z, cfg, name) {
    const group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(cfg.blockSize, cfg.blockSize), world.materials.ground || world.materials.sidewalk);
    ground.rotation.x = -Math.PI/2; ground.position.set(x, world.getTerrainHeight(x,z)+.025, z); ground.receiveShadow=true; group.add(ground);
    const bark = new THREE.MeshStandardMaterial({color:0x625345,roughness:1});
    const leaves = new THREE.MeshStandardMaterial({color:0x455539,roughness:1});
    for(let i=0;i<8;i++) {
        const px=x+(atlantaSeed(x,z,i*37+9)-.5)*(cfg.blockSize-7);
        const pz=z+(atlantaSeed(x,z,i*71+5)-.5)*(cfg.blockSize-7);
        const height=5+atlantaSeed(px,pz)*3,base=world.getTerrainHeight(px,pz);
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.11,.22,height,7),bark);
        trunk.position.set(px,base+height/2,pz);trunk.castShadow=true;trunk.userData.isCollidable=true;group.add(trunk);world.colliders.push(trunk);
        for(let j=0;j<3;j++) {
            const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),leaves);
            crown.position.set(px+Math.cos(j*2.1)*1.2,base+height-.4+j*.25,pz+Math.sin(j*2.1)*1.2);
            crown.scale.set(2.3,1.8,2.1);crown.castShadow=crown.receiveShadow=true;group.add(crown);
        }
    }
    // Keep sidewalks and roads connected around reclaimed green space.
    world.createBlockSidewalks(x,z,cfg.blockSize,cfg.roadWidth);
    group.userData.park=name;world.scene.add(group);world._cityObjects.push(group);
    world.atlantaParks ||= [];world.atlantaParks.push({x,z,name});
}
