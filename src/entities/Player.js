import {motionScale,survivalPressure} from '../core/settings/Accessibility.js';
import {frictionGain} from '../core/input/Response.js';
import {incomingDamage} from '../core/settings/SettingsSchema.js';
import { addWound, updateWounds } from '../systems/Wounds.js';
import * as THREE from 'three';
import { Entity } from './Entity.js';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Player - First person player controller with survival mechanics
 */
// Reusable temp vectors (avoid per-frame GC)
const _pTmpV1 = new THREE.Vector3();
const _pTmpV2 = new THREE.Vector3();
const _pTmpV3 = new THREE.Vector3();
const _pTmpV4 = new THREE.Vector3();
const _pTmpV5 = new THREE.Vector3();
const _pTmpUp = new THREE.Vector3(0, 1, 0);

export class Player extends Entity {
    constructor(options = {}) {
        super({ name: 'Player', tags: ['player'], ...options });
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.cameraPitch = 0;
        this.cameraYaw = 0;
        this.bobOffset = new THREE.Vector3();
        this.bobTime = 0;
        
        // Movement
        this.velocity = new THREE.Vector3();
        this.moveSpeed = 5;
        this.sprintMultiplier = 1.8;
        this.crouchMultiplier = 0.5;
        this.jumpForce = 8;
        this.gravity = -25;
        this.isGrounded = false;
        this.isSprinting = false;
        this.isCrouching = false;
        
        // Movement smoothing
        this.groundFriction = 10;  // Higher = more responsive on ground
        this.airFriction = 2;      // Lower = less control in air
        this.stopFriction = 15;    // How fast player stops when no input
        
        // Dev flags (toggled via dev menu / debug console)
        this.godMode = false;
        this.noclip = false;
        
        // Physics
        this.height = 1.8;
        this.crouchHeight = 1.0;
        this.radius = 0.3;
        this.currentHeight = this.height;
        
        // Stats
        this.stats = {
            health: 100,
            maxHealth: 100,
            stamina: 100,
            maxStamina: 100,
            radiation: 0,
            maxRadiation: 100,
            hunger: 0,
            maxHunger: 100,
            thirst: 0,
            maxThirst: 100
        };
        
        // Inventory
        this.inventory = [];
        this.maxInventorySlots = 24;
        this.equippedWeapon = null;
        this.quickSlots = [null, null, null, null];
        
        // Combat
        this.isAiming = false;
        this.weaponSway = new THREE.Vector3();
        
        // Interaction
        this.interactionRange = 3;
        this.lookingAt = null;
        
        // Input reference
        this.input = null;
        
        // Settings
        this.mouseSensitivity = 0.002;
        this.invertY = false;
        
        // Collision
        this.collisionRadius = 0.3;
        this.collisionHeight = 1.8;
        this.collisionCheckDistance = 0.1;
        this.groundCheckDistance = 0.3;
        this.collisionEnabled = true;
        this.world = null;
        
        // Ground detection
        this.minGroundLevel = -1;
        this.lastValidGroundY = 0;
        this.groundNormalThreshold = 0.5; // Min Y component of normal to count as ground
    }

    init(game) {
        super.init(game);
        this.input = game.inputManager;
        this.world = game.worldManager;
        
        // Position camera
        this.camera.position.set(0, this.height - 0.1, 0);
        
        // Create player collider visualization (debug)
        if (game.debug) {
            const geometry = new THREE.CylinderGeometry(this.radius, this.radius, this.height, 8);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
            this.debugMesh = new THREE.Mesh(geometry, material);
            this.setMesh(this.debugMesh);
        }
        
        // Initialize ground level
        this.lastValidGroundY = this.position.y;
        
        // Setup event listeners
        this.setupEvents();
    }

    setupEvents() {
        globalEventBus.on(GameEvents.PLAYER_DAMAGE, (data) => {
            this.takeDamage(data.amount, data.source);
        });
    }

    update(deltaTime) {
        if (!this.isActive) return;
        
        this.handleInput(deltaTime);
        this.updateMovement(deltaTime);
        this.updateCamera(deltaTime);
        this.updateStats(deltaTime);
        this.updateInteraction();
        
        // Update collision debug mesh position
        if (this.debugMesh) {
            this.debugMesh.position.copy(this.position);
            this.debugMesh.position.y += this.currentHeight / 2;
        }
        
        super.update(deltaTime);
    }

    handleInput(deltaTime) {
        if (!this.input) return;
        
        let lookX=0,lookY=0;
        if(this.input.controllerActive){const look=this.input.getControllerLook(deltaTime),gain=this.controllerAimGain();lookX=look.x*gain;lookY=look.y*gain;}
        else if(this.input.mouse.locked){const look=this.input.getMouseDelta();lookX=look.x*this.mouseSensitivity;lookY=look.y*this.mouseSensitivity;}
        this.cameraYaw-=lookX*(this.invertX?-1:1);this.cameraPitch-=lookY*(this.invertY?-1:1);this.cameraPitch=Math.max(-Math.PI/2+.1,Math.min(Math.PI/2-.1,this.cameraPitch));
        this.game?.weaponManager?.equippedWeapon?.setAiming(this.input.isActionActive('aim'));
        
        // Sprint
        this.isSprinting = this.input.isActionActive('sprint') && this.stats.stamina > 0 && !this.isCrouching && !this.input.isActionActive('aim');
        
        // Crouch toggle
        if (this.input.isActionJustPressed('crouch')) {
            this.isCrouching = !this.isCrouching;
        }
        
        // Jump
        if (this.input.isActionJustPressed('jump') && this.isGrounded) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
        }
        
        // Actions
        if (this.input.isActionJustPressed('interact')) {
            this.interact();
        }
        
        // Inventory toggling is owned by UIManager.
        
        if (this.input.isActionActive('fire') && this.equippedWeapon) {
            this.fireWeapon();
        }
        
        if (this.input.isActionJustPressed('reload') && this.equippedWeapon) {
            this.reloadWeapon();
        }
        
        this.isAiming = this.input.isActionActive('aim');
        
        // Quick slots
        for (let i = 0; i < 4; i++) {
            if (this.input.isActionJustPressed(`quick${i + 1}`)) {
                this.useQuickSlot(i);
            }
        }
        
        // Flashlight
        if (this.input.isActionJustPressed('flashlight')) {
            this.toggleFlashlight();
        }
    }

    controllerAimGain(){
        const settings=this.input.options||{},magnitude=Math.hypot(this.input.controller.look.x,this.input.controller.look.y),aiming=this.input.isActionActive('aim'),strength=(settings.controllerAimAssist??15)/100;
        if(!aiming||!strength||magnitude<=.001||magnitude>.65)return 1;
        const now=performance.now();if(now<(this._nextAssistCheck||0))return this._assistGain||1;this._nextAssistCheck=now+100;this._assistGain=1;
        this._assistDirection ||=new THREE.Vector3();this._assistTarget ||=new THREE.Vector3();this._assistForward ||=new THREE.Vector3();this.camera.getWorldDirection(this._assistForward);let inspected=0,rays=0;
        for(const entity of this.game.worldManager?.entities?.values()||[]){if(++inspected>64)break;if(!entity.tags?.has('enemy')||entity.isActive===false||entity.alive===false||entity.aiState==='dead'||!entity.mesh)continue;
            this._assistTarget.copy(entity.position);this._assistTarget.y+=1.2;this._assistDirection.copy(this._assistTarget).sub(this.camera.position);const distance=this._assistDirection.length();if(distance<.5||distance>35)continue;this._assistDirection.divideScalar(distance);const angle=Math.acos(Math.max(-1,Math.min(1,this._assistDirection.dot(this._assistForward))));if(angle>1.5*Math.PI/180)continue;
            if(++rays>2)break;const hit=this.game.worldManager.raycast(this.camera.position,this._assistDirection,distance),owner=hit?.object;let belongs=false;for(let o=owner;o;o=o.parent)if(o===entity.mesh)belongs=true;const visible=!hit||belongs;
            const gain=frictionGain(strength,{aiming,visible,distance,angle,magnitude});if(gain<1){this._assistGain=gain;break;}
        }return this._assistGain;
    }

    updateNoclipMovement(deltaTime) {
        // Fly mode: no gravity, no collisions. Space = up, C/Ctrl = down.
        const movementInput = this.input ? this.input.getMovementInput() : { x: 0, z: 0 };
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        const speed = this.moveSpeed * 2;
        const vel = new THREE.Vector3();
        vel.addScaledVector(forward, -movementInput.z * speed);
        vel.addScaledVector(right, movementInput.x * speed);
        if (this.input?.isActionActive('jump')) vel.y += speed;
        if (this.input?.isActionActive('crouch')) vel.y -= speed;
        this.position.addScaledVector(vel, deltaTime);
        this.velocity.set(0, 0, 0);
        this.isGrounded = false;
    }

    updateMovement(deltaTime) {
        if (this.noclip) { this.updateNoclipMovement(deltaTime); return; }
        const movementInput = this.input ? this.input.getMovementInput() : { x: 0, z: 0 };
        
        // Calculate movement direction relative to camera
        const forward = _pTmpV1.set(0, 0, -1);
        const right = _pTmpV2.set(1, 0, 0);
        
        forward.applyAxisAngle(_pTmpUp, this.cameraYaw);
        right.applyAxisAngle(_pTmpUp, this.cameraYaw);
        
        // Calculate target speed
        let speed = this.moveSpeed;
        // Apply powerup move speed bonus (capped at +50%)
        if (this.game?.powerupSystem) {
            const bonus = this.game.powerupSystem.getStat('moveSpeed');
            speed *= (1 + Math.min(bonus, 0.5));
        }
        if (this.isSprinting) speed *= this.sprintMultiplier;
        if (this.isCrouching) speed *= this.crouchMultiplier;
        // Encumbrance: a heavy pack slows you down (Elder Scrolls-style)
        const enc = this.game?.inventorySystem?.getEncumbrance?.() || 0;
        if (enc > 0.8) speed *= 0.85;
        if (enc > 0.95) speed *= 0.8;
        
        // Calculate desired horizontal velocity
        const targetVelocity = _pTmpV3.set(0, 0, 0);
        targetVelocity.addScaledVector(forward, -movementInput.z * speed);
        targetVelocity.addScaledVector(right, movementInput.x * speed);
        
        // Check if there's input
        const hasInput = Math.abs(movementInput.x) > 0.01 || Math.abs(movementInput.z) > 0.01;
        
        // Choose friction based on grounded state and input
        let friction;
        if (this.isGrounded) {
            friction = hasInput ? this.groundFriction : this.stopFriction;
        } else {
            friction = this.airFriction;
        }
        
        // Smoothly interpolate horizontal velocity
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocity.x, friction * deltaTime);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocity.z, friction * deltaTime);
        
        // Apply wall collision if enabled
        if (this.collisionEnabled && this.world && !this.game.physicsSystem?.world) {
            const horizontalVelocity = _pTmpV4.set(this.velocity.x, 0, this.velocity.z);
            const adjustedVelocity = this.checkWallCollisions(horizontalVelocity, deltaTime);
            this.velocity.x = adjustedVelocity.x;
            this.velocity.z = adjustedVelocity.z;
        }
        
        // Apply gravity only when not grounded
        if (!this.isGrounded) {
            this.velocity.y += this.gravity * deltaTime;
        }
        
        // Update position (separate axes for better collision handling)
        if(this.game.physicsSystem?.world&&this.collisionEnabled) {
            this.game.physicsSystem.movePlayer(this,_pTmpV4.copy(this.velocity).multiplyScalar(deltaTime));
        } else {
            this.position.x+=this.velocity.x*deltaTime;this.position.z+=this.velocity.z*deltaTime;this.position.y+=this.velocity.y*deltaTime;
            this.checkGroundCollision();
        }
        
        // Update crouch height
        const targetHeight = this.isCrouching ? this.crouchHeight : this.height;
        this.currentHeight = THREE.MathUtils.lerp(this.currentHeight, targetHeight, 10 * deltaTime);
        
        // Safety check to prevent falling below minimum ground level
        if (this.position.y < this.minGroundLevel) {
            this.position.y = this.minGroundLevel;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }

    /**
     * Check for wall collisions (horizontal only)
     * @param {THREE.Vector3} horizontalVelocity - Horizontal movement velocity
     * @param {number} deltaTime - Time since last frame
     * @returns {THREE.Vector3} - Adjusted movement vector
     */
    checkWallCollisions(horizontalVelocity, deltaTime) {
        if (!this.world || !this.world.scene) return horizontalVelocity;
        
        // Skip if barely moving
        if (horizontalVelocity.lengthSq() < 0.0001) {
            return horizontalVelocity;
        }
        
        const result = horizontalVelocity.clone();
        const movementDir = horizontalVelocity.clone().normalize();
        const movementDistance = horizontalVelocity.length() * deltaTime + this.collisionRadius;
        
        const ray = new THREE.Raycaster();
        
        // Check at multiple heights ABOVE ground to avoid hitting floor
        const checkHeights = [
            this.currentHeight * 0.3,  // Knee level
            this.currentHeight * 0.5,  // Waist level
            this.currentHeight * 0.8   // Chest level
        ];
        
        let blocked = false;
        let minAllowedFraction = 1.0;
        let collisionNormal = _pTmpV5.set(0, 0, 0);
        const targets = this.world.getNearbyColliders(this.position, movementDistance)
            .filter(obj => obj !== this.world.terrainMesh);
        
        for (const height of checkHeights) {
            const rayOrigin = new THREE.Vector3(
                this.position.x,
                this.position.y + height,
                this.position.z
            );
            
            ray.set(rayOrigin, movementDir);
            ray.far = movementDistance;
            
            const intersections = ray.intersectObjects(targets, true);
            
            for (const intersection of intersections) {
                // Skip non-collidable objects
                if (!intersection.object.userData?.isCollidable) {
                    continue;
                }
                
                // Check if this is a wall (not floor) by checking the normal
                if (intersection.face) {
                    const normal = intersection.face.normal.clone();
                    normal.transformDirection(intersection.object.matrixWorld);
                    
                    // If normal points mostly up, it's a floor - skip it
                    if (normal.y > this.groundNormalThreshold) {
                        continue;
                    }
                    
                    collisionNormal.copy(normal);
                }
                
                const distance = intersection.distance;
                if (distance < movementDistance) {
                    blocked = true;
                    const allowedDistance = Math.max(0, distance - this.collisionRadius);
                    const fraction = allowedDistance / movementDistance;
                    if (fraction < minAllowedFraction) {
                        minAllowedFraction = fraction;
                    }
                }
            }
        }
        
        if (blocked) {
            // Apply slide along wall if we have a valid normal
            if (collisionNormal.lengthSq() > 0.01) {
                // Project velocity onto the wall plane for sliding
                const dot = result.dot(collisionNormal);
                if (dot < 0) {
                    result.addScaledVector(collisionNormal, -dot);
                }
            }
            
            // Also scale by allowed fraction
            result.multiplyScalar(Math.max(minAllowedFraction, 0.1));
        }
        
        return result;
    }

    /**
     * Check if player is on ground and handle ground snapping
     */
    checkGroundCollision() {
        // Default to not grounded
        this.isGrounded = false;
        
        if (!this.world || !this.world.scene) {
            // Fallback ground check at y=0
            if (this.position.y <= 0) {
                this.position.y = 0;
                this.velocity.y = 0;
                this.isGrounded = true;
                this.lastValidGroundY = 0;
            }
            return;
        }
        
        // Cast ray downward from slightly above feet
        const rayOrigin = new THREE.Vector3(
            this.position.x,
            this.position.y + 0.1,
            this.position.z
        );
        
        const ray = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
        // Sprites (artifact glows, apparitions) live in the scene - their
        // raycast needs a camera or it throws on matrixWorld.
        if (this.game?.camera) ray.camera = this.game.camera;
        ray.far = this.groundCheckDistance + 0.1;

        // Skip the high-poly terrain mesh in this per-frame raycast (45k
        // triangles); analytic terrain height is blended in below instead.
        // Bullets and AI still raycast the terrain via WorldManager helpers.
        const targets = this.world.getNearbyColliders(this.position, this.collisionRadius)
            .filter(obj => obj !== this.world.terrainMesh);
        const intersections = ray.intersectObjects(targets, true);
        
        let foundGround = false;
        let groundY = this.position.y;
        
        for (const intersection of intersections) {
            // Skip non-collidable objects
            if (!intersection.object.userData?.isCollidable) {
                continue;
            }
            
            // Check if it's actually ground (normal pointing up)
            if (intersection.face) {
                const normal = intersection.face.normal.clone();
                normal.transformDirection(intersection.object.matrixWorld);
                
                // Only count as ground if surface is mostly flat
                if (normal.y < this.groundNormalThreshold) {
                    continue;
                }
            }
            
            const hitGroundY = intersection.point.y;
            const distanceToGround = this.position.y - hitGroundY;
            
            // If close enough to ground and moving down or stationary
            if (distanceToGround < this.groundCheckDistance && distanceToGround > -0.1) {
                if (this.velocity.y <= 0.1) {
                    foundGround = true;
                    groundY = hitGroundY;this.groundSurfaceObject=intersection.object;
                    break;
                }
            }
        }
        
        // Blend in analytic terrain height (terrain mesh was skipped above)
        if (typeof this.world.getTerrainHeight === 'function') {
            const analyticY = this.world.getTerrainHeight(this.position.x, this.position.z);
            const tDist = this.position.y - analyticY;
            if (tDist < this.groundCheckDistance && tDist > -0.1 && this.velocity.y <= 0.1) {
                if (!foundGround || analyticY > groundY) {
                    foundGround = true;
                    groundY = analyticY;this.groundSurfaceObject=null;
                }
            }
        }

        if (foundGround) {
            this.position.y = groundY;
            this.velocity.y = 0;
            this.isGrounded = true;
            this.lastValidGroundY = groundY;
            return;
        }
        
        // Fallback: use world's ground level function if available
        if (this.world.getGroundLevel) {
            const worldGroundLevel = this.world.getGroundLevel(this.position.x, this.position.z);
            if (worldGroundLevel !== null) {
                const distanceToGround = this.position.y - worldGroundLevel;
                
                if (distanceToGround < this.groundCheckDistance && 
                    distanceToGround > -0.1 && 
                    this.velocity.y <= 0.1) {
                    this.position.y = worldGroundLevel;
                    this.velocity.y = 0;
                    this.isGrounded = true;
                    this.lastValidGroundY = worldGroundLevel;this.groundSurfaceObject=null;
                    return;
                }
            }
        }
        
        // Safety: prevent falling too far below last known ground
        if (this.position.y < this.lastValidGroundY - 0.5 && this.velocity.y < 0) {
            this.position.y = this.lastValidGroundY;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }

    updateCamera(deltaTime) {
        // Camera rotation
        this.camera.rotation.set(this.cameraPitch, this.cameraYaw, 0, 'YXZ');
        
        // Camera position with head bob
        const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        const isMoving = horizontalSpeed > 0.5;
        
        const cameraMotion=motionScale(this.game?.settings);
        if (cameraMotion===0){this.bobOffset.set(0,0,0);this.bobTime=0;}else if (isMoving && this.isGrounded) {
            const bobFrequency = this.isSprinting ? 12 : 8;
            const bobAmplitude = this.isSprinting ? 0.06 : 0.03;
            
            this.bobTime += deltaTime * bobFrequency;
            this.bobOffset.y = Math.sin(this.bobTime) * bobAmplitude;
            this.bobOffset.x = Math.cos(this.bobTime * 0.5) * bobAmplitude * 0.5;
        } else {
            this.bobOffset.lerp(new THREE.Vector3(), 5 * deltaTime);
            if (!isMoving) {
                this.bobTime = 0;
            }
        }
        
        // Apply weapon sway
        if (this.isAiming) {
            this.weaponSway.lerp(new THREE.Vector3(), 10 * deltaTime);
        } else {
            const swayAmount = 0.002;
            this.weaponSway.x = Math.sin(this.bobTime * 0.5) * swayAmount;
            this.weaponSway.y = Math.cos(this.bobTime * 0.3) * swayAmount;
        }
        
        // Final camera position
        this.camera.position.set(
            this.position.x + this.bobOffset.x*cameraMotion,
            this.position.y + this.currentHeight - 0.1 + this.bobOffset.y*cameraMotion,
            this.position.z
        );
        this.game?.bodyMotionSystem?.apply(this.camera, deltaTime);
        if(!this.noclip&&this.game?.physicsSystem?.world){
            this._headOrigin ||=new THREE.Vector3();this._headOffset ||=new THREE.Vector3();
            this._headOrigin.set(this.position.x,this.position.y+this.currentHeight-.1,this.position.z);
            this._headOffset.copy(this.camera.position).sub(this._headOrigin);const length=this._headOffset.length();
            if(length>.001){this._headOffset.divideScalar(length);const safe=this.game.physicsSystem.clipCameraLean(this._headOrigin,this._headOffset,length);this.camera.position.copy(this._headOrigin).addScaledVector(this._headOffset,safe);}
        }
    }

    updateStats(deltaTime) {
        updateWounds(this,deltaTime);
        // Stamina drain/regen
        if (this.isSprinting) {
            const drain = this.game?.perkSystem?.getEffects().staminaDrain || 0;
            this.stats.stamina = Math.max(0, this.stats.stamina - 15 * (1+drain) * deltaTime);
        } else if(!this.game?.bodyMotionSystem?.breathHolding) {
            this.stats.stamina = Math.min(this.stats.maxStamina, this.stats.stamina + 10 * deltaTime);
        }
        
        // Radiation damage
        if (this.stats.radiation > 50) {
            const radDamage = (this.stats.radiation - 50) * 0.1 * deltaTime*survivalPressure(this.game?.settings?.difficulty);
            this.stats.health = Math.max(0, this.stats.health - radDamage);
        }
        
        // Check death
        if (this.stats.health <= 0) {
            this.die();
        }
    }

    updateInteraction() {
        if (!this.world || !this.world.scene) return;
        
        // Raycast for interaction
        const raycaster = new THREE.Raycaster();
        raycaster.camera = this.camera;
        raycaster.far = this.interactionRange;
        raycaster.set(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
        
        // Check for interactive objects
        // Query interactive roots only. Raycasting the entire city also hit
        // buildings, debris instances and effects before discarding them.
        const targets = [];
        const visit = object => {
            if (object.userData?.isInteractive) { targets.push(object); return; }
            for (const child of object.children) visit(child);
        };
        visit(this.world.scene);
        const intersections = raycaster.intersectObjects(targets, true);
        let closestObject = null;
        let closestDistance = this.interactionRange;
        
        for (const intersection of intersections) {
            if (intersection.distance >= closestDistance) continue;
            // Metadata may live on a parent group (e.g. loot containers are
            // Groups whose child meshes are what the ray actually hits)
            let obj = intersection.object;
            while (obj && !obj.userData?.isInteractive) obj = obj.parent;
            if (obj) {
                closestObject = obj;
                closestDistance = intersection.distance;
            }
        }
        
        // A nearby wall must block interactions even when an item is in range.
        if (closestObject) {
            raycaster.far = Math.max(0, closestDistance - 0.04);
            const blockers = this.world.getNearbyColliders?.(this.camera.position, this.interactionRange) || [];
            if (raycaster.intersectObjects(blockers, true).length) closestObject = null;
        }
        this.lookingAt = closestObject;
    }

    takeDamage(amount, source) {
        if (this.godMode) return; // dev god mode
        amount=incomingDamage(amount,this.game?.settings?.difficulty,source);
        // Apply powerup damage resistance (capped at 75%)
        if (this.game?.powerupSystem) {
            const resist = this.game.powerupSystem.getStat('damageResist');
            amount = amount * (1 - Math.min(resist, 0.75));
        }
        this.stats.health = Math.max(0, this.stats.health - amount);
        addWound(this,amount,source);
        
        // Screen shake effect
        if (this.game) {
            this.game.cameraShake(0.3, 0.2);
        }
        
        globalEventBus.emit('player:injured', { amount, source });
        
        if (this.stats.health <= 0) {
            this.die();
        }
    }

    heal(amount) {
        this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
        globalEventBus.emit(GameEvents.PLAYER_HEAL, { amount });
    }

    addRadiation(amount) {
        this.stats.radiation = Math.min(this.stats.maxRadiation, this.stats.radiation + amount);
    }

    removeRadiation(amount) {
        this.stats.radiation = Math.max(0, this.stats.radiation - amount);
    }

    interact() {
        if (this.lookingAt) {
            globalEventBus.emit(GameEvents.PLAYER_INTERACT, { target: this.lookingAt });
        }
    }

    fireWeapon() {
        if (!this.equippedWeapon) return;
        globalEventBus.emit(GameEvents.WEAPON_FIRE, { weapon: this.equippedWeapon });
    }

    reloadWeapon() {
        if (!this.equippedWeapon) return;
        globalEventBus.emit(GameEvents.WEAPON_RELOAD, { weapon: this.equippedWeapon });
    }

    useQuickSlot(index) {this.game.inventorySystem?.useQuickSlot(index);}

    toggleFlashlight() {
        // Toggle flashlight logic
    }

    die() {
        if(!this.isActive)return;
        this.isActive = false;
        globalEventBus.emit(GameEvents.PLAYER_DEATH);
    }

    serialize() {
        return {
            ...super.serialize(),
            stats: { ...this.stats },
            inventory: this.inventory,
            cameraYaw: this.cameraYaw,
            cameraPitch: this.cameraPitch
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.stats = { ...data.stats };
        this.inventory = data.inventory;
        this.cameraYaw = data.cameraYaw;
        this.cameraPitch = data.cameraPitch;
    }
}
