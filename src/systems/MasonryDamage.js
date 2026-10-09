import {surfaceCoordinates} from '../world/SurfaceCoordinates.js';
import { fractureSlab, encodeGeometry, decodeGeometry } from './destruction/FractureGeometry.ts';
import { fractureBatch } from './destruction/FractureBatch.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MasonryDust } from './MasonryDust.js';
import { globalEventBus } from '../core/EventBus.js';
import { FallingDecorations } from './FallingDecorations.js';
import {cityBodyBudget,cityBodyCounts} from './destruction/CityBodyBudget.js';
import {fractureExisting} from './destruction/SecondaryFracture.js';

const zero=new THREE.Matrix4().makeScale(0,0,0);
function fractureGeometry(size=new THREE.Vector3(1,1,1)){const g=new THREE.BoxGeometry(1,1,1).toNonIndexed(),normal=g.attributes.normal,faces=new Float32Array(normal.count),axis=[0,1,2].sort((a,b)=>size.getComponent(a)-size.getComponent(b))[0];for(let i=0;i<normal.count;i++)faces[i]=Math.abs(normal.getComponent(i,axis))>.99?0:1;g.setAttribute('fractureFace',new THREE.Float32BufferAttribute(faces,1));return g;}
function finishMaterial(source){const material=source.clone();material.userData.cellUV=false;material.userData.fractureSurface=true;return material;}
function bakeUV(geometry,size,material){surfaceCoordinates(geometry,size);const uv=geometry.attributes.uv,n=geometry.attributes.normal;for(let i=0;i<uv.count;i++){const u=Math.abs(n.getX(i))>.5?size.z:size.x,v=Math.abs(n.getY(i))>.5?size.z:size.y;uv.setXY(i,uv.getX(i)*u/((material.map?.repeat.x||1)*1.8),uv.getY(i)*v/((material.map?.repeat.y||1)*1.5));}return geometry;}
function rubbleShape(geometry,size){const p=geometry.attributes.position,vertices=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){vertices[i*3]=p.getX(i)*size.x;vertices[i*3+1]=p.getY(i)*size.y;vertices[i*3+2]=p.getZ(i)*size.z;}return RAPIER.ColliderDesc.convexHull(vertices)||RAPIER.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2);}
export class MasonryDamage {
    constructor(physics){this.physics=physics;this.chips=new Map();this.rubble=new Map();this.settled=[];this.pending=[];this.decorations=new FallingDecorations(physics);this.dust=typeof document!=='undefined'&&document.createElement('canvas').getContext?.('2d')?.createRadialGradient?new MasonryDust(physics.game):null;}
    pool(parent,chips) {
        const pools=chips?this.chips:this.rubble;if(pools.has(parent))return pools.get(parent);
        const material=finishMaterial(parent.material);
        const mesh=fractureBatch(material,parent.userData.panes.length*(chips?18:4));
        mesh.name=chips?'chipped-masonry':'settled-masonry';mesh.userData.isCollidable=true;mesh.userData.damageOwned=true;mesh.userData.glassId=parent.userData.glassId+':chips';mesh.userData.panes=chips?[]:undefined;mesh.userData.chipParent=chips?parent:undefined;
        mesh.castShadow=mesh.receiveShadow=true;this.physics.game.scene.add(mesh);this.physics.game.worldManager.colliders.push(mesh);pools.set(parent,mesh);return mesh;
    }
    fragment(parent,index,legacy=false,impact,warped=false) {
        const pane=parent.userData.panes[index];if(pane.fragmented)return pane.fragmented;
        const mesh=this.pool(parent,true),pieces=[];
        let shards;
        if(legacy){
            const divisions=pane.size.x<pane.size.z?[2,3,3]:[3,3,2];shards=[];
            for(let x=0;x<divisions[0];x++)for(let y=0;y<divisions[1];y++)for(let z=0;z<divisions[2];z++){
                const size=pane.size.clone().divide(new THREE.Vector3(...divisions));
                shards.push({size,geometry:fractureGeometry(),offset:new THREE.Vector3((x+.5)*size.x-pane.size.x/2,(y+.5)*size.y-pane.size.y/2,(z+.5)*size.z-pane.size.z/2),volume:size.x*size.y*size.z});
            }
        }else shards=fractureSlab(pane.size,18,1337+(index%8)*71,impact,warped);
        for(const shard of shards){
            const size=shard.size,position=pane.position.clone().add(shard.offset.clone().applyQuaternion(pane.quaternion)),slot=index*18+pieces.length,matrix=new THREE.Matrix4().compose(position,pane.quaternion,size);
            const part={position,size,volume:shard.volume,density:pane.density,geometry:shard.geometry,quaternion:pane.quaternion.clone(),matrix,broken:false,health:18,maxHealth:18,parent,index,slot};pieces.push(part);mesh.userData.panes[slot]=part;
            mesh.setFragment(slot,bakeUV(shard.geometry.clone(),size,mesh.material),matrix);
        }
        pane.fragmented={mesh,pieces,legacy,warped,impact:impact?.clone()};parent.setMatrixAt(index,zero);parent.instanceMatrix.needsUpdate=true;
        parent.visible=!parent.userData.panes.every(p=>p.broken||p.fragmented);
        mesh.computeBoundingBox();mesh.computeBoundingSphere();
        this.physics.rebuildSectionCollider(parent);this.physics.rebuildSectionCollider(mesh);return pane.fragmented;
    }
    hit(parent,index,point,direction,damage) {
        const pane=parent.userData.panes[index],roof=pane.size.y<Math.min(pane.size.x,pane.size.z)*.5;
        const local=roof?point.clone().sub(pane.position).applyQuaternion(pane.quaternion.clone().invert()):undefined;
        const {mesh,pieces}=this.fragment(parent,index,false,local),part=pieces.filter(p=>!p.broken&&!p.queued).sort((a,b)=>a.position.distanceToSquared(point)-b.position.distanceToSquared(point))[0];
        if(part)this.hitFragment(mesh,part,direction,damage,point);
    }
    hitFragment(mesh,part,direction,damage,point=part.position){
        if(part.broken||part.queued)return;
        const original=part.parent.userData.panes[part.index],kind=part.parent.material.userData.proceduralKind||'concrete';
        const multiplier=original.density>=2800?.65:kind==='brick'||kind==='wood'?1.5:1.2;
        const impact=Number.isFinite(damage)?Math.max(0,damage):0;
        original.impactDamage=(original.impactDamage||0)+impact*multiplier;part.health-=impact*multiplier;
        if(part.health<=0)this.detach(mesh,part,direction,Math.min(18,impact*.08),point);
        this.sectionHealth(original);this.physics.structure?.damage(part.parent);
        if(original.health<=0&&!original.broken)this.physics.collapseCell({mesh:part.parent,pane:original,index:part.index});
    }
    sectionHealth(original){const remaining=original.fragmented.pieces.filter(p=>!p.broken).reduce((sum,p)=>sum+p.volume,0),volume=original.size.x*original.size.y*original.size.z;original.health=Math.max(0,Math.min(original.maxHealth-(original.impactDamage||0),original.maxHealth*remaining/volume));if(!remaining)original.broken=true;}
    detach(mesh,part,direction,impulseNs=0,point=part.position) {
        if(part.broken)return;
        const counts=cityBodyCounts(this.physics),budget=cityBodyBudget(this.physics.game.settings?.quality);
        if(counts.chips>=budget.chips||counts.total>=budget.total){if(!part.queued){part.queued=true;part.pendingColliderDisabled=true;part.queuedDirection=direction.clone();part.queuedImpulseNs=impulseNs;part.queuedImpactPoint=point.clone();this.pending.push({mesh,part,direction:direction.clone(),impulseNs,point:part.queuedImpactPoint});this.physics.rebuildSectionCollider(mesh);}return;}
        part.queued=false;part.broken=true;mesh.setMatrixAt(part.slot,zero);mesh.instanceMatrix.needsUpdate=true;
        const r=this.fall(mesh,part,part.slot,'wall-chip');r.destination=mesh;r.slot=part.slot;
        if(impulseNs>0)r.body.applyImpulseAtPoint(direction.clone().multiplyScalar(impulseNs),point,true);
        r.originId=part.parent.userData.glassId;
        const original=part.parent.userData.panes[part.index];
        this.sectionHealth(original);
        this.physics.rebuildSectionCollider(mesh);this.physics.structure?.damage(part.parent);this.physics.game.renderer.shadowMap.needsUpdate=true;
        this.dust?.puff(part.position,.5);globalEventBus.emit('audio:play',{sound:'wall_break',volume:.22});
    }
    fall(parent,pane,index,kind='structural',direction=new THREE.Vector3()) {
        const material=finishMaterial(parent.material),geometry=pane.geometry?pane.geometry.clone():fractureGeometry(pane.size),chunk=new THREE.Mesh(geometry,material);
        if(!pane.geometryBaked)bakeUV(geometry,pane.size,material);
        chunk.position.copy(pane.position);chunk.quaternion.copy(pane.quaternion);chunk.scale.copy(pane.size);chunk.castShadow=chunk.receiveShadow=true;this.physics.game.scene.add(chunk);
        const r=this.physics.addBody(chunk,pane.size,{mass:Math.max(.15,(pane.volume??pane.size.x*pane.size.y*pane.size.z)*(pane.density||1700)),kind,convex:true});
        // Gravity, shape and contacts create the fall. Unsupported members must
        // not receive an arbitrary animation-like launch or spin.
        r.destination=kind==='wall-chip'?parent:this.pool(parent,false);r.slot=kind==='wall-chip'?index:index*4;r.originId=(parent.userData.chipParent||parent).userData.glassId;r.still=0;r.age=0;r.fractured=false;return r;
    }
    update(dt) {
        this.dust?.update(dt);
        this.decorations.update(dt,this.settled);
        const budget=cityBodyBudget(this.physics.game.settings?.quality);
        while(this.pending.length){const counts=cityBodyCounts(this.physics);if(counts.chips>=budget.chips||counts.total>=budget.total)break;const p=this.pending.shift();this.detach(p.mesh,p.part,p.direction,p.impulseNs||0,p.point||p.part.position);}
        this.breakableHandles=new Set([...this.physics.panes.values(),...(this.settledColliders?.values()||[]),...[...(this.physics.staticSolids?.records.values()||[])].map(r=>r.collider)].filter(Boolean).map(c=>c.handle));
        for(const r of [...this.physics.dynamic.values()])if(r.kind==='structural'||r.kind==='wall-chip'){
            r.age+=dt;const v=r.body.linvel(),a=r.body.angvel(),slow=Math.hypot(v.x,v.y,v.z)<.12&&Math.hypot(a.x,a.y,a.z)<.2;
            if(!r.fractured&&r.impactSpeed>3.5&&(r.lastFallSpeed||0)-Math.abs(v.y)>2)r.needsSplit=true;
            r.lastFallSpeed=Math.abs(v.y);r.impactSpeed=Math.max(r.impactSpeed||0,Math.abs(v.y));
            if(r.needsSplit&&this.splitImpact(r))continue;
            r.still=slow?r.still+dt:0;
            if((r.body.isSleeping()||(r.age>1&&r.still>.8))&&this.grounded(r))this.freeze(r);
        }
    }
    grounded(r) {
        let supported=false;const own=r.body.collider(0),handles=this.breakableHandles||new Set([...this.physics.panes.values()].filter(Boolean).map(c=>c.handle));
        this.physics.world.contactPairsWith(own,other=>{
            if(other.parent()||handles.has(other.handle))return;
            this.physics.world.contactPair(own,other,manifold=>{if(manifold.numSolverContacts()>0&&Math.abs(manifold.normal().y)>.3)supported=true;});
        });
        if(supported)return true;
        const p=r.body.translation(),q=r.body.rotation(),m=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().copy(q)).elements;
        const radius=(Math.abs(m[1])*r.size.x+Math.abs(m[5])*r.size.y+Math.abs(m[9])*r.size.z)/2;
        const hit=this.physics.world.castRay(new RAPIER.Ray(p,{x:0,y:-1,z:0}),radius+.15,true,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
        // Rapier's cast ray uses the shrunken convex hull. A resting shard can
        // therefore sit a few centimetres above the floor while its visible
        // face is already supported; accept that bounded contact gap only near
        // the ground, never for a suspended piece.
        if(!hit)return p.y<=radius+.35;
        if(handles.has(hit.collider.handle))return false;
        return true;
    }
    splitImpact(r) {
        if(cityBodyCounts(this.physics).total+3>cityBodyBudget(this.physics.game.settings?.quality).total)return false;
        const shards=fractureExisting(r.mesh.geometry,r.size,4),volume=shards.reduce((sum,p)=>sum+p.volume,0);
        if(!Number.isFinite(volume)||volume<=0){for(const shard of shards)shard.geometry.dispose();throw Error('Secondary fracture lost its source volume');}
        const center=new THREE.Vector3().copy(r.body.translation()),rotation=new THREE.Quaternion().copy(r.body.rotation()),velocity=new THREE.Vector3().copy(r.body.linvel()),spin=new THREE.Vector3().copy(r.body.angvel()),totalMass=r.body.mass(),material=finishMaterial(r.mesh.material),destination=r.destination,slot=destination.allocateFragments(4),origin=r.originId,kind=r.kind;
        const children=[];
        try{shards.forEach((shard,i)=>{
            const offset=shard.offset.clone().applyQuaternion(rotation),mesh=new THREE.Mesh(bakeUV(shard.geometry,shard.size,material),material.clone());mesh.position.copy(center).add(offset);mesh.quaternion.copy(rotation);mesh.scale.copy(shard.size);mesh.castShadow=mesh.receiveShadow=true;this.physics.game.scene.add(mesh);
            const part=this.physics.addBody(mesh,shard.size,{mass:totalMass*shard.volume/volume,kind,convex:true,velocity:velocity.clone().add(spin.clone().cross(offset))});part.body.setAngvel(spin,true);part.destination=destination;part.slot=slot+i;part.originId=origin;part.fractured=true;part.age=0;part.still=0;children.push(part);
        });}catch(error){for(const child of children)this.physics.remove(child);material.dispose();throw error;}
        this.physics.remove(r);this.dust?.puff(center,Math.min(2,Math.sqrt(totalMass)/15));material.dispose();return true;
    }
    freeze(r) {
        const p=new THREE.Vector3().copy(r.body.translation()),q=new THREE.Quaternion().copy(r.body.rotation()),matrix=new THREE.Matrix4().compose(p,q,r.size);
        r.destination.setFragment(r.slot,r.mesh.geometry,matrix);r.destination.instanceMatrix.needsUpdate=true;r.destination.computeBoundingBox();r.destination.computeBoundingSphere();
        const collider=this.physics.world.createCollider(rubbleShape(r.mesh.geometry,r.size).setTranslation(p.x,p.y,p.z).setRotation(q).setFriction(.9));
        const entry={origin:r.originId,slot:r.slot,chip:r.kind==='wall-chip',mass:r.body.mass(),matrix:matrix.toArray(),size:r.size.toArray(),geometry:encodeGeometry(r.mesh.geometry)};
        this.settledColliders ||= new Map();this.settledColliders.set(entry,collider);this.settled.push(entry);this.physics.remove(r);
    }
    reactivate(hit,direction,damage){
        const mesh=hit.object,slot=hit.instanceId??mesh.userData.logicalSlots?.get(hit.batchId),entry=this.settled.find(p=>p.slot===slot&&(p.chip?this.chips:this.rubble).get([...this.physics.panes.keys()].find(m=>m.userData.glassId===p.origin))===mesh);
        if(!entry)return false;
        const size=new THREE.Vector3(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();new THREE.Matrix4().fromArray(entry.matrix).decompose(position,rotation,size);
        const geometry=decodeGeometry(entry.geometry),chunk=new THREE.Mesh(geometry,finishMaterial(mesh.material));chunk.position.copy(position);chunk.quaternion.copy(rotation);chunk.scale.copy(size);chunk.castShadow=chunk.receiveShadow=true;this.physics.game.scene.add(chunk);
        const r=this.physics.addBody(chunk,size,{mass:entry.mass??size.x*size.y*size.z*1700,kind:entry.chip?'wall-chip':'structural',convex:true});
        r.destination=mesh;r.slot=slot;r.originId=entry.origin;r.age=0;r.still=0;r.fractured=Math.max(size.x,size.y,size.z)<.18;r.needsSplit=!r.fractured&&damage>=35;
        const collider=this.settledColliders?.get(entry);if(collider)this.physics.world.removeCollider(collider,true);this.settledColliders?.delete(entry);
        mesh.setMatrixAt(slot,zero);mesh.instanceMatrix.needsUpdate=true;this.settled.splice(this.settled.indexOf(entry),1);
        r.body.applyImpulseAtPoint(direction.clone().multiplyScalar(Math.min(18,damage*.12)),hit.point||position,true);return true;
    }
    serialize() {
        const chipped=[...this.chips.keys()].flatMap(parent=>parent.userData.panes.flatMap((pane,index)=>pane.fragmented?[{origin:parent.userData.glassId,index,legacy:pane.fragmented.legacy,warped:pane.fragmented.warped,impact:pane.fragmented.impact?.toArray(),impactDamage:pane.impactDamage||0,damaged:pane.fragmented.pieces.filter(p=>!p.broken&&p.health<p.maxHealth).map(p=>({piece:p.slot-index*18,health:p.health})),removed:pane.fragmented.pieces.filter(p=>p.broken).map(p=>p.slot-index*18),queued:pane.fragmented.pieces.filter(p=>p.queued).map(p=>({piece:p.slot-index*18,direction:p.queuedDirection.toArray(),impulseNs:p.queuedImpulseNs||0,point:p.queuedImpactPoint?.toArray()}))}]:[]));
        const falling=[...this.physics.dynamic.values()].filter(r=>r.destination).map(r=>({origin:r.originId,slot:r.slot,chip:r.kind==='wall-chip',fractured:r.fractured,mass:r.body.mass(),spin:r.body.angvel(),matrix:new THREE.Matrix4().compose(new THREE.Vector3().copy(r.body.translation()),new THREE.Quaternion().copy(r.body.rotation()),r.size).toArray(),size:r.size.toArray(),geometry:encodeGeometry(r.mesh.geometry),velocity:r.body.linvel()}));
        return {version:2,chipped,settled:this.settled,falling,decorations:this.decorations.serialize()};
    }
    restore(data) {
        if(!data)return;const parents=new Map([...this.physics.panes.keys()].filter(m=>!m.userData.damageOwned).map(m=>[m.userData.glassId,m]));
        for(const c of data.chipped||[]){const parent=parents.get(c.origin);if(!parent||!parent.userData.panes[c.index])continue;const wasBroken=parent.userData.panes[c.index].broken,fragment=this.fragment(parent,c.index,c.legacy??data.version!==2,c.impact?new THREE.Vector3().fromArray(c.impact):undefined,c.warped??!c.impact);for(const i of c.removed){const part=fragment.pieces[i];if(part){part.broken=true;fragment.mesh.setMatrixAt(part.slot,zero);}}for(const damaged of c.damaged||[]){const part=fragment.pieces[damaged.piece];if(part&&!part.broken&&Number.isFinite(damaged.health))part.health=Math.min(part.maxHealth,damaged.health);}for(const pending of c.queued||[]){const part=fragment.pieces[pending.piece];if(part&&!part.broken){part.queued=true;part.pendingColliderDisabled=true;part.queuedDirection=new THREE.Vector3().fromArray(pending.direction);part.queuedImpulseNs=pending.impulseNs||0;part.queuedImpactPoint=pending.point?new THREE.Vector3().fromArray(pending.point):part.position.clone();this.pending.push({mesh:fragment.mesh,part,direction:part.queuedDirection,impulseNs:part.queuedImpulseNs,point:part.queuedImpactPoint});}}parent.userData.panes[c.index].broken=wasBroken||c.removed.length===fragment.pieces.length;parent.userData.panes[c.index].impactDamage=c.impactDamage||0;this.sectionHealth(parent.userData.panes[c.index]);if(wasBroken||parent.userData.panes[c.index].health<=0||parent.userData.panes[c.index].pendingColliderDisabled)for(const part of fragment.pieces)part.pendingColliderDisabled=true;fragment.mesh.instanceMatrix.needsUpdate=true;this.physics.rebuildSectionCollider(fragment.mesh);}
        for(const c of [...(data.settled||[]),...(data.falling||[])]){
            const parent=parents.get(c.origin);if(!parent)continue;const destination=this.pool(parent,c.chip),matrix=new THREE.Matrix4().fromArray(c.matrix),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),size=new THREE.Vector3();matrix.decompose(position,rotation,size);
            const geometry=c.geometry?decodeGeometry(c.geometry):fractureGeometry();
            if(c.velocity){const pane={position,quaternion:rotation,size,geometry,geometryBaked:true,density:c.mass?c.mass/(size.x*size.y*size.z):1700},r=this.fall(c.chip?destination:parent,pane,c.chip?c.slot:Math.floor(c.slot/4),c.chip?'wall-chip':'structural',new THREE.Vector3());r.slot=c.slot;destination.userData.nextFragmentSlot=Math.max(destination.userData.nextFragmentSlot,c.slot+1);r.fractured=!!c.fractured;r.originId=c.origin;r.destination=destination;r.body.setLinvel(c.velocity,true);if(c.spin)r.body.setAngvel(c.spin,true);}
            else {destination.setFragment(c.slot,geometry,matrix);destination.instanceMatrix.needsUpdate=true;destination.computeBoundingBox();destination.computeBoundingSphere();const collider=this.physics.world.createCollider(rubbleShape(geometry,size).setTranslation(position.x,position.y,position.z).setRotation(rotation).setFriction(.9));this.settledColliders ||= new Map();this.settledColliders.set(c,collider);this.settled.push(c);}
        }
        this.decorations.restore(data.decorations);
    }
    dispose() {
        this.decorations.restoreOriginal();
        this.dust?.dispose();
        const owned=new Set([...this.chips.values(),...this.rubble.values()]);
        this.physics.game.worldManager.colliders=this.physics.game.worldManager.colliders.filter(m=>!owned.has(m));
        for(const mesh of owned)this.physics.disposeMesh(mesh);this.chips.clear();this.rubble.clear();this.pending=[];this.settled=[];this.settledColliders?.clear();
    }
}
