import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Weapon definitions
 */
export const WeaponData = {
    pm_pistol: {
        id: 'pm_pistol',
        name: 'PM Pistol',
        type: 'pistol',
        damage: 15,
        fireRate: 3,
        accuracy: 0.85,
        recoil: 0.08,
        range: 50,
        magazineSize: 8,
        reloadTime: 2.0,
        ammoType: 'pistol',
        automatic: false,
        weight: 0.73
    },
    
    ak74: {
        id: 'ak74',
        name: 'AK-74',
        type: 'rifle',
        damage: 28,
        fireRate: 10,
        accuracy: 0.75,
        recoil: 0.15,
        range: 200,
        magazineSize: 30,
        reloadTime: 2.5,
        ammoType: 'rifle',
        automatic: true,
        weight: 3.3
    },
    
    shotgun_toz: {
        id: 'shotgun_toz',
        name: 'TOZ-34',
        type: 'shotgun',
        damage: 60,
        fireRate: 1,
        accuracy: 0.6,
        recoil: 0.3,
        range: 30,
        magazineSize: 2,
        reloadTime: 3.0,
        ammoType: 'shotgun',
        automatic: false,
        pellets: 8,
        spread: 0.1,
        weight: 3.3
    },
    
    svd_sniper: {
        id: 'svd_sniper',
        name: 'SVD Dragunov',
        type: 'sniper',
        damage: 80,
        fireRate: 1,
        accuracy: 0.95,
        recoil: 0.25,
        range: 500,
        magazineSize: 10,
        reloadTime: 3.5,
        ammoType: 'sniper',
        automatic: false,
        scopeZoom: 4,
        weight: 4.3
    },
    
    knife: {
        id: 'knife',
        name: 'Combat Knife',
        type: 'melee',
        damage: 25,
        fireRate: 2,
        accuracy: 1.0,
        recoil: 0,
        range: 2,
        magazineSize: Infinity,
        reloadTime: 0,
        ammoType: null,
        automatic: false,
        weight: 0.3
    }
};

/**
 * Weapon class - Individual weapon instance
 */
export class Weapon {
    constructor(weaponId, game) {
        const data = WeaponData[weaponId];
        if (!data) {
            throw new Error(`Unknown weapon: ${weaponId}`);
        }
        
        this.game = game;
        this.id = weaponId;
        this.data = data;
        
        // State
        this.currentAmmo = data.magazineSize;
        this.reserveAmmo = data.magazineSize * 3;
        this.isReloading = false;
        this.reloadProgress = 0;
        this.canFire = true;
        this.fireTimer = 0;
        this.isAiming = false;
        
        // Visual
        this.mesh = null;
        this.muzzleFlash = null;
        this.muzzlePosition = new THREE.Vector3(0, -0.15, -0.5);
        
        // Animation state
        this.swayOffset = new THREE.Vector3();
        this.recoilOffset = new THREE.Vector3();
        this.aimProgress = 0;
        
        // Audio
        this.sounds = {
            fire: `weapon_${weaponId}_fire`,
            reload: `weapon_${weaponId}_reload`,
            empty: 'weapon_empty',
            equip: 'weapon_equip'
        };
        
        this.createMesh();
    }

    createMesh() {
        // Low-poly FPS viewmodel, built per weapon type. -Z is forward.
        const group = new THREE.Group();
        // Note: no environment map in the scene, so keep metalness low -
        // high metalness renders near-black without env reflections.
        const metal = new THREE.MeshStandardMaterial({ color: 0x3d3d44, metalness: 0.3, roughness: 0.5 });
        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x26262b, metalness: 0.25, roughness: 0.6 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, metalness: 0.05, roughness: 0.8 });
        const polymer = new THREE.MeshStandardMaterial({ color: 0x303036, metalness: 0.1, roughness: 0.85 });

        const box = (w, h, d, mat, x, y, z, rx = 0) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y, z);
            m.rotation.x = rx;
            group.add(m);
            return m;
        };
        const tube = (r1, r2, len, mat, x, y, z) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 10), mat);
            m.rotation.x = Math.PI / 2;
            m.position.set(x, y, z);
            group.add(m);
            return m;
        };

        const type = this.data.type;
        if (type === 'pistol') {
            box(0.055, 0.07, 0.24, metal, 0, 0.02, -0.05);          // slide
            box(0.05, 0.05, 0.05, darkMetal, 0, 0.065, -0.15);       // front sight block
            box(0.012, 0.025, 0.012, darkMetal, 0, 0.095, -0.155);   // front sight post
            box(0.05, 0.13, 0.055, polymer, 0, -0.07, 0.045, -0.25); // grip
            box(0.045, 0.02, 0.1, darkMetal, 0, -0.025, -0.02);      // trigger guard
        } else if (type === 'rifle') {
            box(0.06, 0.09, 0.5, metal, 0, 0, -0.1);                 // receiver
            box(0.055, 0.07, 0.28, wood, 0, -0.01, -0.42);           // handguard
            tube(0.016, 0.016, 0.22, darkMetal, 0, 0.01, -0.62);     // barrel
            box(0.012, 0.05, 0.012, darkMetal, 0, 0.06, -0.68);      // front sight
            box(0.05, 0.14, 0.06, metal, 0, -0.1, -0.12, 0.5);       // curved magazine
            box(0.055, 0.11, 0.22, wood, 0, -0.03, 0.22, 0.15);      // stock
            box(0.045, 0.02, 0.09, darkMetal, 0, -0.055, 0.02);       // trigger guard
            box(0.04, 0.03, 0.06, wood, 0, -0.02, -0.02, -0.3);      // pistol grip
        } else if (type === 'shotgun') {
            tube(0.02, 0.02, 0.62, metal, 0, 0.015, -0.3);           // barrel
            tube(0.024, 0.024, 0.3, wood, 0, -0.035, -0.32);         // pump
            box(0.06, 0.08, 0.3, metal, 0, 0, 0.08);                // receiver
            box(0.055, 0.12, 0.2, wood, 0, -0.04, 0.3, 0.12);        // stock
            box(0.012, 0.04, 0.012, darkMetal, 0, 0.05, -0.58);      // bead sight
        } else if (type === 'sniper') {
            tube(0.014, 0.014, 0.7, darkMetal, 0, 0.01, -0.35);      // long barrel
            box(0.06, 0.09, 0.42, metal, 0, 0, 0.02);               // receiver
            tube(0.028, 0.028, 0.22, darkMetal, 0, 0.085, -0.05);    // scope
            box(0.02, 0.05, 0.02, darkMetal, 0, 0.045, -0.05);       // scope mount
            box(0.055, 0.11, 0.26, wood, 0, -0.04, 0.32, 0.1);       // stock
            box(0.05, 0.12, 0.055, metal, 0, -0.09, 0.0, 0.35);      // magazine
            box(0.05, 0.16, 0.04, darkMetal, 0, -0.1, 0.18);         // bipod legs (folded look)
        } else { // melee - knife
            const blade = box(0.012, 0.045, 0.3, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.25 }), 0, 0.01, -0.18);
            blade.rotation.x = -0.12;
            box(0.03, 0.05, 0.14, polymer, 0, -0.03, 0.05, -0.35);   // handle
            box(0.05, 0.015, 0.02, darkMetal, 0, -0.01, -0.02);      // guard
        }

        // Muzzle flash sprite (positioned at barrel tip per type)
        const flashGeom = new THREE.SphereGeometry(0.06, 8, 8);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0, depthWrite: false });
        this.muzzleFlash = new THREE.Mesh(flashGeom, flashMat);
        const tipZ = type === 'pistol' ? -0.2 : type === 'rifle' ? -0.74 : type === 'shotgun' ? -0.62 : type === 'sniper' ? -0.72 : -0.32;
        this.muzzleFlash.position.set(0, 0.02, tipZ);
        this.muzzlePosition.copy(this.muzzleFlash.position);
        group.add(this.muzzleFlash);

        // FPS placement: lower-right, angled inward so the profile reads
        group.position.set(0.3, -0.27, -0.55);
        group.scale.setScalar(0.8);
        group.rotation.y = 0.32;

        this.mesh = group;
    }

    /**
     * Attach weapon to the first-person overlay (ViewmodelSystem). The
     * overlay renders in its own scene after the main pass, so the weapon
     * can never clip through walls.
     * @param {THREE.Camera} camera - Player camera (fallback parent)
     */
    attachToCamera(camera) {
        const vm = this.game?.viewmodelSystem;
        if (vm && this.mesh) {
            vm.attach(this.mesh);
        } else if (this.mesh) {
            camera.add(this.mesh); // fallback before the overlay exists
        }
        // Arms match the player's character and are parented to the weapon
        // so they follow recoil, sway and aim transitions exactly
        this.setCharacter(this.game?.character);
    }

    /**
     * Detach weapon from camera
     */
    detach() {
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }

    /**
     * Build first-person arms parented to the weapon so they track recoil,
     * sway and aim transitions. Grip points differ per weapon type.
     * @param {Object} character - { skinTone, sleeveColor }
     */
    setCharacter(character) {
        if (this.armGroup && this.mesh) {
            this.mesh.remove(this.armGroup);
            this.armGroup = null;
        }
        if (!character || !this.mesh) return;

        const sleeveMat = new THREE.MeshStandardMaterial({ color: character.sleeveColor ?? 0x4a5240, roughness: 0.9 });
        const skinMat = new THREE.MeshStandardMaterial({ color: character.skinTone ?? 0xc9a186, roughness: 0.7 });
        const arms = new THREE.Group();

        const limb = (from, to, r, mat) => {
            const dir = new THREE.Vector3().subVectors(to, from);
            const len = dir.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, len, 10), mat);
            m.position.copy(from).addScaledVector(dir, 0.5);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            return m;
        };
        const hand = (x, y, z, rx = 0.3, ry = 0) => {
            const h = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.12), skinMat);
            h.position.set(x, y, z);
            h.rotation.set(rx, ry, 0);
            return h;
        };

        // Grip points per weapon type (weapon-local space, -Z forward)
        const grips = {
            pistol:  { r: [0, -0.09, 0.05],  l: [0.03, -0.14, 0.02], twoHand: true },
            rifle:   { r: [0, -0.08, -0.02], l: [0.01, -0.06, -0.42] },
            shotgun: { r: [0, -0.07, 0.08],  l: [0.01, -0.07, -0.32] },
            sniper:  { r: [0, -0.08, 0.02],  l: [0.01, -0.06, -0.30] },
            melee:   { r: [0, -0.06, 0.05],  l: null },
        };
        const gp = grips[this.data.type] || grips.rifle;
        const rElbow = new THREE.Vector3(0.30, -0.42, 0.30);
        const lElbow = new THREE.Vector3(-0.10, -0.42, 0.18);

        const rHand = new THREE.Vector3(...gp.r);
        arms.add(hand(rHand.x, rHand.y, rHand.z, 0.35, 0.2));
        arms.add(limb(rElbow, rHand, 0.055, sleeveMat));

        if (gp.l) {
            const lHand = new THREE.Vector3(...gp.l);
            arms.add(hand(lHand.x, lHand.y, lHand.z, 0.4, -0.15));
            arms.add(limb(lElbow, lHand, 0.055, sleeveMat));
        } else {
            // Off hand rests low for melee
            const rest = new THREE.Vector3(-0.05, -0.35, 0.1);
            arms.add(hand(rest.x, rest.y, rest.z, 0.2, 0));
            arms.add(limb(lElbow, rest, 0.055, sleeveMat));
        }

        arms.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        this.armGroup = arms;
        this.mesh.add(arms);
    }

    /**
     * Try to fire the weapon
     * @returns {boolean} Whether the weapon fired
     */
    fire() {
        if (!this.canFire || this.isReloading) return false;
        
        if (this.currentAmmo <= 0) {
            // Click sound for empty
            globalEventBus.emit('audio:play', {
                sound: this.sounds.empty,
                volume: 0.5
            });
            return false;
        }
        
        this.canFire = false;
        this.fireTimer = 1 / this.data.fireRate;
        this.currentAmmo--;
        
        // Apply recoil
        this.applyRecoil();
        
        // Muzzle flash
        this.showMuzzleFlash();
        
        // Fire sound
        globalEventBus.emit('audio:play', {
            sound: this.sounds.fire,
            volume: 0.8
        });
        
        // Spawn projectile/hitscan
        this.performHitscan();
        
        // Emit event
        globalEventBus.emit(GameEvents.WEAPON_FIRE, {
            weapon: this,
            ammoLeft: this.currentAmmo
        });
        
        return true;
    }

    /**
     * Perform hitscan for instant-hit weapons
     */
    performHitscan() {
        const player = this.game.player;
        if (!player) return;
        
        const camera = player.camera;
        const raycaster = new THREE.Raycaster();
        
        // Get firing direction with accuracy spread
        const spread = (1 - this.data.accuracy) * (this.isAiming ? 0.3 : 1);
        const direction = new THREE.Vector3(0, 0, -1);
        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread;
        direction.applyQuaternion(camera.quaternion);
        direction.normalize();
        
        raycaster.set(camera.position, direction);
        raycaster.far = this.data.range;
        
        // Shotgun fires multiple pellets
        if (this.data.pellets) {
            for (let i = 0; i < this.data.pellets; i++) {
                const pelletDir = direction.clone();
                pelletDir.x += (Math.random() - 0.5) * this.data.spread;
                pelletDir.y += (Math.random() - 0.5) * this.data.spread;
                pelletDir.normalize();
                
                const pelletRay = new THREE.Raycaster(camera.position, pelletDir, 0, this.data.range);
                this.processHit(pelletRay, this.data.damage / this.data.pellets);
            }
        } else {
            this.processHit(raycaster, this.data.damage);
        }
    }

    /**
     * Process a raycast hit
     * @param {THREE.Raycaster} raycaster - Raycaster instance
     * @param {number} damage - Damage amount
     */
    processHit(raycaster, damage) {
        const worldManager = this.game.worldManager;
        if (!worldManager) return;
        
        const hit = worldManager.raycast(
            raycaster.ray.origin,
            raycaster.ray.direction,
            this.data.range
        );
        
        if (hit) {
            // Check for entity hit
            let hitEntity = null;
            let current = hit.object;
            
            while (current) {
                if (current.userData?.entityId) {
                    hitEntity = worldManager.entities.get(current.userData.entityId);
                    break;
                }
                current = current.parent;
            }
            
            if (hitEntity && hitEntity.takeDamage) {
                // Calculate damage with distance falloff
                const distance = hit.distance;
                const falloff = Math.max(0.5, 1 - (distance / this.data.range) * 0.5);
                const finalDamage = damage * falloff;
                
                hitEntity.takeDamage(finalDamage, this.game.player);
            }
            
            // Spawn impact effect
            globalEventBus.emit('effect:impact', {
                position: hit.point,
                normal: hit.face?.normal || new THREE.Vector3(0, 1, 0),
                type: hitEntity ? 'flesh' : 'default'
            });
        }
    }

    /**
     * Apply recoil effect
     */
    applyRecoil() {
        const recoilAmount = this.data.recoil * (this.isAiming ? 0.5 : 1);
        
        this.recoilOffset.y += recoilAmount;
        this.recoilOffset.z += recoilAmount * 0.5;
        
        // Apply to player camera
        if (this.game.player) {
            this.game.player.cameraPitch += recoilAmount * 0.5;
            this.game.player.cameraYaw += (Math.random() - 0.5) * recoilAmount * 0.3;
        }
    }

    /**
     * Show muzzle flash effect
     */
    showMuzzleFlash() {
        if (this.muzzleFlash) {
            this.muzzleFlash.material.opacity = 1;
            this.muzzleFlash.scale.setScalar(1 + Math.random() * 0.5);
            
            // Hide after short delay
            setTimeout(() => {
                if (this.muzzleFlash) {
                    this.muzzleFlash.material.opacity = 0;
                }
            }, 50);
        }
    }

    /**
     * Start reloading
     */
    reload() {
        if (this.isReloading) return;
        if (this.currentAmmo >= this.data.magazineSize) return;
        if (this.reserveAmmo <= 0) return;
        
        this.isReloading = true;
        this.reloadProgress = 0;
        
        // Reload sound
        globalEventBus.emit('audio:play', {
            sound: this.sounds.reload,
            volume: 0.6
        });
        
        globalEventBus.emit(GameEvents.WEAPON_RELOAD, { weapon: this });
    }

    /**
     * Complete the reload
     */
    finishReload() {
        const ammoNeeded = this.data.magazineSize - this.currentAmmo;
        const ammoToLoad = Math.min(ammoNeeded, this.reserveAmmo);
        
        this.currentAmmo += ammoToLoad;
        this.reserveAmmo -= ammoToLoad;
        this.isReloading = false;
        this.reloadProgress = 0;
    }

    /**
     * Add ammo to reserve
     * @param {number} amount - Amount to add
     */
    addAmmo(amount) {
        this.reserveAmmo += amount;
    }

    /**
     * Set aiming state
     * @param {boolean} aiming - Whether aiming
     */
    setAiming(aiming) {
        this.isAiming = aiming;
    }

    /**
     * Update weapon state
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        // Update fire timer
        if (!this.canFire) {
            this.fireTimer -= deltaTime;
            if (this.fireTimer <= 0) {
                this.canFire = true;
            }
        }
        
        // Update reload
        if (this.isReloading) {
            this.reloadProgress += deltaTime / this.data.reloadTime;
            if (this.reloadProgress >= 1) {
                this.finishReload();
            }
        }
        
        // Update visual effects
        this.updateVisuals(deltaTime);
    }

    /**
     * Update weapon visuals (sway, recoil recovery, etc.)
     * @param {number} deltaTime - Frame delta
     */
    updateVisuals(deltaTime) {
        if (!this.mesh) return;
        
        // Recover from recoil
        this.recoilOffset.lerp(new THREE.Vector3(), 10 * deltaTime);
        
        // Aim transition
        const targetAimProgress = this.isAiming ? 1 : 0;
        this.aimProgress = THREE.MathUtils.lerp(this.aimProgress, targetAimProgress, 10 * deltaTime);
        
        // Calculate position
        const hipPos = new THREE.Vector3(0.2, -0.15, -0.3);
        const aimPos = new THREE.Vector3(0, -0.1, -0.25);
        
        this.mesh.position.lerpVectors(hipPos, aimPos, this.aimProgress);
        
        // Apply recoil offset
        this.mesh.position.add(this.recoilOffset);
        
        // Weapon sway (reduced when aiming)
        const swayAmount = (1 - this.aimProgress * 0.8) * 0.002;
        const time = performance.now() * 0.001;
        this.swayOffset.x = Math.sin(time * 1.5) * swayAmount;
        this.swayOffset.y = Math.cos(time * 2) * swayAmount;
        
        this.mesh.position.add(this.swayOffset);
    }

    /**
     * Get weapon info for UI
     */
    getInfo() {
        return {
            name: this.data.name,
            currentAmmo: this.currentAmmo,
            reserveAmmo: this.reserveAmmo,
            magazineSize: this.data.magazineSize,
            isReloading: this.isReloading,
            reloadProgress: this.reloadProgress
        };
    }
}

/**
 * WeaponManager - Manages player weapons
 */
export class WeaponManager {
    constructor(game) {
        this.game = game;
        this.weapons = new Map();
        this.equippedWeapon = null;
        this.weaponSlots = [null, null, null]; // Primary, Secondary, Melee
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('item:equip', (data) => {
            if (data.item.type === 'weapon') {
                this.equipWeapon(data.item.weaponId);
            }
        });
    }

    /**
     * Add a weapon to inventory
     * @param {string} weaponId - Weapon ID
     * @param {number} slot - Slot index
     */
    addWeapon(weaponId, slot = -1) {
        if (this.weapons.has(weaponId)) return;
        
        const weapon = new Weapon(weaponId, this.game);
        this.weapons.set(weaponId, weapon);
        
        // Auto-assign to slot
        if (slot === -1) {
            const weaponType = weapon.data.type;
            if (weaponType === 'melee') {
                slot = 2;
            } else if (weaponType === 'pistol') {
                slot = 1;
            } else {
                slot = 0;
            }
        }
        
        if (slot >= 0 && slot < this.weaponSlots.length) {
            this.weaponSlots[slot] = weaponId;
        }
        
        return weapon;
    }

    /**
     * Equip a weapon
     * @param {string} weaponId - Weapon ID
     */
    equipWeapon(weaponId) {
        const weapon = this.weapons.get(weaponId);
        if (!weapon) return;
        
        // Unequip current
        if (this.equippedWeapon) {
            this.equippedWeapon.detach();
        }
        
        this.equippedWeapon = weapon;
        
        // Attach to camera
        if (this.game.player?.camera) {
            weapon.attachToCamera(this.game.player.camera);
        }
        
        // Equip sound
        globalEventBus.emit('audio:play', {
            sound: weapon.sounds.equip,
            volume: 0.5
        });
        
        globalEventBus.emit(GameEvents.WEAPON_SWITCH, { weapon });
    }

    /**
     * Equip weapon by slot
     * @param {number} slot - Slot index
     */
    equipSlot(slot) {
        if (slot < 0 || slot >= this.weaponSlots.length) return;
        
        const weaponId = this.weaponSlots[slot];
        if (weaponId) {
            this.equipWeapon(weaponId);
        }
    }

    /**
     * Remove every weapon (fresh start). Detaches viewmodels from the camera.
     */
    clearAll() {
        for (const weapon of this.weapons.values()) {
            try { weapon.detach(); } catch (_) { /* already detached */ }
        }
        this.weapons.clear();
        this.weaponSlots = [null, null, null];
        this.equippedWeapon = null;
    }

    /**
     * Add ammo to a weapon
     * @param {string} ammoType - Ammo type
     * @param {number} amount - Amount to add
     */
    addAmmo(ammoType, amount) {
        for (const weapon of this.weapons.values()) {
            if (weapon.data.ammoType === ammoType) {
                weapon.addAmmo(amount);
            }
        }
    }

    /**
     * Update equipped weapon
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        if (this.equippedWeapon) {
            this.equippedWeapon.update(deltaTime);
            
            // Update player reference
            if (this.game.player) {
                this.game.player.equippedWeapon = this.equippedWeapon;
            }
        }
    }

    dispose() {
        for (const weapon of this.weapons.values()) {
            weapon.detach();
        }
        this.weapons.clear();
        this.equippedWeapon = null;
    }
}