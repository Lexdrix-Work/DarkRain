import {motionScale} from '../core/settings/Accessibility.js';
import * as THREE from 'three';
import { normalizeCharacter } from '../entities/CharacterModel.js';

/**
 * ViewmodelSystem - First-person overlay renderer.
 *
 * Weapon viewmodels used to be children of the player camera, so walking up
 * to a wall pushed the gun *through* the wall (same depth buffer, same near
 * plane). This system renders all first-person geometry (weapon, arms, hat
 * brim) in a dedicated overlay scene with its own camera, drawn after the
 * main pass with the depth buffer cleared. The viewmodel can never clip
 * into world geometry again, and it keeps its own near/far + lighting.
 */
export class ViewmodelSystem {
    constructor(game) {
        this.game = game;

        this.vmScene = new THREE.Scene();
        // No fog in the overlay - the gun is 50cm away
        this.vmScene.fog = null;

        this.vmCamera = new THREE.PerspectiveCamera(75, 1, 0.01, 30);
        // Rig holds weapon + arms + hat at the exact local offsets the old
        // camera-child setup used, so placement tuning carries over unchanged
        this.rig = new THREE.Group();
        this.vmCamera.add(this.rig);
        this.vmScene.add(this.vmCamera);

        // Overlay lighting: soft hemisphere so standard materials read
        // correctly + the warm fill the old camera light provided.
        // NOTE: these are children of the overlay CAMERA (not the scene),
        // because the camera teleports to the player's world position each
        // frame - scene-space lights would be left behind at the origin.
        const hemi = new THREE.HemisphereLight(0x9aa4b5, 0x3a352c, 0.55);
        this.vmCamera.add(hemi);
        const fill = new THREE.PointLight(0xfff0dd, 0.9, 3, 1.6);
        fill.position.set(0.15, 0.1, 0.15);
        this.vmCamera.add(fill);
        // Key light from upper-left so the gun has form even at night
        const key = new THREE.DirectionalLight(0xdfe8ff, 0.35);
        key.position.set(-0.5, 1, 0.5);
        this.vmCamera.add(key);

        this.hatBrim = null;
        this.character = null;
    }

    /** Attach a weapon group (or any FP object) to the overlay rig */
    attach(obj) {
        if (obj) this.rig.add(obj);
    }

    /** Remove everything the rig holds (weapon swaps call detach themselves) */
    clear() {
        for (let i = this.rig.children.length - 1; i >= 0; i--) {
            const child = this.rig.children[i];
            if (child !== this.hatBrim) {
                this.rig.remove(child);
            }
        }
    }

    /**
     * Apply the player's character customization: rebuild the hat brim
     * visible when looking down. Arms are built per-weapon (see
     * Weapon.setCharacter) so they follow recoil and aim motion.
     */
    setCharacter(character) {
        this.character = character || ViewmodelSystem.defaultCharacter();
        this._buildHatBrim();
        // Push to every known weapon so arms match on next equip
        for (const weapon of this.game.weaponManager?.weapons.values() || []) {
            weapon.setCharacter(this.character);
        }
    }

    static defaultCharacter() {
        return normalizeCharacter({ hat: 'cap', skinTone: 0xc9a186, sleeveColor: 0x4a5240, name: 'Stalker' });
    }

    _buildHatBrim() {
        if (this.hatBrim) {
            this.rig.remove(this.hatBrim);
            this.hatBrim = null;
        }
        const hat = HatFactory.build(this.character.hat, this.character);
        if (!hat) return;
        // Brim sits just above the eyes; only the front edge peeks into view
        // when the player pitches down
        hat.position.set(0, 0.16, -0.02);
        hat.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false; o.receiveShadow = false;
                o.material.transparent = true;
            }
        });
        hat.visible = false;
        this.hatBrim = hat;
        this.rig.add(hat);
    }

    /**
     * Procedural weapon motion: walk bob, mouse sway, fire recoil, reload dip.
     */
    updateWeaponMotion(deltaTime) {
        if (!this.rig) return;
        const player = this.game.player;
        const t = (this._vmT = (this._vmT || 0) + deltaTime);
        const dt = Math.min(deltaTime, 0.05);

        // --- Spring helper: critically-damped-ish spring for weighty feel ---
        const spring = (cur, target, vel, stiffness, damping) => {
            const f = (target - cur) * stiffness;
            vel += f * dt;
            vel *= Math.exp(-damping * dt);
            cur += vel * dt;
            return [cur, vel];
        };
        if (!this._swayVel) this._swayVel = { x: 0, y: 0, rx: 0, ry: 0 };

        // --- Walk bob: figure-eight with rotation ---
        let speed = 0;
        if (player && player.velocity) {
            speed = Math.hypot(player.velocity.x, player.velocity.z);
        }
        const moving = Math.min(1, speed / 3);
        this._bobPhase = (this._bobPhase || 0) + dt * (5 + speed * 1.2) * moving;
        const bp = this._bobPhase || 0;
        const bobX = Math.cos(bp) * 0.018 * moving;
        const bobY = Math.abs(Math.sin(bp)) * 0.020 * moving;
        const bobRoll = Math.sin(bp) * 0.03 * moving;   // gun rolls with steps
        const bobYaw = Math.cos(bp * 0.5) * 0.02 * moving;

        // --- Breathing: subtle idle sway (BODYCAM-style) ---
        const breathFactor=this.game.bodyMotionSystem?.breathHolding ? .15 : 1;
        const breathX = Math.sin(t * 1.4) * 0.0035*breathFactor;
        const breathY = Math.cos(t * 1.1) * 0.003*breathFactor;
        const breathR = Math.sin(t * 0.9) * 0.008*breathFactor;

        // --- Mouse sway: heavy spring lag (weapon has inertia) ---
        const yaw = player?.cameraYaw || 0, pitch = player?.cameraPitch || 0;
        const dyaw = yaw - (this._lastYaw ?? yaw);
        const dpitch = pitch - (this._lastPitch ?? pitch);
        this._lastYaw = yaw; this._lastPitch = pitch;
        // Target is proportional to angular velocity; spring gives overshoot
        const swayTX = THREE.MathUtils.clamp(-dyaw * 3.0, -0.09, 0.09);
        const swayTY = THREE.MathUtils.clamp(dpitch * 3.0, -0.09, 0.09);
        [this._swayX, this._swayVel.x] = spring(this._swayX || 0, swayTX, this._swayVel.x, 90, 9);
        [this._swayY, this._swayVel.y] = spring(this._swayY || 0, swayTY, this._swayVel.y, 90, 9);
        // Rotational sway (gun tilts against the look direction)
        const rswayTX = THREE.MathUtils.clamp(-dyaw * 1.2, -0.12, 0.12);
        const rswayTY = THREE.MathUtils.clamp(dpitch * 1.0, -0.10, 0.10);
        [this._swayRX, this._swayVel.rx] = spring(this._swayRX || 0, rswayTX, this._swayVel.rx, 70, 8);
        [this._swayRY, this._swayVel.ry] = spring(this._swayRY || 0, rswayTY, this._swayVel.ry, 70, 8);

        // --- Strafe lean: roll into sideways movement ---
        let strafe = 0;
        if (player && player.velocity && player.cameraYaw !== undefined) {
            const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.cameraYaw);
            const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.cameraYaw);
            strafe = player.velocity.dot(right) / 5;
        }
        const leanTarget = THREE.MathUtils.clamp(-strafe * 0.06, -0.08, 0.08);
        this._lean = (this._lean || 0) + (leanTarget - (this._lean || 0)) * Math.min(1, dt * 6);

        // --- Fire recoil: kick back + up, spring back ---
        this._recoil = Math.max(0, (this._recoil || 0) - dt * 5);
        const rk = this._recoil;

        // --- Reload dip ---
        const w = this.game.weaponManager?.equippedWeapon;
        const reloading = w?.isReloading;
        this._reloadDip = ((this._reloadDip || 0) +
            ((reloading ? 1 : 0) - (this._reloadDip || 0)) * Math.min(1, dt * 7));

        // --- ADS dampening: aiming steadies the weapon ---
        const ads = w?.isAiming ? 0.45 : 1.0;const motion=motionScale(this.game.settings,'weaponMotion');
        const running=player?.isSprinting && speed>0.5 && !w?.isAiming;
        this._sprintDip=(this._sprintDip || 0)+((running?1:0)-(this._sprintDip || 0))*Math.min(1,dt*8);

        // The overlay avoids depth clipping; retract it near actual geometry so
        // the barrel does not visibly sit on top of a wall it should meet.
        this._wallDirection ||=new THREE.Vector3();
        let obstruction=0;
        if(player?.camera&&this.game.physicsSystem?.world){player.camera.getWorldDirection(this._wallDirection);const distance=this.game.physicsSystem.clipCameraLean(player.camera.position,this._wallDirection,.8);obstruction=1-THREE.MathUtils.clamp((distance-.15)/.65,0,1);}
        this._wallRetraction=THREE.MathUtils.lerp(this._wallRetraction||0,obstruction,1-Math.exp(-dt*18));
        // Compose final rig transform
        this.rig.position.set(
            (bobX + breathX + (this._swayX || 0)) * ads*motion,
            ((bobY + breathY + (this._swayY || 0))*motion - this._reloadDip * 0.09 - this._sprintDip * 0.07) * ads,
            rk * 0.09*motion+this._wallRetraction*.32
        );
        this.rig.rotation.set(
            ((rk * 0.35 + (this._swayRY || 0) * 1.4 + breathR * 0.5)*motion + this._reloadDip * 0.55) * ads+this._wallRetraction*.5,
            ((this._swayRX || 0) * 1.6 + bobYaw) * ads*motion,
            (this._reloadDip * 0.25 + (bobRoll + (this._lean || 0) + breathR)*motion) * ads
        );
    }
    /** Call on weapon fire to kick the viewmodel. */
    kick(recoilAmount = 1) {
        this._recoil = Math.min(1.2, (this._recoil || 0) + 0.55 * recoilAmount);
    }

    update(deltaTime) {
        this.updateWeaponMotion(deltaTime);
        // Fade the hat brim in as the player looks down past ~-20 degrees
        if (this.hatBrim) {
            const pitch = this.game.player?.cameraPitch || 0;
            const target = pitch < -0.35 ? Math.min(1, (-pitch - 0.35) * 2.5) : 0;
            this.hatBrim.visible = target > 0.01;
            this.hatBrim.traverse(o => {
                if (o.isMesh) o.material.opacity = target;
            });
        }
    }

    prepare(renderer) {
        const cam = this.game.player?.camera;
        if (!cam) return;
        // Mirror the main camera exactly
        cam.getWorldPosition(this.vmCamera.position);
        cam.getWorldQuaternion(this.vmCamera.quaternion);
        if (this.vmCamera.fov !== cam.fov) {
            this.vmCamera.fov = cam.fov;
            this.vmCamera.updateProjectionMatrix();
        }
        const w = renderer.domElement.width, h = renderer.domElement.height;
        const aspect = w / Math.max(1, h);
        if (Math.abs(this.vmCamera.aspect - aspect) > 0.001) {
            this.vmCamera.aspect = aspect;
            this.vmCamera.updateProjectionMatrix();
        }
    }

    render(renderer) {
        this.prepare(renderer);
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.vmScene, this.vmCamera);
        renderer.autoClear = autoClear;
    }
}

/**
 * HatFactory - procedural hats for the character creator + FP brim.
 * Each hat is built around the origin (head center); the creator preview
 * shows the full hat, the FP brim shows the same geometry from inside.
 */
export const HATS = [
    { id: 'cap', name: 'Baseball Cap', color: 0x3a4a3a },
    { id: 'beanie', name: 'Beanie', color: 0x5a3a2a },
    { id: 'boonie', name: 'Boonie Hat', color: 0x6a6a4a },
    { id: 'ushanka', name: 'Ushanka', color: 0x4a3a30 },
    { id: 'helmet', name: 'Combat Helmet', color: 0x3f4438 },
    { id: 'hood', name: 'Hood', color: 0x2e3138 },
];

export class HatFactory {
    static build(hatId, character = {}) {
        const g=new THREE.Group();g.name='headwear';
        if(!hatId||hatId==='none')return g;
        if(hatId==='military_cap')hatId='cap';
        const def=HATS.find(h=>h.id===hatId)||HATS[0];
        const mat=new THREE.MeshStandardMaterial({color:character.hatColor??def.color,roughness:.94,side:THREE.DoubleSide});
        const add=(geometry,position,scale=[1,1,1],material=mat)=>{
            const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.scale.set(...scale);
            m.castShadow=m.receiveShadow=true;g.add(m);return m;
        };
        const dome=(radius,y,height=1)=>add(new THREE.SphereGeometry(radius,32,20,0,Math.PI*2,0,Math.PI/2),[0,y,.025],[1,height,1.12]);
        const rim=(r,y,thickness)=>{const m=add(new THREE.TorusGeometry(r,thickness,8,32),[0,y,.025],[1,1.12,1]);m.rotation.x=Math.PI/2;};
        if(hatId==='cap') {
            dome(.097,.035,.95);rim(.094,.035,.006);
            const shape=new THREE.Shape();shape.moveTo(-.084,.06);shape.quadraticCurveTo(-.105,.16,-.063,.203);
            shape.quadraticCurveTo(0,.222,.063,.203);shape.quadraticCurveTo(.105,.16,.084,.06);shape.closePath();
            const brim=add(new THREE.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,steps:1}),[0,.035,0]);
            brim.rotation.x=Math.PI/2;
            add(new THREE.SphereGeometry(.006,10,8),[0,.131,.025]);
        } else if(hatId==='beanie') {
            dome(.101,.023,1.12);rim(.096,.032,.01);
        } else if(hatId==='boonie') {
            add(new THREE.CylinderGeometry(.084,.1,.075,32),[0,.077,.025],[1,1,1.12]);
            add(new THREE.CylinderGeometry(.155,.16,.008,48),[0,.038,.025],[1,1,1.1]);
        } else if(hatId==='helmet') {
            dome(.108,.022,1.13);rim(.105,.022,.006);
            const band=new THREE.MeshStandardMaterial({color:0x262a25,roughness:.98});
            for(const side of [-1,1])add(new THREE.BoxGeometry(.012,.065,.012),[side*.093,-.009,.059],[1,1,1],band);
        } else if(hatId==='ushanka') {
            dome(.108,.02,1.08);
            for(const side of [-1,1])add(new THREE.CapsuleGeometry(.025,.07,5,14),[side*.095,-.025,.021],[.55,1,1.6]);
            add(new THREE.BoxGeometry(.15,.045,.022),[0,.035,.124]);
        } else {
            // Open front: the hood covers the back and sides without sealing the face.
            const hood=add(new THREE.SphereGeometry(.115,32,20,Math.PI/2+.8,Math.PI*2-1.6,0,Math.PI*.76),[0,.025,.022],[1,1.18,1.1]);
            hood.rotation.y=0;
        }
        return g;
    }
}
