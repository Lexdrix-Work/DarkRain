const reliefTextures=new Map();
export const reliefTexture=id=>reliefTextures.get(id);
import * as THREE from 'three';

export function makeSurfaceRelief(texture,kind) {
    const size=512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.drawImage(texture.image,0,0,size,size);
    const pixels=ctx.getImageData(0,0,size,size).data,height=new Float32Array(size*size);
    for(let i=0;i<height.length;i++) {
        const r=pixels[i*4]/255,g=pixels[i*4+1]/255,b=pixels[i*4+2]/255;
        height[i]=kind==='brick'?THREE.MathUtils.clamp(.25+(r-Math.max(g,b))*3.5+.15*r,0,1):.2+.6*(r+g+b)/3;
    }
    const heights=new Uint8Array(size*size*4),normals=new Uint8Array(size*size*4),orm=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
        const i=y*size+x,j=i*4;
        const dx=height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size];
        const dy=height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x];
        const nx=-dx*3,ny=-dy*3,inv=1/Math.sqrt(nx*nx+ny*ny+1);
        orm[j]=Math.round((.84+.16*height[i])*255);orm[j+1]=Math.round((.84+.16*(1-height[i]))*255);orm[j+2]=0;orm[j+3]=255;
        heights[j]=heights[j+1]=heights[j+2]=Math.round(height[i]*255);heights[j+3]=255;
        normals[j]=Math.round((nx*inv*.5+.5)*255);normals[j+1]=Math.round((ny*inv*.5+.5)*255);normals[j+2]=Math.round((inv*.5+.5)*255);normals[j+3]=255;
    }
    const create=data=>{const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.flipY=true;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;t.needsUpdate=true;return t;};
    texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=8;texture.needsUpdate=true;
    const packed=create(orm);return {heightMap:create(heights),normalMap:create(normals),roughnessMap:packed,aoMap:packed};
}

export function applyRelief(material,heightMap,game,kind) {
    if(!heightMap)return;
    reliefTextures.set(heightMap.uuid,heightMap);
    material.userData.reliefHeightId=heightMap.uuid;
    material.userData.reliefAmount=kind==='brick'?.018:.008;
    material.userData.reliefScale={value:['high','ultra'].includes(game.settings?.quality)?(kind==='brick'?.018:.008):0};
    material.customProgramCacheKey=()=>`surface-relief-${kind}-${!!material.userData.cellUV}`;
}
