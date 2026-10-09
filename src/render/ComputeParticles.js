import * as THREE from 'three';
import {StorageInstancedBufferAttribute, PointsNodeMaterial} from 'three/webgpu';
import * as N from 'three/tsl';
import {fidelityState} from './FidelityPolicy.ts';

/** Cosmetic only: no collisions, damage, structural state or readback on the gameplay thread. */
export class ComputeParticles {
    constructor(scene,quality='high',renderer){
        this.scene=scene;this.renderer=renderer;this.quality=quality;this.dropped=0;this.clock=0;this.pending=[];
        const caps=quality==='ultra'?[1024,4096]:quality==='high'?[512,2048]:quality==='medium'?[256,1024]:[256,512];
        this.banks=caps.map((capacity,index)=>{
            const pa=new StorageInstancedBufferAttribute(capacity,4),va=new StorageInstancedBufferAttribute(capacity,4),ca=new StorageInstancedBufferAttribute(capacity,4),sa=new StorageInstancedBufferAttribute(capacity,2);
            const p=N.storage(pa,'vec4',capacity),v=N.storage(va,'vec4',capacity),c=N.storage(ca,'vec4',capacity),shape=N.storage(sa,'vec2',capacity);
            const dt=N.uniform(0),start=N.uniform(0,'uint'),amount=N.uniform(0,'uint'),seed=N.uniform(0,'uint'),origin=N.uniform(new THREE.Vector3()),normal=N.uniform(new THREE.Vector3()),color=N.uniform(new THREE.Color()),speed=N.uniform(1),life=N.uniform(1),gravity=N.uniform(9.81),drag=N.uniform(3),size=N.uniform(.05);
            const spawn=N.Fn(()=>{
                const i=N.instanceIndex,offset=i.add(capacity).sub(start).mod(capacity);
                N.If(offset.lessThan(amount),()=>{
                    const h=i.add(seed),direction=N.vec3(N.hash(h).sub(.5),N.hash(h.add(17)).sub(.2),N.hash(h.add(43)).sub(.5)).add(normal).normalize();
                    p.element(i).assign(N.vec4(origin,life));v.element(i).assign(N.vec4(direction.mul(speed).mul(N.hash(h.add(81)).add(.5)),gravity));c.element(i).assign(N.vec4(color,life));shape.element(i).assign(N.vec2(drag,size));
                });
            })().compute(capacity);
            const integrate=N.Fn(()=>{
                const a=p.element(N.instanceIndex),b=v.element(N.instanceIndex);
                N.If(a.w.greaterThan(0),()=>{a.w.assign(a.w.sub(dt).max(0));b.y.subAssign(b.w.mul(dt));a.xyz.addAssign(b.xyz.mul(dt));b.xyz.mulAssign(dt.mul(shape.element(N.instanceIndex).x).negate().exp());});
            })().compute(capacity);
            const material=new PointsNodeMaterial({transparent:true,depthWrite:false,sizeAttenuation:true,blending:index?THREE.AdditiveBlending:THREE.NormalBlending});
            material.positionNode=p.element(N.instanceIndex).xyz;material.colorNode=c.element(N.instanceIndex).rgb;
            const fade=p.element(N.instanceIndex).w.div(c.element(N.instanceIndex).w.max(.001)).clamp(0,1),disc=N.uv().sub(.5).length().mul(2).oneMinus().max(0);
            material.opacityNode=fade.mul(disc.mul(disc)).mul(index?.85:.5);material.sizeNode=shape.element(N.instanceIndex).y.mul(index?1:fade.oneMinus().mul(3).add(1));
            const mesh=new THREE.Sprite(material);mesh.geometry=mesh.geometry.clone();mesh.geometry.setAttribute('particlePosition',pa);mesh.geometry.setAttribute('particleVelocity',va);mesh.geometry.setAttribute('particleColor',ca);mesh.geometry.setAttribute('particleShape',sa);mesh.count=capacity;mesh.visible=false;mesh.frustumCulled=false;mesh.name=index?'compute-sparks':'compute-dust';scene.add(mesh);
            mesh.userData.prewarm=true;
            return {capacity,count:0,cursor:0,expires:new Float64Array(capacity),positions:pa.array,geometry:mesh.geometry,material,mesh,spawn,integrate,dt,start,amount,seed,origin,normal,color,speed,life,gravity,drag,size};
        });
        this.initialized=false;
        this.ready=renderer.compileComputeAsync(this.banks.flatMap(b=>[b.spawn,b.integrate])).then(()=>{this.initialized=true;});
        // Surface initialization failures to the owner; never silently claim a working compute path.
        this.ready.catch(error=>{this.error=error;console.error('Dark Rain particle compute warmup failed',error);});
    }
    emit(position,normal,type='concrete',radius=0){
        if(this.pending.length>=32){this.dropped++;return;}
        this.pending.push({position:position.clone(),normal:normal?.clone(),type,radius});
    }
    update(dt){
        if(this.error||!this.initialized)return;dt=Math.min(Math.max(dt,0),.1);this.clock+=dt;
        for(const event of this.pending){
            const {type,radius}=event,b=this.banks[type==='metal'||type==='muzzle'||radius&&type!=='dust'?1:0],dust=type==='dust'||type==='concrete'||type==='brick'||type==='default',wood=type==='wood',glass=type==='glass';
            const base=radius?Math.min(160,32+Math.ceil(radius*24)):type==='flesh'?15:10,desired=Math.max(3,Math.ceil(base*fidelityState.fxDensity));
            b.start.value=b.cursor;b.amount.value=desired;b.seed.value=(b.seed.value+149)>>>0;b.origin.value.copy(event.position);b.normal.value.copy(event.normal||new THREE.Vector3(0,1,0));
            b.life.value=type==='muzzle'?.035:type==='dust'?2.8:dust?1.2:glass?.7:wood?.8:.45;b.gravity.value=dust?-.15:9.81;b.drag.value=dust?1.3:.6;b.speed.value=type==='muzzle'?1:radius?Math.min(8,radius):dust?1.1:4;b.size.value=type==='muzzle'?.08:type==='dust'?.65:dust?.13:glass?.035:wood?.075:.04;
            b.color.value.setHex(type==='flesh'?0x8b0000:type==='muzzle'?0xffdf99:type==='metal'?0xffb65b:wood?0x9c784f:glass?0xc5e0df:radius&&type!=='dust'?0xff7c2b:0xada593);
            for(let i=0;i<desired;i++){const slot=(b.cursor+i)%b.capacity;if(b.expires[slot]>this.clock)this.dropped++;b.expires[slot]=this.clock+b.life.value;}
            b.cursor=(b.cursor+desired)%b.capacity;this.renderer.compute(b.spawn);
        }this.pending.length=0;
        for(const b of this.banks){let count=0;for(let i=0;i<b.capacity;i++)if(b.expires[i]>this.clock)count++;const wasActive=b.count>0;b.count=count;b.mesh.visible=count>0;b.dt.value=dt;if(count||wasActive)this.renderer.compute(b.integrate);}
    }
    clear(){this.pending.length=0;for(const b of this.banks){b.expires.fill(0);b.count=0;b.mesh.visible=false;} /* GPU slots are overwritten on reuse; hidden until all old lifetimes have elapsed. */
        if(this.initialized)for(const b of this.banks){b.dt.value=10;this.renderer.compute(b.integrate);}}
    dispose(){for(const b of this.banks){b.mesh.removeFromParent();b.geometry.dispose();b.material.dispose();b.spawn.dispose();b.integrate.dispose();}this.pending.length=0;}
}
