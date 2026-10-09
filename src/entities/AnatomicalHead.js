import { createHair } from './Hair.js';
import * as THREE from 'three';
import { humanHead } from '../assets/models/human-head.js';

let geometry;
export function createAnatomicalHead(skin, eyeColor, y = 1.62, options = {}) {
    if (!geometry) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(humanHead.positions, 3));
        geometry.setIndex(humanHead.indices);
        geometry.computeVertexNormals(); geometry.computeBoundingSphere();
        geometry.userData.shared = true;
    }
    const group = new THREE.Group(); group.position.y = y;group.eyeParts=[];
    let faceGeometry=geometry,faceMaterial=skin;
    {
        faceGeometry=geometry.clone();faceGeometry.userData.shared=false;
        const p=faceGeometry.attributes.position,colors=new Float32Array(p.count*3);
        for(let i=0;i<p.count;i++) {
            const x=p.getX(i),y=p.getY(i),z=p.getZ(i),color=new THREE.Color(0xffffff);
            if(z>.075){
                const cheek=Math.exp(-((Math.abs(x)-.044)**2/.00035+(y+.025)**2/.00045));
                color.lerp(new THREE.Color(1,.87,.81),cheek*.38);
                const lip=Math.exp(-(x*x/.00055+(y+.062)**2/.000025));
                color.lerp(new THREE.Color(.78,.51,.47),lip*.55);
                const brow=Math.max(0,1-Math.abs(y-.018)/.005)*Math.max(0,1-Math.abs(Math.abs(x)-.031)/.018);
                color.lerp(new THREE.Color(.38,.30,.24),brow*.72);
                color.multiplyScalar(.98+.02*Math.sin(x*811+y*937)*Math.cos(z*733));
            }
            if(z>.11&&Math.abs(x)<.035&&y>-.074&&y<-.05) {
                if(options.mouth==='smile')p.setY(i,y+Math.abs(x)*.1);
                else if(options.mouth==='stern')p.setY(i,y-Math.abs(x)*.05);
                else if(options.mouth==='grimace')p.setY(i,y+(y>-.061?.002:-.002));
            }
            if(options.beard!=='none'&&options.beard&&y<-.045&&z>.025) {
                color.set(options.beard==='stubble'?0x78614c:0x342b23);
                if(options.beard==='full'&&y<-.085)p.setY(i,y-.025);
            }
            const paint=options.facePaint;
            if(z>.085&&y>-.07&&y<.045&&paint&&paint!=='none') {
                const wave=Math.sin(x*150+y*90)*Math.cos(y*135);
                if(paint==='dirt')color.multiplyScalar(.72+.16*(wave+1)/2);
                else if(paint==='camo'&&wave>.12)color.set(0x596245);
                else if(paint==='war'&&Math.abs(x)>.035&&Math.abs(x)<.055)color.set(0x292c2b);
            }
            color.toArray(colors,i*3);
        }
        faceGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        faceMaterial=skin.clone();faceMaterial.vertexColors=true;faceMaterial.roughness=.82;faceGeometry.computeVertexNormals();
    }
    const head = new THREE.Mesh(faceGeometry, faceMaterial); head.castShadow = true;
    head.userData.hitRegion = 'head'; group.add(head);
    // Small inset eyes fit the anatomical orbital sockets.
    const white = new THREE.MeshStandardMaterial({color:0xb9b3a7,roughness:0.62});
    const iris = new THREE.MeshStandardMaterial({color:eyeColor,roughness:0.5});
    const black = new THREE.MeshStandardMaterial({color:0x15110f,roughness:.4});
    for (const side of [-1,1]) {
        const cx=side*.0308,cy=-.0065,aperture=options.eyes==='narrow'||options.eyes==='tired'?.0045:options.eyes==='wide'?.007:.006;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(.011,16,12),white);
        eye.position.set(cx,cy,.1085);eye.scale.set(1,aperture/.011,.7);group.add(eye);
        const colored = new THREE.Mesh(new THREE.SphereGeometry(.0045,12,10),iris);
        colored.position.set(cx,cy,.1158);colored.scale.z=.18;group.add(colored);
        const pupil=new THREE.Mesh(new THREE.SphereGeometry(.0022,12,8),black);
        pupil.position.set(cx,cy,.1165);pupil.scale.z=.16;group.add(pupil);
        for(const part of [eye,colored,pupil])group.eyeParts.push({part,scaleY:part.scale.y,centerY:cy});
        for(const upper of [true,false]) {
            const points=[];for(let i=0;i<=12;i++){const a=i*Math.PI/12;points.push(new THREE.Vector3(cx+Math.cos(a)*.011,cy+Math.sin(a)*aperture*(upper?1:-1),.1105+Math.sin(a)*.004));}
            const lid=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.0018,5,false),skin);group.add(lid);group.eyeParts.push({part:lid,scaleY:1,centerY:cy,lid:true});
        }
    }
    const shapes={oval:[1,1,1],round:[1.05,.97,1],square:[1.04,1,1],narrow:[.94,1.03,.98]};
    group.scale.set(...(shapes[options.faceShape]||shapes.oval));
    group.add(createHair(options.hair||'short',options.hairColor??0x251e19));
    return group;
}
