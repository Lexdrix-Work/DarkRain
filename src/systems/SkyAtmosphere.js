import * as THREE from 'three';

// Smooth periodic keyframes retain the existing noon and night lighting budget.
const keys = [
    [0,0,.35,.14,0x000011,0x0a0a1a,0x2a3a5c,0xff8866],
    [5,0,.35,.14,0x000011,0x0a0a1a,0x2a3a5c,0xff8866],
    [6,.15,.08,.22,0x263c66,0xb66c52,0x8b8295,0xff8866],
    [7,2.2,0,.5,0x397eb3,0xa8bbca,0xbcd4e8,0xffd9ac],
    [12.5,3,0,.65,0x2474ad,0xaecbdc,0xbcd4e8,0xffffee],
    [17,2.2,0,.5,0x397eb3,0xa8bbca,0xbcd4e8,0xffd9ac],
    [18,.6,0,.3,0x3f496b,0xd58562,0x9a7a88,0xff8866],
    [19,0,.08,.2,0x18253e,0x644b60,0x595b80,0xff6644],
    [20,0,.35,.14,0x000011,0x0a0a1a,0x2a3a5c,0xff8866],
    [24,0,.35,.14,0x000011,0x0a0a1a,0x2a3a5c,0xff8866]
];
export function sampleAtmosphere(hours) {
    const hour=((hours%24)+24)%24;
    let i=0;while(i<keys.length-2&&hour>keys[i+1][0])i++;
    const a=keys[i],b=keys[i+1],t=THREE.MathUtils.smoothstep(hour,a[0],b[0]);
    const color=k=>new THREE.Color(a[k]).lerp(new THREE.Color(b[k]),t);
    const sun=THREE.MathUtils.lerp(a[1],b[1],t),moon=THREE.MathUtils.lerp(a[2],b[2],t);
    const daylight=THREE.MathUtils.smoothstep(Math.sin((hour-6)*Math.PI/12),-.12,.22);
    return {sun,moon,ambient:THREE.MathUtils.lerp(a[3],b[3],t),top:color(4),horizon:color(5),ambientColor:color(6),sunColor:color(7),
        night:1-THREE.MathUtils.smoothstep(Math.sin((hour-6)*Math.PI/12),-.30,.05),fogBrightness:.07+.93*daylight};
}

