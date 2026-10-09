import * as THREE from 'three';

// A two-bone support pose layered over locomotion. Grip targets move with the chest.
export function applyArmedHumanPose(rig) {
    if(!rig.weapon)return;
    const chest=rig.bones.chest;
    for(const side of ['R','L']) {
        const upper=rig.bones['upperArm'+side],lower=rig.bones['forearm'+side],hand=rig.bones['hand'+side];
        const shoulder=upper.getWorldPosition(new THREE.Vector3());
        const grip=rig.weapon.userData.grips?.[side];
        const target=grip?rig.weapon.localToWorld(new THREE.Vector3(...grip)):chest.localToWorld(new THREE.Vector3(side==='R'?.06:-.05,side==='R'?-.07:-.05,side==='R'?.12:.31));
        const pole=chest.localToWorld(new THREE.Vector3(side==='R'?.42:-.42,-.25,.02));
        const a=lower.position.length(),b=hand.position.length();
        const direction=target.clone().sub(shoulder),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.001,a+b-.001);
        direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
        const bend=pole.sub(shoulder);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
        const along=(a*a-b*b+distance*distance)/(2*distance);
        const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
        const orient=(bone,bind,destination)=>{
            const world=new THREE.Quaternion().setFromUnitVectors(bind.clone().normalize(),destination.normalize());
            bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
            bone.updateWorldMatrix(false,true);
        };
        orient(upper,lower.position,elbow.clone().sub(shoulder));
        orient(lower,hand.position,target.clone().sub(elbow));
        const tip=rig.bones['handTip'+side].position;
        const forward=new THREE.Vector3(0,-.07,.14).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
        orient(hand,tip,forward);
    }
}
