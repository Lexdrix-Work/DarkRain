import * as THREE from 'three';

let weave,wear;
export function garmentMaterial(color) {
    if(!weave) {
        const size=128,data=new Uint8Array(size*size*4),albedo=new Uint8Array(size*size*4);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
            const i=(y*size+x)*4;
            data[i]=128+Math.round(Math.sin(x*Math.PI/2)*6+Math.sin(x*.16+y*.07)*11);
            data[i+1]=128+Math.round(Math.sin(y*Math.PI/2)*6+Math.cos(y*.22+x*.05)*9);
            data[i+2]=250;data[i+3]=255;
            const dust=218+Math.round(Math.sin(x*.08)*Math.cos(y*.07)*12+Math.sin(x*2.3+y*1.7)*3);
            albedo[i]=dust;albedo[i+1]=dust;albedo[i+2]=dust-3;albedo[i+3]=255;
        }
        weave=new THREE.DataTexture(data,size,size);weave.wrapS=weave.wrapT=THREE.RepeatWrapping;
        weave.repeat.set(2,2);weave.generateMipmaps=true;weave.minFilter=THREE.LinearMipmapLinearFilter;weave.needsUpdate=true;weave.userData.shared=true;
        wear=new THREE.DataTexture(albedo,size,size);wear.wrapS=wear.wrapT=THREE.RepeatWrapping;wear.colorSpace=THREE.SRGBColorSpace;wear.generateMipmaps=true;wear.minFilter=THREE.LinearMipmapLinearFilter;wear.needsUpdate=true;wear.userData.shared=true;
    }
    return new THREE.MeshStandardMaterial({color,map:wear,roughness:.94,normalMap:weave,normalScale:new THREE.Vector2(.18,.18)});
}
