import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';

/**
 * EffectsSystem - Manages visual effects (particles, decals, etc.)
 */
export class EffectsSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        
        // Effect pools
        this.particleSystems = [];
        this.decals = [];
        this.tracers = [];
        
        // Configuration
        this.maxDecals = 100;
        this.maxTracers = 50;
        
        // Decal materials
        this.decalMaterials = {
            bullet: null,
            blood: null,
            scorch: null
        };
        
        this.init();
    }

    init() {
        this.createDecalMaterials();
        this.setupEventListeners();
    }

    createDecalMaterials() {
        // Bullet hole decal (procedural)
        const bulletCanvas = document.createElement('canvas');
        bulletCanvas.width = 64;
        bulletCanvas.height = 64;
        const bulletCtx = bulletCanvas.getContext('2d');
        
        // Draw bullet hole
        const gradient = bulletCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(0.3, 'rgba(30, 30, 30, 0.8)');
        gradient.addColorStop(0.6, 'rgba(50, 50, 50, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bulletCtx.fillStyle = gradient;
        bulletCtx.fillRect(0, 0, 64, 64);
        
        const bulletTexture = new THREE.CanvasTexture(bulletCanvas);
        this.decalMaterials.bullet = new THREE.MeshBasicMaterial({
            map: bulletTexture,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        });
        
        // Blood decal
        const bloodCanvas = document.createElement('canvas');
        bloodCanvas.width = 64;
        bloodCanvas.height = 64;
        const bloodCtx = bloodCanvas.getContext('2d');
        
        const bloodGradient = bloodCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        bloodGradient.addColorStop(0, 'rgba(139, 0, 0, 0.9)');
        bloodGradient.addColorStop(0.5, 'rgba(139, 0, 0, 0.5)');
        bloodGradient.addColorStop(1, 'rgba(139, 0, 0, 0)');
        bloodCtx.fillStyle = bloodGradient;
        bloodCtx.fillRect(0, 0, 64, 64);
        
        const bloodTexture = new THREE.CanvasTexture(bloodCanvas);
        this.decalMaterials.blood = new THREE.MeshBasicMaterial({
            map: bloodTexture,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        });
        
        // Scorch decal
        const scorchCanvas = document.createElement('canvas');
        scorchCanvas.width = 128;
        scorchCanvas.height = 128;
        const scorchCtx = scorchCanvas.getContext('2d');
        
        const scorchGradient = scorchCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        scorchGradient.addColorStop(0, 'rgba(20, 20, 20, 0.9)');
        scorchGradient.addColorStop(0.4, 'rgba(40, 30, 20, 0.7)');
        scorchGradient.addColorStop(0.7, 'rgba(60, 40, 20, 0.3)');
        scorchGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        scorchCtx.fillStyle = scorchGradient;
        scorchCtx.fillRect(0, 0, 128, 128);
        
        const scorchTexture = new THREE.CanvasTexture(scorchCanvas);
        this.decalMaterials.scorch = new THREE.MeshBasicMaterial({
            map: scorchTexture,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        });
    }

    setupEventListeners() {
        globalEventBus.on('effect:impact', (data) => {
            this.createImpactEffect(data.position, data.normal, data.type);
        });
        
        globalEventBus.on('effect:muzzleFlash', (data) => {
            this.createMuzzleFlash(data.position, data.direction);
        });
        
        globalEventBus.on('effect:explosion', (data) => {
            this.createExplosion(data.position, data.radius);
        });
        
        globalEventBus.on('effect:tracer', (data) => {
            this.createTracer(data.start, data.end);
        });
    }

    /**
     * Create impact effect at position
     * @param {THREE.Vector3} position - Impact position
     * @param {THREE.Vector3} normal - Surface normal
     * @param {string} type - Impact type (default, flesh, metal, etc.)
     */
    createImpactEffect(position, normal, type = 'default') {
        // Create decal
        this.createDecal(position, normal, type);
        
        // Create particles
        this.createImpactParticles(position, normal, type);
    }

    /**
     * Create a decal at position
     * @param {THREE.Vector3} position - Decal position
     * @param {THREE.Vector3} normal - Surface normal
     * @param {string} type - Decal type
     */
    createDecal(position, normal, type) {
        let material;
        let size = 0.1;
        
        switch (type) {
            case 'flesh':
            case 'blood':
                material = this.decalMaterials.blood.clone();
                size = 0.15 + Math.random() * 0.1;
                break;
            case 'scorch':
            case 'explosion':
                material = this.decalMaterials.scorch.clone();
                size = 0.5 + Math.random() * 0.5;
                break;
            default:
                material = this.decalMaterials.bullet.clone();
                size = 0.05 + Math.random() * 0.03;
        }
        
        // Create decal geometry (simple plane for now)
        const geometry = new THREE.PlaneGeometry(size, size);
        const decal = new THREE.Mesh(geometry, material);
        
        decal.position.copy(position);
        decal.position.addScaledVector(normal, 0.01);
        
        // Align to surface normal
        decal.lookAt(position.clone().add(normal));
        
        // Random rotation around normal
        decal.rotateZ(Math.random() * Math.PI * 2);
        
        this.scene.add(decal);
        this.decals.push({
            mesh: decal,
            createdAt: Date.now()
        });
        
        // Remove old decals
        while (this.decals.length > this.maxDecals) {
            const old = this.decals.shift();
            this.scene.remove(old.mesh);
            old.mesh.geometry.dispose();
            old.mesh.material.dispose();
        }
    }

    /**
     * Create impact particles
     * @param {THREE.Vector3} position - Impact position
     * @param {THREE.Vector3} normal - Surface normal
     * @param {string} type - Impact type
     */
    createImpactParticles(position, normal, type) {
        const particleCount = type === 'flesh' ? 15 : 10;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        
        let color;
        switch (type) {
            case 'flesh':
                color = new THREE.Color(0x8b0000);
                break;
            case 'metal':
                color = new THREE.Color(0xffaa00);
                break;
            default:
                color = new THREE.Color(0x888888);
        }
        
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
            
            // Random velocity in hemisphere around normal
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            );
            velocity.add(normal.clone().multiplyScalar(Math.random() * 2));
            velocity.normalize().multiplyScalar(1 + Math.random() * 3);
            velocities.push(velocity);
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color,
            size: type === 'flesh' ? 0.05 : 0.03,
            transparent: true,
            opacity: 1
        });
        
        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        
        // Animate particles
        const startTime = Date.now();
        const duration = 500;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = elapsed / duration;
            
            if (t >= 1) {
                this.scene.remove(particles);
                geometry.dispose();
                material.dispose();
                return;
            }
            
            const posArray = geometry.attributes.position.array;
            for (let i = 0; i < particleCount; i++) {
                posArray[i * 3] += velocities[i].x * 0.016;
                posArray[i * 3 + 1] += velocities[i].y * 0.016 - 0.01; // Gravity
                posArray[i * 3 + 2] += velocities[i].z * 0.016;
                
                velocities[i].multiplyScalar(0.95); // Drag
            }
            geometry.attributes.position.needsUpdate = true;
            
            material.opacity = 1 - t;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    /**
     * Create muzzle flash effect
     * @param {THREE.Vector3} position - Flash position
     * @param {THREE.Vector3} direction - Firing direction
     */
    createMuzzleFlash(position, direction) {
        const light = new THREE.PointLight(0xffaa00, 2, 5);
        light.position.copy(position);
        this.scene.add(light);
        
        // Quick flash
        setTimeout(() => {
            this.scene.remove(light);
            light.dispose();
        }, 50);
        
        // Flash sprite
        const spriteMaterial = new THREE.SpriteMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.scale.setScalar(0.3 + Math.random() * 0.2);
        this.scene.add(sprite);
        
        setTimeout(() => {
            this.scene.remove(sprite);
            spriteMaterial.dispose();
        }, 30);
    }

    /**
     * Create explosion effect
     * @param {THREE.Vector3} position - Explosion center
     * @param {number} radius - Explosion radius
     */
    createExplosion(position, radius = 3) {
        // Flash light
        const light = new THREE.PointLight(0xff6600, 5, radius * 3);
        light.position.copy(position);
        this.scene.add(light);
        
        // Animated light decay
        const startIntensity = 5;
        const startTime = Date.now();
        const duration = 500;
        
        const animateLight = () => {
            const t = (Date.now() - startTime) / duration;
            if (t >= 1) {
                this.scene.remove(light);
                light.dispose();
                return;
            }
            light.intensity = startIntensity * (1 - t);
            requestAnimationFrame(animateLight);
        };
        animateLight();
        
        // Explosion particles
        this.createExplosionParticles(position, radius);
        
        // Scorch decal
        const groundPos = position.clone();
        groundPos.y = 0.01;
        this.createDecal(groundPos, new THREE.Vector3(0, 1, 0), 'scorch');
        
        // Camera shake
        if (this.game.player) {
            const distance = this.game.player.position.distanceTo(position);
            const shakeIntensity = Math.max(0, 1 - distance / (radius * 5)) * 0.5;
            this.game.cameraShake?.(shakeIntensity, 0.5);
        }
    }

    /**
     * Create explosion particles
     * @param {THREE.Vector3} position - Center position
     * @param {number} radius - Explosion radius
     */
    createExplosionParticles(position, radius) {
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const velocities = [];
        
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;
            
            // Random velocity
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random(),
                (Math.random() - 0.5) * 2
            );
            velocity.normalize().multiplyScalar(radius * (0.5 + Math.random()));
            velocities.push(velocity);
            
            // Color gradient from yellow to red to black
            const colorT = Math.random();
            const color = new THREE.Color();
            if (colorT < 0.3) {
                color.setHex(0xffff00);
            } else if (colorT < 0.6) {
                color.setHex(0xff6600);
            } else {
                color.setHex(0x333333);
            }
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            sizes[i] = 0.1 + Math.random() * 0.2;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        
        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        
        // Animate
        const startTime = Date.now();
        const duration = 1000;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = elapsed / duration;
            
            if (t >= 1) {
                this.scene.remove(particles);
                geometry.dispose();
                material.dispose();
                return;
            }
            
            const posArray = geometry.attributes.position.array;
            for (let i = 0; i < particleCount; i++) {
                posArray[i * 3] += velocities[i].x * 0.016;
                posArray[i * 3 + 1] += velocities[i].y * 0.016 - 0.015;
                posArray[i * 3 + 2] += velocities[i].z * 0.016;
                
                velocities[i].multiplyScalar(0.96);
            }
            geometry.attributes.position.needsUpdate = true;
            
            material.opacity = 1 - t;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    /**
     * Create bullet tracer
     * @param {THREE.Vector3} start - Start position
     * @param {THREE.Vector3} end - End position
     */
    createTracer(start, end) {
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        
        const geometry = new THREE.CylinderGeometry(0.01, 0.01, length, 4);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, 0, length / 2);
        
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.8
        });
        
        const tracer = new THREE.Mesh(geometry, material);
        tracer.position.copy(start);
        tracer.lookAt(end);
        
        this.scene.add(tracer);
        
        // Fade out
        const startTime = Date.now();
        const duration = 100;
        
        const animate = () => {
            const t = (Date.now() - startTime) / duration;
            if (t >= 1) {
                this.scene.remove(tracer);
                geometry.dispose();
                material.dispose();
                return;
            }
            material.opacity = 0.8 * (1 - t);
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    /**
     * Update effects system
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        // Clean up old decals (after 5 minutes)
        const now = Date.now();
        const maxAge = 300000;
        
        this.decals = this.decals.filter(decal => {
            if (now - decal.createdAt > maxAge) {
                this.scene.remove(decal.mesh);
                decal.mesh.geometry.dispose();
                decal.mesh.material.dispose();
                return false;
            }
            return true;
        });
    }

    dispose() {
        // Clean up all decals
        for (const decal of this.decals) {
            this.scene.remove(decal.mesh);
            decal.mesh.geometry.dispose();
            decal.mesh.material.dispose();
        }
        this.decals = [];
        
        // Dispose materials
        for (const material of Object.values(this.decalMaterials)) {
            material?.dispose();
        }
    }
}