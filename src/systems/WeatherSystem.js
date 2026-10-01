import * as THREE from 'three';
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
                fogDensity: 0.01,
                rainIntensity: 0,
                windStrength: 0.1,
                lightningChance: 0,
                ambientIntensity: 0.4,
                sunIntensity: 1.0,
                fogColor: new THREE.Color(0x87ceeb)
            },
            [WeatherType.CLOUDY]: {
                cloudDensity: 0.5,
                fogDensity: 0.02,
                rainIntensity: 0,
                windStrength: 0.3,
                lightningChance: 0,
                ambientIntensity: 0.3,
                sunIntensity: 0.6,
                fogColor: new THREE.Color(0x9db4c0)
            },
            [WeatherType.OVERCAST]: {
                cloudDensity: 0.9,
                fogDensity: 0.04,
                rainIntensity: 0,
                windStrength: 0.4,
                lightningChance: 0,
                ambientIntensity: 0.25,
                sunIntensity: 0.3,
                fogColor: new THREE.Color(0x6b7b8a)
            },
            [WeatherType.RAIN]: {
                cloudDensity: 0.8,
                fogDensity: 0.06,
                rainIntensity: 0.5,
                windStrength: 0.5,
                lightningChance: 0.01,
                ambientIntensity: 0.2,
                sunIntensity: 0.2,
                fogColor: new THREE.Color(0x5a6a7a)
            },
            [WeatherType.HEAVY_RAIN]: {
                cloudDensity: 1.0,
                fogDensity: 0.1,
                rainIntensity: 1.0,
                windStrength: 0.8,
                lightningChance: 0.05,
                ambientIntensity: 0.15,
                sunIntensity: 0.1,
                fogColor: new THREE.Color(0x3a4a5a)
            },
            [WeatherType.THUNDERSTORM]: {
                cloudDensity: 1.0,
                fogDensity: 0.08,
                rainIntensity: 0.8,
                windStrength: 1.0,
                lightningChance: 0.15,
                ambientIntensity: 0.1,
                sunIntensity: 0.05,
                fogColor: new THREE.Color(0x2a3a4a)
            },
            [WeatherType.FOG]: {
                cloudDensity: 0.3,
                fogDensity: 0.3,
                rainIntensity: 0,
                windStrength: 0.1,
                lightningChance: 0,
                ambientIntensity: 0.25,
                sunIntensity: 0.3,
                fogColor: new THREE.Color(0x8a9a8a)
            },
            [WeatherType.EMISSION]: {
                cloudDensity: 1.0,
                fogDensity: 0.15,
                rainIntensity: 0,
                windStrength: 1.0,
                lightningChance: 0.3,
                ambientIntensity: 0.3,
                sunIntensity: 0.0,
                fogColor: new THREE.Color(0xff4400)
            }
        };
        
        // Rain system
        this.rainParticles = null;
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
        this.minTimeBetweenChanges = 120; // 2 minutes minimum
        
        this.init();
    }

    init() {
        this.createRainSystem();
        this.createLightning();
        this.createCloudLayer();
        this.setupFog();
    }

    setupFog() {
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.01);
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
        this.cloudCount = 42;
        this.clouds = [];
        this.cloudGroup = new THREE.Group();

        // Soft puffy texture painted on a canvas - no external assets needed
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const blob = (x, y, r, a) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(235,240,245,${a})`);
            g.addColorStop(0.6, `rgba(225,232,238,${a * 0.55})`);
            g.addColorStop(1, 'rgba(220,228,235,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, size, size);
        };
        // Cluster of overlapping puffs
        blob(64, 70, 44, 0.85);
        blob(40, 78, 30, 0.7);
        blob(88, 78, 32, 0.7);
        blob(58, 55, 28, 0.6);
        blob(76, 58, 24, 0.55);
        blob(28, 66, 20, 0.5);
        blob(100, 66, 20, 0.5);
        const tex = new THREE.CanvasTexture(canvas);

        for (let i = 0; i < this.cloudCount; i++) {
            const mat = new THREE.SpriteMaterial({
                map: tex,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                fog: false
            });
            const sprite = new THREE.Sprite(mat);
            sprite.raycast = () => {}; // visual only - never a raycast target
            const scale = 90 + Math.random() * 130;
            sprite.scale.set(scale, scale * 0.45, 1);
            sprite.userData.speed = 0.5 + Math.random();
            this.cloudGroup.add(sprite);
            this.clouds.push(sprite);
            this.resetCloud(sprite, true);
        }
        this.scene.add(this.cloudGroup);
    }

    resetCloud(cloud, randomY = false) {
        const R = 420; // cloud field radius
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * R;
        cloud.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        cloud.position.y = randomY ? 130 + Math.random() * 90 : 150 + Math.random() * 60;
        // start upwind so it drifts across
        cloud.position.x -= this.windDirection.x * R * 0.5;
        cloud.position.z -= this.windDirection.z * R * 0.5;
    }

    updateClouds(deltaTime) {
        if (!this.clouds || !this.clouds.length) return;
        const player = this.game?.player;
        const px = player?.mesh?.position?.x ?? 0;
        const pz = player?.mesh?.position?.z ?? 0;
        const density = this.params.cloudDensity;
        const drift = this.params.windStrength * 6 + 1.5;

        for (const cloud of this.clouds) {
            // Drift with the wind
            cloud.position.x += this.windDirection.x * drift * cloud.userData.speed * deltaTime;
            cloud.position.z += this.windDirection.z * drift * cloud.userData.speed * deltaTime;

            // Keep the cloud field centered on the player
            let dx = cloud.position.x - px;
            let dz = cloud.position.z - pz;
            if (dx * dx + dz * dz > 480 * 480) {
                this.resetCloud(cloud);
                cloud.position.x += px;
                cloud.position.z += pz;
            }

            // Fade with density; storm clouds darken
            const dark = 1 - density * 0.45;
            cloud.material.opacity = density * 0.92;
            cloud.material.color.setRGB(dark, dark, dark * 1.02);
        }
        this.cloudGroup.visible = density > 0.02;
    }

    createRainSystem() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.rainCount * 3);
        const velocities = new Float32Array(this.rainCount);
        
        for (let i = 0; i < this.rainCount; i++) {
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
        if (this.transitionProgress < 1) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            this.transitionProgress = Math.min(1, this.transitionProgress);
            
            // Lerp parameters
            const t = this.easeInOutCubic(this.transitionProgress);
            
            for (const key in this.params) {
                this.params[key] = THREE.MathUtils.lerp(
                    this.params[key],
                    this.targetParams[key],
                    t
                );
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
        if (this.rainParticles) {
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