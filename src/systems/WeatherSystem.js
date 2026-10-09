import * as THREE from 'three';
import {createComputeRain} from '../render/ComputeRain.js';
import {fidelityState} from '../render/FidelityPolicy.ts';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Weather types available in the Zone
 */
export const WeatherType = {
    CLEAR: 'clear',
    CLOUDY: 'cloudy',
    OVERCAST: 'overcast',
    RAIN: 'rain',
    HEAVY_RAIN: 'heavy_rain',
    THUNDERSTORM: 'thunderstorm',
    FOG: 'fog',
    EMISSION: 'emission' // Deadly psi-storm
};

/**
 * WeatherSystem - Dynamic weather with atmospheric effects
 */
export class WeatherSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        
        // Current state
        this.currentWeather = WeatherType.CLEAR;
        this.targetWeather = WeatherType.CLEAR;
        this.transitionProgress = 1;
        this.transitionDuration = 30; // seconds
        
        // Weather parameters (0-1)
        this.params = {
            cloudDensity: 0,
            fogDensity: 0,
            rainIntensity: 0,
            windStrength: 0,
            lightningChance: 0,
            sunIntensity: 1,
            ambientIntensity: 1
        };
        
        // Target parameters for lerping
        this.targetParams = { ...this.params };
        
        // Weather presets
        this.presets = {
            [WeatherType.CLEAR]: {
                cloudDensity: 0.1,
                fogDensity: 0.004,
                rainIntensity: 0,
                windStrength: 0.1,
                lightningChance: 0,
                ambientIntensity: 0.4,
                sunIntensity: 1.0,
                fogColor: new THREE.Color(0x87ceeb)
            },
            [WeatherType.CLOUDY]: {
                cloudDensity: 0.5,
                fogDensity: 0.008,
                rainIntensity: 0,
                windStrength: 0.3,
                lightningChance: 0,
                ambientIntensity: 0.3,
                sunIntensity: 0.6,
                fogColor: new THREE.Color(0x9db4c0)
            },
            [WeatherType.OVERCAST]: {
                cloudDensity: 0.9,
                fogDensity: 0.014,
                rainIntensity: 0,
                windStrength: 0.4,
                lightningChance: 0,
                ambientIntensity: 0.25,
                sunIntensity: 0.3,
                fogColor: new THREE.Color(0x6b7b8a)
            },
            [WeatherType.RAIN]: {
                cloudDensity: 0.8,
                fogDensity: 0.02,
                rainIntensity: 0.5,
                windStrength: 0.5,
                lightningChance: 0.01,
                ambientIntensity: 0.2,
                sunIntensity: 0.2,
                fogColor: new THREE.Color(0x5a6a7a)
            },
            [WeatherType.HEAVY_RAIN]: {
                cloudDensity: 1.0,
                fogDensity: 0.03,
                rainIntensity: 1.0,
                windStrength: 0.8,
                lightningChance: 0.05,
                ambientIntensity: 0.15,
                sunIntensity: 0.1,
                fogColor: new THREE.Color(0x3a4a5a)
            },
            [WeatherType.THUNDERSTORM]: {
                cloudDensity: 1.0,
                fogDensity: 0.025,
                rainIntensity: 0.8,
                windStrength: 1.0,
                lightningChance: 0.15,
                ambientIntensity: 0.1,
                sunIntensity: 0.05,
                fogColor: new THREE.Color(0x2a3a4a)
            },
            [WeatherType.FOG]: {
                cloudDensity: 0.3,
                fogDensity: 0.045,
                rainIntensity: 0,
                windStrength: 0.1,
                lightningChance: 0,
                ambientIntensity: 0.25,
                sunIntensity: 0.3,
                fogColor: new THREE.Color(0x8a9a8a)
            },
            [WeatherType.EMISSION]: {
                cloudDensity: 1.0,
                fogDensity: 0.035,
                rainIntensity: 0,
                windStrength: 1.0,
                lightningChance: 0.3,
                ambientIntensity: 0.3,
                sunIntensity: 0.0,
                fogColor: new THREE.Color(0xff4400)
            }
        };
        
        // Rain system (allocated at max quality; draw range scales it down)
        this.rainParticles = null;
        this.rainMax = 20000;
        this.rainCount = 15000;
        
        // Lightning
        this.lightningLight = null;
        this.lightningTimer = 0;
        this.isLightningActive = false;
        
        // Wind
        this.windDirection = new THREE.Vector3(1, 0, 0.5).normalize();
        this.windTime = 0;
        
        // Scheduled weather changes
        this.weatherSchedule = [];
        this.timeSinceLastChange = 0;
        this.weatherLocked = false; // dev menu can lock weather against random changes
        this.minTimeBetweenChanges = 120; // 2 minutes minimum
        
        this.init();
    }

    init() {
        this.createRainSystem();
        // Quality scaling: the graphics settings push a target rain count;
        // the geometry stays at max size and we just draw a prefix of it.
        globalEventBus.on('settings:rainCount', ({ count }) => this.setRainCount(count));
        this.createLightning();
        this.createCloudLayer();
        this.setupFog();
    }

    /**
     * Scale the active rain particle count (draw-range only, no rebuild)
     */
    setRainCount(count) {
        this.rainCount = count;
        if(this.computeRain){this.computeRain.setCount(count);return;}
        if (this.rainParticles?.geometry) {
            this.rainParticles.geometry.setDrawRange(0, Math.min(count, this.rainMax));
        }
    }

    setupFog() {
        this.scene.fog = null;
    }

    /**
     * Snap fog + params to the current weather preset instantly.
     * Called after level loads re-install the weather-owned fog.
     */
    applyCurrentPreset() {
        const preset = this.presets[this.currentWeather] || this.presets[WeatherType.OVERCAST];
        if (this.scene.fog && preset.fogColor) {
            this.scene.fog.color.copy(preset.fogColor);
        }
        this.params = {
            cloudDensity: preset.cloudDensity,
            fogDensity: preset.fogDensity,
            rainIntensity: preset.rainIntensity,
            windStrength: preset.windStrength,
            lightningChance: preset.lightningChance,
            sunIntensity: preset.sunIntensity,
            ambientIntensity: preset.ambientIntensity
        };
        this.updateFog();
    }

    /**
     * Create the drifting cloud layer (billboard sprites, density-driven)
     */
    createCloudLayer() {
        // Clouds are composited by the existing sky shader: no cloud objects or overdraw.
        this.cloudOffset=new THREE.Vector2();
    }

    updateClouds(deltaTime) {
        const drift=(this.params.windStrength*6+1.5)*.0008*Math.max(0,deltaTime);
        this.cloudOffset.x+=this.windDirection.x*drift;
        this.cloudOffset.y+=this.windDirection.z*drift;
    }

    createRainSystem() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.rainMax * 3);
        const velocities = new Float32Array(this.rainMax);
        
        for (let i = 0; i < this.rainMax; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = Math.random() * 50;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            velocities[i] = 0.5 + Math.random() * 0.5;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        
        // Thin vertical streak sprite so rain reads as falling streaks, not squares
        const streakCanvas = document.createElement('canvas');
        streakCanvas.width = 16;
        streakCanvas.height = 64;
        const sctx = streakCanvas.getContext('2d');
        const sgrad = sctx.createLinearGradient(0, 0, 0, 64);
        sgrad.addColorStop(0, 'rgba(191,212,230,0)');
        sgrad.addColorStop(0.5, 'rgba(191,212,230,0.9)');
        sgrad.addColorStop(1, 'rgba(191,212,230,0)');
        sctx.fillStyle = sgrad;
        sctx.fillRect(6, 0, 4, 64);
        const streakTex = new THREE.CanvasTexture(streakCanvas);
        this.rainTexture=streakTex;
        if(this.game.renderer?.backend?.isWebGPUBackend){
            geometry.dispose();this.computeRain=createComputeRain(this.game.renderer,streakTex,this.rainMax);this.rainParticles=this.computeRain.mesh;this.computeRain.setCount(this.rainCount);this.scene.add(this.rainParticles);return;
        }
        const material = new THREE.PointsMaterial({
            color: 0xbfd4e6,
            map: streakTex,
            size: 0.55,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.rainParticles = new THREE.Points(geometry, material);
        this.rainParticles.raycast = () => {}; // visual only
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }

    createLightning() {
        this.lightningLight = new THREE.PointLight(0xffffff, 0, 500);
        this.lightningLight.position.set(0, 100, 0);
        this.scene.add(this.lightningLight);
    }

    /**
     * Change weather to a new type
     * @param {WeatherType} weatherType - Target weather
     * @param {number} duration - Transition duration in seconds
     */
    setWeather(weatherType, duration = 30) {
        if (this.currentWeather === weatherType) return;
        
        this.targetWeather = weatherType;
        this.transitionDuration = duration;
        this.transitionProgress = 0;
        // Capture start params for correct lerp (was lerping from mid-transition value)
        this.startParams = { ...this.params };
        // Manual weather set pauses random changes for 5 minutes
        this.timeSinceLastChange = -300;
        
        const preset = this.presets[weatherType] || this.presets[WeatherType.OVERCAST];
        this.targetParams = {
            cloudDensity: preset.cloudDensity,
            fogDensity: preset.fogDensity,
            rainIntensity: preset.rainIntensity,
            windStrength: preset.windStrength,
            lightningChance: preset.lightningChance,
            sunIntensity: preset.sunIntensity,
            ambientIntensity: preset.ambientIntensity
        };
        
        globalEventBus.emit(GameEvents.WEATHER_CHANGE, {
            from: this.currentWeather,
            to: weatherType,
            duration
        });
    }

    /**
     * Start an emission event (dangerous Zone storm)
     * @param {number} warningTime - Time before emission hits (seconds)
     * @param {number} duration - Emission duration (seconds)
     */
    triggerEmission(warningTime = 60, duration = 120) {
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: 'WARNING: Emission approaching! Find shelter!',
            type: 'danger',
            duration: 10000
        });
        
        // Pre-emission storm
        this.setWeather(WeatherType.THUNDERSTORM, 10);
        
        // Schedule emission
        setTimeout(() => {
            this.setWeather(WeatherType.EMISSION, 5);
            this.emissionActive = true;
            
            // Deal damage to exposed players/NPCs
            this.emissionDamageInterval = setInterval(() => {
                globalEventBus.emit('emission:damage', { damage: 10 });
            }, 1000);
        }, warningTime * 1000);
        
        // Schedule end
        setTimeout(() => {
            this.emissionActive = false;
            clearInterval(this.emissionDamageInterval);
            this.setWeather(WeatherType.OVERCAST, 20);
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Emission has passed.',
                type: 'info'
            });
        }, (warningTime + duration) * 1000);
    }

    update(deltaTime) {
        this.updateTransition(deltaTime);
        this.updateRain(deltaTime);
        this.updateLightning(deltaTime);
        this.updateWind(deltaTime);
        this.updateFog();
        this.updateClouds(deltaTime);
        this.updateRandomWeatherChanges(deltaTime);
    }

    updateTransition(deltaTime) {
        // Guard: zero-duration transitions snap instantly (avoids 0/0 = NaN
        // when deltaTime is also 0, which poisoned all light intensities).
        if (this.transitionDuration <= 0) {
            this.transitionProgress = 1;
            for (const key in this.targetParams) {
                const v = this.targetParams[key];
                if (typeof v === 'number' && isFinite(v)) this.params[key] = v;
            }
            return;
        }
        if (this.transitionProgress < 1) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            // Clamp out NaN/Infinity (e.g. deltaTime=0 on a paused frame)
            if (!isFinite(this.transitionProgress)) this.transitionProgress = 1;
            this.transitionProgress = Math.min(1, this.transitionProgress);
            
            // Lerp parameters from START to TARGET (not from current mid-transition value)
            const t = this.easeInOutCubic(this.transitionProgress);
            const start = this.startParams || this.params;
            
            for (const key in this.params) {
                if (start[key] !== undefined && this.targetParams[key] !== undefined) {
                    this.params[key] = THREE.MathUtils.lerp(
                        start[key],
                        this.targetParams[key],
                        t
                    );
                }
            }
            
            // Update fog color
            const currentPreset = this.presets[this.currentWeather];
            const targetPreset = this.presets[this.targetWeather];
            
            if (this.scene.fog && currentPreset && targetPreset) {
                this.scene.fog.color.lerpColors(
                    currentPreset.fogColor,
                    targetPreset.fogColor,
                    t
                );
            }
            
            if (this.transitionProgress >= 1) {
                this.currentWeather = this.targetWeather;
            }
        }
    }

    updateRain(deltaTime) {
        if (!this.rainParticles) return;
        
        const isRaining = this.params.rainIntensity > 0.1;
        this.rainParticles.visible = isRaining;
        
        if (!isRaining) return;
        if(this.computeRain){this.computeRain.setCount(Math.ceil(this.rainCount*fidelityState.fxDensity));this.computeRain.update(deltaTime,this.game.player?.position||this.game.camera.position,this.params.rainIntensity,this.windDirection,this.params.windStrength);return;}
        
        // Update rain particle positions
        const positions = this.rainParticles.geometry.attributes.position.array;
        const velocities = this.rainParticles.geometry.attributes.velocity.array;
        
        const playerPos = this.game.player?.position || new THREE.Vector3();
        const rainSpeed = 20 * this.params.rainIntensity;
        const windEffect = this.windDirection.clone().multiplyScalar(this.params.windStrength * 5);
        
        for (let i = 0; i < this.rainCount; i++) {
            // Fall down
            positions[i * 3 + 1] -= rainSpeed * velocities[i] * deltaTime;
            
            // Wind effect
            positions[i * 3] += windEffect.x * deltaTime;
            positions[i * 3 + 2] += windEffect.z * deltaTime;
            
            // Reset if below ground or too far from player
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3] = playerPos.x + (Math.random() - 0.5) * 100;
                positions[i * 3 + 1] = 50;
                positions[i * 3 + 2] = playerPos.z + (Math.random() - 0.5) * 100;
            }
        }
        
        this.rainParticles.geometry.attributes.position.needsUpdate = true;
        
        // Update material opacity based on intensity
        this.rainParticles.material.opacity = 0.3 + this.params.rainIntensity * 0.4;
    }

    updateLightning(deltaTime) {
        if (!this.lightningLight) return;
        
        // Decay lightning
        if (this.isLightningActive) {
            this.lightningLight.intensity *= 0.9;
            if (this.lightningLight.intensity < 0.1) {
                this.isLightningActive = false;
                this.lightningLight.intensity = 0;
            }
        }
        
        // Random lightning strikes
        if (this.params.lightningChance > 0 && !this.isLightningActive) {
            this.lightningTimer += deltaTime;
            
            if (this.lightningTimer > 1) {
                this.lightningTimer = 0;
                
                if (Math.random() < this.params.lightningChance) {
                    this.strikeLightning();
                }
            }
        }
    }

    strikeLightning() {
        this.isLightningActive = true;
        
        // Random position
        const playerPos = this.game.player?.position || new THREE.Vector3();
        this.lightningLight.position.set(
            playerPos.x + (Math.random() - 0.5) * 200,
            100,
            playerPos.z + (Math.random() - 0.5) * 200
        );
        
        // Flash intensity
        this.lightningLight.intensity = 2 + Math.random() * 3;
        
        // Thunder sound (emit event for audio system)
        const distance = playerPos.distanceTo(this.lightningLight.position);
        const delay = distance / 343; // Speed of sound
        
        setTimeout(() => {
            globalEventBus.emit('audio:play', {
                sound: 'thunder',
                volume: Math.max(0.3, 1 - distance / 500)
            });
        }, delay * 1000);
    }

    updateWind(deltaTime) {
        this.windTime += deltaTime * 0.5;
        
        // Vary wind direction over time
        const windVariation = Math.sin(this.windTime) * 0.3;
        this.windDirection.x = Math.cos(windVariation);
        this.windDirection.z = Math.sin(windVariation);
        this.windDirection.normalize();
    }

    updateFog() {
        if (this.scene.fog) {
            this.scene.fog.density = this.params.fogDensity;
        }
    }

    updateRandomWeatherChanges(deltaTime) {
        if (this.weatherLocked) return;
        this.timeSinceLastChange += deltaTime;
        
        // Random weather changes
        if (this.timeSinceLastChange > this.minTimeBetweenChanges) {
            if (Math.random() < 0.001) { // Small chance each frame
                this.timeSinceLastChange = 0;
                
                // Pick random weather (weighted)
                const weights = {
                    [WeatherType.CLEAR]: 0.25,
                    [WeatherType.CLOUDY]: 0.25,
                    [WeatherType.OVERCAST]: 0.2,
                    [WeatherType.RAIN]: 0.15,
                    [WeatherType.FOG]: 0.1,
                    [WeatherType.THUNDERSTORM]: 0.05
                };
                
                const random = Math.random();
                let cumulative = 0;
                
                for (const [weather, weight] of Object.entries(weights)) {
                    cumulative += weight;
                    if (random < cumulative) {
                        this.setWeather(weather, 30 + Math.random() * 30);
                        break;
                    }
                }
            }
        }
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Get current weather data for UI
     */
    getWeatherData() {
        return {
            current: this.currentWeather,
            target: this.targetWeather,
            params: { ...this.params },
            windDirection: this.windDirection.clone(),
            transitioning: this.transitionProgress < 1
        };
    }

    dispose() {
        this.computeRain?.dispose();this.rainTexture?.dispose();
        if (this.rainParticles&&!this.computeRain) {
            this.rainParticles.geometry.dispose();
            this.rainParticles.material.dispose();
            this.scene.remove(this.rainParticles);
        }
        
        if (this.lightningLight) {
            this.scene.remove(this.lightningLight);
        }
        
        if (this.emissionDamageInterval) {
            clearInterval(this.emissionDamageInterval);
        }
    }
}
