import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * FlashlightSystem - Player-attached flashlight with battery management
 */
export class FlashlightSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.player = null;
        
        // Flashlight state
        this.isOn = false;
        this.battery = 100; // Percentage
        this.maxBattery = 100;
        this.drainRate = 2; // Battery % per minute when on
        this.rechargeRate = 0; // Set > 0 if you want auto-recharge when off
        
        // Light objects
        this.spotLight = null;
        this.outerSpotLight = null; // Secondary wider cone for soft falloff
        this.pointLight = null; // Subtle fill
        this.lightHelper = null; // Debug helper
        
        // Flashlight settings - optimized for realistic wide beam
        this.settings = {
            // Warm white flashlight color
            color: 0xfff4e0,
            outerColor: 0xffecd0,
            
            // Main beam settings
            intensity: 40,
            distance: 90,
            angle: Math.PI / 5, // ~36 degrees - focused tactical beam
            penumbra: 0.45, // Tighter hotspot, soft edge
            decay: 1.0, // Less decay for further reach
            
            // Outer glow settings (secondary light)
            outerIntensity: 10,
            outerDistance: 50,
            outerAngle: Math.PI / 3, // ~60 degrees - very wide soft glow
            outerPenumbra: 1.0, // Maximum softness
            outerDecay: 1.5,
            
            // Ambient fill light
            fillIntensity: 1.2,
            fillDistance: 10,
            
            // Position offset from camera
            offsetX: 0.3,
            offsetY: -0.2,
            offsetZ: 0.5,
        };
        
        // Flicker effect when battery low
        this.flickerTimer = 0;
        this.isFlickering = false;
        
        this.init();
    }

    init() {
        this.createFlashlight();
        this.setupEventListeners();
        console.log('FlashlightSystem initialized');
    }

    /**
     * Create the flashlight light objects
     */
    createFlashlight() {
        // Main spotlight - bright center beam
        this.spotLight = new THREE.SpotLight(
            this.settings.color,
            0, // Start off
            this.settings.distance,
            this.settings.angle,
            this.settings.penumbra,
            this.settings.decay
        );
        
        this.spotLight.castShadow = false;
        this.spotLight.shadow.mapSize.width = 1024;
        this.spotLight.shadow.mapSize.height = 1024;
        this.spotLight.shadow.camera.near = 0.5;
        this.spotLight.shadow.camera.far = this.settings.distance;
        this.spotLight.shadow.bias = -0.0003;
        this.spotLight.shadow.normalBias = 0.02;
        this.spotLight.shadow.autoUpdate=false;this.spotLight.shadow.needsUpdate=true;
        
        // Target for the spotlight to look at
        this.spotLight.target = new THREE.Object3D();
        this.scene.add(this.spotLight.target);
        this.scene.add(this.spotLight);
        
        // Outer spotlight - wider soft glow for realistic falloff
        this.outerSpotLight = new THREE.SpotLight(
            this.settings.outerColor,
            0, // Start off
            this.settings.outerDistance,
            this.settings.outerAngle,
            this.settings.outerPenumbra,
            this.settings.outerDecay
        );
        
        this.outerSpotLight.castShadow = false; // Only main light casts shadows
        
        // Target for outer spotlight
        this.outerSpotLight.target = new THREE.Object3D();
        this.scene.add(this.outerSpotLight.target);
        this.scene.add(this.outerSpotLight);
        
        // Small point light for subtle ambient glow around player
        this.pointLight = new THREE.PointLight(
            this.settings.color,
            0, // Start off
            this.settings.fillDistance,
            2
        );
        this.scene.add(this.pointLight);
        
        // Debug helper (uncomment to visualize light cone)
        // this.lightHelper = new THREE.SpotLightHelper(this.spotLight);
        // this.scene.add(this.lightHelper);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for flashlight toggle input
        globalEventBus.on('input:flashlight', () => {
            this.toggle();
        });
        
        // Listen for battery pickup
        globalEventBus.on('item:battery', (data) => {
            this.addBattery(data.amount || 25);
        });
    }

    /**
     * Set player reference
     */
    setPlayer(player) {
        this.player = player;
    }

    /**
     * Toggle flashlight on/off
     */
    toggle() {
        if(this.game.tutorialSystem?.active&&!this.isOn&&!this.game.inventorySystem?.hasItem('flashlight')){
            this.game.uiManager?.showNotification('Find a flashlight in the emergency supplies near the entrance.','info');return;
        }
        if (this.battery <= 0 && !this.isOn) {
            // Can't turn on with no battery
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Flashlight battery dead',
                type: 'warning'
            });
            this.playSound('click_empty');
            return;
        }
        
        this.isOn = !this.isOn;
        
        if (this.isOn) {
            this.turnOn();
        } else {
            this.turnOff();
        }
        
        this.playSound(this.isOn ? 'flashlight_on' : 'flashlight_off');
        
        globalEventBus.emit('flashlight:toggle', { isOn: this.isOn });
    }

    /**
     * Turn flashlight on
     */
    turnOn() {
        this.isOn = true;
        this.spotLight.intensity = this.settings.intensity;
        this.outerSpotLight.intensity = this.settings.outerIntensity;
        this.pointLight.intensity = this.settings.fillIntensity;
    }

    /**
     * Turn flashlight off
     */
    turnOff() {
        this.isOn = false;
        this.spotLight.intensity = 0;
        this.outerSpotLight.intensity = 0;
        this.pointLight.intensity = 0;
        this.isFlickering = false;
    }

    /**
     * Add battery charge
     */
    addBattery(amount) {
        this.battery = Math.min(this.maxBattery, this.battery + amount);
        
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: `Battery +${amount}%`,
            type: 'success'
        });
        
        // Stop flickering if battery is good now
        if (this.battery > 20) {
            this.isFlickering = false;
        }
    }

    /**
     * Play flashlight sounds
     */
    playSound(soundName) {
        if (this.game.audioManager) {
            this.game.audioManager.playSound(soundName);
        }
    }

    /**
     * Update flashlight position and state
     */
    update(deltaTime) {
        if (!this.player) return;
        this.spotLight.castShadow=this.isOn&&this.game.settings.shadows&&this.game.settings.quality!=='low';
        
        // Get camera/player position and direction
        const camera = this.player.camera;
        if (!camera) return;
        
        // Position flashlight at camera position with offset
        const offset = new THREE.Vector3(
            this.settings.offsetX,
            this.settings.offsetY,
            this.settings.offsetZ
        );
        
        // Transform offset by camera rotation
        offset.applyQuaternion(camera.quaternion);
        
        const flashlightPos = camera.position.clone().add(offset);
        
        this.spotLight.position.copy(flashlightPos);
        this.outerSpotLight.position.copy(flashlightPos);
        this.pointLight.position.copy(flashlightPos);
        
        // Point spotlight in camera direction
        const targetPos = camera.position.clone();
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(camera.quaternion);
        targetPos.add(direction.multiplyScalar(15));
        
        this.spotLight.target.position.copy(targetPos);
        this.outerSpotLight.target.position.copy(targetPos);
        
        // Update debug helper if exists
        if (this.lightHelper) {
            this.lightHelper.update();
        }
        
        // Battery drain
        if (this.isOn) {
            this.battery -= (this.drainRate / 60) * deltaTime;
            this.battery = Math.max(0, this.battery);
            
            // Low battery warning
            if (this.battery <= 20 && this.battery > 0) {
                this.updateFlicker(deltaTime);
            }
            
            // Battery dead
            if (this.battery <= 0) {
                this.turnOff();
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'Flashlight battery dead!',
                    type: 'danger'
                });
            }
        } else if (this.rechargeRate > 0) {
            // Recharge when off (if enabled)
            this.battery += (this.rechargeRate / 60) * deltaTime;
            this.battery = Math.min(this.maxBattery, this.battery);
        }
        
        // Emit battery update for UI
        globalEventBus.emit('flashlight:battery', { 
            battery: this.battery,
            isOn: this.isOn
        });
    }

    /**
     * Update flicker effect for low battery
     */
    updateFlicker(deltaTime) {
        this.flickerTimer += deltaTime;
        
        // Random flicker based on battery level
        const flickerChance = (20 - this.battery) / 20; // More flicker as battery decreases
        
        if (Math.random() < flickerChance * deltaTime * 5) {
            this.isFlickering = true;
            
            // Random intensity drop
            const flickerIntensity = this.settings.intensity * (0.3 + Math.random() * 0.5);
            const outerFlickerIntensity = this.settings.outerIntensity * (0.3 + Math.random() * 0.5);
            this.spotLight.intensity = flickerIntensity;
            this.outerSpotLight.intensity = outerFlickerIntensity;
            this.pointLight.intensity = this.settings.fillIntensity * 0.3;
            
            // Recover after short time
            setTimeout(() => {
                if (this.isOn && this.battery > 0) {
                    this.spotLight.intensity = this.settings.intensity;
                    this.outerSpotLight.intensity = this.settings.outerIntensity;
                    this.pointLight.intensity = this.settings.fillIntensity;
                }
                this.isFlickering = false;
            }, 50 + Math.random() * 100);
        }
    }

    /**
     * Set flashlight color (for different flashlight types)
     */
    setColor(color) {
        this.settings.color = color;
        this.spotLight.color.setHex(color);
        this.outerSpotLight.color.setHex(color);
        this.pointLight.color.setHex(color);
    }

    /**
     * Set flashlight intensity
     */
    setIntensity(intensity) {
        this.settings.intensity = intensity;
        this.settings.outerIntensity = intensity * 0.375; // Maintain ratio
        if (this.isOn) {
            this.spotLight.intensity = intensity;
            this.outerSpotLight.intensity = this.settings.outerIntensity;
        }
    }

    /**
     * Set flashlight distance/range
     */
    setDistance(distance) {
        this.settings.distance = distance;
        this.settings.outerDistance = distance * 0.6; // Outer is shorter range
        this.spotLight.distance = distance;
        this.spotLight.shadow.camera.far = distance;
        this.outerSpotLight.distance = this.settings.outerDistance;
    }

    /**
     * Get current battery level
     */
    getBattery() {
        return this.battery;
    }

    /**
     * Check if flashlight is on
     */
    getIsOn() {
        return this.isOn;
    }

    /**
     * Serialize for save system
     */
    serialize() {
        return {
            isOn: this.isOn,
            battery: this.battery
        };
    }

    /**
     * Deserialize from save
     */
    deserialize(data) {
        this.battery = data.battery ?? 100;
        if (data.isOn) {
            this.turnOn();
        } else {
            this.turnOff();
        }
    }

    /**
     * Dispose
     */
    dispose() {
        if (this.spotLight) {
            this.scene.remove(this.spotLight);
            this.scene.remove(this.spotLight.target);
            this.spotLight.dispose();
        }
        
        if (this.outerSpotLight) {
            this.scene.remove(this.outerSpotLight);
            this.scene.remove(this.outerSpotLight.target);
            this.outerSpotLight.dispose();
        }
        
        if (this.pointLight) {
            this.scene.remove(this.pointLight);
            this.pointLight.dispose();
        }
        
        if (this.lightHelper) {
            this.scene.remove(this.lightHelper);
            this.lightHelper.dispose();
        }
    }
}
