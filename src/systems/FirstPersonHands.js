import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { garmentMaterial } from '../entities/GarmentMaterials.js';

const smooth=t=>t*t*(3-2*t);
export const HANDLING_PROFILES={
    compact9:{grip:[.025,-.12,.03],well:[.01,-.16,.045],action:[.045,.04,-.06],timing:[.13,.28,.43,.59,.73,.84]},
    heavy45:{grip:[.025,-.13,.04],well:[.01,-.18,.06],action:[.045,.04,-.08],timing:[.18,.35,.49,.67,.81,.9]},
    revolver357:{grip:[.025,-.13,.03],well:[-.065,.01,-.03],action:[-.045,.025,-.04],timing:[.2,.38,.57,.76,.87,.94]},
    smg9:{grip:[.01,-.04,-.25],well:[.01,-.13,-.09],action:[.04,.05,-.10],timing:[.12,.31,.46,.63,.78,.88]},
    carbine556:{grip:[.01,-.03,-.39],well:[.01,-.14,-.12],action:[.05,.055,.10],timing:[.17,.34,.50,.68,.80,.90]},
    bolt308:{grip:[.01,-.03,-.33],well:[.01,-.11,-.015],action:[.075,.04,.06],timing:[.22,.40,.54,.72,.84,.94]},
    pump12:{grip:[.01,-.03,-.26],well:[.035,-.045,.01],action:[.01,-.03,-.26],timing:[.16,.27,.40,.71,.84,.94]},
    support762:{grip:[.01,-.03,-.43],well:[.01,-.17,-.12],action:[.04,.085,-.13],timing:[.23,.40,.57,.75,.86,.95]}
};
export function reloadHandPose(type,progress,id) {
    const profile=HANDLING_PROFILES[id];
    if(profile) {
        const times=profile.timing;
        const keys=[[0,profile.grip],[times[0],profile.well],[times[1],[.02,-.38,.05]],[times[2],[.02,-.38,.05]],[times[3],profile.well],[times[4],profile.action],[times[5],[profile.action[0],profile.action[1],profile.action[2]+.08]],[1,profile.grip]];
        if(id==='revolver357'){keys[2][1]=[-.08,-.04,-.02];keys[3][1]=[-.08,.015,-.04];}
        if(id==='pump12'){keys[2][1]=[.035,-.22,.09];keys[3][1]=[.035,-.045,.01];}
        if(id==='support762'){keys[1][1]=[.04,.085,-.13];keys[3][1]=[.01,-.13,-.12];}
        const p=THREE.MathUtils.clamp(progress,0,1);let i=0;while(i<keys.length-2&&p>keys[i+1][0])i++;
        return new THREE.Vector3(...keys[i][1]).lerp(new THREE.Vector3(...keys[i+1][1]),smooth((p-keys[i][0])/(keys[i+1][0]-keys[i][0])));
    }
    const mag=type==='pistol'?[.015,-.16,.06]:[.015,-.14,-.12];
    const keys=type==='shotgun'?[[0,[0,-.04,-.28]],[.2,[0,-.03,-.1]],[.42,[.04,-.02,.03]],[.66,[.04,-.02,.03]],[.82,[0,-.04,-.2]],[1,[0,-.04,-.28]]]
        :[[0,type==='pistol'?[.025,-.13,.03]:[.01,-.03,type==='sniper'?-.33:-.4]],[.17,mag],[.35,[.02,-.38,.04]],[.48,[.02,-.38,.04]],[.65,mag],[.78,[.06,.03,-.18]],[.86,[.06,.03,-.08]],[1,type==='pistol'?[.025,-.13,.03]:[.01,-.03,type==='sniper'?-.33:-.4]]];
    const p=THREE.MathUtils.clamp(progress,0,1);let i=0;while(i<keys.length-2&&p>keys[i+1][0])i++;
    return new THREE.Vector3(...keys[i][1]).lerp(new THREE.Vector3(...keys[i+1][1]),smooth((p-keys[i][0])/(keys[i+1][0]-keys[i][0])));
}

export class FirstPersonHands {
    constructor(weapon,character) {
        this.weapon=weapon;this.group=new THREE.Group();this.group.name='first-person-hands';
        this.skin=new THREE.MeshStandardMaterial({color:character.skinTone??0xc9a186,roughness:.75});
        this.sleeve=garmentMaterial(character.sleeveColor??0x4a5240);
        this.shell=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.035,12),new THREE.MeshStandardMaterial({color:0xa57534,metalness:.6,roughness:.35}));this.group.add(this.shell);
        this.hands={};this.forearms={};this.fingers=[];
        this.grips={pistol:[[.028,-.09,.05],[.025,-.13,.03]],rifle:[[.028,-.07,.025],[.01,-.03,-.4]],shotgun:[[.03,-.06,.10],[.01,-.04,-.28]],sniper:[[.03,-.075,.20],[.01,-.03,-.33]],melee:[[.025,-.05,.03],[-.1,-.28,.1]]}[weapon.data.type];
        this.grips=this.grips.map(v=>[...v]);
        if(['fireaxe','sledgehammer'].includes(weapon.id))this.grips=[[.02,-.025,.055],[-.02,-.025,-.20]];
        if(HANDLING_PROFILES[weapon.id])this.grips[1]=[...HANDLING_PROFILES[weapon.id].grip];
        for(const [i,side] of ['R','L'].entries()) {
            const hand=new THREE.Group();hand.name='wrist'+side;
            const palm=new THREE.Mesh(new RoundedBoxGeometry(.062,.034,.067,4,.012),this.skin);hand.add(palm);
            for(let f=0;f<4;f++) {
                const root=new THREE.Group();root.position.set((f-1.5)*.015,0,-.026);hand.add(root);
                let joint=root;
                for(let k=0;k<3;k++) {
                    const length=(f===3?.014:.018)*(k===2?.8:1),finger=new THREE.Mesh(new THREE.CapsuleGeometry(.006,length-.008,3,8),this.skin);
                    finger.rotation.x=Math.PI/2;finger.position.z=-length/2;joint.add(finger);
                    joint.rotation.x=-.8;this.fingers.push({joint,trigger:side==='R'&&f===0,base:-.8});
                    const next=new THREE.Group();next.position.z=-length;joint.add(next);joint=next;
                }
            }
            const thumb=new THREE.Mesh(new THREE.CapsuleGeometry(.009,.032,4,10),this.skin);
            thumb.position.set(side==='R'?-.029:.029,-.009,.007);thumb.rotation.z=side==='R'?-.7:.7;hand.add(thumb);
            const fore=new THREE.Mesh(new THREE.CylinderGeometry(.042,.054,1,16),this.sleeve);
            this.group.add(fore,hand);this.hands[side]=hand;this.forearms[side]=fore;
            hand.position.fromArray(this.grips[i]);
        }
        weapon.mesh.add(this.group);this.update();
    }
    update() {
        const w=this.weapon;
        for(const [i,side] of ['R','L'].entries()) {
            const hand=this.hands[side];hand.position.fromArray(this.grips[i]);
            if(side==='L'&&w.isReloading)hand.position.copy(reloadHandPose(w.data.type,w.reloadProgress,w.id));
            if(side==='R'&&w.data.shape==='bolt'&&!w.canFire&&!w.isReloading){const cycle=1-w.fireTimer*w.data.fireRate;hand.position.lerp(new THREE.Vector3(.08,.04,.07+Math.sin(cycle*Math.PI)*.08),Math.sin(Math.max(0,cycle)*Math.PI));}
            if(side==='L'&&w.data.shape==='pump'&&!w.canFire&&!w.isReloading)hand.position.z+=Math.sin(Math.max(0,1-w.fireTimer*w.data.fireRate)*Math.PI)*.09;
            hand.rotation.set(.35,side==='R'?.3:-.25,side==='R'?-.4:.4);
            const elbow=new THREE.Vector3(side==='R'?.3:-.14,-.42,.32),dir=hand.position.clone().sub(elbow),fore=this.forearms[side];
            fore.scale.y=dir.length();fore.position.copy(elbow).addScaledVector(dir,.5);
            fore.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
        }
        this.shell.visible=w.isReloading&&(w.data.shape==='pump'||w.data.shape==='revolver');this.shell.position.copy(this.hands.L.position);
        const trigger=w.canFire?0:.22;
        for(const f of this.fingers)f.joint.rotation.x=f.base-(f.trigger?trigger:0);
    }
    dispose() {this.group.traverse(o=>o.geometry?.dispose());this.skin.dispose();this.sleeve.dispose();this.shell.material.dispose();this.group.removeFromParent();}
}
