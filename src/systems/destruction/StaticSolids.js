import * as THREE from 'three';
import {fractureExisting} from './SecondaryFracture.js';

/** Bridge legacy solid props into the same retained fracture path as city cells.
 * Open terrain/leaf surfaces need authored thickness and are not solid volumes. */
export class StaticSolids {
    constructor(physics){
        this.physics=physics;this.records=new Map();this.byId=new Map();
        const types=new Set(['BoxGeometry','RoundedBoxGeometry','CylinderGeometry','SphereGeometry','IcosahedronGeometry','TorusGeometry']);
        for(const [mesh,collider]of physics.staticColliderByMesh){
            if(mesh.userData.staticSolidBroken){mesh.visible=true;delete mesh.userData.staticSolidBroken;}
            // Hidden batching sources are collision proxies, not independent
            // rendered props. Their visible batches need an authored owner map.
            if(!mesh.visible||!mesh.parent)continue;
            if(!types.has(mesh.geometry.type)||Array.isArray(mesh.material)||mesh.userData.terrain)continue;
            mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.getWorldScale(new THREE.Vector3()));
            // Terrain decks have no underside to excavate into. They remain the
            // world boundary until volumetric terrain authoring is implemented.
            if(size.y<.5&&Math.max(size.x,size.z)>20)continue;
            const p=mesh.getWorldPosition(new THREE.Vector3()),id='solid:'+mesh.geometry.type+':'+p.toArray().map(v=>v.toFixed(3)).join(',')+':'+size.toArray().map(v=>v.toFixed(3)).join(',');
            const record={id,mesh,collider,health:120,broken:false};this.records.set(mesh,record);this.byId.set(id,record);
        }
    }
    hide(record){record.broken=true;record.mesh.userData.staticSolidBroken=true;record.mesh.visible=false;if(record.collider){this.physics.world.removeCollider(record.collider,true);record.collider=null;}}
    hit(hit,direction,damage){
        const record=this.records.get(hit.object);if(!record||record.broken)return false;
        record.health-=damage;if(record.health>0)return true;
        const mesh=record.mesh,scale=mesh.getWorldScale(new THREE.Vector3()),pieces=fractureExisting(mesh.geometry,scale,6),volume=pieces.reduce((sum,p)=>sum+p.volume,0);
        if(!volume||pieces.some(p=>!Number.isFinite(p.volume)||p.volume<=0)){for(const p of pieces)p.geometry.dispose();return false;}
        const material=mesh.material,metal=material.metalness>.25;
        this.physics.models.emit({id:record.id,size:scale,position:mesh.getWorldPosition(new THREE.Vector3()),rotation:mesh.getWorldQuaternion(new THREE.Quaternion()),mass:volume*(metal?2700:1700),material,materialId:metal?'steel':'concrete',velocity:new THREE.Vector3(),angular:new THREE.Vector3(),direction,pieces});
        for(const p of pieces)p.geometry.dispose();this.hide(record);return true;
    }
    serialize(){return [...this.records.values()].filter(r=>r.health<120||r.broken).map(r=>({id:r.id,health:r.health,broken:r.broken}));}
    restore(states){for(const state of states||[]){const r=this.byId.get(state.id);if(!r)continue;r.health=state.health;if(state.broken)this.hide(r);}}
}
