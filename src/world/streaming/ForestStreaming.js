import * as THREE from 'three';
import {StorageInstancedBufferAttribute} from 'three/webgpu';
import {ChunkResidency} from './ChunkResidency.js';

/** Streams decorative woodland only; gameplay/collision and city destruction stay resident. */
export class ForestStreaming {
    constructor(world,recipes,bark,foliage){
        this.world=world;this.bark=bark;this.foliage=foliage;this.clock=0;
        this.trunkGeometry=new THREE.CylinderGeometry(.11,.22,1,7);this.leafGeometry=new THREE.PlaneGeometry(1,1);
        this.scheduler=new ChunkResidency(recipes,{commit:r=>this.create(r),release:a=>this.release(a)});
        this.treeCount=recipes.reduce((sum,c)=>sum+c.trees.length/4,0);
    }
    instance(geometry,material,count){
        const mesh=new THREE.InstancedMesh(geometry,material,count),renderer=this.world.game.renderer;
        if(renderer?.backend?.isWebGPUBackend)mesh.instanceMatrix=new StorageInstancedBufferAttribute(mesh.instanceMatrix.array,16);
        else if(renderer?.getContext){const gl=renderer.getContext(),capacity=Math.floor((gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE)||65536)/64)+1;
            if(mesh.instanceMatrix.count<capacity){const array=new Float32Array(capacity*16);array.set(mesh.instanceMatrix.array);mesh.instanceMatrix=new THREE.InstancedBufferAttribute(array,16);}}
        mesh.castShadow=mesh.receiveShadow=true;return mesh;
    }
    create(recipe){
        const count=recipe.trees.length/4,group=new THREE.Group();group.name=recipe.id;
        const bark=this.bark.clone(),leaves=this.foliage.clone(),detail=this.foliage.clone();
        for(const m of [bark,leaves,detail]){m.alphaHash=true;m.opacity=0;}
        const trunks=this.instance(this.trunkGeometry,bark,count),crowns=this.instance(this.leafGeometry,leaves,count),extra=this.instance(this.leafGeometry,detail,count*2),t=new THREE.Object3D();
        for(let i=0;i<count;i++){
            const [x,y,z,height]=recipe.trees.subarray(i*4,i*4+4);
            t.position.set(x,y+height/2,z);t.rotation.set(0,0,0);t.scale.set(1,height,1);t.updateMatrix();trunks.setMatrixAt(i,t.matrix);
            t.position.set(x,y+height*.83,z);t.scale.set(height*.82,height*.72,1);
            for(let j=0;j<3;j++){t.rotation.y=j*Math.PI/3;t.updateMatrix();(j===0?crowns:extra).setMatrixAt(j===0?i:(j-1)*count+i,t.matrix);}
        }
        for(const mesh of [trunks,crowns,extra]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);}
        this.world.scene.add(group);return {group,bark,leaves,detail,extra,fade:0,lod:0,recipe};
    }
    update(dt,position,velocity){
        this.clock+=dt;this.scheduler.update(position,velocity);
        for(const {asset:a}of this.scheduler.resident.values()){
            a.fade=Math.min(1,a.fade+dt/.35);const distance=Math.hypot(a.recipe.x-position.x,a.recipe.z-position.z);
            const target=this.world.game.settings?.vegetationDetail===false?0:distance<128?1:distance>176?0:a.lod;
            a.lod=THREE.MathUtils.clamp(a.lod+Math.sign(target-a.lod)*dt/.5,0,1);
            a.bark.opacity=a.leaves.opacity=a.fade;a.detail.opacity=a.fade*a.lod;a.extra.visible=a.lod>.001;
        }
    }
    async prepareAt(position,{timeoutMs=1500,signal}={}){
        const start=performance.now();
        while(performance.now()-start<timeoutMs){
            if(signal?.aborted)return false;
            this.scheduler.update(position,{x:0,z:0},true);
            const pending=this.scheduler.recipes.some(r=>Math.hypot(r.x-position.x,r.z-position.z)<=219&&!this.scheduler.resident.has(r.id));
            if(!pending){this.update(.35,position,{x:0,z:0});return true;}
            await new Promise(resolve=>setTimeout(resolve,0));
        }
        return false; // Collision/gameplay is ready; distant decorative detail can arrive later.
    }
    release(asset){asset.group.removeFromParent();for(const mesh of asset.group.children)mesh.dispose?.();asset.bark.dispose();asset.leaves.dispose();asset.detail.dispose();}
    stats(){return {...this.scheduler.stats(),trees:this.treeCount,scope:'decorative woodland'};}
    dispose(){this.scheduler.dispose();this.trunkGeometry.dispose();this.leafGeometry.dispose();this.bark.dispose();this.foliage.map?.dispose();this.foliage.dispose();}
}
