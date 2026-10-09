import {paintAnomaly} from './AnomalyAccessibility.js';
import { createAnomalyCompute } from '../render/AnomalyCompute.ts';
import { createNodeAnomalyMaterial } from '../render/ModernRenderer.ts';
import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Anomaly types found in the Zone
 */
export const AnomalyType = {
    GRAVITATIONAL: 'gravitational',  // Vortex, Springboard
    ELECTRICAL: 'electrical',        // Electro
    CHEMICAL: 'chemical',            // Fruit Punch, Burnt Fuzz
    THERMAL: 'thermal',              // Burner
    PSI: 'psi'                       // Brain Scorcher effects
};

/**
 * Base Anomaly class
 */
export class Anomaly {
    constructor(options = {}) {
        this.id = `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = options.type || AnomalyType.GRAVITATIONAL;
        this.position = new THREE.Vector3().fromArray(options.position || [0, 0, 0]);
        this.radius = options.radius || 3;
        this.damage = options.damage || 10;
        this.system = null;
        this.damageInterval = options.damageInterval || 0.5;
        this.isActive = true;
        this.isTriggered = false;
        
        // Visual
        this.mesh = null;
        this.particles = null;
        
        // Timing
        this.cooldownTime = options.cooldownTime || 5;
        this.currentCooldown = 0;
        this.damageTimer = 0;
        
        // Detection
        this.detectionRadius = this.radius * 1.5;
        this.isVisible = false; // Hidden until detected
    }

    init(scene) {
        this.scene = scene;
        this.createVisuals();paintAnomaly(this,this.system?.game?.settings?.anomalyPalette);
    }

    createVisuals() {
        // Override in subclasses
        const geometry = new THREE.SphereGeometry(this.radius, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.2,
            wireframe: true
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.visible = this.isVisible;
        
        if (this.scene) {
            this.scene.add(this.mesh);
        }
    }

    /** Damage scaled by Zone-wide effects (e.g. emission surge). */
    get effectiveDamage() {
        return this.damage * (this.system?.emissionDamageMultiplier || 1);
    }

    /**
     * Check if entity is within anomaly
     * @param {THREE.Vector3} entityPosition - Entity position
     */
    isEntityInside(entityPosition) {
        return entityPosition.distanceTo(this.position) <= this.radius;
    }

    /**
     * Check if entity is within detection range
     * @param {THREE.Vector3} entityPosition - Entity position
     */
    isEntityNearby(entityPosition) {
        return entityPosition.distanceTo(this.position) <= this.detectionRadius;
    }

    /**
     * Trigger the anomaly effect
     * @param {Entity} entity - Entity that triggered
     */
    trigger(entity) {
        if (!this.isActive || this.isTriggered) return;
        
        this.isTriggered = true;
        this.onTrigger(entity);
        
        globalEventBus.emit(GameEvents.ANOMALY_TRIGGER, {
            anomaly: this,
            entity
        });
    }

    /**
     * Override in subclasses for specific trigger behavior
     * @param {Entity} entity - Triggering entity
     */
    onTrigger(entity) {
        // Base implementation - deal damage
        if (entity.takeDamage) {
            entity.takeDamage(this.effectiveDamage, this);
        }
    }

    /**
     * Apply continuous effect to entity inside anomaly
     * @param {Entity} entity - Entity inside
     * @param {number} deltaTime - Frame delta
     */
    applyEffect(entity, deltaTime) {
        // Override in subclasses
    }

    /**
     * Reveal the anomaly (detector found it)
     */
    reveal() {
        this.isVisible = true;
        if(this.accessibilityMarker)this.accessibilityMarker.visible=true;
        if (this.mesh) {
            this.mesh.visible = true;
        }
    }

    /**
     * Hide the anomaly
     */
    hide() {
        this.isVisible = false;
        if(this.accessibilityMarker)this.accessibilityMarker.visible=false;
        if (this.mesh) {
            this.mesh.visible = false;
        }
    }

    update(deltaTime) {
        // Update cooldown
        if (this.isTriggered) {
            this.currentCooldown += deltaTime;
            if (this.currentCooldown >= this.cooldownTime) {
                this.currentCooldown = 0;
                this.isTriggered = false;
            }
        }
        
        // Update visuals
        this.updateVisuals(deltaTime);
    }

    updateVisuals(deltaTime) {
        // Override in subclasses for animation
        if (this.mesh && this.isVisible) {
            this.mesh.rotation.y += deltaTime * 0.5;
        }
    }

    dispose() {
        if(this.accessibilityMarker){this.accessibilityMarker.removeFromParent();this.accessibilityMarker.geometry.dispose();this.accessibilityMarker.material.dispose();}
        if(this.computeField){this.computeField.dispose();this.computeField=null;this.particles=null;}
        if (this.mesh) {
            this.scene?.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.particles) {
            this.scene?.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
    }
}

/**
 * Gravitational Anomaly - Pulls/throws entities
 */
export class GravitationalAnomaly extends Anomaly {
    constructor(options = {}) {
        super({ ...options, type: AnomalyType.GRAVITATIONAL });
        this.pullStrength = options.pullStrength || 10;
        this.launchStrength = options.launchStrength || 20;
        this.isVortex = options.isVortex || false; // Vortex vs Springboard
    }

    createVisuals() {
        // Distortion sphere
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = createNodeAnomalyMaterial(false);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.mesh);
        }

        // Particle system for debris
        this.createParticles();
    }

    createParticles() {
        const renderer=this.system?.game?.renderer;
        if(renderer?.isWebGPURenderer){
            this.computeField=createAnomalyCompute(renderer,this.position,this.radius,this.system.game.settings.quality);
            if(this.computeField){this.particles=this.computeField.mesh;this.particles.visible=this.isVisible;this.scene.add(this.particles);return;}
        }
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * this.radius;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = (Math.random() - 0.5) * this.radius;
            positions[i * 3 + 2] = Math.sin(angle) * radius;
            
            velocities[i * 3] = (Math.random() - 0.5) * 2;
            velocities[i * 3 + 1] = Math.random() * 2;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

        const material = new THREE.PointsMaterial({
            color: 0x666666,
            size: 0.1,
            transparent: true,
            opacity: 0.6
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.position.copy(this.position);
        this.particles.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.particles);
        }
    }

    onTrigger(entity) {
        if (this.isVortex) {
            // Vortex - pull and damage
            super.onTrigger(entity);
        } else {
            // Springboard - launch upward
            if (entity.velocity) {
                entity.velocity.y = this.launchStrength;
            }
            entity.takeDamage?.(this.effectiveDamage * 0.5, this);
        }
    }

    applyEffect(entity, deltaTime) {
        if (!this.isVortex) return;
        
        // Pull toward center
        const direction = new THREE.Vector3()
            .subVectors(this.position, entity.position)
            .normalize();
        
        if (entity.velocity) {
            entity.velocity.addScaledVector(direction, this.pullStrength * deltaTime);
        }
        
        // Damage over time
        this.damageTimer += deltaTime;
        if (this.damageTimer >= this.damageInterval) {
            this.damageTimer = 0;
            entity.takeDamage?.(this.effectiveDamage * 0.2, this);
        }
    }

    updateVisuals(deltaTime) {
        if (this.mesh?.material?.uniforms) {
            this.mesh.material.uniforms.time.value += deltaTime;
        }

        if(this.computeField){this.particles.visible=this.isVisible;if(this.isVisible)this.computeField.update(deltaTime);return;}
        // Animate particles
        if (this.particles && this.isVisible) {
            const positions = this.particles.geometry.attributes.position.array;
            const velocities = this.particles.geometry.attributes.velocity.array;

            for (let i = 0; i < positions.length / 3; i++) {
                // Spiral motion
                const x = positions[i * 3];
                const y = positions[i * 3 + 1];
                const z = positions[i * 3 + 2];

                const angle = Math.atan2(z, x) + deltaTime * 2;
                const radius = Math.sqrt(x * x + z * z);

                positions[i * 3] = Math.cos(angle) * radius;
                positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime;
                positions[i * 3 + 2] = Math.sin(angle) * radius;

                // Reset if too high
                if (positions[i * 3 + 1] > this.radius) {
                    positions[i * 3 + 1] = -this.radius / 2;
                }
            }

            this.particles.geometry.attributes.position.needsUpdate = true;
        }
    }
}

/**
 * Electrical Anomaly - Electro
 */
export class ElectricalAnomaly extends Anomaly {
    constructor(options = {}) {
        super({ ...options, type: AnomalyType.ELECTRICAL });
        this.arcCount = options.arcCount || 5;
        this.arcs = [];
    }

    createVisuals() {
        // Core sphere
        const geometry = new THREE.SphereGeometry(this.radius * 0.3, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.5
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.mesh);
        }

        // Create lightning arcs
        for (let i = 0; i < this.arcCount; i++) {
            const arc = this.createArc();
            this.arcs.push(arc);
            if (this.scene) {
                this.scene.add(arc);
            }
        }
    }

    createArc() {
        const points = [];
        const segments = 10;

        for (let i = 0; i <= segments; i++) {
            points.push(new THREE.Vector3(0, 0, 0));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8
        });

        const arc = new THREE.Line(geometry, material);
        arc.position.copy(this.position);
        arc.visible = this.isVisible;

        return arc;
    }

    onTrigger(entity) {
        // Electrical shock
        entity.takeDamage?.(this.effectiveDamage * 1.5, this);
        
        // Stun effect (if entity supports it)
        if (entity.applyStatus) {
            entity.applyStatus('stunned', 1.0);
        }
    }

    applyEffect(entity, deltaTime) {
        this.damageTimer += deltaTime;
        if (this.damageTimer >= this.damageInterval) {
            this.damageTimer = 0;
            entity.takeDamage?.(this.effectiveDamage * 0.3, this);
        }
    }

    updateVisuals(deltaTime) {
        super.updateVisuals(deltaTime);

        // Update lightning arcs
        if (this.isVisible) {
            for (const arc of this.arcs) {
                this.updateArc(arc);
            }
        }
    }

    updateArc(arc) {
        const positions = arc.geometry.attributes.position.array;
        const segments = positions.length / 3 - 1;

        // Random end point on sphere surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const endX = Math.sin(phi) * Math.cos(theta) * this.radius;
        const endY = Math.sin(phi) * Math.sin(theta) * this.radius;
        const endZ = Math.cos(phi) * this.radius;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const jitter = (1 - Math.abs(t - 0.5) * 2) * 0.3;

            positions[i * 3] = endX * t + (Math.random() - 0.5) * jitter;
            positions[i * 3 + 1] = endY * t + (Math.random() - 0.5) * jitter;
            positions[i * 3 + 2] = endZ * t + (Math.random() - 0.5) * jitter;
        }

        arc.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        super.dispose();
        for (const arc of this.arcs) {
            this.scene?.remove(arc);
            arc.geometry.dispose();
            arc.material.dispose();
        }
        this.arcs = [];
    }
}

/**
 * Chemical Anomaly - Acid/toxic
 */
export class ChemicalAnomaly extends Anomaly {
    constructor(options = {}) {
        super({ ...options, type: AnomalyType.CHEMICAL });
        this.radiationDamage = options.radiationDamage || 5;
    }

    createVisuals() {
        // Toxic pool
        const geometry = new THREE.CircleGeometry(this.radius, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x44ff44,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.position.y += 0.01; // Slightly above ground
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.mesh);
        }

        // Bubbles/fumes particles
        this.createFumes();
    }

    createFumes() {
        const particleCount = 50;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * this.radius;
            positions[i * 3] = Math.cos(angle) * r;
            positions[i * 3 + 1] = Math.random() * 2;
            positions[i * 3 + 2] = Math.sin(angle) * r;
            sizes[i] = 0.1 + Math.random() * 0.2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            color: 0x88ff88,
            size: 0.2,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.position.copy(this.position);
        this.particles.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.particles);
        }
    }

    applyEffect(entity, deltaTime) {
        this.damageTimer += deltaTime;
        if (this.damageTimer >= this.damageInterval) {
            this.damageTimer = 0;
            entity.takeDamage?.(this.effectiveDamage * 0.2, this);
            
            // Add radiation
            if (entity.addRadiation) {
                entity.addRadiation(this.radiationDamage * deltaTime);
            }
        }
    }

    updateVisuals(deltaTime) {
        // Animate fumes rising
        if (this.particles && this.isVisible) {
            const positions = this.particles.geometry.attributes.position.array;

            for (let i = 0; i < positions.length / 3; i++) {
                positions[i * 3 + 1] += deltaTime * (0.5 + Math.random() * 0.5);

                // Reset if too high
                if (positions[i * 3 + 1] > 3) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * this.radius;
                    positions[i * 3] = Math.cos(angle) * r;
                    positions[i * 3 + 1] = 0;
                    positions[i * 3 + 2] = Math.sin(angle) * r;
                }
            }

            this.particles.geometry.attributes.position.needsUpdate = true;
        }

        // Pulsing pool effect
        if (this.mesh && this.isVisible) {
            this.mesh.material.opacity = 0.4 + Math.sin(Date.now() * 0.003) * 0.2;
        }
    }
}

/**
 * Thermal Anomaly - Burner
 */
export class ThermalAnomaly extends Anomaly {
    constructor(options = {}) {
        super({ ...options, type: AnomalyType.THERMAL });
        this.burnDuration = options.burnDuration || 3;
    }

    createVisuals() {
        // Heat shimmer effect (simplified)
        const geometry = new THREE.CylinderGeometry(this.radius, this.radius * 1.2, 3, 16, 1, true);
        const material = createNodeAnomalyMaterial(true);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.mesh);
        }

        // Fire particles
        this.createFireParticles();
    }

    createFireParticles() {
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * this.radius;
            positions[i * 3] = Math.cos(angle) * r;
            positions[i * 3 + 1] = Math.random() * 2;
            positions[i * 3 + 2] = Math.sin(angle) * r;

            // Orange to yellow gradient
            const t = Math.random();
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.3 + t * 0.5;
            colors[i * 3 + 2] = t * 0.2;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.position.copy(this.position);
        this.particles.visible = this.isVisible;

        if (this.scene) {
            this.scene.add(this.particles);
        }
    }

    onTrigger(entity) {
        super.onTrigger(entity);
        
        // Apply burn status
        if (entity.applyStatus) {
            entity.applyStatus('burning', this.burnDuration);
        }
    }

    applyEffect(entity, deltaTime) {
        this.damageTimer += deltaTime;
        if (this.damageTimer >= this.damageInterval) {
            this.damageTimer = 0;
            entity.takeDamage?.(this.effectiveDamage * 0.4, this);
        }
    }

    updateVisuals(deltaTime) {
        if (this.mesh?.material?.uniforms) {
            this.mesh.material.uniforms.time.value += deltaTime;
        }

        // Animate fire particles
        if (this.particles && this.isVisible) {
            const positions = this.particles.geometry.attributes.position.array;

            for (let i = 0; i < positions.length / 3; i++) {
                positions[i * 3 + 1] += deltaTime * (2 + Math.random());

                // Slight horizontal wobble
                positions[i * 3] += (Math.random() - 0.5) * deltaTime * 2;
                positions[i * 3 + 2] += (Math.random() - 0.5) * deltaTime * 2;

                // Reset
                if (positions[i * 3 + 1] > 3) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * this.radius;
                    positions[i * 3] = Math.cos(angle) * r;
                    positions[i * 3 + 1] = 0;
                    positions[i * 3 + 2] = Math.sin(angle) * r;
                }
            }

            this.particles.geometry.attributes.position.needsUpdate = true;
        }
    }
}

/**
 * AnomalySystem - Manages all anomalies in the world
 */
export class AnomalySystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.anomalies = new Map();
        
        // Detector state
        this.detectorActive = false;
        this.emissionDamageMultiplier = 1.0; // scaled up during emissions
        this.detectorRange = 15;
        this.detectorBeepInterval = 0;
    }

    /**
     * Create an anomaly
     * @param {string} type - Anomaly type
     * @param {Object} options - Anomaly options
     */
    createAnomaly(type, options = {}) {
        let anomaly;

        switch (type) {
            case AnomalyType.GRAVITATIONAL:
                anomaly = new GravitationalAnomaly(options);
                break;
            case AnomalyType.ELECTRICAL:
                anomaly = new ElectricalAnomaly(options);
                break;
            case AnomalyType.CHEMICAL:
                anomaly = new ChemicalAnomaly(options);
                break;
            case AnomalyType.THERMAL:
                anomaly = new ThermalAnomaly(options);
                break;
            default:
                anomaly = new Anomaly(options);
        }

        anomaly.system = this;
        anomaly.init(this.scene);
        this.anomalies.set(anomaly.id, anomaly);

        return anomaly;
    }

    /**
     * Remove an anomaly
     * @param {string} id - Anomaly ID
     */
    removeAnomaly(id) {
        const anomaly = this.anomalies.get(id);
        if (anomaly) {
            anomaly.dispose();
            this.anomalies.delete(id);
        }
    }

    /**
     * Spawn anomaly field (cluster of anomalies)
     * @param {THREE.Vector3} center - Center position
     * @param {number} radius - Field radius
     * @param {string} type - Anomaly type
     * @param {number} count - Number of anomalies
     */
    spawnAnomalyField(center, radius, type, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            const position = [
                center.x + Math.cos(angle) * r,
                center.y,
                center.z + Math.sin(angle) * r
            ];

            this.createAnomaly(type, {
                position,
                radius: 1.5 + Math.random() * 2,
                damage: 10 + Math.random() * 20
            });
        }
    }

    /**
     * Toggle anomaly detector
     * @param {boolean} active - Detector state
     */
    applyAccessibility(mode){for(const anomaly of this.anomalies.values())paintAnomaly(anomaly,mode);}

    setDetectorActive(active) {
        this.detectorActive = active;
        
        if (!active) {
            // Hide all anomalies
            for (const anomaly of this.anomalies.values()) {
                anomaly.hide();
            }
        }
    }

    /**
     * Update all anomalies
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        const player = this.game.player;
        if (!player) return;

        let nearestDistance = Infinity,nearestAnomaly=null;

        const detectorRangeSq = this.detectorRange * this.detectorRange;

        for (const anomaly of this.anomalies.values()) {
            anomaly.update(deltaTime);

            // Squared distance avoids sqrt per anomaly per frame
            const distanceSq = player.position.distanceToSquared(anomaly.position);
            const distance = Math.sqrt(distanceSq);

            // Track nearest for detector
            if (distance < nearestDistance) {
                nearestDistance = distance;nearestAnomaly=anomaly;
            }

            // Detector reveals nearby anomalies
            if (this.detectorActive && distanceSq <= detectorRangeSq) {
                anomaly.reveal();
            }

            // Check if player is inside
            if (anomaly.isEntityInside(player.position)) {
                if (!anomaly.isTriggered) {
                    anomaly.trigger(player);
                }
                anomaly.applyEffect(player, deltaTime);
            }

            // Check enemies
            if (this.game.worldManager) {
                const nearbyEnemies = this.game.worldManager.getNearbyEntities(
                    anomaly.position,
                    anomaly.radius,
                    'enemy'
                );

                for (const enemy of nearbyEnemies) {
                    if (anomaly.isEntityInside(enemy.position)) {
                        if (!anomaly.isTriggered) {
                            anomaly.trigger(enemy);
                        }
                        anomaly.applyEffect(enemy, deltaTime);
                    }
                }
            }
        }

        // Detector beeping
        if (this.detectorActive && nearestDistance < this.detectorRange) {
            this.updateDetectorBeep(nearestDistance, deltaTime,nearestAnomaly);
        }
    }

    /**
     * Update detector beeping based on distance
     * @param {number} distance - Distance to nearest anomaly
     * @param {number} deltaTime - Frame delta
     */
    updateDetectorBeep(distance, deltaTime,anomaly) {
        // Nearer hazards produce faster pulses; the same cadence drives the visual detector.
        const normalizedDist = distance / this.detectorRange;
        const beepRate = 0.1 + normalizedDist * 0.9; // 0.1 to 1.0 seconds

        this.detectorBeepInterval += deltaTime;

        if (this.detectorBeepInterval >= beepRate) {
            this.detectorBeepInterval = 0;
            globalEventBus.emit('zone:detector_ping',{distance,kind:'anomaly',type:anomaly?.isVortex?'vortex':anomaly?.type});
            globalEventBus.emit('audio:play', {
                sound: 'detector_beep',
                volume: 0.5 + (1 - normalizedDist) * 0.5
            });
        }
    }

    /**
     * Get anomalies in area
     * @param {THREE.Vector3} position - Center
     * @param {number} radius - Search radius
     */
    getAnomaliesInArea(position, radius) {
        const results = [];
        
        for (const anomaly of this.anomalies.values()) {
            if (anomaly.position.distanceTo(position) <= radius) {
                results.push(anomaly);
            }
        }
        
        return results;
    }

    dispose() {
        for (const anomaly of this.anomalies.values()) {
            anomaly.dispose();
        }
        this.anomalies.clear();
    }
}