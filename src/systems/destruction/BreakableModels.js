import * as THREE from 'three';
import { fractureSlab,encodeGeometry,decodeGeometry } from './FractureGeometry.ts';
import {fractureExisting} from './SecondaryFracture.js';

const seed=id=>{let n=2166136261;for(const c of id)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n;};
/** Shared retained-material path for breakable rigid models and window panes.
 * Arbitrary meshes require authored fracture geometry; never replace their
 * empty space with bounding-box fragments. Ordinary crates/panes are boxes. */
export class BreakableModels {
    constructor(physics){this.physics=physics;this.serial=0;this.destroyed=new Set();this.pending=new Set();}
    collision(a,b,started) {
        if(!started)return;
        let normal=null;this.physics.world.contactPair(this.physics.world.getCollider(a),this.physics.world.getCollider(b),manifold=>{normal=new THREE.Vector3().copy(manifold.normal());});
        if(!normal)return;
        for(const [handle,other]of [[a,b],[b,a]]) {
            const body=this.physics.world.getCollider(handle)?.parent(),record=body&&this.physics.dynamic.get(body.handle);
            if(!record?.breakable||record.modelFailed)continue;
            const otherBody=this.physics.world.getCollider(other)?.parent(),otherRecord=otherBody&&this.physics.dynamic.get(otherBody.handle);
            const relative=(record.recentImpactVelocity||new THREE.Vector3()).clone().sub(otherRecord?.recentImpactVelocity||new THREE.Vector3());
            const speed=Math.abs(relative.dot(normal)),mass=body.mass(),effectiveMass=otherRecord?mass*otherBody.mass()/(mass+otherBody.mass()):mass;
            const threshold=record.breakable.impactEnergyJ??(record.breakable.material==='steel'?5000:180);
            if(speed>2&&.5*effectiveMass*speed*speed>threshold){record.health=0;this.pending.add(body.handle);}
        }
    }
    update(){for(const handle of this.pending){const r=this.physics.dynamic.get(handle);if(r)this.breakRecord(r);}this.pending.clear();}
    breakRecord(record,direction=new THREE.Vector3()) {
        if(!record.breakable||record.modelFailed)return false;
        const recipe=record.breakable,box=recipe.shape==='box'||record.mesh.geometry?.type==='BoxGeometry';
        if(!recipe.fragments&&!box&&record.mesh.geometry){
            recipe.fragments=fractureExisting(record.mesh.geometry,record.mesh.scale,6);
        }
        if(!record.mesh.geometry){
            const root=record.mesh,parts=[];root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
            root.traverse(mesh=>{if(!mesh.geometry||Array.isArray(mesh.material))return;const geometry=mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)),shards=fractureExisting(geometry,new THREE.Vector3(1,1,1),2);geometry.dispose();for(const shard of shards)if(shard.volume>1e-7)parts.push({...shard,material:mesh.material});});
            const volume=parts.reduce((sum,p)=>sum+p.volume,0);if(!volume)return false;
            const q=new THREE.Quaternion().copy(record.body.rotation()),p=new THREE.Vector3().copy(record.body.translation()),v=new THREE.Vector3().copy(record.body.linvel()),w=new THREE.Vector3().copy(record.body.angvel());
            for(let i=0;i<parts.length;i++){const part=parts[i];this.emit({id:record.id+':part:'+i,size:part.size,position:p,rotation:q,mass:record.body.mass()*part.volume/volume,material:part.material,materialId:recipe.material||'steel',velocity:v,angular:w,direction,pieces:[part]});part.geometry.dispose();}
            this.destroyed.add(record.id);this.physics.remove(record);return true;
        }
        const position=new THREE.Vector3().copy(record.body.translation()),rotation=new THREE.Quaternion().copy(record.body.rotation());
        const velocity=new THREE.Vector3().copy(record.body.linvel()),angular=new THREE.Vector3().copy(record.body.angvel());
        this.emit({id:record.id,size:record.size,position,rotation,mass:record.body.mass(),material:record.mesh.material,
            materialId:recipe.material||'wood',velocity,angular,direction,pieces:recipe.fragments});
        this.destroyed.add(record.id);this.physics.remove(record);return true;
    }
    breakGlass(mesh,pane,index,direction) {
        const id=`glass:${mesh.userData.glassId}:${index}`;
        this.emit({id,size:pane.size,position:pane.position,rotation:pane.quaternion,
            mass:pane.size.x*pane.size.y*pane.size.z*(pane.density||2500),material:mesh.material,
            materialId:'glass',velocity:new THREE.Vector3(),angular:new THREE.Vector3(),direction});
        this.destroyed.add(id);
    }
    emit({id,size,position,rotation,mass,material,materialId,velocity,angular,direction,pieces}) {
        const quality=this.physics.game.settings?.quality||'high',desired=quality==='ultra'?8:quality==='low'?3:6;
        const resident=[...this.physics.dynamic.values()].filter(r=>r.kind==='model-fragment').length;
        // Reduce visual subdivision at saturation, but retain material and collision.
        const count=resident>=128?1:desired;
        const shards=pieces||fractureSlab(size,count,seed(id));
        const volume=shards.reduce((sum,p)=>sum+p.volume,0);
        if(!shards.length||!Number.isFinite(volume)||volume<=0||shards.some(p=>!p.geometry?.attributes.position||!p.geometry.attributes.uv||!Number.isFinite(p.volume)||p.volume<=0))throw Error('Invalid fracture recipe for '+id);
        const records=[],mean=new THREE.Vector3();
        for(let i=0;i<shards.length;i++) {
            const part=shards[i],m=material.clone();m.userData.cellUV=false;
            const child=new THREE.Mesh(part.geometry.clone(),m);child.scale.copy(part.size);child.quaternion.copy(rotation);
            const offset=part.offset.clone().applyQuaternion(rotation);child.position.copy(position).add(offset);child.castShadow=child.receiveShadow=true;
            this.physics.game.scene.add(child);
            const r=this.physics.addBody(child,part.size,{mass:mass*part.volume/volume,kind:'model-fragment',convex:true,id:`${id}/fragment:${i}:${this.serial++}`});
            r.materialId=materialId;r.originId=id;r.modelFailed=true;
            const motion=velocity.clone().add(angular.clone().cross(offset));r.body.setLinvel(motion,true);r.body.setAngvel(angular,true);
            mean.addScaledVector(motion,r.body.mass()/mass);records.push(r);
            if(!pieces)part.geometry.dispose();
        }
        // Bounding-box centers differ from geometric COM; preserve total linear
        // momentum when inheriting the parent's rotation instead of creating energy.
        mean.sub(velocity);
        for(const r of records)r.body.setLinvel(new THREE.Vector3().copy(r.body.linvel()).sub(mean),true);
        this.physics.game.renderer&&(this.physics.game.renderer.shadowMap.needsUpdate=true);
        return records;
    }
    serialize(){return {version:1,serial:this.serial,destroyed:[...this.destroyed],intact:[...this.physics.dynamic.values()].filter(r=>r.breakable&&r.mesh.geometry).map(r=>({
        id:r.id,size:r.size.toArray(),scale:r.mesh.scale.toArray(),position:r.body.translation(),rotation:r.body.rotation(),mass:r.body.mass(),health:r.health,kind:r.kind,convex:r.convex,
        modelFailed:!!r.modelFailed,geometry:encodeGeometry(r.mesh.geometry.index?r.mesh.geometry.toNonIndexed():r.mesh.geometry),
        color:r.mesh.material.color.getHex(),roughness:r.mesh.material.roughness,metalness:r.mesh.material.metalness,
        recipe:{material:r.breakable.material,shape:r.breakable.shape,impactEnergyJ:r.breakable.impactEnergyJ,
            fragments:r.breakable.fragments?.map(p=>({geometry:encodeGeometry(p.geometry.index?p.geometry.toNonIndexed():p.geometry),size:p.size.toArray(),offset:p.offset.toArray(),volume:p.volume}))}
    })),pieces:[...this.physics.dynamic.values()].filter(r=>r.kind==='model-fragment').map(r=>({
        id:r.id,origin:r.originId,materialId:r.materialId,mass:r.body.mass(),size:r.size.toArray(),position:r.body.translation(),rotation:r.body.rotation(),
        velocity:r.body.linvel(),angular:r.body.angvel(),sleeping:r.body.isSleeping(),geometry:encodeGeometry(r.mesh.geometry),
        material:{color:r.mesh.material.color.getHex(),roughness:r.mesh.material.roughness,metalness:r.mesh.material.metalness,
            transparent:r.mesh.material.transparent,opacity:r.mesh.material.opacity,depthWrite:r.mesh.material.depthWrite,side:r.mesh.material.side}
    }))};}
    restore(data){if(!data)return;this.serial=data.serial||0;this.destroyed=new Set(data.destroyed||[]);
        for(const p of data.intact||[]) {
            const recipe={...p.recipe,fragments:p.recipe.fragments?.map(f=>({geometry:decodeGeometry(f.geometry),size:new THREE.Vector3().fromArray(f.size),offset:new THREE.Vector3().fromArray(f.offset),volume:f.volume}))};
            let r=[...this.physics.dynamic.values()].find(r=>r.id===p.id);
            if(!r){const mesh=new THREE.Mesh(decodeGeometry(p.geometry),new THREE.MeshStandardMaterial({color:p.color,roughness:p.roughness,metalness:p.metalness}));mesh.scale.fromArray(p.scale);mesh.position.copy(p.position);mesh.quaternion.copy(p.rotation);mesh.castShadow=mesh.receiveShadow=true;this.physics.game.scene.add(mesh);
                r=this.physics.addBody(mesh,new THREE.Vector3().fromArray(p.size),{mass:p.mass,id:p.id,health:p.health,kind:p.kind,convex:p.convex,breakable:recipe});}
            r.breakable=recipe;r.modelFailed=p.modelFailed;
        }
        for(const p of data.pieces||[]) {
            const mesh=new THREE.Mesh(decodeGeometry(p.geometry),new THREE.MeshStandardMaterial(p.material));mesh.scale.fromArray(p.size);mesh.position.copy(p.position);mesh.quaternion.copy(p.rotation);mesh.castShadow=mesh.receiveShadow=true;this.physics.game.scene.add(mesh);
            const r=this.physics.addBody(mesh,new THREE.Vector3().fromArray(p.size),{mass:p.mass,id:p.id,kind:'model-fragment',convex:true});
            r.materialId=p.materialId;r.originId=p.origin;r.modelFailed=true;r.body.setLinvel(p.velocity,true);r.body.setAngvel(p.angular,true);if(p.sleeping)r.body.sleep();
        }
    }
}
