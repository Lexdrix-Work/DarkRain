import {getProceduralSet} from './ProceduralTextures.js';
import { attachCellDimensions } from './CellDimensions.js';
import * as THREE from 'three';
export const WALL_SECTION_HEALTH=68;
export function addDestructibleWalls(world,building,sections,material) {
    material=material.clone();material.userData.cellUV=true;
    // Cell UVs carry metre-scale tiling; per-building texture clones only duplicate uploads.
    const kind=material.userData.proceduralKind;
    if(kind){const set=getProceduralSet(kind);material.map=set.map||null;material.bumpMap=set.bumpMap||null;material.normalMap=set.normalMap||null;}
    // Equivalent cell finishes share node material bindings; instance dimensions stay per mesh.
    const key=[material.type,material.color.getHex(),material.roughness,material.metalness,material.side,material.opacity,material.transparent,material.vertexColors,material.flatShading,material.alphaTest,material.depthWrite,material.emissive?.getHex(),material.emissiveIntensity,material.map?.uuid,material.normalMap?.uuid,material.bumpMap?.uuid,material.userData.reliefHeightId,material.userData.reliefScale?.value].join('|');
    world._cellMaterials ||= new Map();const cached=world._cellMaterials.get(key);if(cached){material.dispose();material=cached;}else world._cellMaterials.set(key,material);
    material.customProgramCacheKey=()=> 'structural-cell-uv';
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,sections.length);
    attachCellDimensions(mesh);
    mesh.name='breachable-masonry';mesh.userData.isCollidable=true;mesh.userData.wallSections=true;mesh.userData.panes=[];
    const q=building.getWorldQuaternion(new THREE.Quaternion()),origin=building.getWorldPosition(new THREE.Vector3());
    mesh.userData.glassId='wall:'+origin.x.toFixed(2)+','+origin.z.toFixed(2);
    mesh.userData.structureId='structure:'+origin.x.toFixed(2)+','+origin.z.toFixed(2);
    for(let i=0;i<sections.length;i++) {
        const section=sections[i],position=new THREE.Vector3(...section.position).applyMatrix4(building.matrixWorld),size=new THREE.Vector3(...section.size);
        const rotation=q.clone().multiply(section.quaternion||new THREE.Quaternion());
        const matrix=new THREE.Matrix4().compose(position,rotation,size);mesh.setMatrixAt(i,matrix);
        const maxHealth=section.health??WALL_SECTION_HEALTH;
        const supportSize=section.quaternion?new THREE.Box3(size.clone().multiplyScalar(-.5),size.clone().multiplyScalar(.5)).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(section.quaternion)).getSize(new THREE.Vector3()):size;
        mesh.userData.panes.push({position,size,supportSize,quaternion:rotation,matrix,broken:false,health:maxHealth,maxHealth,
            localPosition:new THREE.Vector3(...section.position),anchor:section.anchor??section.position[1]-section.size[1]/2<.08,
            density:section.density??1700,capacity:section.capacity??600000,finish:section.finish??'masonry'});
    }
    mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.updateMatrixWorld(true);
    world.scene.add(mesh);world._cityObjects.push(mesh);world.colliders.push(mesh);return mesh;
}
