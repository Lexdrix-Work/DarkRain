import {PooledParticles} from './PooledParticles.js';
import {BurstLights} from './BurstLights.js';
import {TracerPool} from './TracerPool.js';
import { BloodEffects } from './BloodEffects.js';
import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';

/**
 * EffectsSystem - Manages visual effects (particles, decals, etc.)
 */
export class EffectsSystem {
    constructor(game) {
        this.game = game;
        this.blood=new BloodEffects(game);
        this.scene = game.scene;
        this.pooledParticles=new PooledParticles(this.scene,game.settings?.particleQuality||game.settings?.quality,game.renderer);
        this.burstLights=new BurstLights(this.scene);
        this.tracerPool=new TracerPool(this.scene);
        
        // Effect pools
        this.particleSystems = [];
        this.decals = [];
        this.tracers = [];
        // PARTICLE POOL: reuse objects (zero visual loss, less GC)
        this._particlePool = [];
        this._maxPoolSize = 20;
        
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
            this.createImpactEffect(data.position, data.normal, data.type,data.direction);
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
    createImpactEffect(position, normal, type = 'default',direction) {
        if(type==='flesh'){this.blood.spray(position,normal,direction);return;}
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
    createImpactParticles(position, normal, type) {this.pooledParticles.emit(position,normal,type);}

    createMuzzleFlash(position, direction) {
        this.burstLights.emit(position,0xffaa55,6,5,.05);
        
        this.pooledParticles.emit(position,direction,'muzzle');
    }

    /**
     * Create explosion effect
     * @param {THREE.Vector3} position - Explosion center
     * @param {number} radius - Explosion radius
     */
    createExplosion(position, radius = 3) {
        this.game.physicsSystem?.explode(position,radius,220);
        // Flash light
        this.burstLights.emit(position,0xff6600,12,radius*3,.5);
        
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
    createExplosionParticles(position, radius) {this.pooledParticles.emit(position,null,'explosion',radius);}

    createTracer(start, end) {
        // One brief local reflection on nearby surfaces, rather than a new light per shot.
        this.burstLights.emit(start,0xffd887,1.5,3,.035);
        this.tracerPool.emit(start,end);
    }

    /**
     * Update effects system
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        this.blood.update(deltaTime);this.pooledParticles.update(deltaTime);this.burstLights.update(deltaTime);this.tracerPool.update(deltaTime);
        // Clean up old decals (after 5 minutes)
        const now = Date.now();
        const maxAge = 300000;
        
        let kept=0;for(let i=0;i<this.decals.length;i++){const decal=this.decals[i];if(now-decal.createdAt>maxAge){decal.mesh.removeFromParent();decal.mesh.geometry.dispose();decal.mesh.material.dispose();}else this.decals[kept++]=decal;}this.decals.length=kept;

    }

    dispose() {
        this.blood.dispose();this.pooledParticles.dispose();this.burstLights.dispose();this.tracerPool.dispose();
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
