import * as THREE from 'three';
const MiB=1024*1024;
export const MEMORY_TIERS=Object.freeze({
    low:{appPrivate:1024,texture:256,geometry:128,targets:96,effects:32,audio:32,sim:64,save:64},
    medium:{appPrivate:1536,texture:512,geometry:192,targets:160,effects:64,audio:48,sim:96,save:96},
    high:{appPrivate:2048,texture:1024,geometry:256,targets:256,effects:128,audio:64,sim:128,save:128},
    ultra:{appPrivate:3072,texture:2048,geometry:512,targets:384,effects:256,audio:96,sim:192,save:192}
});
export function estimateTextureBytes(texture){
    if(!texture)return 0;
    if(texture.isCompressedTexture&&texture.mipmaps?.length)return texture.mipmaps.reduce((bytes,m)=>bytes+(m.data?.byteLength||0),0);
    const image=texture.image;if(!image)return 0;

    const channels=texture.format===THREE.RedFormat?1:texture.format===THREE.RGFormat?2:4;
    const component=texture.type===THREE.FloatType?4:texture.type===THREE.HalfFloatType?2:1;
    const mipFactor=texture.generateMipmaps?4/3:1;
    if(Array.isArray(image))return Math.ceil(image.reduce((bytes,i)=>bytes+(i.width||0)*(i.height||0)*channels*component*mipFactor,0));
    return Math.ceil((image.width||0)*(image.height||0)*(image.depth||1)*channels*component*mipFactor);
}
/** Budgeted incremental scene inventory. GPU bytes are estimates, never VRAM readings. */
export class MemorySystem {
    constructor(game){
        this.game=game;this.nextScan=0;this.nextDesktop=0;this.stack=[];this.geometries=new Set();this.textures=new Set();this.buffers=new Set();this.pendingDesktop=false;this.appPrivate=null;this.workingSet=null;this.pressureLevel='normal';this.lastAction=0;this.healthyScans=0;this.geometryBytes=0;this.textureBytes=0;this.incomplete=true;
        this.snapshot={geometryBytes:0,textureBytes:0,appPrivateBytes:null,workingSetBytes:null,saveCacheBytes:0,audioBytes:0,pressure:'normal',estimated:true};
        this.onPressure=()=>this.relieve(true);globalThis.window?.addEventListener('darkrain:memory-pressure',this.onPressure);
    }
    texture(t){if(t&&!this.textures.has(t)){this.textures.add(t);this.textureBytes+=estimateTextureBytes(t);}}
    geometry(g){if(!g||this.geometries.has(g))return;this.geometries.add(g);
        const add=a=>{const buffer=a?.data?.array?.buffer||a?.array?.buffer;if(buffer&&!this.buffers.has(buffer)){this.buffers.add(buffer);this.geometryBytes+=buffer.byteLength;}};
        for(const name in g.attributes)add(g.attributes[name]);add(g.index);
    }
    node(n){
        this.geometry(n.geometry);const instanceBuffer=n.instanceMatrix?.array?.buffer;if(instanceBuffer&&!this.buffers.has(instanceBuffer)){this.buffers.add(instanceBuffer);this.geometryBytes+=instanceBuffer.byteLength;}
        // Fracture BatchedMeshes use matrix/indirect textures and expose a legacy
        // dirty flag shim, not an InstancedBufferAttribute with an array.
        if(n.isBatchedMesh){this.texture(n._matricesTexture);this.texture(n._indirectTexture);this.texture(n._colorsTexture);}
        const material=m=>{if(!m)return;for(const key in m)if(m[key]?.isTexture)this.texture(m[key]);};
        if(Array.isArray(n.material))for(let i=0;i<n.material.length;i++)material(n.material[i]);else material(n.material);
        this.texture(n.shadow?.map?.texture);this.texture(n.shadow?.map?.depthTexture);
        for(let i=0;i<n.children.length;i++)this.stack.push(n.children[i]);
    }
    update(){
        const now=performance.now();
        if(!this.stack.length&&now>=this.nextScan){this.nextScan=now+5000;this.geometryBytes=this.textureBytes=0;this.geometries.clear();this.textures.clear();this.buffers.clear();this.stack.push(this.game.scene);if(this.game.viewmodelSystem?.vmScene)this.stack.push(this.game.viewmodelSystem.vmScene);this.incomplete=true;
            const extra=this.game.composer?.memoryTextures?.();if(extra)for(let i=0;i<extra.length;i++)this.texture(extra[i]);this.texture(this.game.reflectionSystem?.target?.texture);this.texture(this.game.reflectionSystem?.filtered?.texture);
        }
        const deadline=now+.2;let processed=0;
        while(this.stack.length&&processed++<64&&performance.now()<deadline){const n=this.stack.pop();if(n)this.node(n);}
        if(this.incomplete&&!this.stack.length){this.incomplete=false;let audio=0;const buffers=new Set();for(const entry of this.game.audioManager?.sounds.values()||[]){const b=entry.buffer;if(b&&!buffers.has(b)){buffers.add(b);audio+=b.length*b.numberOfChannels*4;}}
            Object.assign(this.snapshot,{geometryBytes:this.geometryBytes,textureBytes:this.textureBytes,audioBytes:audio,saveCacheBytes:this.game.saveSystem?.storage?.cachedBytes||0});
            const limits=MEMORY_TIERS[this.game.settings?.quality]||MEMORY_TIERS.high;
            if(this.textureBytes>limits.texture*MiB||this.geometryBytes>limits.geometry*MiB||this.appPrivate>limits.appPrivate*MiB){this.healthyScans=0;this.relieve(false);}
            else if(this.pressureLevel==='high'&&this.textureBytes<limits.texture*MiB*.75&&this.geometryBytes<limits.geometry*MiB*.75&&(this.appPrivate===null||this.appPrivate<limits.appPrivate*MiB*.75)&&++this.healthyScans>=3){this.pressureLevel=this.snapshot.pressure='normal';const streaming=this.game.worldManager?.forestStreaming?.scheduler;if(streaming)streaming.memoryConstrained=false;}
        }
        const desktop=globalThis.window?.darkRainDesktop?.memory;
        if(desktop&&!this.pendingDesktop&&now>=this.nextDesktop){this.nextDesktop=now+5000;this.pendingDesktop=true;desktop.sample().then(rows=>{let privateBytes=0,working=0;for(let i=0;i<rows.length;i++){if(rows[i].privateBytes===null)privateBytes=NaN;else privateBytes+=rows[i].privateBytes;working+=rows[i].workingSetBytes;}this.appPrivate=Number.isFinite(privateBytes)?privateBytes:null;this.workingSet=working;Object.assign(this.snapshot,{appPrivateBytes:this.appPrivate,workingSetBytes:working});}).catch(()=>{}).finally(()=>{this.pendingDesktop=false;});}
    }
    relieve(emergency){
        const now=performance.now();if(!emergency&&now-this.lastAction<10000)return;this.lastAction=now;this.pressureLevel=emergency?'critical':'high';this.snapshot.pressure=this.pressureLevel;
        const streaming=this.game.worldManager?.forestStreaming?.scheduler;if(streaming)streaming.memoryConstrained=true;
        if(emergency)this.game.effectsSystem?.pooledParticles?.clear();this.game.physicsSystem?.trimIdlePools?.();this.game.textureResidency?.evictUnused?.();
        if(emergency){this.game._benchmarkController?.abort();
            if(this.game.renderer?.backendName==='WebGL2'){this.game.isPaused=true;this.game.gameState='menu';this.game.uiManager?.showMainMenu();this.game.uiManager?.showNotification('Graphics memory is exhausted. Lower graphics settings before resuming. Your saved games are kept.','warning',8000);}
            else {this.game.uiManager?.showNotification('Graphics memory ran out. Recovering the renderer; your saved games are kept.','warning',6000);void this.game.recoverGraphics?.();}
        }
    }
    dispose(){globalThis.window?.removeEventListener('darkrain:memory-pressure',this.onPressure);this.stack.length=0;this.geometries.clear();this.textures.clear();this.buffers.clear();}
}
