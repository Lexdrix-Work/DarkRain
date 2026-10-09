import * as THREE from 'three';

// Joint locations in the anatomical asset's bind pose, in metres.
export const HUMANOID_JOINTS = {
    hips: [null,0,.9339,.0152], spine:['hips',0,1.0536,.0156], chest:['spine',0,1.3121,-.0075],
    neck:['chest',0,1.4761,.0071], head:['neck',0,1.59,.0169], headTip:['head',0,1.7401,.0087],
    upperArmL:['chest',-.1761,1.4084,.0153], forearmL:['upperArmL',-.3286,1.2244,.0139], handL:['forearmL',-.4527,1.115,.1844], handTipL:['handL',-.5023,.9944,.3165],
    upperArmR:['chest',.1761,1.4084,.0153], forearmR:['upperArmR',.3286,1.2244,.0139], handR:['forearmR',.4527,1.115,.1844], handTipR:['handR',.5023,.9944,.3165],
    thighL:['hips',-.1159,.9086,.0129], shinL:['thighL',-.166,.4696,.0336], footL:['shinL',-.2306,.0756,-.001], toesL:['footL',-.2308,.0149,.2132],
    thighR:['hips',.1159,.9086,.0129], shinR:['thighR',.166,.4696,.0336], footR:['shinR',.2306,.0756,-.001], toesR:['footR',.2308,.0149,.2132]
};

export function createHumanoidRig(root) {
    const bones = {};
    for(const [name,[parent,x,y,z]] of Object.entries(HUMANOID_JOINTS)) {
        const bone = new THREE.Bone();bone.name=name;
        bone.position.set(x,y,z);
        if(parent) bone.position.sub(new THREE.Vector3(...HUMANOID_JOINTS[parent].slice(1)));
        (bones[parent]||root).add(bone);bones[name]=bone;
    }
    root.updateMatrixWorld(true);
    const skeleton=new THREE.Skeleton(Object.values(bones));skeleton.calculateInverses();
    return {bones,skeleton,indices:Object.fromEntries(skeleton.bones.map((b,i)=>[b.name,i]))};
}

export function skinHumanoidGeometry(geometry, part, indices) {
    const [region]=part.split(':');part=region;
    const g=geometry.clone(),positions=g.attributes.position;
    const offset=part.startsWith('arm') ? [part==='armR'?.215:-.215,1.43,0]
        : part.startsWith('leg') ? [part==='legR'?.1:-.1,.87,0] : [0,0,0];
    g.translate(...offset);
    if(!g.attributes.uv) {
        const uv=new Float32Array(positions.count*2);
        for(let i=0;i<positions.count;i++) {
            uv[i*2]=Math.atan2(positions.getX(i)-offset[0],positions.getZ(i)-offset[2])/(Math.PI*2)+.5;
            uv[i*2+1]=positions.getY(i)*3;
        }
        g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    }
    const ids=new Uint16Array(positions.count*4),weights=new Float32Array(positions.count*4);
    const mix=(y,pivot,width)=>THREE.MathUtils.clamp((pivot+width-y)/(width*2),0,1);
    for(let i=0;i<positions.count;i++) {
        const y=positions.getY(i);let a,b,t;
        if(part.startsWith('arm')) {
            const side=part.endsWith('R')?'R':'L';
            if(y>1.38){a='chest';b=`upperArm${side}`;t=mix(y,1.415,.035);}
            else if(y<1.16) {a=`forearm${side}`;b=`hand${side}`;t=mix(y,1.115,.035);}
            else {a=`upperArm${side}`;b=`forearm${side}`;t=mix(y,1.2244,.055);}
        } else if(part.startsWith('leg')) {
            const side=part.endsWith('R')?'R':'L';
            if(y<.17) {a=`shin${side}`;b=`foot${side}`;t=mix(y,.0756,.045);}
            else {a=`thigh${side}`;b=`shin${side}`;t=mix(y,.4696,.075);}
        } else {
            const chain=['hips','spine','chest','neck','head'].map(n=>[n,HUMANOID_JOINTS[n][2]]);
            let k=0;while(k<chain.length-2&&y>chain[k+1][1])k++;
            [a]=chain[k];[b]=chain[k+1];t=THREE.MathUtils.clamp((y-chain[k][1])/(chain[k+1][1]-chain[k][1]),0,1);
        }
        ids[i*4]=indices[a];ids[i*4+1]=indices[b];weights[i*4]=1-t;weights[i*4+1]=t;
    }
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    g.computeBoundingSphere();return g;
}

export function attachSkinnedMesh(root,geometry,material,rig) {
    const mesh=new THREE.SkinnedMesh(geometry,material);
    mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
    root.updateMatrixWorld(true);mesh.bind(rig.skeleton);return mesh;
}
