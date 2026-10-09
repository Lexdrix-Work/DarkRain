import * as THREE from 'three';
import { applyArmedHumanPose } from './ArmedHumanPose.js';

let library;
let loading;
export function preloadHumanAnimations() {
    loading ||= fetch(new URL('../assets/animations/human-locomotion.json',import.meta.url).href)
        .then(r=>{if(!r.ok)throw new Error('Could not load human motion clips');return r.json();})
        .then(data=>{
            library=Object.fromEntries(Object.entries(data.motions).map(([name,motion])=>[name,
                {...motion,clip:THREE.AnimationClip.parse(motion.clip)}]));
        });
    return loading;
}

export function locomotionState(speed) {
    return speed < .15 ? 'idle' : speed < 3.8 ? 'walk' : 'run';
}

/** Shared clips, separate mixers. World movement remains owned by the AI. */
export class HumanAnimationController {
    constructor(actor) {
        if(!library) throw new Error('Human motion clips must be preloaded');
        this.actor=actor;this.root=actor.mesh;this.rig=this.root.animationRig;
        this.mixer=new THREE.AnimationMixer(this.root);
        this.actions=Object.fromEntries(Object.entries(library).map(([name,m])=>[name,this.mixer.clipAction(m.clip)]));
        this.state='idle';this.actions.idle.play();
        this.previousPosition=actor.position.clone();this.speed=0;
        this.blinkTime=Math.random()*4.5;this.eyeParts=[];this.root.traverse(o=>{if(o.eyeParts)this.eyeParts.push(...o.eyeParts);});
    }
    update(dt) {
        if(dt<=0||this.disposed)return;
        this.blinkTime=(this.blinkTime+dt)%4.5;
        const blink=this.blinkTime<.18?1-.96*Math.sin(this.blinkTime/.18*Math.PI):1;
        for(const eye of this.eyeParts){eye.part.scale.y=eye.scaleY*blink;if(eye.lid)eye.part.position.y=eye.centerY*(1-blink);}
        const actualSpeed=this.actor.position.clone().sub(this.previousPosition).setY(0).length()/dt;
        this.previousPosition.copy(this.actor.position);
        this.speed=THREE.MathUtils.lerp(this.speed,actualSpeed,1-Math.exp(-dt*12));
        let next=locomotionState(this.speed);
        if(this.state==='run'&&this.speed>=3.4)next='run';
        if(next!==this.state) {
            const old=this.actions[this.state],action=this.actions[next];
            const phase=(old.time%library[this.state].clip.duration)/library[this.state].clip.duration;
            action.reset().setEffectiveWeight(1).play();
            if(this.state!=='idle'&&next!=='idle')action.time=phase*library[next].clip.duration;
            old.crossFadeTo(action,.18,false);this.state=next;
        }
        const action=this.actions[this.state],nominal=library[this.state].nominalSpeed;
        action.setEffectiveTimeScale(nominal>0?THREE.MathUtils.clamp(this.speed/nominal,.45,2.5):1);
        this.root.position.copy(this.actor.position);this.root.rotation.copy(this.actor.rotation);
        this.mixer.update(dt);this.root.updateMatrixWorld(true);
        if(this.rig.weapon) {
            const kick=Math.max(0,this.shotKick||0);this.shotKick=Math.max(0,kick-dt*9);
            const chest=this.rig.bones.chest;
            if(this.actor.target&&this.actor.aiState==='attack') {
                const targetY=this.actor.target.position.y+1.2;
                chest.rotation.x+=THREE.MathUtils.clamp((1.3+this.actor.position.y-targetY)/Math.max(1,this.actor.position.distanceTo(this.actor.target.position)),-.3,.3);
            }
            chest.rotation.x+=kick*.09;
            this.root.updateMatrixWorld(true);
        }
        applyArmedHumanPose(this.rig);
        // Conservative sole contacts follow the actual foot orientation on terrain.
        let lift=0;
        for(const {bone,point} of this.rig.footContacts||[]) {
            const world=point.clone().applyMatrix4(bone.matrixWorld);
            const ground=this.actor.game?.worldManager?.getTerrainHeight(world.x,world.z) ?? this.actor.position.y;
            lift=Math.max(lift,ground+.035-world.y);
        }
        if(lift>0) {this.rig.bones.hips.position.y+=lift;this.root.updateMatrixWorld(true);}
    }
    fire() {this.shotKick=1;}
    dispose() {
        if(this.disposed)return;this.disposed=true;
        // Stopping actions restores bind transforms; retain the visible death pose.
        const pose=this.rig.skeleton.bones.map(b=>({bone:b,position:b.position.clone(),quaternion:b.quaternion.clone()}));
        this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);
        for(const p of pose){p.bone.position.copy(p.position);p.bone.quaternion.copy(p.quaternion);}
        this.root.updateMatrixWorld(true);this.rig.skeleton.dispose();
    }
}
