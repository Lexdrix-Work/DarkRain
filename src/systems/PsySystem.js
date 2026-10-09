import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';
import { AnomalyType } from '../world/AnomalySystem.js';

/**
 * PsySystem - The Zone's surreal layer.
 *
 * Psy exposure builds near psi anomalies, during emissions, and at high
 * radiation. As it rises the world stops behaving: whispers, apparitions
 * that dissolve when approached, floating debris around gravity wells,
 * and full reality flickers at the peak.
 */
export class PsySystem {
    constructor(game) {
        this.game = game;
        this.scene = null;
        this.exposure = 0;          // 0..100
        this.whisperTimer = 0;
        this.flickerTimer = 6 + Math.random() * 8;
        this.apparitions = [];
        this.debris = new Map();   // anomalyId -> { group, chunks }
        this.apparitionTexture = null;
        this.time = 0;
    }

    init(scene) {
        this.scene = scene;
        this.apparitionTexture = this.makeApparitionTexture();
    }

    makeApparitionTexture() {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.filter = 'blur(6px)';
        // Head
        ctx.beginPath(); ctx.arc(64, 42, 20, 0, Math.PI * 2); ctx.fill();
        // Torso - tall, wrong proportions
        ctx.beginPath();
        ctx.moveTo(64, 60);
        ctx.bezierCurveTo(30, 90, 34, 170, 48, 236);
        ctx.lineTo(80, 236);
        ctx.bezierCurveTo(94, 170, 98, 90, 64, 60);
        ctx.fill();
        // Long arms
        ctx.fillRect(22, 96, 14, 110);
        ctx.fillRect(92, 96, 14, 110);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    addExposure(n) {
        const shield = this.game.artifactSystem?.getPsiShield() || 0;
        this.exposure = Math.min(100, Math.max(0, this.exposure + n * (1 - shield)));
    }

    getTier() {
        if (this.exposure >= 75) return 3;
        if (this.exposure >= 50) return 2;
        if (this.exposure >= 25) return 1;
        return 0;
    }

    update(deltaTime) {
        const player = this.game.player;
        if (!player || !this.scene || this.game.isPaused) return;
        this.time += deltaTime;

        // Accumulate from psi fields
        let fieldStrength = 0;
        const anomalies = this.game.anomalySystem?.anomalies;
        if (anomalies) {
            for (const a of anomalies.values()) {
                if (a.type !== AnomalyType.PSI) continue;
                const d = player.position.distanceTo(a.position);
                if (d < a.detectionRadius) {
                    fieldStrength += 1 - d / a.detectionRadius;
                }
            }
        }
        const emission = this.game.emissionSystem?.phase === 'emission' ? 1 : 0;
        const radFactor = player.stats.radiation > 60 ? (player.stats.radiation - 60) / 40 : 0;

        const gain = fieldStrength * 6 + emission * 10 + radFactor * 2.5;
        if (gain > 0) {
            this.addExposure(gain * deltaTime);
        } else {
            this.exposure = Math.max(0, this.exposure - 2.2 * deltaTime);
        }

        const tier = this.getTier();
        globalEventBus.emit('zone:psy_tier', { tier, exposure: this.exposure });

        // Whispers
        if (tier >= 1) {
            this.whisperTimer -= deltaTime;
            if (this.whisperTimer <= 0) {
                this.whisperTimer = tier >= 3 ? 4 + Math.random() * 5 : 12 + Math.random() * 14;
                globalEventBus.emit('audio:play', { sound: 'whisper', volume: 0.5 + tier * 0.15 });
                if (tier >= 2 && Math.random() < 0.35) {
                    const lines = [
                        'You hear your own name in the static.',
                        'The whispering knows where you slept.',
                        'Something counts your footsteps behind you.',
                        'The Zone is dreaming. You are in the dream.'
                    ];
                    globalEventBus.emit(GameEvents.NOTIFICATION, {
                        message: lines[Math.floor(Math.random() * lines.length)],
                        type: 'warning', duration: 4000
                    });
                }
            }
        }

        // Apparitions
        if (tier >= 2) this.updateApparitions(deltaTime, player);

        // Reality flicker at peak exposure
        if (tier >= 3) {
            this.flickerTimer -= deltaTime;
            if (this.flickerTimer <= 0) {
                this.flickerTimer = 7 + Math.random() * 9;
                this.realityFlicker();
            }
        }

        // Floating debris around gravity anomalies - always on, subtle
        this.updateDebris(deltaTime);
    }

    updateApparitions(deltaTime, player) {
        // Spawn up to 2 apparitions at a distance
        if (this.apparitions.length < 2 && Math.random() < deltaTime * 0.25) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 22 + Math.random() * 20;
            const x = player.position.x + Math.cos(angle) * dist;
            const z = player.position.z + Math.sin(angle) * dist;
            const wm = this.game.worldManager;
            const y = (wm?.getTerrainHeight ? wm.getTerrainHeight(x, z) : 0);

            const mat = new THREE.SpriteMaterial({
                map: this.apparitionTexture,
                color: 0x8899bb,
                transparent: true,
                opacity: 0,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(mat);
            sprite.raycast = () => {}; // apparitions are never raycast targets
            sprite.scale.set(1.4, 2.8, 1);
            sprite.position.set(x, y + 1.4, z);
            this.scene.add(sprite);
            this.apparitions.push({ sprite, life: 0, stareTime: 0 });
            globalEventBus.emit('audio:play', { sound: 'whisper', volume: 0.35 });
        }

        const camDir = new THREE.Vector3();
        player.camera?.getWorldDirection(camDir);

        for (let i = this.apparitions.length - 1; i >= 0; i--) {
            const app = this.apparitions[i];
            app.life += deltaTime;
            const toApp = new THREE.Vector3().subVectors(app.sprite.position, player.position);
            const dist = toApp.length();
            toApp.normalize();

            // Fade in over 3s, cap opacity by tier
            const targetOpacity = Math.min(0.75, app.life / 3 * 0.75);
            app.sprite.material.opacity += (targetOpacity - app.sprite.material.opacity) * deltaTime * 2;

            // Dissolve if approached or stared at
            const stareDot = camDir.dot(toApp);
            if (stareDot > 0.995) app.stareTime += deltaTime;
            else app.stareTime = Math.max(0, app.stareTime - deltaTime);

            if (dist < 9 || app.stareTime > 1.6 || app.life > 30) {
                // Dissolve
                app.sprite.material.opacity -= deltaTime * 2.5;
                if (app.sprite.material.opacity <= 0) {
                    this.scene.remove(app.sprite);
                    app.sprite.material.dispose();
                    this.apparitions.splice(i, 1);
                    if (dist < 14) {
                        globalEventBus.emit('audio:play', { sound: 'psy_hit', volume: 0.4 });
                        this.addExposure(6);
                    }
                }
            }
        }
    }

    realityFlicker() {
        // The world glitches: sky pulse, sound, a lie on the HUD
        globalEventBus.emit('zone:reality_flicker', { at: Date.now() });
        globalEventBus.emit('audio:play', { sound: 'psy_hit', volume: 0.7 });
        const lies = [
            'Your ammunition count is wrong.',
            'You have been here before.',
            'The sky blinked.',
            'One of your artifacts is looking at you.'
        ];
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: lies[Math.floor(Math.random() * lies.length)],
            type: 'warning', duration: 3500
        });
    }

    updateDebris(deltaTime) {
        const anomalies = this.game.anomalySystem?.anomalies;
        if (!anomalies) return;

        // Prune debris for removed anomalies
        for (const [id, entry] of this.debris) {
            if (!anomalies.has(id)) {
                this.scene.remove(entry.group);
                this.debris.delete(id);
            }
        }

        for (const a of anomalies.values()) {
            if (a.type !== AnomalyType.GRAVITATIONAL) continue;
            let entry = this.debris.get(a.id);
            if (!entry) {
                if (this.debris.size > 24) continue; // cap
                const group = new THREE.Group();
                const chunks = [];
                const geo = new THREE.TetrahedronGeometry(0.16);
                const mat = new THREE.MeshStandardMaterial({ color: 0x555560, roughness: 0.9 });
                for (let i = 0; i < 6; i++) {
                    const m = new THREE.Mesh(geo, mat);
                    const chunk = {
                        mesh: m,
                        angle: Math.random() * Math.PI * 2,
                        radius: a.radius * (0.55 + Math.random() * 0.4),
                        height: 0.5 + Math.random() * (a.radius * 0.9),
                        speed: 0.4 + Math.random() * 0.8,
                        spin: Math.random() * 3
                    };
                    group.add(m);
                    chunks.push(chunk);
                }
                group.position.copy(a.position);
                this.scene.add(group);
                entry = { group, chunks };
                this.debris.set(a.id, entry);
            }
            entry.group.position.copy(a.position);
            for (const c of entry.chunks) {
                c.angle += deltaTime * c.speed;
                c.mesh.position.set(
                    Math.cos(c.angle) * c.radius,
                    c.height + Math.sin(this.time * 1.7 + c.angle * 3) * 0.25,
                    Math.sin(c.angle) * c.radius
                );
                c.mesh.rotation.x += deltaTime * c.spin;
                c.mesh.rotation.y += deltaTime * c.spin * 0.7;
            }
        }
    }

    /** Clear apparitions, debris and exposure (level change). */
    clear() {
        for (const app of this.apparitions) {
            this.scene?.remove(app.sprite);
            app.sprite.material.dispose();
        }
        this.apparitions = [];
        for (const entry of this.debris.values()) {
            this.scene?.remove(entry.group);
        }
        this.debris.clear();
        this.exposure = 0;
    }

    serialize(){return {exposure:this.exposure,whisperTimer:this.whisperTimer,flickerTimer:this.flickerTimer,time:this.time};}
    restore(data){this.clear();if(data){this.exposure=data.exposure;this.whisperTimer=data.whisperTimer;this.flickerTimer=data.flickerTimer;this.time=data.time;}}

    dispose() {
        this.clear();
        this.apparitionTexture?.dispose();
    }
}
