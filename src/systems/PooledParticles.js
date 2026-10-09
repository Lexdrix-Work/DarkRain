import * as THREE from 'three';
import {PointsNodeMaterial} from 'three/webgpu';
import {instancedBufferAttribute,uv} from 'three/tsl';
import {ComputeParticles} from '../render/ComputeParticles.js';

/** Packed particle banks: creation and expiry never allocate geometry, math objects or animation loops. */
export class PooledParticles {
    constructor(scene,quality='high',renderer){
        if(renderer?.backend?.isWebGPUBackend)return new ComputeParticles(scene,quality,renderer);
        this.quality=quality;
        this.scene=scene;this.dropped=0;this.color=new THREE.Color();
        const capacities=quality==='low'?[256,512]:quality==='medium'?[256,1024]:quality==='ultra'?[1024,4096]:[512,2048];
        this.banks=capacities.map((capacity,index)=>{
            const positions=new Float32Array(capacity*3),colors=new Float32Array(capacity*3),alpha=new Float32Array(capacity),velocity=new Float32Array(capacity*3),age=new Float32Array(capacity),life=new Float32Array(capacity);
            const positionAttribute=new THREE.InstancedBufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage),colorAttribute=new THREE.InstancedBufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage),alphaAttribute=new THREE.InstancedBufferAttribute(alpha,1).setUsage(THREE.DynamicDrawUsage);
            const material=new PointsNodeMaterial({size:index?.2:.05,sizeAttenuation:true,transparent:true,depthWrite:false,blending:index?THREE.AdditiveBlending:THREE.NormalBlending});
            material.positionNode=instancedBufferAttribute(positionAttribute);material.colorNode=instancedBufferAttribute(colorAttribute);material.opacityNode=instancedBufferAttribute(alphaAttribute).mul(uv().sub(.5).length().mul(2).oneMinus().max(0));
            const mesh=new THREE.Sprite(material);mesh.geometry=mesh.geometry.clone();const geometry=mesh.geometry;geometry.setAttribute('particlePosition',positionAttribute);geometry.setAttribute('particleColor',colorAttribute);geometry.setAttribute('particleAlpha',alphaAttribute);mesh.count=0;mesh.name=index?'pooled-explosion':'pooled-impact';mesh.frustumCulled=false;scene.add(mesh);            return {capacity,count:0,positions,colors,alpha,velocity,age,life,geometry,material,mesh};
        });
    }
    emit(position,normal,type='concrete',radius=0){
        const bank=this.banks[radius&&type!=='dust'||type==='metal'||type==='muzzle'?1:0],desired=radius?100:type==='flesh'?15:10;
        for(let n=0;n<desired;n++){
            if(bank.count>=bank.capacity){this.dropped+=desired-n;break;}
            const i=bank.count++,j=i*3;let x=(Math.random()-.5)*2,y=radius?Math.random():(Math.random()-.5)*2,z=(Math.random()-.5)*2;
            if(!radius){const spread=Math.random()*2;x+=normal.x*spread;y+=normal.y*spread;z+=normal.z*spread;}
            const speed=radius?radius*(.5+Math.random()):1+Math.random()*3,length=Math.max(.001,Math.hypot(x,y,z));
            bank.positions[j]=position.x;bank.positions[j+1]=position.y;bank.positions[j+2]=position.z;
            bank.velocity[j]=x*speed/length;bank.velocity[j+1]=y*speed/length;bank.velocity[j+2]=z*speed/length;
            this.color.setHex(type==='muzzle'?0xffdf99:type==='dust'?0xada593:radius?(n%3===0?0xffff00:n%3===1?0xff6600:0x333333):type==='flesh'?0x8b0000:type==='metal'?0xffaa00:type==='wood'?0x9c784f:type==='glass'?0xc5e0df:0x888888);
            bank.colors[j]=this.color.r;bank.colors[j+1]=this.color.g;bank.colors[j+2]=this.color.b;bank.alpha[i]=1;bank.age[i]=0;bank.life[i]=type==='muzzle'?.035:type==='dust'?2.8:radius?1:.5;
        }
        bank.mesh.count=bank.count;bank.geometry.attributes.particlePosition.needsUpdate=bank.geometry.attributes.particleColor.needsUpdate=bank.geometry.attributes.particleAlpha.needsUpdate=true;
    }
    update(dt){
        for(const b of this.banks){if(!b.count)continue;
            for(let i=b.count-1;i>=0;i--){b.age[i]+=dt;const j=i*3;
                if(b.age[i]>=b.life[i]){const last=--b.count;if(i!==last){const k=last*3;for(let c=0;c<3;c++){b.positions[j+c]=b.positions[k+c];b.colors[j+c]=b.colors[k+c];b.velocity[j+c]=b.velocity[k+c];}b.age[i]=b.age[last];b.life[i]=b.life[last];b.alpha[i]=b.alpha[last];}continue;}
                b.velocity[j+1]-=9.81*dt;const drag=Math.exp(-3*dt);for(let c=0;c<3;c++){b.positions[j+c]+=b.velocity[j+c]*dt;b.velocity[j+c]*=drag;}b.alpha[i]=1-b.age[i]/b.life[i];
            }
            b.mesh.count=b.count;b.geometry.attributes.particlePosition.needsUpdate=b.geometry.attributes.particleColor.needsUpdate=b.geometry.attributes.particleAlpha.needsUpdate=true;
        }
    }
    clear(){for(const b of this.banks){b.count=0;b.mesh.count=0;}}
    dispose(){for(const b of this.banks){b.mesh.removeFromParent();b.geometry.dispose();b.material.dispose();}}
}
