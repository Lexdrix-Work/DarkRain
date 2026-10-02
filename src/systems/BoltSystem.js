import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * BoltSystem - Throwable bolts for probing anomaly fields, S.T.A.L.K.E.R.-style.
 * Press G to throw. A landed bolt discharges nearby anomalies from a safe
 * distance and reveals them on the detector's terms: sight, not luck.
 */
export class BoltSystem {
    constructor(game) {
        this.game = game;
        this.scene = null;
        this.bolts = [];
        this.cooldown = 0;
        this.maxBolts = 12;

        this.boltGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6);
        this.boltMat = new THREE.MeshStandardMaterial({
            color: 0x8a8f96, roughness: 0.4, metalness: 0.85
        });

        globalEventBus.on('input:throw_bolt', () => this.throwBolt());
    }

    init(scene) {
        this.scene = scene;
    }

    throwBolt() {
        const player = this.game.player;
        if (!player || !player.camera || this.game.isPaused) return;
        if (this.cooldown > 0) return;
        const menuStates = this.game.uiManager?.menuStates;
        if (menuStates && Object.values(menuStates).some(Boolean)) return;
        this.cooldown = 0.45;

        const dir = new THREE.Vector3();
        player.camera.getWorldDirection(dir);
        const start = new THREE.Vector3();
        player.camera.getWorldPosition(start);
        start.addScaledVector(dir, 0.6);
        start.y -= 0.15;

        const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
        mesh.position.copy(start);
        // Orient along throw direction
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        this.scene.add(mesh);

        const vel = dir.multiplyScalar(13);
        vel.y += 2.6;

        this.bolts.push({ mesh, vel, life: 0, landed: false, spin: Math.random() * 8 });
        if (this.bolts.length > this.maxBolts) {
            const old = this.bolts.shift();
            this.scene.remove(old.mesh);
        }

        globalEventBus.emit('audio:play', { sound: 'bolt_throw', volume: 0.7 });
    }

    update(deltaTime) {
        if (this.cooldown > 0) this.cooldown -= deltaTime;
        const wm = this.game.worldManager;

        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const bolt = this.bolts[i];
            bolt.life += deltaTime;

            if (!bolt.landed) {
                bolt.vel.y -= 12.5 * deltaTime;
                bolt.mesh.position.addScaledVector(bolt.vel, deltaTime);
                bolt.mesh.rotateX(deltaTime * bolt.spin);

                const p = bolt.mesh.position;
                const groundY = wm?.getTerrainHeight ? wm.getTerrainHeight(p.x, p.z) : 0;
                if (p.y <= groundY + 0.04) {
                    bolt.landed = true;
                    p.y = groundY + 0.04;
                    bolt.mesh.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
                    this.onBoltLand(p);
                }
            }

            if (bolt.life > 30) {
                this.scene.remove(bolt.mesh);
                this.bolts.splice(i, 1);
            }
        }
    }

    onBoltLand(position) {
        globalEventBus.emit('audio:play', { sound: 'bolt_clack', volume: 0.8 });

        const anomalySystem = this.game.anomalySystem;
        if (!anomalySystem) return;

        const nearby = anomalySystem.getAnomaliesInArea(position, 3.4);
        for (const anomaly of nearby) {
            anomaly.reveal();
            // Discharge it with a dummy entity - takeDamage is optional-chained
            anomaly.trigger({ position: position.clone(), takeDamage() {} });
            globalEventBus.emit('audio:play', { sound: 'anomaly_zap', volume: 0.9 });
        }
        if (nearby.length > 0) {
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `Bolt discharged ${nearby.length} anomal${nearby.length > 1 ? 'ies' : 'y'} — path marked`,
                type: 'info',
                duration: 2500
            });
        }
    }

    /** Remove all bolts (level change) without destroying shared resources. */
    clear() {
        for (const bolt of this.bolts) {
            this.scene?.remove(bolt.mesh);
        }
        this.bolts = [];
    }

    dispose() {
        this.clear();
        this.boltGeo.dispose();
        this.boltMat.dispose();
    }
}
