import * as THREE from 'three';
import {ComputeParticles} from '../render/ComputeParticles.js';

/** A bounded, local dust effect; no distance fog or extra light passes. */
export class MasonryDust {
    constructor(game){this.game=game;
        if(game.renderer?.backend?.isWebGPUBackend){this.compute=new ComputeParticles(game.scene,game.settings?.particleQuality||game.settings?.quality,game.renderer);return;}
        this.particles=[];const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,2,32,32,30);g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(.5,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);
        this.texture=new THREE.CanvasTexture(c);this.mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.texture,color:0xaaa18d,transparent:true,depthWrite:false,opacity:.32}),64);this.mesh.frustumCulled=false;this.mesh.count=0;game.scene.add(this.mesh);
    }
    puff(position,amount=1){if(this.compute){this.compute.emit(position,null,'dust',amount);return;}for(let i=0;i<Math.min(8,3+Math.floor(amount*2));i++){if(this.particles.length>=64)this.particles.shift();this.particles.push({p:position.clone(),v:new THREE.Vector3((Math.random()-.5)*amount,.3+Math.random()*.4,(Math.random()-.5)*amount),age:0,life:1.4+Math.random()*.8,size:.12+amount*.12});}}
    update(dt){if(this.compute){this.compute.update(dt);return;}const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),q=this.game.camera?.quaternion||new THREE.Quaternion();this.particles=this.particles.filter(p=>p.age<p.life);this.particles.forEach((p,i)=>{p.age+=dt;p.p.addScaledVector(p.v,dt);const fade=Math.max(.01,1-p.age/p.life);scale.setScalar((p.size+p.age*.25)*fade);matrix.compose(p.p,q,scale);this.mesh.setMatrixAt(i,matrix);});this.mesh.count=this.particles.length;this.mesh.instanceMatrix.needsUpdate=true;}
    dispose(){if(this.compute){this.compute.dispose();return;}this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();}
}
