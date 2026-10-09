import * as THREE from 'three';
import {globalEventBus} from '../../core/EventBus.js';

/** Fuses run on simulation time, so pause and saving cannot silently detonate them. */
export class Explosives {
    constructor(physics){this.physics=physics;this.serial=0;}
    spawn(position,velocity,settings,id){
        const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.5,2),new THREE.MeshStandardMaterial({color:0x48513b,roughness:.82,metalness:.35}));mesh.scale.setScalar(.13);
        mesh.position.copy(position);mesh.castShadow=mesh.receiveShadow=true;this.physics.game.scene.add(mesh);
        const r=this.physics.addBody(mesh,new THREE.Vector3(.13,.13,.13),{mass:.55,kind:'explosive',id:id||'grenade:'+this.serial++,velocity,convex:true});
        r.explosive={fuse:3,radius:4.5,strength:220,...settings};return r;
    }
    throwFromPlayer(item){
        const game=this.physics.game,camera=game.player?.camera;if(!camera||!this.physics.world)return false;
        const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),hit=game.worldManager.raycast(camera.position,direction,.65);
        const distance=hit?Math.max(.08,hit.distance-.12):.5;
        this.spawn(camera.position.clone().addScaledVector(direction,distance),direction.multiplyScalar(10).add(new THREE.Vector3(0,2.5,0)),{radius:item.blastRadius,strength:item.blastDamage});
        game.uiManager?.showNotification('Grenade thrown — take cover','warning');return true;
    }
    update(dt){
        for(const r of [...this.physics.dynamic.values()])if(r.explosive){
            r.explosive.fuse-=dt;if(r.explosive.fuse>0)continue;
            const p=new THREE.Vector3().copy(r.body.translation()),{radius,strength}=r.explosive;delete r.explosive;
            // The casing remains physical; it is not a lifetime-cull exception.
            r.kind='model-fragment';r.originId=r.id;r.materialId='steel';
            this.physics.explode(p,radius,strength);
            const game=this.physics.game,targets=new Set([game.player,...(game.worldManager.entities?.values()||[])]);
            for(const entity of targets){if(!entity?.position||!entity.takeDamage)continue;
                const target=entity.position.clone().add(new THREE.Vector3(0,.8,0)),d=target.distanceTo(p);if(d>=radius)continue;
                const direction=target.sub(p).normalize(),cover=game.worldManager.raycast?.(p.clone().addScaledVector(direction,.15),direction,Math.max(0,d-.15));
                const blocked=cover&&cover.distance<d-.5;entity.takeDamage(strength*(1-d/radius)*(blocked?.18:1),game.player);
            }
            for(const entity of game.worldManager.entities?.values()||[])entity.hearNoise?.(p,150);
            globalEventBus.emit('effect:explosion',{position:p,radius});
            globalEventBus.emit('audio:play',{sound:'explosion',volume:.9,position:p});
        }
    }
    serialize(){return [...this.physics.dynamic.values()].filter(r=>r.explosive).map(r=>({id:r.id,position:r.body.translation(),velocity:r.body.linvel(),rotation:r.body.rotation(),angular:r.body.angvel(),settings:r.explosive}));}
    restore(states){for(const s of states||[]){const r=this.spawn(s.position,s.velocity,s.settings,s.id);r.body.setRotation(s.rotation,true);r.body.setAngvel(s.angular,true);}this.serial=Math.max(0,...(states||[]).map(s=>Number(s.id.split(':').at(-1))+1||0));}
}
