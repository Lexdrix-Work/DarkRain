import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * DayNightCycle - Controls sun/moon position, lighting, and time of day
 */
export class DayNightCycle {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        
        // Time settings
        this.timeScale = 60; // Game seconds per real second (1 min real = 1 hour game)
        this.currentTime = 8 * 3600; // Start at 8:00 AM (seconds since midnight)
        this.dayLength = 24 * 3600; // 24 hours in seconds
        
        // Celestial bodies
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;
        this.skyDome = null;
        
        // Sun/Moon orbit
        this.orbitRadius = 400;
        this.sunPosition = new THREE.Vector3();
        this.moonPosition = new THREE.Vector3();
        
        // Colors for different times of day
        this.skyColors = {
            night: new THREE.Color(0x0a0a1a),
            dawn: new THREE.Color(0xff7744),
            day: new THREE.Color(0x87ceeb),
            dusk: new THREE.Color(0xff5522),
        };
        
        this.sunColors = {
            night: new THREE.Color(0x000000),
            dawn: new THREE.Color(0xff8866),
            day: new THREE.Color(0xffffee),
            dusk: new THREE.Color(0xff6644)
        };
        
        // Lighting intensities
        this.lightIntensities = {
            sun: { night: 0, dawn: 0.5, day: 1.0, dusk: 0.4 },
            moon: { night: 0.15, dawn: 0.05, day: 0, dusk: 0.05 },
            ambient: { night: 0.05, dawn: 0.2, day: 0.4, dusk: 0.15 }
        };
        
        // Time periods (in hours)
        this.timePeriods = {
            nightEnd: 5,
            dawnStart: 5,
            dawnEnd: 7,
            dayStart: 7,
            dayEnd: 18,
            duskStart: 18,
            duskEnd: 20,
            nightStart: 20
        };
        
        this.init();
    }

    init() {
        this.createLights();
        this.createSkyDome();
    }

    createLights() {
        // Directional sun light
        this.sunLight = new THREE.DirectionalLight(0xfff2df, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 1000;
        this.sunLight.shadow.camera.left = -500;
        this.sunLight.shadow.camera.right = 500;
        this.sunLight.shadow.camera.top = 500;
        this.sunLight.shadow.camera.bottom = -500;
        this.sunLight.shadow.bias = -0.0003;
        this.sunLight.shadow.normalBias = 0.02;
        this.scene.add(this.sunLight);
        
        // Moon light
        this.moonLight = new THREE.DirectionalLight(0x4444ff, 0.15);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 1024;
        this.moonLight.shadow.mapSize.height = 1024;
        this.scene.add(this.moonLight);
        
        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(this.ambientLight);
        
        // Hemisphere light for more natural outdoor lighting
        this.hemiLight = new THREE.HemisphereLight(0xbcd6e8, 0x54503f, 0.5);
        this.scene.add(this.hemiLight);
    }

    createSkyDome() {
        // Simple sky dome
        const geometry = new THREE.SphereGeometry(500, 32, 32);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        this.skyDome = new THREE.Mesh(geometry, material);
        this.scene.add(this.skyDome);
        
        // Sun visual
        const sunGeometry = new THREE.SphereGeometry(10, 16, 16);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        this.scene.add(this.sunMesh);
        
        // Moon visual
        const moonGeometry = new THREE.SphereGeometry(8, 16, 16);
        const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc });
        this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        this.scene.add(this.moonMesh);
    }

    /**
     * Set the current time
     * @param {number} hours - Hours (0-24)
     * @param {number} minutes - Minutes (0-60)
     */
    setTime(hours, minutes = 0) {
        this.currentTime = (hours * 3600) + (minutes * 60);
        this.update(0);
    }

    /**
     * Get current time as hours and minutes
     * @returns {{hours: number, minutes: number, formatted: string}}
     */
    getTime() {
        const totalMinutes = Math.floor(this.currentTime / 60);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        
        return {
            hours,
            minutes,
            formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
        };
    }

    /**
     * Get the current time period
     * @returns {string}
     */
    getTimePeriod() {
        const hours = this.currentTime / 3600;
        
        if (hours >= this.timePeriods.nightStart || hours < this.timePeriods.nightEnd) {
            return 'night';
        } else if (hours >= this.timePeriods.dawnStart && hours < this.timePeriods.dawnEnd) {
            return 'dawn';
        } else if (hours >= this.timePeriods.dayStart && hours < this.timePeriods.dayEnd) {
            return 'day';
        } else if (hours >= this.timePeriods.duskStart && hours < this.timePeriods.duskEnd) {
            return 'dusk';
        }
        return 'day';
    }

    update(deltaTime) {
        // Update time
        this.currentTime += deltaTime * this.timeScale;
        if (this.currentTime >= this.dayLength) {
            this.currentTime -= this.dayLength;
        }
        
        const normalizedTime = this.currentTime / this.dayLength;
        const sunAngle = normalizedTime * Math.PI * 2 - Math.PI / 2;
        
        // Update sun position
        this.sunPosition.set(
            Math.cos(sunAngle) * this.orbitRadius,
            Math.sin(sunAngle) * this.orbitRadius,
            0
        );
        
        // Update moon position (opposite to sun)
        this.moonPosition.set(
            -this.sunPosition.x,
            -this.sunPosition.y,
            0
        );
        
        // Update light positions
        if (this.sunLight) {
            this.sunLight.position.copy(this.sunPosition);
            this.sunLight.target.position.set(0, 0, 0);
        }
        
        if (this.moonLight) {
            this.moonLight.position.copy(this.moonPosition);
            this.moonLight.target.position.set(0, 0, 0);
        }
        
        // Update celestial body meshes
        if (this.sunMesh) {
            this.sunMesh.position.copy(this.sunPosition);
        }
        
        if (this.moonMesh) {
            this.moonMesh.position.copy(this.moonPosition);
        }
        
        // Update colors and intensities
        this.updateLighting(normalizedTime);
        this.updateSky(normalizedTime);
        
        // Emit time update
        globalEventBus.emit(GameEvents.TIME_UPDATE, this.getTime());
    }

    updateLighting(normalizedTime) {
        const hours = normalizedTime * 24;
        const period = this.getTimePeriod();
        
        // Calculate blend factors based on time of day
        let sunIntensity, moonIntensity, ambientIntensity;
        let sunColor, skyColor;
        
        if (period === 'night') {
            sunIntensity = 0;
            moonIntensity = 0.15;
            ambientIntensity = 0.05;
            sunColor = this.sunColors.night;
            skyColor = this.skyColors.night;
        } else if (period === 'dawn') {
            const t = (hours - this.timePeriods.dawnStart) / (this.timePeriods.dawnEnd - this.timePeriods.dawnStart);
            sunIntensity = THREE.MathUtils.lerp(0, 0.7, t);
            moonIntensity = THREE.MathUtils.lerp(0.1, 0, t);
            ambientIntensity = THREE.MathUtils.lerp(0.1, 0.3, t);
            sunColor = new THREE.Color().lerpColors(this.sunColors.night, this.sunColors.dawn, t);
            skyColor = new THREE.Color().lerpColors(this.skyColors.night, this.skyColors.dawn, t);
        } else if (period === 'day') {
            const midDay = (this.timePeriods.dayStart + this.timePeriods.dayEnd) / 2;
            const distFromMid = Math.abs(hours - midDay) / (midDay - this.timePeriods.dayStart);
            sunIntensity = THREE.MathUtils.lerp(2.4, 1.7, distFromMid);
            moonIntensity = 0;
            ambientIntensity = THREE.MathUtils.lerp(0.75, 0.6, distFromMid);
            sunColor = this.sunColors.day;
            skyColor = this.skyColors.day;
        } else { // dusk
            const t = (hours - this.timePeriods.duskStart) / (this.timePeriods.duskEnd - this.timePeriods.duskStart);
            sunIntensity = THREE.MathUtils.lerp(0.6, 0, t);
            moonIntensity = THREE.MathUtils.lerp(0, 0.1, t);
            ambientIntensity = THREE.MathUtils.lerp(0.25, 0.1, t);
            sunColor = new THREE.Color().lerpColors(this.sunColors.dusk, this.sunColors.night, t);
            skyColor = new THREE.Color().lerpColors(this.skyColors.dusk, this.skyColors.night, t);
        }
        
        // Weather dims/brightens the whole rig (storms go dark, clear days blaze)
        const wx = this.game.weatherSystem?.params;
        const sunWeatherFactor = wx ? wx.sunIntensity : 1;
        const ambientWeatherFactor = wx ? wx.ambientIntensity : 1;
        
        // Apply to lights
        if (this.sunLight) {
            this.sunLight.intensity = sunIntensity * sunWeatherFactor;
            this.sunLight.color.copy(sunColor);
        }
        
        if (this.moonLight) {
            this.moonLight.intensity = moonIntensity;
        }
        
        if (this.ambientLight) {
            this.ambientLight.intensity = ambientIntensity * ambientWeatherFactor;
        }
        
        // Update hemisphere light (fill so shadow faces never go pitch black)
        if (this.hemiLight) {
            this.hemiLight.intensity = ambientIntensity * 0.75 * ambientWeatherFactor;
            this.hemiLight.color.copy(skyColor);
        }
    }

    updateSky(normalizedTime) {
        if (!this.skyDome) return;
        
        const period = this.getTimePeriod();
        let topColor, bottomColor;
        
        switch (period) {
            case 'night':
                topColor = new THREE.Color(0x000011);
                bottomColor = new THREE.Color(0x0a0a1a);
                break;
            case 'dawn':
                topColor = new THREE.Color(0x4477aa);
                bottomColor = new THREE.Color(0xff7744);
                break;
            case 'day':
                topColor = new THREE.Color(0x0077ff);
                bottomColor = new THREE.Color(0x87ceeb);
                break;
            case 'dusk':
                topColor = new THREE.Color(0x553377);
                bottomColor = new THREE.Color(0xff5522);
                break;
        }
        
        // Weather dims the sky dome (storms go dark, clear days blaze)
        const sunWx = this.game?.weatherSystem?.params?.sunIntensity;
        const skyDim = sunWx !== undefined ? 0.35 + 0.65 * THREE.MathUtils.clamp(sunWx, 0, 1) : 1;
        topColor.multiplyScalar(skyDim);
        bottomColor.multiplyScalar(skyDim);

        this.skyDome.material.uniforms.topColor.value.copy(topColor);
        this.skyDome.material.uniforms.bottomColor.value.copy(bottomColor);
    }

    /**
     * Check if it's currently nighttime
     * @returns {boolean}
     */
    isNight() {
        const hours = this.currentTime / 3600;
        return hours >= this.timePeriods.nightStart || hours < this.timePeriods.nightEnd;
    }

    dispose() {
        if (this.sunLight) this.scene.remove(this.sunLight);
        if (this.moonLight) this.scene.remove(this.moonLight);
        if (this.ambientLight) this.scene.remove(this.ambientLight);
        if (this.hemiLight) this.scene.remove(this.hemiLight);
        if (this.skyDome) {
            this.skyDome.geometry.dispose();
            this.skyDome.material.dispose();
            this.scene.remove(this.skyDome);
        }
        if (this.sunMesh) {
            this.sunMesh.geometry.dispose();
            this.sunMesh.material.dispose();
            this.scene.remove(this.sunMesh);
        }
        if (this.moonMesh) {
            this.moonMesh.geometry.dispose();
            this.moonMesh.material.dispose();
            this.scene.remove(this.moonMesh);
        }
    }
}