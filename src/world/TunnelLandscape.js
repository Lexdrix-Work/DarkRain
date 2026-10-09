import * as THREE from 'three';
import {getProceduralSet} from './ProceduralTextures.js';

/** Grounded shoulders and a wooded approach, with an unobstructed road. */
export function tunnelLandscape(add){
    const textures=typeof document==='undefined'?{}:getProceduralSet('ground');
    const soil=new THREE.MeshStandardMaterial({color:0xffffff,map:textures.map||null,bumpMap:textures.bumpMap||null,bumpScale:.08,roughness:1,vertexColors:true});
    const height=(x,z)=>.03+Math.min(1,(Math.abs(x)-6)/12)*(1.8+5*Math.exp(-(((z+48)/18)**2)))+.15*Math.sin(x*.4)*Math.cos(z*.3);
    for(const side of [-1,1]){
        const vertices=[],colors=[],uv=[],indices=[],color=new THREE.Color();const nx=14,nz=18;
        for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){const x=side*(6+ix*3.8),z=-46-iz*4.5,y=height(x,z);vertices.push(x,y,z);uv.push(x/3,z/3);color.set(ix%4===0?0xaaa486:0x91a17c);colors.push(color.r,color.g,color.b);}
        for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const a=iz*(nx+1)+ix,b=a+1,c=a+nx+1,d=c+1;indices.push(...(side===1?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();add(geometry,[0,0,0],soil);
    }
    if(typeof document==='undefined')return;
    let seed=5321;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
    for(let i=0;i<650;i++){const a=rng()*Math.PI*2,r=Math.sqrt(rng())*54;ctx.fillStyle=['#586b46','#74825a','#3d533a','#8a9367'][i%4];ctx.beginPath();ctx.ellipse(64+Math.cos(a)*r,64+Math.sin(a)*r*.9,2+rng()*4,1.5+rng()*3,a,0,Math.PI*2);ctx.fill();}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const leaves=new THREE.MeshStandardMaterial({map:texture,alphaTest:.5,side:THREE.DoubleSide,roughness:1}),bark=new THREE.MeshStandardMaterial({color:0x665741,roughness:1});
    // Merge woody geometry and leaf cards: three draws for the entire approach.
    const trunks=[],crowns=[],barkGeometry=new THREE.CylinderGeometry(.10,.22,1,7).toNonIndexed(),card=new THREE.PlaneGeometry(1,1).toNonIndexed(),transform=new THREE.Object3D();
    const append=(target,g)=>{const clone=g.clone().applyMatrix4(transform.matrix);target.push(clone);};
    for(let i=0;i<52;i++){const x=(i%2?1:-1)*(9+rng()*40),z=-52-rng()*65,h=5+rng()*6,y=height(x,z);transform.position.set(x,y+h/2,z);transform.rotation.set(0,0,0);transform.scale.set(1,h,1);transform.updateMatrix();append(trunks,barkGeometry);
        for(let cluster=0;cluster<7;cluster++){const angle=cluster*2.399,spread=cluster===0?0:h*.19;transform.position.set(x+Math.cos(angle)*spread,y+h*(.68+(cluster%3)*.09),z+Math.sin(angle)*spread);transform.scale.set(h*.48,h*.38,1);for(let j=0;j<3;j++){transform.rotation.set((rng()-.5)*.2,j*Math.PI/3+angle,(rng()-.5)*.25);transform.updateMatrix();append(crowns,card);}}
    }
    const merge=list=>{const g=new THREE.BufferGeometry();for(const name of ['position','normal','uv']){const arrays=list.map(p=>p.attributes[name].array),merged=new Float32Array(arrays.reduce((sum,a)=>sum+a.length,0));let offset=0;for(const a of arrays){merged.set(a,offset);offset+=a.length;}g.setAttribute(name,new THREE.BufferAttribute(merged,name==='uv'?2:3));}for(const p of list)p.dispose();return g;};
    add(merge(trunks),[0,0,0],bark);add(merge(crowns),[0,0,0],leaves,false);barkGeometry.dispose();card.dispose();
}
