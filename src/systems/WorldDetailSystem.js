import {fidelityState} from '../render/FidelityPolicy.ts';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { globalEventBus } from '../core/EventBus.js';

const CONTACT_KINDS=new Set(['prop','structural','wall-chip','model-fragment','city-fitting']);
/** Bounded nearby lighting and soft contact shading; no full-scene AO pass. */
export class WorldDetailSystem {
    constructor(game) {
        this.game=game;this.clock=0;this.contactPool=Array.from({length:24},()=>({id:null,p:null,size:null,d:0,halfY:0}));this.contactCount=0;this.actorSize={x:.55,y:0,z:.4};this.ray=new RAPIER.Ray({x:0,y:0,z:0},{x:0,y:-1,z:0});this.contactMatrix=new THREE.Matrix4();this.contactPosition=new THREE.Vector3();this.contactScale=new THREE.Vector3();this.contactRotation=new THREE.Quaternion();this.floorCache=new Map();this.lights=[];
        for(let i=0;i<2;i++){const light=new THREE.PointLight(0xffe3ba,0,8,2);light.castShadow=false;game.scene.add(light);this.lights.push(light);}
        const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
        gradient.addColorStop(0,'rgba(255,255,255,.8)');gradient.addColorStop(.45,'rgba(255,255,255,.3)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
        this.texture=new THREE.CanvasTexture(c);this.material=new THREE.MeshBasicMaterial({color:0x0b0c09,map:this.texture,transparent:true,opacity:.25,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
        this.geometry=new THREE.PlaneGeometry(1,1);this.geometry.rotateX(-Math.PI/2);
        this.opacity=new THREE.InstancedBufferAttribute(new Float32Array(24),1);this.geometry.setAttribute('contactOpacity',this.opacity);
        this.material.userData.contactShading=true;
        this.contacts=new THREE.InstancedMesh(this.geometry,this.material,24);this.contacts.frustumCulled=false;this.contacts.raycast=()=>{};game.scene.add(this.contacts);
        this.offLevel=globalEventBus.on('level:loaded',()=>{this.floorCache.clear();this.selection=[];});
        this.update(0);
    }
    update(dt) {
        const g=this.game,p=g.player?.position;if(!p)return;
        const wet=THREE.MathUtils.clamp(g.weatherSystem?.params.rainIntensity||0,0,1);
        for(const object of g.scene.children)if(object.userData.type==='merged:tex:asphalt') {
            object.material.roughness=THREE.MathUtils.lerp(.94,.38,wet);
            object.material.envMapIntensity=THREE.MathUtils.lerp(.06,.35,wet);
        }
        this.clock+=dt;const count=g.settings.quality==='low'?0:g.settings.quality==='medium'?1:2;
        if(!this.selection||this.clock>=.3){this.clock=0;this.selection=(g.worldManager.buildingSpots||[]).map((s,i)=>({s,i,d:(s.x-p.x)**2+(s.z-p.z)**2})).filter(v=>v.d<22*22).sort((a,b)=>a.d-b.d).slice(0,2);}
        for(let i=0;i<2;i++) {
            const light=this.lights[i],entry=this.selection[i];light.visible=i<count;light.intensity=0;if(!entry||!light.visible)continue;
            const s=entry.s;light.position.set(s.x,s.baseY+2.75,s.z-.7);
            const sun=g.dayNightCycle.sunLight.intensity;
            light.color.copy(g.dayNightCycle.sunLight.color);light.intensity=Math.min(6,sun*2);
            if(g.dayNightCycle.isNight()&&entry.i%11===0&&!s.isDamaged){light.color.set(0xffd4a0);light.intensity=3.2;}
        }
        this.contacts.visible=count>0;if(!count)return;
        this.contactCount=0;this.contactOrigin=p;
        for(const r of g.physicsSystem?.dynamic.values()||[])if(CONTACT_KINDS.has(r.kind)){r.contactId||=('body:'+r.body.handle);this.offerContact(r.contactId,r.mesh.position,r.boundsSize||r.size,r.mesh.quaternion);}
        for(const n of g.physicsSystem?.fixture?.nodes||[])if(n.alive&&n.loose){n.contactId||=('fixture:'+n.id);this.offerContact(n.contactId,n.mesh.position,n.size,n.mesh.quaternion);}
        for(const e of g.worldManager.entities.values())if(e.isActive!==false&&e.alive!==false&&(e.tags?.has('enemy')||e.tags?.has('npc')))this.offerContact(e.id,e.position,this.actorSize);
        for(let i=0;i<24;i++) {
            const c=i<this.contactCount?this.contactPool[i]:null;this.opacity.setX(i,0);if(!c){this.contacts.setMatrixAt(i,this.contactMatrix.makeScale(0,0,0));continue;}
            let floor=this.floorCache.get(c.id);
            if(!floor||floor.p.distanceToSquared(c.p)>.02||performance.now()-floor.time>300) {
                const origin=this.ray.origin;origin.x=c.p.x;origin.y=c.p.y+Math.max(.2,c.halfY);origin.z=c.p.z;
                const hit=g.physicsSystem.world.castRay(this.ray,5,true,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
                if(!floor){floor={p:c.p.clone(),time:0,y:0};this.floorCache.set(c.id,floor);if(this.floorCache.size>256)this.floorCache.delete(this.floorCache.keys().next().value);}floor.p.copy(c.p);floor.time=performance.now();floor.y=hit?origin.y-hit.timeOfImpact:g.worldManager.getTerrainHeight(c.p.x,c.p.z);
            }
            const gap=Math.max(0,c.p.y-c.halfY-floor.y),opacity=Math.max(0,1-gap*2);
            this.opacity.setX(i,opacity);this.contacts.setMatrixAt(i,this.contactMatrix.compose(this.contactPosition.set(c.p.x,floor.y+.006,c.p.z),this.contactRotation,this.contactScale.set(Math.max(.45,c.size.x)*1.55,1,Math.max(.35,c.size.z)*1.55)));
        }
        this.opacity.needsUpdate=true;this.contacts.instanceMatrix.needsUpdate=true;
    }
    offerContact(id,p,size,q){
        const d=p.distanceToSquared(this.contactOrigin);if(d>=18*18)return;const limit=fidelityState.contactLimit;let index=this.contactCount;
        if(index<limit)this.contactCount++;else{index=0;for(let i=1;i<limit;i++)if(this.contactPool[i].d>this.contactPool[index].d)index=i;if(d>=this.contactPool[index].d)return;}
        const c=this.contactPool[index];c.id=id;c.p=p;c.size=size;c.d=d;c.halfY=size.y/2;
        if(q){const x=q.x,y=q.y,z=q.z,w=q.w;c.halfY=(Math.abs(2*(x*y+z*w))*size.x+Math.abs(1-2*(x*x+z*z))*size.y+Math.abs(2*(y*z-x*w))*size.z)/2;}
    }
    dispose(){this.offLevel?.();this.contacts.removeFromParent();this.geometry.dispose();this.material.dispose();this.texture.dispose();for(const light of this.lights){light.removeFromParent();light.dispose();}}
}
