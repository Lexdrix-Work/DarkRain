import {motionScale} from '../core/settings/Accessibility.js';
import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/** Small, bounded body-mounted motion; no extra render pass or scene objects. */
export class BodyMotionSystem {
    constructor(game) {
        this.game = game; this.roll = 0; this.recoil = 0; this.breathHolding = false;
        this.lean=0;this.leanDirection=new THREE.Vector3();this.lastGrounded = true; this.landing = 0;
        this.offFire = globalEventBus.on(GameEvents.WEAPON_FIRE, ({ weapon }) => {
            this.recoil = Math.min(0.025, this.recoil + (weapon?.data?.recoil || 0.08) * 0.06);
        });
    }
    apply(camera, dt) {
        const player = this.game.player;
        const input = this.game.inputManager;
        const aiming = input?.isActionActive('aim');
        const requested=!!input?.isActionActive('steadyAim');if(!requested)this.breathExhausted=false;if(player.stats.stamina<=5)this.breathExhausted=true;
        this.breathHolding = !!(aiming && requested && !this.breathExhausted && player.stats.stamina > 5 && !player.isSprinting);
        if (this.breathHolding) player.stats.stamina = Math.max(0, player.stats.stamina - dt * 18);
        if (player.isGrounded && !this.lastGrounded) this.landing = 0.035;
        this.lastGrounded = player.isGrounded;
        const yaw = player.cameraYaw || 0;
        const sideSpeed = player.velocity.x * Math.cos(yaw) - player.velocity.z * Math.sin(yaw);
        const target = Math.max(-0.018, Math.min(0.018, -sideSpeed * 0.004));
        this.roll += (target - this.roll) * (1 - Math.exp(-8 * Math.max(0, dt)));
        this.recoil *= Math.exp(-12 * Math.max(0, dt));
        this.landing *= Math.exp(-10 * Math.max(0, dt));
        const cameraMotion=motionScale(this.game.settings);const strength = (this.game.progressionSystem?.motionAmount ?? 0.55)*cameraMotion;
        const steady = aiming ? (this.breathHolding ? 0.15 : 0.4) : 1;
        camera.rotation.z += this.roll * strength * steady;
        camera.rotation.x -= this.recoil * strength;
        camera.position.y -= this.landing * strength;
        const targetLean=(input?.isActionActive('leanRight')?1:0)-(input?.isActionActive('leanLeft')?1:0);this.lean+=(targetLean-this.lean)*(1-Math.exp(-12*Math.max(0,dt)));
        if(Math.abs(this.lean)>.001){const desired=Math.abs(this.lean)*.2;this.leanDirection.set(Math.cos(yaw)*Math.sign(this.lean),0,-Math.sin(yaw)*Math.sign(this.lean));const allowed=this.game.physicsSystem?.clipCameraLean?.(camera.position,this.leanDirection,desired)??0;camera.position.addScaledVector(this.leanDirection,allowed);camera.rotation.z-=this.lean*.10*cameraMotion;}

    }
    dispose() { if (typeof this.offFire === 'function') this.offFire(); }
}
