import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Emission phases
 */
export const EmissionPhase = {
    DORMANT: 'dormant',
    WARNING: 'warning',     // Sirens, sky darkens, take cover
    EMISSION: 'emission',   // The blowout - lethal in the open
    AFTERMATH: 'aftermath'  // Sky recovers, the Zone has shifted
};

/**
 * EmissionSystem - Periodic Zone blowouts (S.T.A.L.K.E.R.-style emissions).
 *
 * Cycle: dormant -> warning (sirens, ~60s) -> emission (~45s of lethal psy
 * energy for anyone caught in the open) -> aftermath -> dormant.
 * Shelter = inside a building footprint or under solid cover.
 * Every emission empowers anomalies and births new artifacts.
 */
export class EmissionSystem {
    constructor(game) {
        this.game = game;
        this.phase = EmissionPhase.DORMANT;
        this.phaseTime = 0;
        this.nextEmissionAt = 480 + Math.random() * 240; // first blowout 8-12 min in
        this.elapsed = 0;
        this.sirenAudio = null;
        this.droneAudio = null;
        this.pulseTimer = 0;
        this.tickSecond = -1;

        this.durations = {
            [EmissionPhase.WARNING]: 60,
            [EmissionPhase.EMISSION]: 45,
            [EmissionPhase.AFTERMATH]: 40
        };

        // Sky/fog manipulation targets
        this.skyColor = new THREE.Color();
        this.origFogColor = null;
        this.origBg = null;
    }

    setPhase(phase) {
        if (this.phase === phase) return;
        const prev = this.phase;
        this.phase = phase;
        this.phaseTime = 0;
        this.tickSecond = -1;

        globalEventBus.emit('zone:emission_phase', { phase, prev });

        if (phase === EmissionPhase.WARNING) {
            this.game.saveSystem?.requestAutosave('before-emission');
            globalEventBus.emit('audio:play', { sound: 'emission_siren', volume: 0.9 });
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: '⚠ EMISSION INCOMING — Take cover inside a building!',
                type: 'error',
                duration: 8000
            });
            globalEventBus.emit('zone:pda_feed', {
                text: 'Emergency broadcast: emission front approaching. All stalkers seek shelter.',
                kind: 'warning'
            });
        } else if (phase === EmissionPhase.EMISSION) {
            globalEventBus.emit('audio:play', { sound: 'emission_blast', volume: 1.0 });
            globalEventBus.emit('audio:play', { sound: 'psy_drone', volume: 0.8 });
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'THE EMISSION IS HERE — STAY UNDER COVER',
                type: 'error',
                duration: 6000
            });
            // Anomalies surge
            if (this.game.anomalySystem) this.game.anomalySystem.emissionDamageMultiplier = 1.6;
        } else if (phase === EmissionPhase.AFTERMATH) {
            globalEventBus.emit('audio:stop', { sound: 'emission_siren' });
            globalEventBus.emit('audio:stop', { sound: 'psy_drone' });
            if (this.game.anomalySystem) this.game.anomalySystem.emissionDamageMultiplier = 1.0;
            globalEventBus.emit('zone:pda_feed', {
                text: 'Emission passed. The Zone has shifted — new artifacts have surfaced.',
                kind: 'info'
            });
            // The blowout births artifacts
            this.game.artifactSystem?.seedArtifacts();
        } else if (phase === EmissionPhase.DORMANT) {
            this.nextEmissionAt = this.elapsed + 600 + Math.random() * 360; // 10-16 min
        }
    }

    /**
     * Is the player under solid cover? Tests building footprints first
     * (cheap), falls back to an upward raycast against building meshes.
     */
    isSheltered(position) {
        if (!position) return false;
        if (this.game.fieldOperations?.isCheckpointSheltered(position)) return true;
        const wm = this.game.worldManager;
        if (wm?.buildingSpots?.some(s => s.enterable &&
            Math.abs(position.x-s.x)<s.width/2-0.35 && Math.abs(position.z-s.z)<s.depth/2-0.35 &&
            position.y >= s.baseY-0.2 && position.y < s.baseY+3.2 &&
            !(s.floors===1&&s.roofOpening&&Math.abs(position.x-s.x)<s.roofOpening.width/2&&Math.abs(position.z-s.z)<s.roofOpening.depth/2))) return true;
        // Primary: building colliders (world-space boxes added to the scene)
        const colliders = wm?.colliders;
        if (colliders) {
            for (const c of colliders) {
                if (c.userData?.type !== 'buildingCollider') continue;
                const params = c.geometry?.parameters;
                if (!params) continue;
                const hw = params.width / 2 + 1.0;
                const hd = params.depth / 2 + 1.0;
                if (Math.abs(position.x - c.position.x) < hw && Math.abs(position.z - c.position.z) < hd) {
                    return true;
                }
            }
        }
        // Fallback: raycast up, sheltered if something solid is overhead
        if (wm?.scene) {
            const ray = new THREE.Raycaster(
                new THREE.Vector3(position.x, position.y + 1.6, position.z),
                new THREE.Vector3(0, 1, 0), 0, 30
            );
            if (this.game.camera) ray.camera = this.game.camera;
            const hits = ray.intersectObjects(wm.scene.children, false);
            if (hits.length > 0) return true;
        }
        return false;
    }

    update(deltaTime) {
        const player = this.game.player;
        if (!player || this.game.isPaused) return;

        this.elapsed += deltaTime;
        this.phaseTime += deltaTime;

        if (this.phase === EmissionPhase.DORMANT) {
            if (this.elapsed >= this.nextEmissionAt) this.setPhase(EmissionPhase.WARNING);
            return;
        }

        const duration = this.durations[this.phase];
        const wholeSecond = Math.floor(this.phaseTime);
        if (wholeSecond !== this.tickSecond) {
            this.tickSecond = wholeSecond;
            globalEventBus.emit('zone:emission_tick', {
                phase: this.phase,
                timeLeft: Math.max(0, Math.ceil(duration - this.phaseTime))
            });
        }

        if (this.phase === EmissionPhase.WARNING) {
            this.updateSky(deltaTime, 0.35); // bruised dark sky
        } else if (this.phase === EmissionPhase.EMISSION) {
            this.updateSky(deltaTime, 1.0); // full blood-red psy sky

            // Lethal pulses for the exposed
            this.pulseTimer += deltaTime;
            if (this.pulseTimer >= 2.0) {
                this.pulseTimer = 0;
                if (!this.isSheltered(player.position)) {
                    player.takeDamage(14, 'emission');
                    player.addRadiation(6);
                    this.game.psySystem?.addExposure(22);
                    globalEventBus.emit('audio:play', { sound: 'psy_hit', volume: 0.9 });
                    globalEventBus.emit(GameEvents.NOTIFICATION, {
                        message: 'The emission tears at you — FIND COVER!',
                        type: 'error',
                        duration: 2000
                    });
                } else if (Math.random() < 0.3) {
                    // Sheltered but the walls hum
                    this.game.psySystem?.addExposure(4);
                }
            }
        } else if (this.phase === EmissionPhase.AFTERMATH) {
            this.updateSky(deltaTime, 0); // recover
        }

        if (this.phaseTime >= duration) {
            const order = [EmissionPhase.WARNING, EmissionPhase.EMISSION, EmissionPhase.AFTERMATH, EmissionPhase.DORMANT];
            this.setPhase(order[(order.indexOf(this.phase) + 1) % order.length]);
        }
    }

    updateSky(deltaTime, intensity) {
        const scene = this.game.worldManager?.scene;
        if (!scene) return;
        if (this.origFogColor === null && scene.fog) {
            this.origFogColor = scene.fog.color.clone();
        }
        if (this.origBg === null) {
            this.origBg = scene.background instanceof THREE.Color ? scene.background.clone() : null;
        }
        // Blood-red psy tint scaled by intensity
        const target = new THREE.Color(0x4a0d12).lerp(new THREE.Color(0x0a0a12), 1 - intensity);
        if (scene.fog) {
            scene.fog.color.lerp(target, deltaTime * 1.5);
            if (intensity === 0 && this.origFogColor) {
                scene.fog.color.lerp(this.origFogColor, deltaTime * 0.8);
            }
        }
        if (scene.background instanceof THREE.Color) {
            scene.background.lerp(target, deltaTime * 1.5);
            if (intensity === 0 && this.origBg) {
                scene.background.lerp(this.origBg, deltaTime * 0.8);
            }
        }
        globalEventBus.emit('zone:emission_sky', { intensity });
    }

    serialize(){return {phase:this.phase,phaseTime:this.phaseTime,elapsed:this.elapsed,nextEmissionAt:this.nextEmissionAt,pulseTimer:this.pulseTimer};}
    restore(data){if(!data)return;const prev=this.phase;Object.assign(this,data);globalEventBus.emit('zone:emission_phase',{phase:this.phase,prev,restored:true});if(this.game.anomalySystem)this.game.anomalySystem.emissionDamageMultiplier=this.phase==='emission'?1.6:1;globalEventBus.emit(this.phase==='warning'||this.phase==='emission'?'audio:play':'audio:stop',{sound:'emission_siren',volume:.9});globalEventBus.emit(this.phase==='emission'?'audio:play':'audio:stop',{sound:'psy_drone',volume:.8});}

    getState() {
        return {
            phase: this.phase,
            timeLeft: this.phase === EmissionPhase.DORMANT
                ? Math.max(0, Math.ceil(this.nextEmissionAt - this.elapsed))
                : Math.max(0, Math.ceil(this.durations[this.phase] - this.phaseTime))
        };
    }

    /** Test hook - force the warning phase. */
    debugTrigger() {
        this.setPhase(EmissionPhase.WARNING);
    }

    /** Back to dormant with a fresh timer (level change). */
    reset() {
        globalEventBus.emit('audio:stop', { sound: 'emission_siren' });
        globalEventBus.emit('audio:stop', { sound: 'psy_drone' });
        this.phase = EmissionPhase.DORMANT;
        this.phaseTime = 0;
        this.elapsed = 0;
        this.nextEmissionAt = 480 + Math.random() * 240;
        if (this.game.anomalySystem) this.game.anomalySystem.emissionDamageMultiplier = 1.0;
        const banner = document.getElementById('emission-banner');
        if (banner) banner.style.display = 'none';
    }

    dispose() {
        globalEventBus.emit('audio:stop', { sound: 'emission_siren' });
        globalEventBus.emit('audio:stop', { sound: 'psy_drone' });
    }
}
