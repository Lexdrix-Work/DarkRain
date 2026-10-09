import * as THREE from 'three';
/** Stable light count: firing never recompiles the world shader's light layout. */
export class BurstLights {
    constructor(scene){this.scene=scene;this.clock=0;this.slots=Array.from({length:3},()=>{const light=new THREE.PointLight(0xffb56a,0,8);light.castShadow=false;scene.add(light);return {light,until:0,duration:0,peak:0};});}
    emit(position,color,intensity,distance,duration){let slot=this.slots[0];for(const candidate of this.slots)if(candidate.until<slot.until)slot=candidate;slot.light.position.copy(position);slot.light.color.setHex(color);slot.light.distance=distance;slot.peak=intensity;slot.duration=duration;slot.until=this.clock+duration;slot.light.intensity=intensity;}
    update(dt){this.clock+=dt;for(const s of this.slots)s.light.intensity=s.peak*Math.max(0,(s.until-this.clock)/s.duration||0);}
    dispose(){for(const s of this.slots){s.light.removeFromParent();s.light.dispose();}}
}
