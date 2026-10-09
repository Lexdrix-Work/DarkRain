import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { humanBody } from '../assets/models/human-body.js';
import { createAnatomicalHead } from './AnatomicalHead.js';
import { createHumanoidRig, skinHumanoidGeometry, attachSkinnedMesh } from './HumanoidRig.js';
import { HatFactory } from '../systems/ViewmodelSystem.js';
import { garmentMaterial } from './GarmentMaterials.js';
import { trimOpenHand,addGripHand } from './WeaponGripHands.js';

const geometries = new Map();
let loading;
export function preloadAnatomicalActors() {
    loading ||= fetch(new URL('../assets/models/human-body.bin',import.meta.url).href).then(r=>{
        if(!r.ok) throw new Error('Could not load anatomical actor geometry');return r.arrayBuffer();
    }).then(buffer=>{
        const data = new DataView(buffer);
        for(const {key,count,offset} of humanBody) {
            const positions=new Float32Array(count*3),normals=new Float32Array(count*3);
            for(let i=0;i<count*3;i++) {
                positions[i]=data.getInt16(offset+i*2,true)/10000;
                normals[i]=data.getInt8(offset+count*6+i)/127;
            }
            const geometry=new THREE.BufferGeometry();
            geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
            geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
            geometry.computeBoundingSphere();geometries.set(key,geometry);
        }
    });
    return loading;
}
export function buildAnatomicalActor({weapon = false, hat = 'none', skinTone = 0xc9a186, jacketColor = 0x514e42, sleeveColor = jacketColor, pantsColor=0x343b36, character={}} = {}) {
    const root = new THREE.Group();
    const materials = {
        skin: new THREE.MeshStandardMaterial({color:skinTone,roughness:0.73}),
        jacket: garmentMaterial(jacketColor),
        sleeve: garmentMaterial(sleeveColor),
        pants: garmentMaterial(pantsColor),
        boot: new THREE.MeshStandardMaterial({color:0x27251f,roughness:0.87})
    };
    const rig=createHumanoidRig(root);
    const limbs={armL:rig.bones.upperArmL,armR:rig.bones.upperArmR,legL:rig.bones.thighL,legR:rig.bones.thighR};
    root.animationRig=rig;rig.footContacts=[];
    for (const {key} of humanBody) {
        if(!geometries.has(key)) throw new Error('Anatomical actor geometry must be preloaded');
        const [part,finish]=key.split(':');
        if(key==='torso:jacket') continue;
        const skinnedKey='skin:'+key;
        if(!geometries.has(skinnedKey)) {
            const geo=skinHumanoidGeometry(geometries.get(key),key,rig.indices);geo.userData.shared=true;
            geometries.set(skinnedKey,geo);
        }
        let surface=geometries.get(skinnedKey);
        if(key==='torso:skin') {
            const neckKey='covered:'+key;
            if(!geometries.has(neckKey)){
                const source=surface.index?surface.toNonIndexed():surface,result=new THREE.BufferGeometry(),keep=[];
                for(let i=0;i<source.attributes.position.count;i+=3)if((source.attributes.position.getY(i)+source.attributes.position.getY(i+1)+source.attributes.position.getY(i+2))/3>1.435)keep.push(i,i+1,i+2);
                for(const [name,attribute]of Object.entries(source.attributes)){const array=new attribute.array.constructor(keep.length*attribute.itemSize);keep.forEach((index,i)=>{for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute.array[index*attribute.itemSize+j];});result.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));}
                result.computeBoundingSphere();result.userData.shared=true;geometries.set(neckKey,result);if(source!==surface)source.dispose();
            }
            surface=geometries.get(neckKey);
        }
        if(weapon&&part.startsWith('arm')&&finish==='skin'){
            const gripKey='grip:'+key;if(!geometries.has(gripKey))geometries.set(gripKey,trimOpenHand(surface,part.endsWith('R')?'R':'L'));surface=geometries.get(gripKey);
        }
        if(finish!=='boot')attachSkinnedMesh(root,surface,part.startsWith('arm')&&finish==='jacket'?materials.sleeve:materials[finish],rig);
        if(finish==='boot') {
            const side=part.endsWith('R')?'R':'L',bone=rig.bones['foot'+side];
            const geo=new RoundedBoxGeometry(.135,.115,.285,4,.035);
            const boot=new THREE.Mesh(geo,materials.boot);boot.position.set(0,-.014,.09);bone.add(boot);
            const sole=new THREE.Mesh(new RoundedBoxGeometry(.14,.024,.29,3,.01),materials.boot);
            sole.position.set(0,-.060,.09);bone.add(sole);
            boot.castShadow=sole.castShadow=boot.receiveShadow=sole.receiveShadow=true;
            const box=new THREE.Box3(new THREE.Vector3((side==='R'?.2306:-.2306)-.07,0,-.055),new THREE.Vector3((side==='R'?.2306:-.2306)+.07,.12,.235));
            for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z]) {
                const point=new THREE.Vector3(x,box.min.y,z).sub(new THREE.Vector3(side==='R'?.2306:-.2306,.0756,-.001));
                rig.footContacts.push({bone,point});
            }
        }
    }
    const head=createAnatomicalHead(materials.skin,character.eyeColor??0x544b3b,.03,character);head.position.z=-.0169;rig.bones.head.add(head);
    const cap=HatFactory.build(hat,character);cap.position.set(0,.03,-.0169);cap.scale.copy(head.scale);rig.bones.head.add(cap);
    // A loose garment shell replaces the form-fitting torso surface.
    const profile=[[.18,.86],[.185,.89],[.188,1.02],[.195,1.17],[.21,1.3],[.23,1.4],[.21,1.45],[.11,1.49],[.08,1.5]];
    const coatGeometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),32);
    coatGeometry.scale(1,1,.72);
    attachSkinnedMesh(root,skinHumanoidGeometry(coatGeometry,'torso',rig.indices),materials.jacket,rig);coatGeometry.dispose();
    const seam=new THREE.Mesh(new THREE.BoxGeometry(.006,.43,.006),materials.boot);
    seam.position.set(0,.14,.1374);rig.bones.spine.add(seam);
    const waist=new THREE.Mesh(new RoundedBoxGeometry(.35,.24,.25,4,.065),materials.pants);waist.position.set(0,.005,-.015);waist.castShadow=waist.receiveShadow=true;rig.bones.hips.add(waist);
    const belt=new THREE.Mesh(new THREE.CylinderGeometry(.193,.193,.045,32),materials.boot);
    belt.position.set(0,.075,-.0152);belt.scale.z=.76;rig.bones.hips.add(belt);
    // Clothing details cover the anatomical surface with visible seams and pockets.
    for(const side of [-1,1]) {
        const pocket=new THREE.Mesh(new RoundedBoxGeometry(.11,.13,.025,2,.012),materials.jacket);
        pocket.position.set(side*.09,.1364,.1124);rig.bones.spine.add(pocket);
        const flap=new THREE.Mesh(new RoundedBoxGeometry(.115,.025,.03,2,.008),materials.sleeve);
        flap.position.set(side*.09,.20,.117);rig.bones.spine.add(flap);
    }
    // Leather or plate carrier sits over the jacket, fitted around the chest.
    if(character.armor&&character.armor!=='none') {
        const vest=garmentMaterial(character.armor==='armor_leather'?0x46382c:character.armor==='armor_exo'?0x343a40:0x505441);
        const panel=new THREE.Mesh(new RoundedBoxGeometry(.32,.35,.06,4,.035),vest);
        panel.position.set(0,-.075,.15);rig.bones.chest.add(panel);
        const back=panel.clone();back.position.z=-.16;rig.bones.chest.add(back);
        for(const side of [-1,1]) {
            const strap=new THREE.Mesh(new RoundedBoxGeometry(.045,.22,.045,2,.014),vest);
            strap.position.set(side*.117,.075,.105);strap.rotation.x=.48;rig.bones.chest.add(strap);
            const pouch=new THREE.Mesh(new RoundedBoxGeometry(.082,.10,.045,3,.012),vest);
            pouch.position.set(side*.082,-.12,.195);rig.bones.chest.add(pouch);
        }
    }
    if(character.backpack&&character.backpack!=='none') {
        const large=character.backpack!=='daypack',packMat=garmentMaterial(large?0x4a493b:0x39424e);
        const pack=new THREE.Mesh(new RoundedBoxGeometry(.28,large?.43:.34,.15,4,.045),packMat);
        pack.position.set(0,-.12,-.24);rig.bones.chest.add(pack);
        const pocket=new THREE.Mesh(new RoundedBoxGeometry(.20,.18,.06,3,.025),packMat);
        pocket.position.set(0,-.18,-.33);rig.bones.chest.add(pocket);
        for(const side of [-1,1]) {
            const strap=new THREE.Mesh(new RoundedBoxGeometry(.034,.37,.021,2,.01),materials.boot);
            strap.position.set(side*.13,-.04,.151);rig.bones.chest.add(strap);
        }
    }
    if(weapon) {
        const metal=new THREE.MeshStandardMaterial({color:0x303330,roughness:.5,metalness:.55});
        const rifle=new THREE.Group();
        rifle.name='held-rifle';
        const receiver=new THREE.Mesh(new RoundedBoxGeometry(.06,.09,.35,2,.015),metal);rifle.add(receiver);
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,.38,10),metal);
        barrel.rotation.x=Math.PI/2;barrel.position.z=.35;rifle.add(barrel);
        const stock=new THREE.Mesh(new RoundedBoxGeometry(.055,.1,.25,2,.02),materials.boot);stock.position.z=-.26;rifle.add(stock);
        const foregrip=new THREE.Mesh(new RoundedBoxGeometry(.05,.05,.20,2,.009),materials.boot);foregrip.position.set(0,-.018,.20);rifle.add(foregrip);
        const grip=new THREE.Mesh(new RoundedBoxGeometry(.035,.085,.035,2,.007),materials.boot);grip.position.set(0,-.075,-.07);grip.rotation.x=-.18;rifle.add(grip);
        const magazine=new THREE.Mesh(new RoundedBoxGeometry(.035,.12,.07,2,.009),metal);magazine.position.set(0,-.095,.065);magazine.rotation.x=.12;rifle.add(magazine);
        const guard=new THREE.Mesh(new THREE.TorusGeometry(.025,.003,5,14),metal);guard.position.set(0,-.055,-.015);guard.rotation.y=Math.PI/2;guard.scale.z=.7;rifle.add(guard);
        rifle.position.set(.02,-.13,.30);
        rifle.userData.grips={R:[.027,-.045,-.09],L:[-.025,-.006,.095]};
        rig.bones.chest.add(rifle);rig.weapon=rifle;
        for(const side of ['R','L'])addGripHand(rig,side,materials.skin);
    }
    return {group:root,limbs};
}
