import { createNodeSkyMaterial } from '../render/ModernRenderer.ts';
import * as THREE from 'three';
import { sampleAtmosphere } from './SkyAtmosphere.js';
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
        
        // Ambient tint follows the sky (bright blue-grey by day, deep blue at night)
        this.ambientColors = {
            night: new THREE.Color(0x2a3a5c),
            dawn: new THREE.Color(0xc4a488),
            day: new THREE.Color(0xbcd4e8),
            dusk: new THREE.Color(0x9a7a88)
        };
        
        // Lighting intensities (fill tuned so vertical faces read at noon)
        this.lightIntensities = {
            sun: { night: 0, dawn: 0.8, day: 1.0, dusk: 0.6 },
            moon: { night: 0.3, dawn: 0.08, day: 0, dusk: 0.08 },
            ambient: { night: 0.12, dawn: 0.35, day: 0.55, dusk: 0.3 }
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
        // NOTE: sun shadow casting disabled - the shadow map was rendering
        // the entire scene as shadowed (broken) and cost 4000+ draw calls.
        // Directional N·L shading still applies. Re-enable via settings if fixed.
        this.sunLight.castShadow = false;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 1;
        this.sunLight.shadow.camera.far = 700;
        this.sunLight.shadow.camera.left = -36;
        this.sunLight.shadow.camera.right = 36;
        this.sunLight.shadow.camera.top = 36;
        this.sunLight.shadow.camera.bottom = -36;
        this.sunLight.shadow.bias = -0.00008;
        this.sunLight.shadow.normalBias = 0.012;
        this.sunLight.shadow.autoUpdate=false;this.sunLight.shadow.needsUpdate=true;
        this.sunLight.shadow.camera.updateProjectionMatrix();
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
        
        // Moon light
        this.moonLight = new THREE.DirectionalLight(0x4444ff, 0.15);
        this.moonLight.castShadow = false;
        this.moonLight.shadow.camera.copy(this.sunLight.shadow.camera);
        this.moonLight.shadow.bias=-.00008;this.moonLight.shadow.normalBias=.012;
        this.moonLight.shadow.autoUpdate=false;this.moonLight.shadow.needsUpdate=true;
        this.scene.add(this.moonLight);
        this.scene.add(this.moonLight.target);
        
        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0xbcd4e8, 0.5);
        this.scene.add(this.ambientLight);
        
        // Hemisphere light for more natural outdoor lighting
        this.hemiLight = new THREE.HemisphereLight(0xbcd6e8, 0x54503f, 0.5);
        this.scene.add(this.hemiLight);
    }

    createSkyDome() {
        const material=createNodeSkyMaterial();
        this.skyDome=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),material);
        this.skyDome.renderOrder=-1000;this.skyDome.frustumCulled=false;
        this.skyDome.raycast=()=>{};
        // Follow the camera used for this render, including reflection cameras.
        this.skyDome.onBeforeRender=(_renderer,_scene,camera)=>{
            camera.getWorldPosition(this.skyDome.position);
            if(this.game.renderer?.isWebGPURenderer)this.skyDome.scale.setScalar(camera.far*.85);
            this.skyDome.updateMatrixWorld(true);
        };
        this.scene.add(this.skyDome);
        this.update(0);
    }

    /**
     * Set the current time
     * @param {number} hours - Hours (0-24)
     * @param {number} minutes - Minutes (0-60)
     */
    setTime(hours, minutes = 0) {
        this.currentTime = (hours * 3600) + (minutes * 60);
        this.update(0);
        if(this.game.renderer?.shadowMap)this.game.renderer.shadowMap.needsUpdate=true;
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
        this.currentTime=((this.currentTime%this.dayLength)+this.dayLength)%this.dayLength;
        this.skyElapsed=(this.skyElapsed||0)+Math.max(0,deltaTime);
        
        const normalizedTime = this.currentTime / this.dayLength;
        const sunAngle = normalizedTime * Math.PI * 2 - Math.PI / 2;
        
        // Update sun position on a tilted arc: at solar noon the sun sits
        // ~62° up with an azimuth, so facades catch raking light instead of
        // a dead-overhead sun that leaves every vertical face black.
        const tiltZ = 0.45; // orbit tilt (radians) for a natural sun path
        this.sunPosition.set(
            Math.cos(sunAngle) * this.orbitRadius,
            Math.sin(sunAngle) * this.orbitRadius,
            Math.sin(sunAngle) * this.orbitRadius * tiltZ
        );
        
        // Update moon position (opposite to sun)
        this.moonPosition.set(
            -this.sunPosition.x,
            -this.sunPosition.y,
            -this.sunPosition.z
        );

        // Follow the player with one active celestial shadow map, snapped to texels.
        this.updateLighting(normalizedTime);
        const focus=this.game.player?.position || new THREE.Vector3();
        for(const [light,direction] of [[this.sunLight,this.sunPosition],[this.moonLight,this.moonPosition]]) {
            const texel=72/light.shadow.mapSize.x;
            const forward=direction.clone().normalize();
            const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
            const up=new THREE.Vector3().crossVectors(right,forward).normalize();
            const target=focus.clone();
            target.addScaledVector(right,Math.round(focus.dot(right)/texel)*texel-focus.dot(right));
            target.addScaledVector(up,Math.round(focus.dot(up)/texel)*texel-focus.dot(up));
            light.target.position.copy(target);
            light.position.copy(forward).multiplyScalar(300).add(target);
            const enabled=light.userData.shadowEnabled ?? false;
            light.castShadow=enabled&&(this.sunLight.intensity>.02?light===this.sunLight:light===this.moonLight);
        }

        // Update celestial body meshes
        if (this.sunMesh) {
            this.sunMesh.position.copy(this.sunPosition);
        }
        
        if (this.moonMesh) {
            this.moonMesh.position.copy(this.moonPosition);
        }
        
        // Update colors and intensities
        this.updateSky(normalizedTime);
        
        // Emit time update
        globalEventBus.emit(GameEvents.TIME_UPDATE, this.getTime());
    }

    updateLighting(normalizedTime) {
        const state=this.atmosphere=sampleAtmosphere(normalizedTime*24);
        const wx=this.game.weatherSystem?.params;
        const sunWx=Number.isFinite(wx?.sunIntensity)?wx.sunIntensity:1;
        const ambientWx=Number.isFinite(wx?.ambientIntensity)?wx.ambientIntensity:1;
        const cloud=Number.isFinite(wx?.cloudDensity)?THREE.MathUtils.clamp(wx.cloudDensity,0,1):0;
        const elevation=this.sunPosition.clone().normalize().y;
        this.sunLight.intensity=state.sun*sunWx*THREE.MathUtils.smoothstep(elevation,-.04,.08);
        this.sunLight.color.copy(state.sunColor);
        this.moonLight.intensity=state.moon*(1-cloud*.8);
        this.moonLight.color.set(0xa8b9d2);
        this.ambientLight.intensity=state.ambient*ambientWx;
        this.ambientLight.color.copy(state.ambientColor);
        this.hemiLight.intensity=state.ambient*2*ambientWx;
        this.hemiLight.color.copy(state.horizon);
    }

    updateSky(normalizedTime) {
        if(!this.skyDome)return;
        const state=this.atmosphere||sampleAtmosphere(normalizedTime*24),u=this.skyDome.material.uniforms;
        const wx=this.game.weatherSystem?.params;
        const sunWx=Number.isFinite(wx?.sunIntensity)?wx.sunIntensity:1;
        const dim=.35+.65*THREE.MathUtils.clamp(sunWx,0,1);
        u.topColor.value.copy(state.top).multiplyScalar(dim);
        u.bottomColor.value.copy(state.horizon).multiplyScalar(dim);
        u.sunDirection.value.copy(this.sunPosition).normalize();
        u.moonDirection.value.copy(this.moonPosition).normalize();
        u.sunColor.value.copy(state.sunColor);u.nightFactor.value=state.night;
        u.cloudDensity.value=Number.isFinite(wx?.cloudDensity)?THREE.MathUtils.clamp(wx.cloudDensity,0,1):0;
        u.skyTime.value=this.skyElapsed||0;
        if(this.game.weatherSystem?.cloudOffset)u.cloudOffset.value.copy(this.game.weatherSystem.cloudOffset);
        this.updateFogForTime();
    }

    updateFogForTime() {
        const ws=this.game.weatherSystem,scene=this.scene;
        if(!ws||!scene.fog)return;
        const current=ws.presets?.[ws.currentWeather],target=ws.presets?.[ws.targetWeather];
        if(!current?.fogColor)return;
        const progress=THREE.MathUtils.clamp(ws.transitionProgress??1,0,1);
        const blend=ws.easeInOutCubic?.(progress)??progress;
        scene.fog.color.copy(current.fogColor);
        if(target?.fogColor)scene.fog.color.lerp(target.fogColor,blend);
        scene.fog.color.multiplyScalar(this.atmosphere.fogBrightness);
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
        if (this.sunLight) {this.scene.remove(this.sunLight);this.scene.remove(this.sunLight.target);}
        if (this.moonLight) {this.scene.remove(this.moonLight);this.scene.remove(this.moonLight.target);}
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
