import {surfaceCoordinates} from '../../world/SurfaceCoordinates.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { structuralIslands } from './JointConnectivity.ts';
import { fractureSlab, encodeGeometry, decodeGeometry } from './FractureGeometry.ts';
import { globalEventBus } from '../../core/EventBus.js';

const density={concrete:2400,brick:1800,wood:550};
const health={column:650,slab:500,beam:400,wall:120,partition:50,chip:65};
const seedForId=id=>{let seed=2166136261;for(const char of id)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;return seed;};

/** Opt-in, real-joint hero fixture. Static supported islands are an intentional
 * compatibility optimization; load redistribution is an event-driven estimate. */
export class DestructionFixture {
    constructor(physics,origin=new THREE.Vector3()) {
        this.physics=physics;this.world=physics.world;this.game=physics.game;
        this.origin=origin.clone();this.nodes=[];this.edges=[];this.byId=new Map();
        this.ground=new Set();this.failedJointIds=new Set();this.revision=0;this.commands=[];this.targetsList=[];this.secondaryQueue=[];this.secondaryQueued=new Set();
        this.group=new THREE.Group();this.group.name='Dark Rain destruction slice';this.game.scene.add(this.group);
        this.materials=new Map();this.awakeCap=this.game.settings?.quality==='ultra'?192:96;this.colliderNodes=new Map();
        this.residentCap=this.game.settings?.quality==='ultra'?256:128;
        this.fractureCount=this.game.settings?.quality==='ultra'?18:this.game.settings?.quality==='low'?8:12;
        this.positionScratch=new THREE.Vector3();this.rotationScratch=new THREE.Quaternion();
        this.platform=new THREE.Mesh(new THREE.BoxGeometry(28,.4,28),this.material('concrete'));
        const platformSize=new Float32Array(this.platform.geometry.attributes.position.count*3);for(let i=0;i<platformSize.length;i+=3){platformSize[i]=28;platformSize[i+1]=.4;platformSize[i+2]=28;}
        this.platform.geometry.setAttribute('cellSize',new THREE.Float32BufferAttribute(platformSize,3));
        this.platform.position.copy(origin).add(new THREE.Vector3(0,-.2,0));this.platform.receiveShadow=true;this.group.add(this.platform);
        this.floor=this.world.createCollider(RAPIER.ColliderDesc.cuboid(14,.2,14).setTranslation(...this.platform.position.toArray()).setFriction(.8));
        this.targetsList.push(this.platform);
    }
    material(kind) {
        if(!this.materials.has(kind)) {
            // Reuse the city's master textures. Cloning large maps for the fixture
            // wastes VRAM and can exhaust the WebGPU device during first render.
            const m=this.game.worldManager?._mergedBucketMaterial?.(kind,.94,0)||new THREE.MeshStandardMaterial({roughness:.94});
            m.vertexColors=false;m.color.set(kind==='wood'?0x68533e:kind==='brick'?0xb7a69b:0xd3d0c6);m.userData.cellUV=true;m.userData.fractureSurface=true;m.userData.fractureKind=kind;this.materials.set(kind,m);
        }return this.materials.get(kind);
    }
    addNode(id,size,position,kind='wall',material='concrete',bay=-1,geometry=null,volume=null) {
        const mesh=new THREE.Mesh(geometry||new THREE.BoxGeometry(1,1,1),this.material(material));
        surfaceCoordinates(mesh.geometry,size);const cellSize=new Float32Array(mesh.geometry.attributes.position.count*3);for(let i=0;i<cellSize.length;i+=3){cellSize[i]=size.x;cellSize[i+1]=size.y;cellSize[i+2]=size.z;}
        mesh.geometry.setAttribute('cellSize',new THREE.Float32BufferAttribute(cellSize,3));
        mesh.scale.copy(size);mesh.position.copy(position);mesh.castShadow=mesh.receiveShadow=true;
        const index=this.nodes.length,mass=(volume??size.x*size.y*size.z)*density[material];
        mesh.userData.destructFixtureId=id;mesh.userData.isCollidable=true;this.group.add(mesh);mesh.updateMatrixWorld(true);
        const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...position.toArray()));
        const p=mesh.geometry.attributes.position,vertices=new Float32Array(p.count*3);
        for(let i=0;i<p.count;i++){vertices[i*3]=p.getX(i)*size.x;vertices[i*3+1]=p.getY(i)*size.y;vertices[i*3+2]=p.getZ(i)*size.z;}
        const shape=RAPIER.ColliderDesc.convexHull(vertices);if(!shape)throw Error('Invalid fixture hull '+id);
        const collider=this.world.createCollider(shape.setMass(mass).setFriction(.75).setRestitution(.02)
            .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS|RAPIER.ActiveEvents.COLLISION_EVENTS).setContactForceEventThreshold(5000),body);
        const node={id,index,mesh,body,collider,size:size.clone(),mass,kind,material,bay,health:health[kind],alive:true,loose:false,custom:!!geometry,impactVelocity:new THREE.Vector3(),recentVelocity:new THREE.Vector3(),impactAge:0};
        this.nodes.push(node);this.byId.set(id,node);this.targetsList.push(mesh);this.colliderNodes.set(collider.handle,node);return node;
    }
    connect(a,b,{capacity=(a.material==='wood'||b.material==='wood')?8000:(a.material==='brick'||b.material==='brick')?45000:250000,bridge=false}={}) {
        const anchor=a.mesh.position.clone().add(b.mesh.position).multiplyScalar(.5);
        const qa=new THREE.Quaternion().copy(a.body.rotation()).invert(),qb=new THREE.Quaternion().copy(b.body.rotation()).invert();
        const joint=this.world.createImpulseJoint(RAPIER.JointData.fixed(anchor.clone().sub(a.mesh.position).applyQuaternion(qa),qa,anchor.clone().sub(b.mesh.position).applyQuaternion(qb),qb),a.body,b.body,true);
        joint.setContactsEnabled(false);
        const edge={index:this.edges.length,id:`${a.id}|${b.id}:${this.edges.length}`,nodeA:a.index,nodeB:b.index,joint,capacity,bridge,active:true,damage:0};
        this.edges.push(edge);return edge;
    }
    build() {
        const bays=[[-3,-2.25],[3,-2.25],[-3,2.25],[3,2.25]];
        for(let level=0;level<3;level++)for(let bay=0;bay<4;bay++) {
            const [x,z]=bays[bay],pos=(dx,y,dz)=>this.origin.clone().add(new THREE.Vector3(dx,y,dz));
            const column=this.addNode(`column:${level}:${bay}`,new THREE.Vector3(.38,3.05,.38),pos(x,level*3.2+1.525,z),'column','concrete',bay);
            const slab=this.addNode(`slab:${level}:${bay}`,new THREE.Vector3(5.98,.18,4.48),pos(x,(level+1)*3.2-.09,z),'slab','concrete',bay);
            const beam=this.addNode(`beam:${level}:${bay}`,new THREE.Vector3(5.4,.28,.32),pos(x,(level+1)*3.2-.32,z),'beam','concrete',bay);
            this.connect(column,slab);this.connect(beam,slab);this.connect(column,beam);
            if(level===0)this.ground.add(column.index);else this.connect(this.byId.get(`slab:${level-1}:${bay}`),column);
            // Two exterior infill panels per bay. Ground storefront has a door opening.
            let previousWall=null;
            for(let face=0;face<2;face++) {
                const front=z>0,side=x>0;
                const size=face===0?new THREE.Vector3(level===0&&front?4.6:5.98,2.82,.22):new THREE.Vector3(.22,2.82,4.48);
                const wp=face===0?pos(level===0&&front?(side?3.6:-3.6):x,level*3.2+1.65,front?4.5:-4.5):pos(side?6:-6,level*3.2+1.65,z);
                const wall=this.addNode(`wall:${level}:${bay}:${face}`,size,wp,'wall','brick',bay);this.connect(wall,slab);if(previousWall)this.connect(previousWall,wall);previousWall=wall;
            }
        }
        for(let level=0;level<3;level++) {
            for(const [a,b]of [[0,1],[0,2],[1,3],[2,3]])this.connect(this.byId.get(`slab:${level}:${a}`),this.byId.get(`slab:${level}:${b}`),{bridge:true,capacity:a===0?45000:1e7});
            const wood=this.addNode(`partition:${level}`,new THREE.Vector3(.12,2.8,3),this.origin.clone().add(new THREE.Vector3(1.2,level*3.2+1.4,-1)),'partition','wood',1);this.connect(wood,this.byId.get(`slab:${level}:1`));
        }
        this.recompute();return this;
    }
    breakEdge(edge) {
        if(!edge.active)return;edge.active=false;this.failedJointIds.add(edge.id);this.world.removeImpulseJoint(edge.joint,true);edge.joint=null;
        this.record('JointBreak',{id:edge.id});
    }
    record(type,data) {this.commands.push({sequence:++this.revision,type,...data});if(this.commands.length>2048)this.commands.shift();}
    recompute() {
        // Losing the direct column path loads weakened lateral bay bonds.
        // This is cached gravity demand, NOT a measured Rapier joint reaction.
        for(let bay=0;bay<4;bay++) {
            const base=this.byId.get(`column:0:${bay}`);if(!base||this.ground.has(base.index))continue;
            const boundary=this.edges.filter(e=>e.active&&e.bridge&&(this.nodes[e.nodeA].bay===bay||this.nodes[e.nodeB].bay===bay));
            const weight=this.nodes.reduce((sum,n)=>sum+(n.alive&&n.bay===bay?n.mass*9.81:0),0);
            for(const edge of boundary)if(weight/Math.max(1,boundary.length)>edge.capacity)this.breakEdge(edge);
        }
        const islands=structuralIslands(this,Uint8Array.from(this.nodes,n=>n.alive?1:0),Uint8Array.from(this.edges,e=>e.active?1:0),this.ground);
        for(const island of islands)if(!island.grounded){const upper=island.members.some(i=>this.nodes[i].kind==='slab'&&!this.nodes[i].loose);for(const index of island.members)this.release(this.nodes[index]);if(upper&&this.nodes.some(n=>n.id.startsWith('column:0:')&&n.detached))globalEventBus.emit('destruction:surgical',{});}
        this.lastIslands=islands;this.game.renderer&&(this.game.renderer.shadowMap.needsUpdate=true);
    }
    release(node) {
        if(node.loose)return;
        node.loose=true;node.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);node.body.setLinearDamping(.12);node.body.setAngularDamping(.25);node.body.enableCcd(true);
    }
    split(node,count=this.fractureCount) {
        if(!node.alive||node.custom)return false;
        // Keep sixteen slots for critical column failures. Secondary breakup
        // cannot consume the capacity needed to remove the next load path.
        const limit=node.kind==='column'?this.residentCap:this.residentCap-16;
        if(this.nodes.filter(n=>n.alive).length+count-1>limit)return false;
        node.mesh.position.copy(node.body.translation());node.mesh.quaternion.copy(node.body.rotation());
        const pieces=fractureSlab(node.size,count,seedForId(node.id)),rotation=new THREE.Quaternion().copy(node.body.rotation()),velocity=new THREE.Vector3().copy(node.body.linvel()),angular=new THREE.Vector3().copy(node.body.angvel()),com=new THREE.Vector3().copy(node.body.worldCom());
        const oldEdges=this.edges.filter(e=>e.active&&(e.nodeA===node.index||e.nodeB===node.index));
        const children=pieces.map((p,i)=>this.addNode(`${node.id}/shard:${i}`,p.size,node.mesh.position.clone().add(p.offset.clone().applyQuaternion(rotation)), 'chip',node.material,node.bay,p.geometry,p.volume));
        for(const child of children)child.body.setRotation(node.body.rotation(),false);
        const spacing=Math.hypot(node.size.x,node.size.y,node.size.z)/Math.sqrt(count)*1.6;
        for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++)if(children[i].mesh.position.distanceTo(children[j].mesh.position)<spacing)this.connect(children[i],children[j]);
        for(const edge of oldEdges){const other=this.nodes[edge.nodeA===node.index?edge.nodeB:edge.nodeA];this.breakEdge(edge);
            const closest=children.reduce((a,b)=>a.mesh.position.distanceToSquared(other.mesh.position)<b.mesh.position.distanceToSquared(other.mesh.position)?a:b);this.connect(closest,other,{capacity:edge.capacity,bridge:edge.bridge});}
        node.alive=false;this.removeNodeBody(node);this.record('SurfaceFractured',{id:node.id,children:children.map(n=>n.id)});
        if(node.loose){const velocities=children.map(child=>{this.release(child);return velocity.clone().add(angular.clone().cross(new THREE.Vector3().copy(child.body.worldCom()).sub(com)));});
            const drift=new THREE.Vector3();children.forEach((child,i)=>drift.addScaledVector(velocities[i],child.mass/node.mass));drift.sub(velocity);
            children.forEach((child,i)=>{child.body.setLinvel(velocities[i].sub(drift),true);child.body.setAngvel(angular,true);});}
        return children;
    }
    removeNodeBody(node) {
        this.colliderNodes.delete(node.collider.handle);this.world.removeRigidBody(node.body);node.body=null;node.collider=null;
        this.targetsList.splice(this.targetsList.indexOf(node.mesh),1);node.mesh.removeFromParent();node.mesh.geometry.dispose();
    }
    hit(hit,direction,damage) {
        let node=this.byId.get(hit.object.userData.destructFixtureId);if(!node?.alive)return false;
        if(node.kind==='wall'||node.kind==='partition') {
            const children=this.split(node);if(children)node=children.reduce((a,b)=>a.mesh.position.distanceToSquared(hit.point)<b.mesh.position.distanceToSquared(hit.point)?a:b);
        }
        node.health-=damage;
        if(node.loose)node.body.applyImpulseAtPoint(direction.clone().multiplyScalar(Math.min(damage*.25,100)),hit.point,true);
        if(node.health<=0&&!node.detached) {
            node.detached=true;
            this.ground.delete(node.index);
            for(const edge of this.edges)if(edge.active&&(edge.nodeA===node.index||edge.nodeB===node.index))this.breakEdge(edge);
            const children=node.kind==='column'?this.split(node,6):null;
            if(children){for(const child of children){for(const e of this.edges)if(e.active&&(e.nodeA===child.index||e.nodeB===child.index))this.breakEdge(e);this.release(child);
                // Charge energy moves failed COLUMN material, never an artificial building tilt.
                const outward=child.mesh.position.clone().sub(node.mesh.position);outward.y=0;if(outward.lengthSq()<.001)outward.set(1,0,.3);outward.normalize();
                child.body.setLinvel(outward.multiplyScalar(1.2).addScaledVector(direction,.8),true);}}
            else this.release(node);
            if(!children)node.body.applyImpulseAtPoint(direction.clone().multiplyScalar(Math.min(damage*1.6,180)),hit.point,true);
            this.record('MemberDetached',{id:node.id});this.recompute();
            globalEventBus.emit('audio:play',{sound:node.material==='wood'?'wood_break':'wall_break',volume:.6,position:node.mesh.position.clone()});
        }
        this.physics.world.propagateModifiedBodyPositionsToColliders();return true;
    }
    demolishColumn(bay=0) {const n=this.byId.get(`column:0:${bay}`);if(n?.alive&&!n.loose)this.hit({object:n.mesh,point:n.mesh.position},new THREE.Vector3(),1000);}
    demolishAllSupports() {
        for(let bay=0;bay<4;bay++)this.demolishColumn(bay);
        // Resting infill can also carry weight physically. Full demolition must
        // remove those ground-floor supports rather than disabling their collision.
        for(const n of [...this.nodes])if(n.alive&&(n.id.startsWith('wall:0:')||n.id==='partition:0')) {
            const direction=n.mesh.position.clone().sub(this.origin);direction.y=0;direction.normalize();
            this.hit({object:n.mesh,point:n.mesh.position.clone()},direction,1000);
            if(n.alive&&n.loose)n.body.setLinvel(direction.multiplyScalar(1.5),true);
        }
    }
    beforeStep() {for(const n of this.nodes)if(n.alive&&n.loose){n.body.linvel(n.impactVelocity);if(--n.impactAge<=0||n.impactVelocity.lengthSq()>n.recentVelocity.lengthSq()){n.recentVelocity.copy(n.impactVelocity);n.impactAge=4;}}}
    collision(a,b,started) {
        if(!started)return;let normal=null;
        this.world.contactPair(this.world.getCollider(a),this.world.getCollider(b),manifold=>{normal=new THREE.Vector3().copy(manifold.normal());});
        for(const [handle,otherHandle]of [[a,b],[b,a]]) {
            const n=this.colliderNodes.get(handle);if(!n?.loose)continue;
            const speed=n.recentVelocity.length(),impulseForce=n.mass*speed*60;
            this.contact(handle,impulseForce,otherHandle,normal);
        }
    }
    contact(handle,force,otherHandle,normal) {
        const node=this.colliderNodes.get(handle);if(!node||!node.loose||force<5000)return;
        const other=this.colliderNodes.get(otherHandle),relative=node.recentVelocity.clone().sub(other?.recentVelocity||new THREE.Vector3());
        const speed=normal?Math.abs(relative.dot(normal)):relative.length(),effectiveMass=other?.loose?node.mass*other.mass/(node.mass+other.mass):node.mass,energy=.5*effectiveMass*speed*speed;
        const threshold=node.material==='concrete'?8000:node.material==='brick'?1800:500;
        if(!node.custom&&speed>1.8&&energy>threshold&&!this.secondaryQueued.has(node.id)) {this.secondaryQueue.push({id:node.id,energy});this.secondaryQueued.add(node.id);}
        // Contact impacts can break retained assembly bonds; not joint-load telemetry.
        for(const edge of this.edges)if(edge.active&&(edge.nodeA===node.index||edge.nodeB===node.index)) {
            edge.damage+=force>edge.capacity*3?1:Math.max(0,force/edge.capacity-1)/60;
            if(edge.damage>=1)this.breakEdge(edge);
        }
    }
    update() {
        if(!this._collapseRecorded){let floors=0,settled=0;for(const n of this.nodes)if(n.kind==='slab'&&n.alive){floors++;if(n.loose&&n.mesh.position.y<this.origin.y+1.5)settled++;}if(floors&&floors===settled){this._collapseRecorded=true;globalEventBus.emit('destruction:building-collapsed',{id:'hero:'+this.origin.toArray().join(',')});}}
        for(let i=0;i<2&&this.secondaryQueue.length;i++) {
            const job=this.secondaryQueue[0],node=this.byId.get(job.id);
            if(!node?.alive){this.secondaryQueue.shift();this.secondaryQueued.delete(job.id);continue;}
            const children=this.split(node,this.game.settings?.quality==='ultra'?6:4);if(!children)break;
            // Secondary material has already failed; preserve contact-driven motion,
            // but no new fixed bonds are invented between the resulting fragments.
            for(const child of children)for(const edge of this.edges)if(edge.active&&(edge.nodeA===child.index||edge.nodeB===child.index))this.breakEdge(edge);
            this.secondaryQueue.shift();this.secondaryQueued.delete(job.id);this.record('SecondaryFracture',{id:job.id,energy:job.energy});
        }
        for(const node of this.nodes)if(node.alive&&node.loose){node.body.translation(this.positionScratch);node.body.rotation(this.rotationScratch);node.mesh.position.copy(this.positionScratch);node.mesh.quaternion.copy(this.rotationScratch);node.mesh.updateMatrixWorld(true);}
    }
    queryCover(point,radius=20) {return this.nodes.filter(n=>n.alive&&n.mesh.position.distanceTo(point)<=radius&&(!n.loose||n.body.isSleeping())).map(n=>({id:n.id,position:n.mesh.position.toArray(),revision:this.revision,material:n.material,stable:!n.loose||n.body.isSleeping()}));}
    stats() {return {pieces:this.nodes.filter(n=>n.alive).length,awake:this.nodes.filter(n=>n.alive&&n.loose&&!n.body.isSleeping()).length,
        loose:this.nodes.filter(n=>n.alive&&n.loose).length,joints:this.edges.filter(e=>e.active).length,failed:this.failedJointIds.size,
        mass:this.nodes.reduce((sum,n)=>sum+(n.alive?n.mass:0),0),revision:this.revision,cap:this.residentCap,awakeTarget:this.awakeCap,secondaryPending:this.secondaryQueue.length};}
    serialize() {return {version:1,origin:this.origin.toArray(),revision:this.revision,commands:this.commands,failedJointIds:[...this.failedJointIds],secondaryQueue:this.secondaryQueue,
        nodes:this.nodes.map(n=>({id:n.id,size:n.size.toArray(),position:n.alive?n.body.translation():n.mesh.position,rotation:n.alive?n.body.rotation():n.mesh.quaternion,
            kind:n.kind,material:n.material,bay:n.bay,mass:n.mass,health:n.health,alive:n.alive,loose:n.loose,detached:!!n.detached,ground:this.ground.has(n.index),
            geometry:n.custom&&n.alive?encodeGeometry(n.mesh.geometry):null,velocity:n.alive?n.body.linvel():null,angular:n.alive?n.body.angvel():null,sleeping:n.alive&&n.body.isSleeping()})),
        edges:this.edges.filter(e=>e.active).map(e=>({id:e.id,a:this.nodes[e.nodeA].id,b:this.nodes[e.nodeB].id,capacity:e.capacity,bridge:e.bridge,damage:e.damage}))};}
    static restore(physics,data) {
        const f=new DestructionFixture(physics,new THREE.Vector3().fromArray(data.origin));
        for(const saved of data.nodes) {
            if(!saved.alive)continue;
            const n=f.addNode(saved.id,new THREE.Vector3().fromArray(saved.size),new THREE.Vector3().copy(saved.position),saved.kind,saved.material,saved.bay,saved.geometry?decodeGeometry(saved.geometry):null,saved.mass/density[saved.material]);
            n.health=saved.health;n.detached=saved.detached;n.mesh.quaternion.copy(saved.rotation);n.body.setRotation(saved.rotation,false);n.mesh.updateMatrixWorld(true);if(saved.ground)f.ground.add(n.index);
            if(saved.loose){f.release(n);n.body.setLinvel(saved.velocity,true);n.body.setAngvel(saved.angular,true);}
        }
        for(const e of data.edges){const edge=f.connect(f.byId.get(e.a),f.byId.get(e.b),e);edge.id=e.id||edge.id;edge.damage=e.damage;}
        f.commands=data.commands||[];f.failedJointIds=new Set(data.failedJointIds||[]);f.revision=data.revision;f.recompute();
        f.secondaryQueue=data.secondaryQueue||[];f.secondaryQueued=new Set(f.secondaryQueue.map(j=>j.id));
        for(const saved of data.nodes)if(saved.alive&&saved.loose&&saved.sleeping)f.byId.get(saved.id).body.sleep();
        return f;
    }
    dispose() {
        for(const e of this.edges)if(e.active&&e.joint)this.world.removeImpulseJoint(e.joint,true);
        for(const n of this.nodes)if(n.alive)this.removeNodeBody(n);
        this.world.removeCollider(this.floor,true);this.platform.geometry.dispose();this.group.removeFromParent();for(const material of this.materials.values())material.dispose();
    }
}
