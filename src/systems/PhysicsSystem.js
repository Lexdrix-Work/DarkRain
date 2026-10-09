import {StaticSolids} from './destruction/StaticSolids.js';
import {Explosives} from './destruction/Explosives.js';
import {spawnTutorialProps} from '../world/TutorialTunnel.js';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';
import { breakPane } from '../world/GlassWindows.js';
import { WALL_SECTION_HEALTH } from '../world/DestructibleWalls.js';
import { StructuralIntegrity } from './StructuralIntegrity.js';
import { MasonryDamage } from './MasonryDamage.js';
import { DestructionFixture } from './destruction/DestructionFixture.js';
import { BreakableModels } from './destruction/BreakableModels.js';
import {cityBodyBudget,cityBodyCounts} from './destruction/CityBodyBudget.js';
import {CityIslands} from './destruction/CityIslands.js';

let ready;
export const initPhysics=()=>ready ||= RAPIER.init();
const ZERO={x:0,y:0,z:0};
const vec=value=>new THREE.Vector3(value.x,value.y,value.z);

export class PhysicsSystem {
    constructor(game){this.game=game;this.dynamic=new Map();this.panes=new Map();this.actors=new Map();this.accumulator=0;this.propSerial=0;this.fragments=0;this._bodyPool=[];this._actorPool=[];this._activeActors=new Set();this._actorPosition=new THREE.Vector3();this._bodyPosition=new THREE.Vector3();this._bodyRotation=new THREE.Quaternion();this._contactNormal=new THREE.Vector3();this._collisionHandler=(a,b,started)=>{this.fixture?.collision(a,b,started);this.models?.collision(a,b,started);};this._forceHandler=event=>this.contactForceEvent(event); }
    async init(){await initPhysics();this.rebuild();this.offLevel=globalEventBus.on('level:loaded',()=>this.rebuild());}
    rebuild() {
        this.fixture?.dispose();this.fixture=null;
        this.masonry?.dispose();
        this.game.ragdollSystem?.clear();
        for(const record of this.dynamic.values())this.disposeMesh(record.mesh);
        this.dynamic.clear();this.panes.clear();this.actors.clear();this.world?.free();this.accumulator=0;this.propSerial=0;
        this.contactQueue?.free();this.contactQueue=new RAPIER.EventQueue(true);this.sectionHandles=new Map();
        this._bodyPool.length=this._actorPool.length=0;
        this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=1/60;
        this.world.numSolverIterations=6;this.staticColliderByMesh=new Map();
        const colliders=new Set(this.game.worldManager.colliders);if(this.game.worldManager.terrainMesh)colliders.add(this.game.worldManager.terrainMesh);
        for(const mesh of colliders) {
            mesh.updateMatrixWorld(true);
            if(mesh.userData.panes) {
                mesh.visible=true;
                mesh.userData.panes.forEach((pane,i)=>{
                    pane.broken=false;delete pane.fragmented;delete pane.pendingColliderDisabled;delete pane.impactDamage;pane.health=pane.maxHealth??(mesh.userData.wallSections?WALL_SECTION_HEALTH:1);mesh.setMatrixAt(i,pane.matrix);
                });mesh.instanceMatrix.needsUpdate=true;this.rebuildSectionCollider(mesh);continue;
            }
            if(!mesh.geometry?.attributes.position||mesh.isInstancedMesh)continue;
            const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),positions=new Float32Array(geometry.attributes.position.array);
            const indices=geometry.index?new Uint32Array(geometry.index.array):Uint32Array.from({length:positions.length/3},(_,i)=>i);
            const invalid=positions.findIndex(v=>!Number.isFinite(v));if(invalid>=0)throw Error('Non-finite static ground vertex '+mesh.userData.type+' '+invalid);try{const collider=this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions,indices,0).setFriction(.8));this.staticColliderByMesh.set(mesh,collider);}catch(error){throw new Error('Static collision mesh '+(mesh.userData.type||mesh.name||mesh.geometry.type)+' failed ('+positions.length+' coordinates, '+indices.length+' indices): '+error.message);}geometry.dispose();
        }
        this.playerBody=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
        this.playerCollider=this.world.createCollider(RAPIER.ColliderDesc.capsule(.6,.3),this.playerBody);
        this.controller=this.world.createCharacterController(.015);this.controller.enableAutostep(.28,.2,false);this.controller.enableSnapToGround(.12);
        this.controller.setApplyImpulsesToDynamicBodies(true);this.controller.setCharacterMass(80);
        this.playerHeight=1.8;this.models=new BreakableModels(this);this.spawnProps();
        this.structure=new StructuralIntegrity(this);this.structure.rebuild();
        this.masonry=new MasonryDamage(this);
        this.islands=new CityIslands(this);this.explosives=new Explosives(this);this.staticSolids=new StaticSolids(this);
        this.world.step();
    }
    rebuildSectionCollider(mesh) {
        if(this._sectionBatch){this._sectionBatch.add(mesh);return;}
        const previous=this.panes.get(mesh);if(previous){this.sectionHandles?.delete(previous.handle);this.world.removeCollider(previous,true);}
        const shapes=[],translations=[],rotations=[];
        // Rectangular cells are exactly boxes: a compound preserves every cell
        // and opening while avoiding 12 triangles/24 duplicated vertices per box.
        for(const pane of mesh.userData.panes){
            if(!pane||pane.broken||pane.fragmented||pane.pendingColliderDisabled)continue;
            if(!pane.matrix.elements.every(Number.isFinite))throw Error('Invalid structural transform '+mesh.userData.structureId);
            let shape=new RAPIER.Cuboid(pane.size.x/2,pane.size.y/2,pane.size.z/2);
            if(pane.geometry){const p=pane.geometry.attributes.position,vertices=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){vertices[i*3]=p.getX(i)*pane.size.x;vertices[i*3+1]=p.getY(i)*pane.size.y;vertices[i*3+2]=p.getZ(i)*pane.size.z;}shape=new RAPIER.ConvexPolyhedron(vertices);}
            shapes.push(shape);translations.push(pane.position);rotations.push(pane.quaternion);
        }
        let collider=null;if(shapes.length){try{collider=this.world.createCollider(RAPIER.ColliderDesc.compound(shapes,translations,rotations,0).setFriction(.7));}catch(error){throw new Error('Structural collision '+mesh.userData.structureId+' ('+shapes.length+' cells) failed: '+error.message);}}

        this.panes.set(mesh,collider);
        if(collider){collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);collider.setContactForceEventThreshold(2500);this.sectionHandles?.set(collider.handle,mesh);}
    }
    beginColliderChanges(){if(this._sectionBatch)throw Error('Nested collider transaction');this._sectionBatch=new Set();}
    endColliderChanges(){const changed=this._sectionBatch;this._sectionBatch=null;for(const mesh of changed)this.rebuildSectionCollider(mesh);}
    spawnProps() {
        if(this.game.worldManager.tutorialDefinition){spawnTutorialProps(this);return;}
        const spots=this.game.worldManager.buildingSpots||[];
        for(let i=0;i<Math.min(24,spots.length);i++) {
            const spot=spots[i* Math.max(1,Math.floor(spots.length/24))];if(!spot)continue;
            const p=new THREE.Vector3(spot.x+spot.width*.24,spot.baseY+.48,spot.z);
            const barrel=i%3===0,size=barrel?new THREE.Vector3(.48,.88,.48):new THREE.Vector3(.65,.55,.55);
            const geometry=barrel?new THREE.CylinderGeometry(.24,.24,.88,20):new THREE.BoxGeometry(...size.toArray());
            const material=new THREE.MeshStandardMaterial({color:barrel?0x465249:0x69523a,roughness:barrel?.68:.9,metalness:barrel?.35:0});
            const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(p);mesh.castShadow=mesh.receiveShadow=true;this.game.scene.add(mesh);
            this.addBody(mesh,size,{mass:barrel?24:12,id:'prop_'+i,health:barrel?Infinity:60});
        }
    }
    addBody(mesh,size,{mass=1,id,health=Infinity,life=Infinity,velocity,kind='prop',convex=false,breakable,collider}={}) {
        // Physical material has no expiry timer. Removal is reserved for an
        // explicit retained replacement, a session restore, or level teardown.
        life=Infinity;
        if(kind==='prop'&&health===Infinity)health=(breakable||mesh.userData.breakable)?.health??(mesh.isGroup?300:150);
        const recipe=breakable||mesh.userData.breakable||(kind==='prop'&&Number.isFinite(health)?{material:mesh.isGroup||(mesh.material?.metalness||0)>.25?'steel':'wood',shape:mesh.geometry?.type==='BoxGeometry'?'box':'mesh'}:null);
        if(recipe&&Number.isFinite(recipe.health)&&health===Infinity)health=recipe.health;
        if(recipe)life=Infinity;
        let body=this._bodyPool.pop();
        if(body){body.setTranslation(mesh.position,false);body.setRotation(mesh.quaternion,false);body.setLinvel(ZERO,false);body.setAngvel(ZERO,false);body.resetForces(false);body.resetTorques(false);body.setEnabled(true);body.wakeUp();}
        else body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(mesh.position.x,mesh.position.y,mesh.position.z).setRotation(mesh.quaternion).setLinearDamping(.3).setAngularDamping(.6).setCcdEnabled(true));
        let shape=collider||RAPIER.ColliderDesc.cuboid(size.x/2,size.y/2,size.z/2);
        // A tiny collision clearance prevents freshly cut, touching fracture
        // faces from wedging into their neighbours. Rendered volume stays whole.
        if(convex){const p=mesh.geometry.attributes.position,vertices=new Float32Array(p.count*3),clearance=['wall-chip','structural'].includes(kind)?.98:1;for(let i=0;i<p.count;i++){vertices[i*3]=p.getX(i)*size.x*clearance;vertices[i*3+1]=p.getY(i)*size.y*clearance;vertices[i*3+2]=p.getZ(i)*size.z*clearance;}shape=RAPIER.ColliderDesc.convexHull(vertices)||shape;}
        if(recipe)shape.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        if(['structural-island','structural','wall-chip'].includes(kind))shape.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(50);
        this.world.createCollider(shape.setMass(mass).setFriction(.6).setRestitution(.07),body);body.recomputeMassPropertiesFromColliders();
        if(velocity)body.setLinvel(velocity,true);
        mesh.userData.physicsBody=body.handle;mesh.userData.physicsDynamic=true;
        mesh.userData.isCollidable=true;
        const record={body,mesh,size:size.clone(),id:id||'fragment_'+this.propSerial++,health,life,kind,convex,breakable:recipe,previous:mesh.position.clone(),previousRotation:mesh.quaternion.clone()};
        this.dynamic.set(body.handle,record);return record;
    }
    disposeMesh(mesh){mesh?.removeFromParent();mesh?.traverse(o=>{if(o.isBatchedMesh)o.dispose();else o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])if(!this.islands?.materials.has(m))m.dispose();});}
    remove(record){
        if(this.dynamic.get(record.body.handle)!==record)return;
        this.dynamic.delete(record.body.handle);let joined=false;const found=()=>{joined=true;};
        this.world.impulseJoints.forEachJointHandleAttachedToRigidBody(record.body.handle,found);this.world.multibodyJoints.forEachJointHandleAttachedToRigidBody(record.body.handle,found);
        if(!joined&&this._bodyPool.length<32){record.body.setEnabled(false);while(record.body.numColliders())this.world.removeCollider(record.body.collider(0),false);this._bodyPool.push(record.body);}
        else this.world.removeRigidBody(record.body);
        this.disposeMesh(record.mesh);
    }
    trimIdlePools(){for(const body of this._bodyPool)this.world.removeRigidBody(body);for(const actor of this._actorPool)this.world.removeRigidBody(actor.body);this._bodyPool.length=this._actorPool.length=0;}
    clipCameraLean(origin,direction,distance){
        this._leanRay ||=new RAPIER.Ray({x:0,y:0,z:0},{x:1,y:0,z:0});Object.assign(this._leanRay.origin,origin);Object.assign(this._leanRay.dir,direction);
        const hit=this.world.castRay(this._leanRay,distance+.08,true,undefined,undefined,this.playerCollider);return hit?Math.min(distance,Math.max(0,hit.timeOfImpact-.08)):distance;
    }
    movePlayer(player,delta) {
        const height=player.isCrouching?1:1.8;
        if(height!==this.playerHeight){this.playerHeight=height;this.playerCollider.setShape(new RAPIER.Capsule(height/2-.3,.3));}
        this.playerBody.setTranslation({x:player.position.x,y:player.position.y+height/2,z:player.position.z},false);
        this.world.propagateModifiedBodyPositionsToColliders();
        this.controller.computeColliderMovement(this.playerCollider,delta);
        const move=this.controller.computedMovement();player.position.add(vec(move));
        if(delta.y>0&&move.y<delta.y-.005)player.velocity.y=0;
        this.playerBody.setNextKinematicTranslation({x:player.position.x,y:player.position.y+height/2,z:player.position.z});
        player.isGrounded=this.controller.computedGrounded();if(player.isGrounded&&player.velocity.y<0)player.velocity.y=0;
        return move;
    }
    moveActor(entity,dx,dz){
        const actor=this.actors.get(entity.id);if(!actor||!this.controller)return false;
        this._actorDelta ||=new THREE.Vector3();this._actorDelta.set(dx,0,dz);
        this.controller.computeColliderMovement(actor.collider,this._actorDelta);
        const movement=this.controller.computedMovement();entity.position.x+=movement.x;entity.position.y+=movement.y;entity.position.z+=movement.z;return true;
    }
    update(dt) {
        const active=this._activeActors;active.clear();
        for(const entity of this.game.worldManager.entities?.values()||[]) {
            if(!entity.tags?.has('enemy')&&!entity.tags?.has('npc'))continue;
            if(entity===this.game.player||!entity.mesh||entity.isActive===false||entity.isCollidable===false||entity.alive===false)continue;
            active.add(entity.id);let actor=this.actors.get(entity.id);
            const height=entity.tags?.has('mutant')?1.2:1.8;
            const p=this._actorPosition.set(entity.position.x,entity.position.y+height/2,entity.position.z);
            if(!actor){actor=this._actorPool.pop();if(actor){actor.collider.setShape(new RAPIER.Capsule(height/2-.3,.3));actor.body.setTranslation(p,false);actor.body.setEnabled(true);}else{const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z));const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(height/2-.3,.3),body);actor={body,collider};}this.actors.set(entity.id,actor);}
            actor.body.setNextKinematicTranslation(p);
        }
        for(const [id,actor]of this.actors)if(!active.has(id)){actor.body.setEnabled(false);if(this._actorPool.length<32)this._actorPool.push(actor);else this.world.removeRigidBody(actor.body);this.actors.delete(id);}
        this.beginColliderChanges();try{this.structure?.update(dt);}finally{this.endColliderChanges();}
        this.accumulator=Math.min(this.accumulator+Math.max(0,dt),.1);
        while(this.accumulator>=1/60) {
            this.fixture?.beforeStep();
            for(const r of this.dynamic.values()){if(r.visualSleeping&&r.body.isSleeping())continue;r.body.translation(r.previous);r.body.rotation(r.previousRotation);
                if(r.breakable||r.kind==='structural-island'||r.kind==='structural'||r.kind==='wall-chip'){r.impactVelocity ||= new THREE.Vector3();r.recentImpactVelocity ||= new THREE.Vector3();r.body.linvel(r.impactVelocity);
                    if(--r.impactAge<=0||!r.impactAge||r.impactVelocity.lengthSq()>r.recentImpactVelocity.lengthSq()){r.recentImpactVelocity.copy(r.impactVelocity);r.impactAge=4;}}}
            this.world.step(this.contactQueue);
            this.contactQueue?.drainCollisionEvents(this._collisionHandler);
            this.contactQueue?.drainContactForceEvents(this._forceHandler);this.accumulator-=1/60;
        }
        const alpha=this.accumulator*60;
        this.models?.update();this.explosives?.update(dt);
        for(const r of this.dynamic.values()) {
            r.life-=dt;if(r.life<=0){this.remove(r);continue;}
            const sleeping=r.body.isSleeping();if(sleeping&&r.visualSleeping)continue;
            r.body.translation(this._bodyPosition);r.body.rotation(this._bodyRotation);r.mesh.position.copy(r.previous).lerp(this._bodyPosition,alpha);r.mesh.quaternion.copy(r.previousRotation).slerp(this._bodyRotation,alpha);
            if(sleeping){r.mesh.position.copy(this._bodyPosition);r.mesh.quaternion.copy(this._bodyRotation);r.previous.copy(this._bodyPosition);r.previousRotation.copy(this._bodyRotation);}
            r.visualSleeping=sleeping;
            r.mesh.updateMatrixWorld(true);
        }
        this.beginColliderChanges();try{this.masonry?.update(dt);this.islands?.update();}finally{this.endColliderChanges();}
        this.fixture?.update();
    }
    contactForceEvent(event){
        const a=event.collider1(),b=event.collider2(),force=event.totalForceMagnitude();
        for(const handle of [a,b]){const body=this.world.getCollider(handle)?.parent(),record=body&&this.dynamic.get(body.handle);if(record?.kind==='structural-island')this.islands?.contact(record,force);else if(record&&!record.fractured&&(record.kind==='structural'||record.kind==='wall-chip')&&record.recentImpactVelocity?.length()>3.5&&force>body.mass()*9.81*3)record.needsSplit=true;}
        const normal=this.fixture?this._contactNormal.copy(event.totalForceDirection()):null;
        this.fixture?.contact(a,force,b,normal);this.fixture?.contact(b,force,a,normal);
        for(let side=0;side<2;side++){
            const mesh=this.sectionHandles?.get(side?b:a);if(!mesh||mesh.userData.damageOwned)continue;
            const collider=this.world.getCollider(side?a:b),body=collider?.parent(),record=body&&this.dynamic.get(body.handle);
            if(record&&(record.kind==='prop'||record.kind==='structural'||record.kind==='wall-chip'||record.kind==='model-fragment'||record.kind==='city-fitting'))this.structure?.contactForce(mesh,record,force,1/60);
        }
    }
    hit(hit,direction,damage) {
        const mesh=hit.object;
        if(mesh.userData.damageOwned&&this.masonry?.reactivate(hit,direction,damage))return true;
        if(mesh.userData.destructFixtureId)return this.fixture?.hit(hit,direction,damage)??false;
        if(mesh.userData.panes) {
            const hitIndex=hit.instanceId??mesh.userData.logicalSlots?.get(hit.batchId);
            const pane=mesh.userData.panes[hitIndex];if(!pane||pane.broken)return true;
            if(mesh.userData.chipParent){this.masonry.hitFragment(mesh,pane,direction,damage,hit.point||pane.position);return true;}
            if(mesh.userData.wallSections&&this.masonry){this.masonry.hit(mesh,hitIndex,hit.point||pane.position,direction,damage);return true;}
            pane.health-=damage;
            this.structure?.damage(mesh);
            if(pane.health<=0)this.breakSection(mesh,hitIndex,direction,true,hit.point);return true;
        }
        for(const rag of this.game.ragdollSystem?.ragdolls||[]) {
            if(!rag.parts)continue;let ancestor=mesh;while(ancestor&&ancestor!==rag.visual)ancestor=ancestor.parent;
            if(ancestor){const part=rag.parts.reduce((a,b)=>vec(a.body.translation()).distanceToSquared(hit.point)<vec(b.body.translation()).distanceToSquared(hit.point)?a:b);
                part.body.applyImpulseAtPoint(direction.clone().multiplyScalar(Math.min(damage*.12,16)),hit.point,true);
                this.game.effectsSystem?.blood.spray(hit.point,direction.clone().negate(),direction);return true;}
        }
        let root=mesh;while(root&&!root.userData.physicsDynamic)root=root.parent;
        const r=this.dynamic.get(root?.userData.physicsBody);if(!r)return this.staticSolids?.hit(hit,direction,damage)??false;
        if(r.kind==='structural-island'){this.islands.hit(r,hit,direction,damage);return true;}
        r.body.applyImpulseAtPoint(direction.clone().multiplyScalar(Math.min(damage*.16,18)),hit.point,true);
        if(r.kind==='structural'&&!r.fractured&&damage>=20)r.needsSplit=true;
        r.health-=damage;
        if(r.health<=0&&r.breakable)this.models.breakRecord(r,direction);
        return true;
    }
    breakSection(mesh,index,direction=new THREE.Vector3(0,0,1),fragments=true,impact) {
        if(mesh.userData.wallSections&&fragments){if(!this.collapseCell({mesh,index,pane:mesh.userData.panes[index]},direction)){mesh.userData.panes[index].health=0;this.structure?.damage(mesh);}this.rebuildSectionCollider(mesh);return;}
        if(!breakPane(mesh,index))return;
        this.rebuildSectionCollider(mesh);
        const pane=mesh.userData.panes[index];if(fragments&&mesh.userData.glassWindows)this.models.breakGlass(mesh,pane,index,direction);
        else if(fragments)this.fragmentsAt(pane.position,pane.size,direction,mesh.userData.wallSections?'rubble':'glass',pane.quaternion,impact);
        this.structure?.damage(mesh);
        this.game.renderer.shadowMap.needsUpdate=true;
        globalEventBus.emit('audio:play',{sound:mesh.userData.wallSections?'wall_break':'glass_break',volume:.6});
    }
    fragmentsAt(position,size,direction,kind,q=new THREE.Quaternion(),impact=position) {
        const glass=kind==='glass',count=glass?18:10;
        for(let i=0;i<count;i++) {
            const shard=.035+Math.random()*.105;
            const sidePane=glass&&size.x<size.z;
            const dim=glass?new THREE.Vector3(Math.min(shard,(sidePane?size.z:size.x)*.3),Math.min(shard*(.6+Math.random()),size.y*.3),.006):new THREE.Vector3(.05+Math.random()*.1,.045+Math.random()*.08,.035+Math.random()*.08);
            const geometry=glass?new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.3+Math.random()*.5,0,-.3+Math.random()*.6,.5,0],3)):new THREE.IcosahedronGeometry(.5,0);geometry.computeVertexNormals();
            if(!geometry.attributes.uv){const p=geometry.attributes.position,uv=new Float32Array(p.count*2);for(let j=0;j<p.count;j++){uv[j*2]=p.getX(j)+.5;uv[j*2+1]=p.getY(j)+.5;}geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}
            const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:glass?0xdbe6e6:kind==='wood'?0x6a4b32:0x807366,transparent:glass,opacity:glass?.19:1,depthWrite:!glass,roughness:glass?.08:.95,metalness:glass?.15:0,envMap:glass?this.game.worldManager.materials.clearGlass?.envMap:null,side:THREE.DoubleSide}));
            mesh.scale.copy(dim);mesh.quaternion.copy(q);
            if(sidePane)mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
            mesh.position.copy(position).add(new THREE.Vector3((Math.random()-.5)*size.x,(Math.random()-.5)*size.y,(Math.random()-.5)*size.z).applyQuaternion(q));this.game.scene.add(mesh);
            const outward=mesh.position.clone().sub(impact).normalize().multiplyScalar(glass?.7:1);
            const velocity=direction.clone().multiplyScalar(.6+Math.random()*1.4).add(outward).add(new THREE.Vector3((Math.random()-.5)*.7,Math.random()*.8,(Math.random()-.5)*.7));
            const fragment=this.addBody(mesh,dim,{mass:glass?.025:.15,velocity,kind:'model-fragment'});fragment.originId='impact:'+this.propSerial;fragment.materialId=kind;
            fragment.body.setAngvel({x:(Math.random()-.5)*12,y:(Math.random()-.5)*12,z:(Math.random()-.5)*12},true);
        }
    }
    collapseCell({mesh,pane,index},direction=new THREE.Vector3()) {
        if(!pane||pane.broken)return false;
        const counts=cityBodyCounts(this),budget=cityBodyBudget(this.game.settings?.quality);
        if(!pane.fragmented&&(counts.structural>=budget.primary||counts.total>=budget.total))return false;
        if(!breakPane(mesh,index))return false;
        if(pane.fragmented){for(const part of pane.fragmented.pieces)part.pendingColliderDisabled=true;for(const part of pane.fragmented.pieces)if(!part.broken)this.masonry.detach(pane.fragmented.mesh,part,direction);this.rebuildSectionCollider(pane.fragmented.mesh);}
        else this.masonry.fall(mesh,pane,index,'structural',direction);
        this.game.renderer.shadowMap.needsUpdate=true;
        // Glazing attached to a failed cell must not hang unsupported in the air.
        for(const [window]of this.panes)if(window.userData.glassWindows&&window.userData.glassId===mesh.userData.structureId.replace('structure:',''))window.userData.panes.forEach((p,i)=>{if(!p.broken&&Math.abs(p.position.y-pane.position.y)<pane.size.y/2+1&&p.position.distanceTo(pane.position)<2)this.breakSection(window,i,undefined,true);});
        return true;
    }
    explode(position,radius=4,strength=150) {
        this.beginColliderChanges();try{
        for(const [mesh]of [...this.panes]){if(mesh.userData.damageOwned)continue;mesh.userData.panes.forEach((p,i)=>{const d=p.position.distanceTo(position);if(!p.broken&&d<radius){p.health-=strength*(1-d/radius);this.structure?.damage(mesh);if(p.health<=0)this.breakSection(mesh,i,p.position.clone().sub(position).normalize());}});}
        }finally{this.endColliderChanges();}
        for(const record of this.staticSolids?.records.values()||[]){if(record.broken)continue;const p=record.mesh.getWorldPosition(new THREE.Vector3()),d=p.distanceTo(position);if(d<radius)this.staticSolids.hit({object:record.mesh,point:p},p.clone().sub(position).normalize(),strength*(1-d/radius));}
        for(const r of [...this.dynamic.values()]){const d=r.mesh.position.distanceTo(position);if(r.kind==='structural-island'){const q=new THREE.Quaternion().copy(r.body.rotation()),center=new THREE.Vector3().copy(r.body.translation());for(const member of [...r.islandMembers]){const p=member.local.clone().applyQuaternion(q).add(center),distance=p.distanceTo(position);if(distance<radius){member.health-=strength*(1-distance/radius);if(member.health<=0&&this.dynamic.has(r.body.handle))this.islands.release(r,[member]);}}}
            if(this.dynamic.has(r.body.handle)&&d<radius){r.body.applyImpulse(r.mesh.position.clone().sub(position).normalize().multiplyScalar(strength*(1-d/radius)*.1),true);
            if(r.breakable){r.health-=strength*(1-d/radius);if(r.health<=0)this.models.pending.add(r.body.handle);}}}
    }
    spawnFixture(origin) {
        this.fixture?.dispose();
        if(!origin){const spots=this.game.worldManager.buildingSpots||[],z=Math.max(0,...spots.map(s=>s.z+Math.max(s.depth||20,s.width||20)))+40;
            origin=new THREE.Vector3(0,this.game.worldManager.getGroundHeight?.(0,z)||0,z);}
        this.fixture=new DestructionFixture(this,origin).build();return this.fixture;
    }
    targets(){return [...this.dynamic.values()].filter(r=>['explosive','prop','corpse-weapon','structural','structural-island','wall-chip','model-fragment','city-fitting'].includes(r.kind)).map(r=>r.mesh).concat([...(this.masonry?.chips.values()||[]),...(this.masonry?.rubble.values()||[])],[...(this.game.ragdollSystem?.ragdolls||[])].filter(r=>r.parts).map(r=>r.visual),this.fixture?.targetsList||[]);}
    serialize(){return {staticSolids:this.staticSolids?.serialize(),explosives:this.explosives?.serialize(),islands:this.islands?.serialize(),models:this.models?.serialize(),fixture:this.fixture?.serialize()||null,pending:[...this.panes.keys()].filter(m=>!m.userData.damageOwned).flatMap(m=>m.userData.panes.flatMap((p,i)=>!p.broken&&p.pendingColliderDisabled?[{id:m.userData.glassId,index:i}]:[])),broken:[...this.panes.keys()].filter(m=>!m.userData.damageOwned).flatMap(m=>m.userData.panes.flatMap((p,i)=>p.broken?[m.userData.glassId+':'+i]:[])),health:[...this.panes.keys()].filter(m=>!m.userData.damageOwned).flatMap(m=>m.userData.panes.flatMap((p,i)=>!p.broken&&!p.fragmented&&p.health<(p.maxHealth??1)?[{id:m.userData.glassId,index:i,value:p.health}]:[])),masonry:this.masonry?.serialize(),props:[...this.dynamic.values()].filter(r=>r.kind==='prop').map(r=>({id:r.id,position:vec(r.body.translation()).toArray(),rotation:new THREE.Quaternion().copy(r.body.rotation()).toArray(),health:Number.isFinite(r.health)?r.health:null,velocity:r.body.linvel(),angular:r.body.angvel(),sleeping:r.body.isSleeping(),modelFailed:!!r.modelFailed}))};}
    restore(data){if(!data)return;this.rebuild();this.explosives?.restore(data.explosives);const broken=new Set(data.broken||[]);for(const m of this.panes.keys())m.userData.panes.forEach((p,i)=>{if(broken.has(m.userData.glassId+':'+i))this.breakSection(m,i,undefined,false);});
        for(const h of data.health||[]){const m=[...this.panes.keys()].find(m=>m.userData.glassId===h.id);if(m?.userData.panes[h.index]){m.userData.panes[h.index].health=h.value;this.structure?.damage(m);}}
        this.masonry?.restore(data.masonry);this.islands?.restore(data.islands);
        this.models?.restore(data.models);this.staticSolids?.restore(data.staticSolids);
        if(data.fixture)this.fixture=DestructionFixture.restore(this,data.fixture);
        for(const pending of data.pending||[]){const m=[...this.panes.keys()].find(m=>m.userData.glassId===pending.id),p=m?.userData.panes[pending.index];if(p&&!p.broken){p.health=0;p.pendingColliderDisabled=true;if(p.fragmented){for(const part of p.fragmented.pieces)part.pendingColliderDisabled=true;this.rebuildSectionCollider(p.fragmented.mesh);}this.rebuildSectionCollider(m);this.structure?.damage(m);}}
        const props=new Map((data.props||[]).map(p=>[p.id,p]));for(const r of [...this.dynamic.values()]){if(r.kind!=='prop')continue;const p=props.get(r.id);if(!p){this.remove(r);continue;}r.body.setTranslation(new THREE.Vector3().fromArray(p.position),true);r.body.setRotation(new THREE.Quaternion().fromArray(p.rotation),true);r.previous.fromArray(p.position);r.previousRotation.fromArray(p.rotation);r.health=p.health??Infinity;r.modelFailed=!!p.modelFailed;r.body.setLinvel(p.velocity||{x:0,y:0,z:0},true);r.body.setAngvel(p.angular||{x:0,y:0,z:0},true);if(p.sleeping)r.body.sleep();if(r.health<=0&&!r.modelFailed)this.models.pending.add(r.body.handle);}}
    dispose(){this.fixture?.dispose();this.fixture=null;this.offLevel?.();this.game.ragdollSystem?.clear();this.masonry?.dispose();for(const r of [...this.dynamic.values()])this.remove(r);this.world?.free();this._bodyPool.length=this._actorPool.length=0;this.contactQueue?.free();this.contactQueue=null;}
}
