import { RigidRagdoll } from './RigidRagdoll.js';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { globalEventBus } from '../core/EventBus.js';

/**
 * RagdollSystem - Procedural verlet-based ragdoll physics.
 * No external physics engine required. On death, characters switch from
 * animated to ragdoll: point masses connected by distance constraints,
 * integrated with verlet, colliding with the ground.
 */
export class RagdollSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.ragdolls = new Set();
        this.gravity = -22;
        this.groundY = 0;
        this.offLevel = globalEventBus.on('level:loaded', () => this.clear());
    }

    /**
     * Create a ragdoll from a character's current pose.
     * @param {THREE.Group} characterGroup - The character mesh group
     * @param {THREE.Vector3} position - World position
     * @param {THREE.Vector3} impulse - Initial velocity from the killing blow
     * @returns {Ragdoll} The ragdoll instance
     */
    createRagdoll(characterGroup, position, impulse = new THREE.Vector3()) {
        const canArticulate=this.game.physicsSystem?.world&&characterGroup.getObjectByName('hips');
        if(canArticulate)while(this.ragdolls.size>=6){const old=this.ragdolls.values().next().value;old.dispose();this.ragdolls.delete(old);}
        const slot=(this.rigidSerial||0)%6;this.rigidSerial=(this.rigidSerial||0)+1;
        const ragdoll=canArticulate?new RigidRagdoll(this.game.physicsSystem,characterGroup,position,impulse,slot):new Ragdoll(this.scene,characterGroup,position,impulse);
        this.ragdolls.add(ragdoll);
        return ragdoll;
    }

    update(deltaTime) {
        const dt = Math.min(deltaTime, 0.033);
        for (const r of this.ragdolls) {
            r.update(dt, this.gravity, (x,z) => (this.game.worldManager?.getTerrainHeight(x,z) ?? this.groundY) + 0.06);
            if ((r.settled && r.settleTime > 30)||r.age>45) {
                // Remove old settled ragdolls after 30s
                r.dispose();
                this.ragdolls.delete(r);
            }
        }
    }

    clear() {
        for (const r of this.ragdolls) r.dispose();
        this.ragdolls.clear();
    }

    dispose() { this.offLevel?.(); this.clear(); }
}

class Ragdoll {
    constructor(scene, characterGroup, position, impulse) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.position.copy(position);
        this.scene.add(this.group);

        // Clone the character mesh for the ragdoll visual
        this.visual = cloneSkeleton(characterGroup);
        this.visual.position.set(0,0,0);
        this.visual.visible = true;
        this.visual.traverse(o => { if (o.isMesh) { o.geometry = o.geometry.clone();
            o.material = Array.isArray(o.material) ? o.material.map(m=>m.clone()) : o.material.clone(); } });
        this.group.add(this.visual);

        // Define body parts as point masses (positions relative to group)
        // Based on CharacterModel proportions
        this.particles = [];
        this.constraints = [];

        const P = (x, y, z, mass = 1) => {
            const p = {
                pos: new THREE.Vector3(x, y, z),
                prev: new THREE.Vector3(x, y, z).addScaledVector(impulse, -0.016),
                mass,
                radius: 0.12
            };
            this.particles.push(p);
            return p;
        };

        // Core body
        this.head = P(0, 1.62, 0, 0.8);
        this.chest = P(0, 1.35, 0, 1.5);
        this.pelvis = P(0, 1.05, 0, 1.2);
        // Arms (L/R)
        this.upperArmL = P(-0.32, 1.42, 0, 0.5);
        this.foreArmL = P(-0.36, 1.15, -0.05, 0.4);
        this.handL = P(-0.38, 0.95, -0.02, 0.3);
        this.upperArmR = P(0.32, 1.42, 0, 0.5);
        this.foreArmR = P(0.36, 1.15, -0.05, 0.4);
        this.handR = P(0.38, 0.95, -0.02, 0.3);
        // Legs (L/R)
        this.thighL = P(-0.11, 0.75, 0, 0.8);
        this.shinL = P(-0.11, 0.40, 0.02, 0.6);
        this.footL = P(-0.11, 0.08, 0.08, 0.4);
        this.thighR = P(0.11, 0.75, 0, 0.8);
        this.shinR = P(0.11, 0.40, 0.02, 0.6);
        this.footR = P(0.11, 0.08, 0.08, 0.4);

        // Distance constraints (bone lengths)
        const C = (a, b, stiffness = 1.0) => {
            this.constraints.push({
                a, b,
                rest: a.pos.distanceTo(b.pos),
                stiffness
            });
        };

        // Spine
        C(this.head, this.chest);
        C(this.chest, this.pelvis);
        // Arms
        C(this.chest, this.upperArmL); C(this.chest, this.upperArmR);
        C(this.upperArmL, this.foreArmL); C(this.upperArmR, this.foreArmR);
        C(this.foreArmL, this.handL); C(this.foreArmR, this.handR);
        // Legs
        C(this.pelvis, this.thighL); C(this.pelvis, this.thighR);
        C(this.thighL, this.shinL); C(this.thighR, this.shinR);
        C(this.shinL, this.footL); C(this.shinR, this.footR);

        // Apply impulse to all particles (with some randomness for natural look)
        for (const p of this.particles) {
            p.prev.add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                Math.random() * 0.01,
                (Math.random() - 0.5) * 0.02
            ));
        }

        this.settled = false;
        this.settleTime = 0;
        this._lastMove = Infinity;
    }

    update(dt, gravity, groundY) {
        const groundAt = (p) => typeof groundY === 'function' ? groundY(this.group.position.x+p.pos.x,this.group.position.z+p.pos.z) : groundY;
        // Verlet integration
        for (const p of this.particles) {
            const vel = p.pos.clone().sub(p.prev);
            vel.multiplyScalar(0.99); // damping
            p.prev.copy(p.pos);
            p.pos.add(vel);
            p.pos.y += gravity * dt * dt;

            // Ground collision
            const worldY = this.group.position.y + p.pos.y;
            if (worldY < groundAt(p) + p.radius) {
                p.pos.y = groundAt(p) + p.radius - this.group.position.y;
                // Friction: dampen horizontal velocity on ground contact
                const vx = p.pos.x - p.prev.x;
                const vz = p.pos.z - p.prev.z;
                p.prev.x = p.pos.x - vx * 0.7;
                p.prev.z = p.pos.z - vz * 0.7;
            }
        }

        // Solve constraints (3 iterations for stability)
        for (let i = 0; i < 3; i++) {
            for (const c of this.constraints) {
                const delta = c.b.pos.clone().sub(c.a.pos);
                const dist = delta.length();
                if (dist === 0) continue;
                const diff = (dist - c.rest) / dist * c.stiffness;
                const totalMass = c.a.mass + c.b.mass;
                c.a.pos.addScaledVector(delta, diff * (c.b.mass / totalMass) * 0.5);
                c.b.pos.addScaledVector(delta, -diff * (c.a.mass / totalMass) * 0.5);
            }
        }

        // Update visual: position the character mesh to match ragdoll
        // For simplicity, we fade the visual and show a simplified representation
        // Actually, let's pose the visual using the particle positions
        for (const p of this.particles) p.pos.y = Math.max(p.pos.y, groundAt(p)+p.radius-this.group.position.y);
        this.poseVisual();
        this.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(this.visual);
        let floor = -Infinity;
        for (const x of [bounds.min.x,bounds.max.x]) for(const z of [bounds.min.z,bounds.max.z])
            floor = Math.max(floor, typeof groundY === 'function' ? groundY(x,z) : groundY);
        if (bounds.min.y < floor) this.visual.position.y += floor-bounds.min.y;

        // Check if settled (low movement)
        let movement = 0;
        for (const p of this.particles) {
            movement += p.pos.distanceToSquared(p.prev);
        }
        if (movement < 0.00001) {
            this.settleTime += dt;
            if (this.settleTime > 1.0) this.settled = true;
        } else {
            this.settleTime = 0;
            this.settled = false;
        }
    }

    poseVisual() {
        // Orient the visual group based on pelvis->chest vector
        // This is a simplification - full skeletal posing would require bone mapping
        // For now, we tilt the whole visual to match the body's fall direction
        const up = this.chest.pos.clone().sub(this.pelvis.pos).normalize();
        const targetQuat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            up
        );
        this.visual.quaternion.slerp(targetQuat, 0.3);
        
        // Position visual at pelvis
        this.visual.position.copy(this.pelvis.pos).sub(new THREE.Vector3(0,1.05,0).applyQuaternion(this.visual.quaternion)); // offset so pelvis aligns
    }

    dispose() {
        this.scene.remove(this.group);
        this.visual.traverse(o => {
            if (o.isMesh) {
                o.geometry?.dispose?.();
                for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) mat.dispose();
            }
        });
    }
}
