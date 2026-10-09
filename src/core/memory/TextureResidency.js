import * as THREE from 'three';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {estimateTextureBytes,MEMORY_TIERS} from './MemorySystem.js';
const DIMENSIONS={low:512,medium:1024,high:2048,ultra:4096};
/** Ref-counted texture residency. Complete resolution variants each contain their mip chain. */
export class TextureResidency {
    constructor(renderer,quality='high'){this.renderer=renderer;this.quality=quality;this.entries=new Map();this.pending=new Map();this.bytes=0;this.clock=0;this.limit=(MEMORY_TIERS[quality]||MEMORY_TIERS.high).texture*1048576;this.ktx=null;}
    async load(key,descriptor,{pinned=false,colorSpace=THREE.SRGBColorSpace}={}){
        const existing=this.entries.get(key);if(existing){existing.refs++;existing.used=++this.clock;return existing.texture;}
        if(this.pending.has(key)){const texture=await this.pending.get(key);this.entries.get(key).refs++;return texture;}
        const operation=this.prepare(key,descriptor,{pinned,colorSpace});this.pending.set(key,operation);
        try{return await operation;}finally{this.pending.delete(key);}
    }
    async prepare(key,descriptor,{pinned,colorSpace}){
        const max=DIMENSIONS[this.quality]||2048,variants=descriptor.variants||[],eligible=variants.filter(v=>v.dimension<=max).sort((a,b)=>b.dimension-a.dimension);
        const chosen=eligible[0]||variants.slice().sort((a,b)=>a.dimension-b.dimension)[0];
        let texture;const url=chosen?.url||descriptor.fallback;
        try{
            if(/\.ktx2(?:\?|$)/i.test(url)){if(!this.ktx){this.ktx=new KTX2Loader().setWorkerLimit(2);this.ktx.detectSupport(this.renderer);}texture=await this.ktx.loadAsync(url);}
            else texture=await new THREE.TextureLoader().loadAsync(url);
        }catch(error){if(!descriptor.fallback||url===descriptor.fallback)throw error;texture=await new THREE.TextureLoader().loadAsync(descriptor.fallback);}
        if(!texture.isCompressedTexture&&Math.max(texture.image.width,texture.image.height)>max){const image=texture.image,scale=max/Math.max(image.width,image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const context=canvas.getContext('2d');if(!context){texture.dispose();throw Error('Texture resize unavailable');}context.drawImage(image,0,0,canvas.width,canvas.height);texture.image=canvas;texture.needsUpdate=true;}
        texture.colorSpace=colorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=this.quality==='low'?2:4;
        const bytes=estimateTextureBytes(texture);this.evictUnused(Math.max(0,this.bytes+bytes-this.limit));
        if(this.bytes+bytes>this.limit){texture.dispose();throw Error('Texture residency budget exhausted');}
        this.entries.set(key,{texture,bytes,refs:1,pinned,used:++this.clock});this.bytes+=bytes;return texture;
    }
    release(key){const e=this.entries.get(key);if(e)e.refs=Math.max(0,e.refs-1);}
    evictUnused(required=Infinity){let freed=0;const candidates=[...this.entries].filter(([,e])=>!e.pinned&&!e.refs).sort((a,b)=>a[1].used-b[1].used);for(const [key,e]of candidates){if(freed>=required)break;e.texture.dispose();e.texture.image?.close?.();this.entries.delete(key);this.bytes-=e.bytes;freed+=e.bytes;}return freed;}
    dispose(){for(const e of this.entries.values()){e.texture.dispose();e.texture.image?.close?.();}this.entries.clear();this.ktx?.dispose();this.bytes=0;}
}
