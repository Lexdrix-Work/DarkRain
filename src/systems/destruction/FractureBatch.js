import {surfaceCoordinates} from '../../world/SurfaceCoordinates.js';
import * as THREE from 'three';

/** A lazy BatchedMesh keeps unique fracture shapes without a draw per settled shard. */
export function fractureBatch(material,capacity){
    let vertices=4096,used=0,instances=128;
    const mesh=new THREE.BatchedMesh(instances,vertices,0,material),write=mesh.setMatrixAt.bind(mesh),slots=new Map();
    mesh.instanceMatrix={needsUpdate:false};mesh.userData.logicalSlots=new Map();mesh.userData.slotGeometry=new Map();
    mesh.userData.nextFragmentSlot=capacity;
    mesh.allocateFragments=count=>{const first=mesh.userData.nextFragmentSlot;mesh.userData.nextFragmentSlot+=count;return first;};
    mesh.setFragment=(slot,geometry,matrix)=>{
        mesh.userData.nextFragmentSlot=Math.max(mesh.userData.nextFragmentSlot,slot+1);
        const scale=new THREE.Vector3().setFromMatrixScale(matrix);surfaceCoordinates(geometry,scale);const previous=slots.get(slot),count=geometry.attributes.position.count;
        if(previous!==undefined){
            const geometryId=mesh.getGeometryIdAt(previous);
            mesh.setGeometryAt(geometryId,geometry);write(previous,matrix);mesh.setVisibleAt(previous,true);mesh.userData.slotGeometry.set(slot,geometry);return;
        }
        const reserve=Math.max(256,count);
        if(used+reserve>vertices){vertices=Math.max(vertices*2,used+reserve);mesh.setGeometrySize(vertices,0);}
        if(slots.size+1>=instances){instances*=2;mesh.setInstanceCount(instances);}
        const geometryId=mesh.addGeometry(geometry,reserve),id=mesh.addInstance(geometryId);used+=reserve;
        slots.set(slot,id);mesh.userData.logicalSlots.set(id,slot);mesh.userData.slotGeometry.set(slot,geometry);write(id,matrix);
    };
    mesh.setMatrixAt=(slot,matrix)=>{
        const id=slots.get(slot);if(id===undefined)return mesh;
        const zero=matrix.elements[0]===0&&matrix.elements[5]===0&&matrix.elements[10]===0;
        // Keep the matrix texture consistent with the visibility list. Shadow and
        // main passes can consume different cached draw lists on the GL backend.
        mesh.setVisibleAt(id,!zero);write(id,matrix);return mesh;
    };
    // Opaque fragments share one camera-independent draw list with shadow passes.
    // Reordering the same indirect texture for each camera can leave stale chunks.
    mesh.count=capacity;mesh.frustumCulled=false;mesh.perObjectFrustumCulled=false;mesh.sortObjects=false;
    return mesh;
}


