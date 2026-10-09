import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {StorageInstancedBufferAttribute} from 'three/webgpu';
import {attachCellDimensions} from '../../world/CellDimensions.js';
import {mergeCollisionBoxes} from './MergeCollisionBoxes.js';

const zero=new THREE.Matrix4().makeScale(0,0,0);
/** Retain connected unsupported members as one compound rigid body, not a queue
 * of thousands of independently suspended pieces. Source geometry is exchanged
 * only after both the physical body and its rendered replacement exist. */
export class CityIslands {
    constructor(physics){this.physics=physics;this.serial=0;this.materials=new Set();}
    promote(cells,centerOverride,exchange=true){
        if(!cells.length)return null;
        cells=cells.slice();if(exchange){const bounds=new THREE.Box3();for(const c of cells)bounds.expandByPoint(c.pane.position);bounds.expandByScalar(1.2);const owner=cells[0].mesh.userData.structureId?.replace("structure:","");for(const [mesh]of this.physics.panes)if(mesh.userData.glassWindows&&mesh.userData.glassId===owner)mesh.userData.panes.forEach((pane,index)=>{if(!pane.broken&&bounds.containsPoint(pane.position))cells.push({mesh,pane,index});});}
        const center=centerOverride?.clone()||new THREE.Vector3(),root=new THREE.Group(),buckets=new Map();
        if(!centerOverride){let mass=0;for(const {pane:p}of cells){const m=p.size.x*p.size.y*p.size.z*(p.density||2500);center.addScaledVector(p.position,m);mass+=m;}center.divideScalar(mass);}
        root.position.copy(center);root.name='retained-city-island';root.castShadow=true;
        for(const cell of cells){let bucket=buckets.get(cell.mesh);if(!bucket){bucket=[];buckets.set(cell.mesh,bucket);}bucket.push(cell);}
        const members=[];
        for(const [source,list]of buckets){
            const material=source.material;this.materials.add(material);const mesh=new THREE.InstancedMesh(source.geometry.type==='BoxGeometry'?new THREE.BoxGeometry(1,1,1):source.geometry.clone(),material,list.length);
            if(this.physics.game.renderer.backend?.isWebGPUBackend)mesh.instanceMatrix=new StorageInstancedBufferAttribute(mesh.instanceMatrix.array,16);
            else if(this.physics.game.renderer.getContext){const gl=this.physics.game.renderer.getContext(),capacity=Math.floor(gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE)/64)+1;if(mesh.count<capacity){const array=new Float32Array(capacity*16);array.set(mesh.instanceMatrix.array);mesh.instanceMatrix=new THREE.InstancedBufferAttribute(array,16);}}
            attachCellDimensions(mesh);
            mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
            for(let i=0;i<list.length;i++){const cell=list[i],p=cell.pane,local=p.position.clone().sub(center);mesh.setMatrixAt(i,new THREE.Matrix4().compose(local,p.quaternion,p.size));members.push({cell,local,visual:mesh,slot:i,health:p.maxHealth||4});}
            mesh.computeBoundingBox();mesh.computeBoundingSphere();
        }
        const description=this.shape(members),mass=members.reduce((sum,{cell:{pane:p}})=>sum+p.size.x*p.size.y*p.size.z*(p.density||2500),0);
        this.physics.game.scene.add(root);
        let record;
        try{record=this.physics.addBody(root,new THREE.Vector3(1,1,1),{mass,kind:'structural-island',id:'island:'+this.serial++,collider:description});}
        catch(error){this.physics.disposeMesh(root);throw error;}
        record.islandMembers=members;record.islandCenter=center;record.impactEnergy=0;record.contactLoadN=0;
        record.shockLimitN=members.reduce((sum,{cell:{pane:p}})=>sum+p.size.x*p.size.y*p.size.z*(p.density||2500)*(p.density>=2800?4:p.density<=1100?1.4:1.8),0)*9.81;
        const changed=new Set();if(exchange)for(const {cell}of members){cell.pane.broken=true;cell.pane.pendingColliderDisabled=true;cell.mesh.setMatrixAt(cell.index,zero);cell.mesh.instanceMatrix.needsUpdate=true;changed.add(cell.mesh);}
        for(const mesh of changed){mesh.visible=!mesh.userData.panes.every(p=>p.broken||p.fragmented);this.physics.rebuildSectionCollider(mesh);}
        this.physics.game.renderer.shadowMap.needsUpdate=true;return record;
    }
    shape(members){const boxes=mergeCollisionBoxes(members);return RAPIER.ColliderDesc.compound(boxes.map(b=>new RAPIER.Cuboid(b.size.x/2,b.size.y/2,b.size.z/2)),boxes.map(b=>b.position),boxes.map(b=>b.rotation),0);}
    hit(record,hit,direction,damage){
        const local=hit.point.clone().sub(record.mesh.position).applyQuaternion(record.mesh.quaternion.clone().invert());
        let nearest=null,distance=Infinity;for(const m of record.islandMembers){const d=m.local.distanceToSquared(local);if(d<distance){nearest=m;distance=d;}}
        if(!nearest)return;
        record.body.applyImpulseAtPoint(direction.clone().multiplyScalar(Math.min(4,damage*.08)),hit.point,true);
        nearest.health-=Math.max(0,damage)*1.2;
        if(nearest.health<=0)this.release(record,[nearest]);
    }
    release(record,members){
        const rotation=new THREE.Quaternion().copy(record.body.rotation()),position=new THREE.Vector3().copy(record.body.translation()),velocity=new THREE.Vector3().copy(record.body.linvel()),spin=new THREE.Vector3().copy(record.body.angvel());
        for(const m of members){
            const p=m.cell.pane,offset=m.local.clone().applyQuaternion(rotation),pane={...p,density:p.density||2500,position:position.clone().add(offset),quaternion:rotation.clone().multiply(p.quaternion)};
            if(m.cell.mesh.userData.glassWindows){const id=`glass:${m.cell.mesh.userData.glassId}:${m.cell.index}`;this.physics.models.emit({id,size:p.size,position:pane.position,rotation:pane.quaternion,mass:p.size.x*p.size.y*p.size.z*2500,material:m.cell.mesh.material,materialId:'glass',velocity:velocity.clone().add(spin.clone().cross(offset)),angular:spin,direction:new THREE.Vector3()});this.physics.models.destroyed.add(id);}
            else{const shard=this.physics.masonry.fall(m.cell.mesh,pane,m.cell.index,'structural');shard.body.setLinvel(velocity.clone().add(spin.clone().cross(offset)),true);shard.body.setAngvel(spin,true);}
            m.visual.setMatrixAt(m.slot,zero);m.visual.instanceMatrix.needsUpdate=true;
        }
        const released=new Set(members);record.islandMembers=record.islandMembers.filter(m=>!released.has(m));
        if(!record.islandMembers.length){this.physics.remove(record);return;}
        const previous=record.body.collider(0);this.physics.world.removeCollider(previous,false);
        const mass=record.islandMembers.reduce((sum,{cell:{pane:p}})=>sum+p.size.x*p.size.y*p.size.z*(p.density||2500),0);
        this.physics.world.createCollider(this.shape(record.islandMembers).setMass(mass).setFriction(.8).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(20000),record.body);record.body.recomputeMassPropertiesFromColliders();record.body.wakeUp();
    }
    contact(record,force){
        record.contactLoadN+=force;
        // A hard collision weakens a local patch. Slow gravity loading must not
        // pulverise an entire building in one frame.
        if((record.recentImpactVelocity?.length()||0)<3.5)return;
        record.impactEnergy=Math.max(record.impactEnergy,force/60);
    }
    update(){for(const record of this.physics.dynamic.values()){
        if(record.kind!=='structural-island')continue;
        const load=record.contactLoadN;record.contactLoadN=0;
        // The graph has already lost its foundations. Collision shock and
        // concentrated pile loads can now fracture the retained assembly into
        // floor sections, then bays. Never keep a tower as an unbreakable monolith.
        if(record.islandMembers.length>=2&&(record.needsMacroSplit||load>record.shockLimitN)){
            record.needsMacroSplit=true;if(this.splitAssembly(record))continue;
        }
        if(record.impactEnergy<500)continue;
        record.impactEnergy=0;let lowest=null,y=Infinity;
        const rotation=new THREE.Quaternion().copy(record.body.rotation());for(const m of record.islandMembers){const height=m.local.clone().applyQuaternion(rotation).y;if(height<y){y=height;lowest=m;}}
        if(lowest&&this.physics.dynamic.size<384)this.release(record,[lowest]);
    }}
    splitAssembly(record){
        const reference=record.islandMembers.find(m=>m.cell.pane.localPosition)?.cell.pane,base=reference?reference.position.y-reference.localPosition.y:0;
        const bands=new Map();for(const member of record.islandMembers){const y=member.cell.pane.position.y-base,band=Math.floor((y+.01)/3.3);let list=bands.get(band);if(!list){list=[];bands.set(band,list);}list.push(member);}
        let groups=[...bands.values()];if(groups.length===1){const center=new THREE.Vector3();for(const m of record.islandMembers)center.add(m.local);center.divideScalar(record.islandMembers.length);const bays=new Map();
            for(const m of record.islandMembers){const key=(m.local.x<center.x?0:1)+(m.local.z<center.z?0:2);let list=bays.get(key);if(!list){list=[];bays.set(key,list);}list.push(m);}groups=[...bays.values()];
        }
        if(groups.length===1){const bounds=new THREE.Box3();for(const m of record.islandMembers)bounds.expandByPoint(m.local);const extent=bounds.getSize(new THREE.Vector3()),axis=extent.x>=extent.y&&extent.x>=extent.z?'x':extent.y>=extent.z?'y':'z',ordered=record.islandMembers.slice().sort((a,b)=>a.local[axis]-b.local[axis]),mid=Math.ceil(ordered.length/2);groups=[ordered.slice(0,mid),ordered.slice(mid)].filter(g=>g.length);}
        const cap=this.physics.game.settings?.quality==='ultra'?256:128;let active=0;for(const r of this.physics.dynamic.values())if(r.kind==='structural-island'&&!r.body.isSleeping())active++;if(groups.length<2||active+groups.length-1>cap)return false;
        const position=new THREE.Vector3().copy(record.body.translation()),rotation=new THREE.Quaternion().copy(record.body.rotation()),velocity=new THREE.Vector3().copy(record.body.linvel()),spin=new THREE.Vector3().copy(record.body.angvel()),children=[];
        try{for(const group of groups){const child=this.promote(group.map(m=>m.cell),undefined,false),offset=child.islandCenter.clone().sub(record.islandCenter).applyQuaternion(rotation);child.mesh.position.copy(position).add(offset);child.mesh.quaternion.copy(rotation);child.body.setTranslation(child.mesh.position,true);child.body.setRotation(rotation,true);child.previous.copy(child.mesh.position);child.previousRotation.copy(rotation);child.body.setLinvel(velocity.clone().add(spin.clone().cross(offset)),true);child.body.setAngvel(spin,true);const health=new Map(group.map(m=>[m.cell,m.health]));for(const m of child.islandMembers)m.health=health.get(m.cell);children.push(child);}}
        catch(error){for(const child of children)this.physics.remove(child);throw error;}
        this.physics.remove(record);this.physics.game.renderer.shadowMap.needsUpdate=true;return true;
    }
    serialize(){return [...this.physics.dynamic.values()].filter(r=>r.kind==='structural-island').map(r=>({id:r.id,center:r.islandCenter.toArray(),members:r.islandMembers.map(m=>({origin:m.cell.mesh.userData.glassId,index:m.cell.index,health:m.health})),position:r.body.translation(),rotation:r.body.rotation(),velocity:r.body.linvel(),angular:r.body.angvel(),sleeping:r.body.isSleeping()}));}
    restore(states){const parents=new Map([...this.physics.panes.keys()].filter(m=>!m.userData.damageOwned).map(m=>[m.userData.glassId,m]));for(const state of states||[]){
        const cells=state.members.map(m=>({mesh:parents.get(m.origin),index:m.index}));for(const c of cells)c.pane=c.mesh?.userData.panes[c.index];
        if(cells.some(c=>!c.pane))throw Error('Saved destruction island references missing city geometry');
        const r=this.promote(cells,new THREE.Vector3().fromArray(state.center));r.id=state.id;
        r.mesh.position.copy(state.position);r.mesh.quaternion.copy(state.rotation);r.body.setTranslation(state.position,true);r.body.setRotation(state.rotation,true);r.previous.copy(state.position);r.previousRotation.copy(state.rotation);
        r.body.setLinvel(state.velocity,true);r.body.setAngvel(state.angular,true);r.islandMembers.forEach((m,i)=>m.health=state.members[i].health??m.health);if(state.sleeping)r.body.sleep();
    }for(const state of states||[])this.serial=Math.max(this.serial,Number(String(state.id).split(':').at(-1))+1||0);}
}
