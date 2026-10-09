import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/** Articulated human skeleton driven by capsules and joint constraints. */
export class RigidRagdoll {
    constructor(physics,source,position,impulse,slot=0) {
        this.physics=physics;this.age=0;this.group=new THREE.Group();this.group.position.copy(position);physics.game.scene.add(this.group);
        this.visual=clone(source);this.visual.position.set(0,0,0);this.visual.visible=true;
        this.visual.traverse(o=>{delete o.userData.entityId;if(o.isMesh){o.geometry=o.geometry.clone();o.geometry.userData.shared=false;o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});
        this.group.add(this.visual);this.group.updateMatrixWorld(true);this.parts=[];
        const gun=this.visual.getObjectByName('held-rifle');
        if(gun){physics.game.scene.attach(gun);physics.addBody(gun,new THREE.Vector3(.10,.15,1.18),{mass:3.5,life:45,kind:'corpse-weapon',velocity:impulse});}
        const radii={hips:.22,spine:.21,chest:.235,neck:.055,head:.145,upperArm:.052,forearm:.045,hand:.05,thigh:.075,shin:.065,foot:.08};
        const segments=[['hips','spine'],['spine','chest'],['chest','neck'],['neck','head'],['head','headTip']];
        for(const side of ['L','R'])segments.push(['upperArm'+side,'forearm'+side],['forearm'+side,'hand'+side],['hand'+side,'handTip'+side],['thigh'+side,'shin'+side],['shin'+side,'foot'+side],['foot'+side,'toes'+side]);
        const byBone=new Map(),member=1<<(slot+2),groups=((member<<16)|(0xffff^member))>>>0;
        for(const [name,endName] of segments) {
            const bone=this.visual.getObjectByName(name),end=this.visual.getObjectByName(endName);if(!bone||!end)continue;
            const a=bone.getWorldPosition(new THREE.Vector3()),b=end.getWorldPosition(new THREE.Vector3()),length=a.distanceTo(b);
            const align=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),end.position.clone().normalize());
            const rotation=bone.getWorldQuaternion(new THREE.Quaternion()).multiply(align),centre=a.clone().lerp(b,.5);
            const body=physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...centre.toArray()).setRotation(rotation).setLinearDamping(.7).setAngularDamping(1.2).setCcdEnabled(true));
            const key=name.replace(/[LR]$/,''),radius=radii[key]||.06;
            const collider=RAPIER.ColliderDesc.capsule(Math.max(.005,length/2-radius),radius).setMass(['hips','spine','chest'].includes(key)?9:2).setFriction(.85).setContactSkin(.02).setCollisionGroups(groups);
            if(key==='head')collider.setTranslation(0,-.04,.025);
            physics.world.createCollider(collider,body);
            body.setLinvel(impulse.clone().multiplyScalar(.7),true);
            const part={body,bone,alignInverse:align.clone().invert(),length};this.parts.push(part);byBone.set(bone,part);
        }
        for(const part of this.parts) {
            const parent=byBone.get(part.bone.parent);if(!parent)continue;
            const pivot=part.bone.getWorldPosition(new THREE.Vector3());
            const anchor=r=>pivot.clone().sub(new THREE.Vector3().copy(r.body.translation())).applyQuaternion(new THREE.Quaternion().copy(r.body.rotation()).invert());
            const a=anchor(parent),b=anchor(part);let descriptor;
            const hinge=/^(shin|forearm)/.test(part.bone.name);
            if(hinge) {
                const axis=new THREE.Vector3(1,0,0).applyQuaternion(source.getWorldQuaternion(new THREE.Quaternion()));
                const axisA=axis.clone().applyQuaternion(new THREE.Quaternion().copy(parent.body.rotation()).invert());
                const axisB=axis.clone().applyQuaternion(new THREE.Quaternion().copy(part.body.rotation()).invert());
                descriptor=RAPIER.JointData.revoluteWithAxes(a,b,axisA,axisB);
            } else descriptor=RAPIER.JointData.spherical(a,b);
            const joint=physics.world.createImpulseJoint(descriptor,parent.body,part.body,true);joint.setContactsEnabled(false);if(hinge)joint.setLimits(-1.5,1.5);
        }
    }
    update(dt) {
        this.age+=dt;this.settled=this.parts.every(p=>p.body.isSleeping());this.settleTime=this.age;
        for(const part of this.parts) {
            const rotation=new THREE.Quaternion().copy(part.body.rotation()),start=new THREE.Vector3(0,-part.length/2,0).applyQuaternion(rotation).add(new THREE.Vector3().copy(part.body.translation()));
            part.bone.parent.updateWorldMatrix(true,false);part.bone.position.copy(part.bone.parent.worldToLocal(start));
            const parentRotation=part.bone.parent.getWorldQuaternion(new THREE.Quaternion());
            part.bone.quaternion.copy(parentRotation.invert().multiply(rotation).multiply(part.alignInverse));part.bone.updateWorldMatrix(false,true);
        }
        this.visual.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
    }
    dispose(){for(const p of this.parts)this.physics.world.removeRigidBody(p.body);this.visual.traverse(o=>{o.geometry?.dispose();if(o.isSkinnedMesh)o.skeleton.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.group.removeFromParent();}
}
