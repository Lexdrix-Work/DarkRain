import * as THREE from 'three';
import { Entity } from './Entity.js';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Build a low-poly humanoid figure (faces +Z). Returns { group, limbs }.
 * opts: skin, top, bottom colors; hunch (0-1); armLen; spikes; eyes color
 */
function buildHumanoid(opts = {}) {
    const {
        skin = 0x8a7f6a, top = 0x3a3f45, bottom = 0x2c2c30,
        hunch = 0, armLen = 0.7, spikes = false, eyeColor = 0xff2222,
        hat = null, rifle = false
    } = opts;
    const group = new THREE.Group();
    const limbs = {};
    const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });

    const part = (w, h, d, material, x, y, z) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        group.add(mesh);
        return mesh;
    };
    // Limb with pivot at the joint so it can swing
    const limb = (w, h, d, material, px, py, pz) => {
        const pivot = new THREE.Group();
        pivot.position.set(px, py, pz);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.y = -h / 2;
        mesh.castShadow = true;
        pivot.add(mesh);
        group.add(pivot);
        return pivot;
    };

    const skinMat = mat(skin), topMat = mat(top), botMat = mat(bottom);

    // Legs (hip pivots at y=0.95)
    limbs.legL = limb(0.2, 0.9, 0.24, botMat, -0.14, 0.95, 0);
    limbs.legR = limb(0.2, 0.9, 0.24, botMat, 0.14, 0.95, 0);
    // Boots
    part(0.22, 0.12, 0.34, mat(0x1a1a1c, 0.9), -0.14, 0.06, 0.04);
    part(0.22, 0.12, 0.34, mat(0x1a1a1c, 0.9), 0.14, 0.06, 0.04);

    // Torso (leans forward with hunch)
    const torso = part(0.56, 0.68, 0.32, topMat, 0, 1.32 - hunch * 0.15, -hunch * 0.08);
    torso.rotation.x = hunch * 0.45;

    // Shoulder pivots (move forward/down with hunch)
    const shY = 1.58 - hunch * 0.28, shZ = hunch * 0.12;
    limbs.armL = limb(0.16, armLen, 0.18, topMat, -0.37, shY, shZ);
    limbs.armR = limb(0.16, armLen, 0.18, topMat, 0.37, shY, shZ);
    // Hands
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.16), skinMat);
    handL.position.y = -armLen - 0.05; handL.castShadow = true;
    limbs.armL.add(handL);
    const handR = handL.clone(); limbs.armR.add(handR);

    // Head (pushed forward with hunch)
    const headY = 1.82 - hunch * 0.35, headZ = hunch * 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skinMat);
    head.position.set(0, headY, headZ);
    head.castShadow = true;
    group.add(head);
    // Glowing eyes on +Z face
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
        eye.position.set(sx * 0.075, headY + 0.02, headZ + 0.155);
        group.add(eye);
    }

    if (hat === 'cap') {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.09, 10), mat(0x4a3b28, 0.9));
        cap.position.set(0, headY + 0.16, headZ);
        group.add(cap);
    } else if (hat === 'hood') {
        const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 8), topMat);
        hood.position.set(0, headY + 0.18, headZ - 0.04);
        group.add(hood);
    }

    if (rifle) {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.85),
            new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5, metalness: 0.6 }));
        gun.position.set(0.12, 1.25, 0.3);
        gun.rotation.x = -0.08;
        gun.castShadow = true;
        group.add(gun);
    }

    if (spikes) {
        const spikeMat = mat(0x1c1c1c, 0.9);
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 5), spikeMat);
            spike.position.set((i - 2) * 0.11, 1.62 - Math.abs(i - 2) * 0.05, -0.2 - hunch * 0.1);
            spike.rotation.x = -0.5;
            group.add(spike);
        }
    }

    return { group, limbs };
}

/**
 * AI States for enemy behavior
 */
export // Reusable temp vectors (avoid per-frame GC pressure)
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

// Smooth easing functions for animations
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smoothstep = (t) => t * t * (3 - 2 * t);

const AIState = {
    IDLE: 'idle',
    PATROL: 'patrol',
    ALERT: 'alert',
    CHASE: 'chase',
    ATTACK: 'attack',
    FLEE: 'flee',
    DEAD: 'dead'
};

/**
 * Enemy - Base class for hostile NPCs
 */
export class Enemy extends Entity {
    constructor(options = {}) {
        super({ name: options.name || 'Enemy', tags: ['enemy', 'hostile'], ...options });
        
        // Stats
        this.health = options.health || 100;
        this.maxHealth = options.maxHealth || 100;
        this.damage = options.damage || 10;
        this.armor = options.armor || 0;
        
        // Movement
        this.moveSpeed = options.moveSpeed || 3;
        this.runSpeed = options.runSpeed || 6;
        this.turnSpeed = options.turnSpeed || 3;
        this.velocity = new THREE.Vector3();
        
        // AI
        this.aiState = AIState.IDLE;
        this.target = null;
        this.lastKnownTargetPosition = new THREE.Vector3();
        this.alertLevel = 0; // 0-100
        this.maxAlertLevel = 100;
        
        // Perception
        this.sightRange = options.sightRange || 30;
        this.sightAngle = options.sightAngle || Math.PI / 3; // 60 degrees
        this.hearingRange = options.hearingRange || 15;
        this.attackRange = options.attackRange || 2;
        
        // Patrol
        this.patrolPoints = options.patrolPoints || [];
        this.currentPatrolIndex = 0;
        this.waitTime = 0;
        this.maxWaitTime = options.maxWaitTime || 3;
        
        // Combat
        this.attackCooldown = 0;
        this.attackRate = options.attackRate || 1; // attacks per second
        this.canAttack = true;
        
        // Animation state
        this.animationState = 'idle';
        
        // Pathfinding (simplified)
        this.currentPath = [];
        this.pathIndex = 0;
    }

    init(game) {
        super.init(game);
        
        // Create basic mesh (placeholder)
        this.createMesh();
        
        // Register with world manager for updates
        if (game.worldManager) {
            game.worldManager.registerEnemy(this);
        }
    }

    createMesh() {
        // Gaunt anomaly stalker - humanoid figure
        const { group, limbs } = buildHumanoid({
            skin: 0x7d8a6f, top: 0x35383d, bottom: 0x26262a,
            hunch: 0.35, armLen: 0.8, eyeColor: 0xff2222, hat: 'hood'
        });
        this.limbs = limbs;
        this.walkPhase = 0;
        this.setMesh(group);
    }

    update(deltaTime) {
        if (this.aiState === AIState.DEAD) {
            // Keep death animation playing even though AI is off.
            // (No super.update: it would overwrite the animated mesh transform.)
            this.updateDeathAnimation(deltaTime);
            return;
        }
        if (!this.isActive) return;

        // AI THROTTLE: perception and decisions at 10Hz (cheap trick, no visual loss)
        // Movement and animation stay at full framerate for smoothness
        this._aiTimer = (this._aiTimer || 0) + deltaTime;
        if (this._aiTimer >= 0.1) {
            this.updatePerception(this._aiTimer);
            this.updateAI(this._aiTimer);
            this.updateCombat(this._aiTimer);
            this._aiTimer = 0;
        }
        this.updateMovement(deltaTime);
        this.updateWalkAnimation(deltaTime);
        this.updateDeathAnimation(deltaTime);
        
        super.update(deltaTime);
    }

    updatePerception(deltaTime) {
        // Get player reference
        const player = this.game?.player;
        if (!player) return;
        
        const distanceToPlayer = this.distanceTo(player);
        const directionToPlayer = _tmpV1
            .subVectors(player.position, this.position)
            .normalize();

        const forward = _tmpV2.set(0, 0, -1)
            .applyEuler(this.rotation);
        
        const angle = forward.angleTo(directionToPlayer);
        
        // Check line of sight
        let canSeePlayer = false;
        if (distanceToPlayer <= this.sightRange && angle <= this.sightAngle) {
            // Simplified LOS check - in real implementation, use raycasting
            canSeePlayer = true;
        }
        
        // Update alert level
        if (canSeePlayer) {
            this.alertLevel = Math.min(this.maxAlertLevel, this.alertLevel + 50 * deltaTime);
            this.lastKnownTargetPosition.copy(player.position);
            this.target = player;
        } else {
            this.alertLevel = Math.max(0, this.alertLevel - 10 * deltaTime);
            if (this.alertLevel === 0) {
                this.target = null;
            }
        }
        
        // Check for sounds (placeholder for sound system integration)
        // if (soundNearby && distanceToSound <= this.hearingRange) {
        //     this.alertLevel = Math.min(this.maxAlertLevel, this.alertLevel + 20);
        // }
    }

    updateAI(deltaTime) {
        // State machine
        switch (this.aiState) {
            case AIState.IDLE:
                this.handleIdleState(deltaTime);
                break;
            case AIState.PATROL:
                this.handlePatrolState(deltaTime);
                break;
            case AIState.ALERT:
                this.handleAlertState(deltaTime);
                break;
            case AIState.CHASE:
                this.handleChaseState(deltaTime);
                break;
            case AIState.ATTACK:
                this.handleAttackState(deltaTime);
                break;
            case AIState.FLEE:
                this.handleFleeState(deltaTime);
                break;
        }
        
        // State transitions based on alert level
        this.updateStateTransitions();
    }

    updateStateTransitions() {
        if (this.aiState === AIState.DEAD) return;
        
        const distanceToTarget = this.target ? this.distanceTo(this.target) : Infinity;
        
        // High alert - combat states
        if (this.alertLevel >= 80) {
            if (distanceToTarget <= this.attackRange) {
                this.changeState(AIState.ATTACK);
            } else if (this.target) {
                this.changeState(AIState.CHASE);
            }
        }
        // Medium alert - investigation
        else if (this.alertLevel >= 30) {
            this.changeState(AIState.ALERT);
        }
        // Low alert - passive behavior
        else {
            if (this.patrolPoints.length > 0) {
                this.changeState(AIState.PATROL);
            } else {
                this.changeState(AIState.IDLE);
            }
        }
        
        // Low health - consider fleeing
        if (this.health < this.maxHealth * 0.2) {
            this.changeState(AIState.FLEE);
        }
    }

    changeState(newState) {
        if (this.aiState === newState) return;
        
        const oldState = this.aiState;
        this.aiState = newState;
        
        // State entry actions
        switch (newState) {
            case AIState.ALERT:
                globalEventBus.emit(GameEvents.ENEMY_ALERT, { enemy: this, level: this.alertLevel });
                break;
            case AIState.CHASE:
                this.animationState = 'run';
                break;
            case AIState.ATTACK:
                this.animationState = 'attack';
                break;
        }
    }

    handleIdleState(deltaTime) {
        this.animationState = 'idle';
        // Random looking around
        this.waitTime += deltaTime;
        if (this.waitTime >= this.maxWaitTime) {
            this.waitTime = 0;
            // Random rotation
            this.rotation.y += (Math.random() - 0.5) * Math.PI / 2;
        }
    }

    handlePatrolState(deltaTime) {
        if (this.patrolPoints.length === 0) return;
        
        this.animationState = 'walk';
        
        const targetPoint = this.patrolPoints[this.currentPatrolIndex];
        const distance = this.position.distanceTo(targetPoint);
        
        if (distance < 1) {
            // Reached patrol point
            this.waitTime += deltaTime;
            this.animationState = 'idle';
            
            if (this.waitTime >= this.maxWaitTime) {
                this.waitTime = 0;
                this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
            }
        } else {
            // Move to patrol point
            this.moveTowards(targetPoint, this.moveSpeed, deltaTime);
        }
    }

    handleAlertState(deltaTime) {
        this.animationState = 'alert';
        
        // Move towards last known position
        if (this.lastKnownTargetPosition) {
            const distance = this.position.distanceTo(this.lastKnownTargetPosition);
            
            if (distance > 1) {
                this.moveTowards(this.lastKnownTargetPosition, this.moveSpeed, deltaTime);
            } else {
                // Search behavior
                this.waitTime += deltaTime;
                if (this.waitTime >= 2) {
                    this.waitTime = 0;
                    this.rotation.y += (Math.random() - 0.5) * Math.PI;
                }
            }
        }
    }

    handleChaseState(deltaTime) {
        if (!this.target) {
            this.changeState(AIState.ALERT);
            return;
        }
        
        this.animationState = 'run';
        
        const distanceToTarget = this.distanceTo(this.target);
        
        if (distanceToTarget <= this.attackRange) {
            this.changeState(AIState.ATTACK);
        } else {
            this.moveTowards(this.target.position, this.runSpeed, deltaTime);
            this.lastKnownTargetPosition.copy(this.target.position);
        }
    }

    handleAttackState(deltaTime) {
        if (!this.target) {
            this.changeState(AIState.ALERT);
            return;
        }
        
        const distanceToTarget = this.distanceTo(this.target);
        
        // Face target
        this.lookAtTarget(this.target.position, deltaTime);
        
        if (distanceToTarget > this.attackRange * 1.5) {
            this.changeState(AIState.CHASE);
            return;
        }
        
        // Attack logic
        if (this.canAttack) {
            this.performAttack();
        }
    }

    handleFleeState(deltaTime) {
        this.animationState = 'run';
        
        if (!this.target) {
            this.changeState(AIState.IDLE);
            return;
        }
        
        // Run away from target
        const fleeDirection = new THREE.Vector3()
            .subVectors(this.position, this.target.position)
            .normalize();
        
        const fleeTarget = new THREE.Vector3()
            .addVectors(this.position, fleeDirection.multiplyScalar(10));
        
        this.moveTowards(fleeTarget, this.runSpeed, deltaTime);
        
        // Stop fleeing if far enough
        if (this.distanceTo(this.target) > this.sightRange * 1.5) {
            this.alertLevel = 0;
            this.changeState(AIState.IDLE);
        }
    }

    moveTowards(targetPosition, speed, deltaTime) {
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.position)
            .setY(0)
            .normalize();
        
        // Update velocity
        this.velocity.x = direction.x * speed;
        this.velocity.z = direction.z * speed;
        
        // Apply movement
        this.position.addScaledVector(this.velocity, deltaTime);
        
        // Face movement direction
        this.lookAtTarget(targetPosition, deltaTime);
    }

    lookAtTarget(targetPosition, deltaTime) {
        const direction = new THREE.Vector3()
            .subVectors(targetPosition, this.position)
            .setY(0);
        
        if (direction.lengthSq() > 0.001) {
            const targetRotation = Math.atan2(direction.x, direction.z);
            
            // Smooth rotation
            let rotationDiff = targetRotation - this.rotation.y;
            
            // Normalize to -PI to PI
            while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
            while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
            
            this.rotation.y += rotationDiff * this.turnSpeed * deltaTime;
        }
    }

    updateWalkAnimation(deltaTime) {
        if (!this.limbs) return;
        // Attack swipe overrides walk cycle
        if (this._attackAnim !== undefined && this._attackAnim < 1) {
            this._attackAnim = Math.min(1, this._attackAnim + deltaTime * 3);
            const t = this._attackAnim;
            // Ease-out for snappy attack, smooth return
            const eased = t < 0.4 ? easeOut(t / 0.4) : 1 - easeInOut((t - 0.4) / 0.6);
            const raise = Math.sin(eased * Math.PI);
            this.limbs.armL.rotation.x = -1.8 * raise;
            this.limbs.armR.rotation.x = -1.8 * raise;
            this.limbs.armL.rotation.z = 0.4 * raise;
            this.limbs.armR.rotation.z = -0.4 * raise;
            if (t >= 1) this._attackAnim = undefined;
            return;
        }
        // Idle breathing when still
        const t = (this._idleT = (this._idleT || 0) + deltaTime);
        // Measure horizontal speed from position delta
        if (!this._lastAnimPos) this._lastAnimPos = this.position.clone();
        const dx = this.position.x - this._lastAnimPos.x;
        const dz = this.position.z - this._lastAnimPos.z;
        const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(deltaTime, 0.001);
        this._lastAnimPos.copy(this.position);
        
        const moving = speed > 0.3;
        const targetAmp = moving ? 0.55 : 0;
        const ampDelta = targetAmp - (this._limbAmp ?? 0);
        // Smoothstep easing for buttery transitions
        const easeT = smoothstep(Math.min(1, deltaTime * 6));
        this._limbAmp = (this._limbAmp ?? 0) + ampDelta * easeT;
        if (moving) this.walkPhase = (this.walkPhase || 0) + deltaTime * (4 + speed * 0.8);
        const p = this.walkPhase || 0, a = this._limbAmp || 0;
        this.limbs.legL.rotation.x = Math.sin(p) * a;
        this.limbs.legR.rotation.x = Math.sin(p + Math.PI) * a;
        this.limbs.armL.rotation.x = Math.sin(p + Math.PI) * a * 0.8;
        this.limbs.armR.rotation.x = Math.sin(p) * a * 0.8;
        // Subtle idle sway/breathing layered on top
        const breathe = Math.sin(t * 2.2) * 0.04 * (1 - Math.min(1, a * 2));
        this.limbs.armL.rotation.x += breathe;
        this.limbs.armR.rotation.x -= breathe;
        if (this.mesh) this.mesh.position.y += Math.sin(t * 2.2) * 0.008 * (1 - Math.min(1, a * 2));
    }

    updateDeathAnimation(deltaTime) {
        if (this._deathAnim === undefined || !this.mesh) return;
        this._deathAnim = Math.min(1, this._deathAnim + deltaTime * 2.2);
        const t = this._deathAnim;
        // Ease-out fall to the side
        const e = 1 - Math.pow(1 - t, 3);
        this.mesh.rotation.z = e * (Math.PI / 2) * 0.9;
        this.mesh.rotation.x = e * 0.25;
        // Slight sink at the end
        if (t > 0.6) this.mesh.position.y -= deltaTime * 0.25 * (t - 0.6);
        // Deactivate once the fall completes (stops further updates)
        if (t >= 1) {
            this.isActive = false;
            this._deathAnim = undefined;
        }
    }

    updateMovement(deltaTime) {

        // Follow rolling terrain instead of assuming a flat world
        let groundY = 0;
        const wm = this.game && this.game.worldManager;
        if (wm && typeof wm.getTerrainHeight === 'function') {
            groundY = wm.getTerrainHeight(this.position.x, this.position.z);
        }

        // Apply gravity (simplified)
        if (this.position.y > groundY + 0.02) {
            this.velocity.y -= 25 * deltaTime;
            this.position.y += this.velocity.y * deltaTime;
        }

        if (this.position.y < groundY) {
            this.position.y = groundY;
            this.velocity.y = 0;
        }
    }

    updateCombat(deltaTime) {
        // Update attack cooldown
        if (!this.canAttack) {
            this.attackCooldown -= deltaTime;
            if (this.attackCooldown <= 0) {
                this.canAttack = true;
            }
        }
    }

    createMesh() {
        // Bandit - human scavenger with cap and rifle
        const { group, limbs } = buildHumanoid({
            skin: 0x9a8266, top: 0x5d4a33, bottom: 0x3a3f4a,
            hunch: 0.1, armLen: 0.7, eyeColor: 0xffeeaa, hat: 'cap', rifle: true
        });
        this.limbs = limbs;
        this.walkPhase = 0;
        this.setMesh(group);
    }

    performAttack() {
        if (!this.target || !this.canAttack) return;

        // Attack animation: arms raise then swipe
        this._attackAnim = 0;
        this.canAttack = false;
        this.attackCooldown = 1 / this.attackRate;
        
        // Deal damage to target
        if (this.target.takeDamage) {
            this.target.takeDamage(this.damage, this);
        }
        
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: `${this.name} attacks!`,
            type: 'combat'
        });
    }

    takeDamage(amount, source) {
        // Apply armor reduction
        const actualDamage = Math.max(1, amount - this.armor);
        this.health -= actualDamage;
        
        // Increase alert level
        this.alertLevel = this.maxAlertLevel;
        if (source) {
            this.target = source;
            this.lastKnownTargetPosition.copy(source.position);
        }
        
        // Visual feedback - flash all child materials red (mesh may be a Group)
        if (this.mesh) {
            const mats = [];
            this.mesh.traverse((child) => {
                if (child.isMesh && child.material && child.material.color) {
                    mats.push({ mat: child.material, color: child.material.color.clone() });
                    child.material.color.setHex(0xff2222);
                }
            });
            setTimeout(() => {
                for (const { mat, color } of mats) mat.color.copy(color);
            }, 100);
        }
        
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.aiState = AIState.DEAD;
        // Keep isActive true so update() runs the death animation;
        // deactivated in updateDeathAnimation when the fall completes.
        this.isCollidable = false;
        this.alive = false;
        
        // Death animation: smooth fall + sink (updated in updateDeathAnimation)
        this._deathAnim = 0;
        
        globalEventBus.emit(GameEvents.ENEMY_DEATH, { enemy: this });
        
        // Drop loot
        this.dropLoot();
        
        // Remove after delay
        setTimeout(() => {
            this.destroy();
        }, 30000);
    }

    dropLoot() {
        // Override in subclasses or use loot table system
        const lootTable = [
            { item: 'ammo_pistol', chance: 0.5, amount: [5, 15] },
            { item: 'medkit_small', chance: 0.3, amount: [1, 1] },
            { item: 'bandage', chance: 0.4, amount: [1, 3] }
        ];
        
        // Emit corpse event - the LootSystem turns the kill into a
        // searchable body instead of floating loot cubes
        globalEventBus.emit('loot:corpse', {
            position: this.position.clone(),
            kind: this.tags?.has('mutant') ? 'mutant' : 'human',
            lootTable
        });
    }

    /**
     * Set patrol route
     * @param {THREE.Vector3[]} points - Array of patrol points
     */
    setPatrolRoute(points) {
        this.patrolPoints = points;
        this.currentPatrolIndex = 0;
        if (points.length > 0 && this.alertLevel < 30) {
            this.changeState(AIState.PATROL);
        }
    }

    serialize() {
        return {
            ...super.serialize(),
            health: this.health,
            maxHealth: this.maxHealth,
            aiState: this.aiState,
            alertLevel: this.alertLevel,
            patrolPoints: this.patrolPoints.map(p => p.toArray()),
            currentPatrolIndex: this.currentPatrolIndex
        };
    }

    deserialize(data) {
        super.deserialize(data);
        this.health = data.health;
        this.maxHealth = data.maxHealth;
        this.aiState = data.aiState;
        this.alertLevel = data.alertLevel;
        this.patrolPoints = data.patrolPoints.map(p => new THREE.Vector3().fromArray(p));
        this.currentPatrolIndex = data.currentPatrolIndex;
    }
}

/**
 * Mutant Enemy - Example subclass for Zone mutants
 */
export class Mutant extends Enemy {
    constructor(options = {}) {
        super({
            name: options.name || 'Mutant',
            health: 150,
            damage: 25,
            moveSpeed: 4,
            runSpeed: 8,
            sightRange: 25,
            attackRange: 2.5,
            ...options
        });
        
        this.tags.add('mutant');
        this.mutantType = options.mutantType || 'bloodsucker';
    }

    createMesh() {
        // Hulking mutant brute - hunched, spiked, long arms
        const { group, limbs } = buildHumanoid({
            skin: 0x4a5d3a, top: 0x3d4a2f, bottom: 0x2e3823,
            hunch: 0.85, armLen: 1.0, spikes: true, eyeColor: 0xffcc00
        });
        group.scale.setScalar(1.25);
        this.limbs = limbs;
        this.walkPhase = 0;
        this.setMesh(group);
    }
}

/**
 * Human Enemy - Bandits, military, etc.
 */
export class HumanEnemy extends Enemy {
    constructor(options = {}) {
        super({
            name: options.name || 'Bandit',
            health: 100,
            damage: 15,
            armor: 5,
            moveSpeed: 3,
            runSpeed: 6,
            sightRange: 40,
            attackRange: 30, // Ranged
            attackRate: 0.5,
            ...options
        });
        
        this.tags.add('human');
        this.faction = options.faction || 'bandit';
        this.hasWeapon = true;
        this.accuracy = options.accuracy || 0.7;
    }

    performAttack() {
        if (!this.target || !this.canAttack) return;
        
        this.canAttack = false;
        this.attackCooldown = 1 / this.attackRate;
        
        // Ranged attack - accuracy check
        if (Math.random() < this.accuracy) {
            if (this.target.takeDamage) {
                this.target.takeDamage(this.damage, this);
            }
        }
        
        // Muzzle flash effect
        globalEventBus.emit('weapon:enemy_fire', {
            position: this.position.clone(),
            direction: new THREE.Vector3().subVectors(this.target.position, this.position).normalize()
        });
    }
}

/**
 * PackHound - Fast pack predator. Circles prey at range, darts in to bite.
 * Always spawns in packs of 3-5; the pack shares a target.
 */
export class PackHound extends Enemy {
    constructor(options = {}) {
        super({
            name: options.name || 'Pack Hound',
            health: 45,
            damage: 9,
            armor: 0,
            moveSpeed: 5,
            runSpeed: 11,
            sightRange: 35,
            attackRange: 2.2,
            attackRate: 1.4,
            ...options
        });

        this.tags.add('mutant');
        this.mutantType = 'packhound';
        this.packId = options.packId || null;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        this.circleRadius = 6 + Math.random() * 3;
    }

    createMesh() {
        const group = new THREE.Group();
        const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
        const flesh = mat(0x5a4a3a);
        const dark = mat(0x3a2f24);

        // Low-slung body
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.5), flesh);
        body.position.y = 0.55;
        body.castShadow = true;
        group.add(body);

        // Four legs
        this.legPivots = [];
        for (const [lx, lz] of [[-0.4, 0.18], [0.4, 0.18], [-0.4, -0.18], [0.4, -0.18]]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), dark);
            leg.position.set(lx, 0.28, lz);
            leg.castShadow = true;
            group.add(leg);
            this.legPivots.push(leg);
        }

        // Head with jaw
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.34), flesh);
        head.position.set(0.72, 0.72, 0);
        head.castShadow = true;
        group.add(head);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.28), dark);
        jaw.position.set(0.78, 0.55, 0);
        group.add(jaw);

        // Glowing eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        for (const ez of [0.1, -0.1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
            eye.position.set(0.93, 0.78, ez);
            group.add(eye);
        }

        // Spiked back ridges
        for (let i = 0; i < 4; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), dark);
            spike.position.set(-0.35 + i * 0.24, 0.85, 0);
            group.add(spike);
        }

        // Tail
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), dark);
        tail.position.set(-0.75, 0.68, 0);
        tail.rotation.z = 0.5;
        group.add(tail);

        group.rotation.y = -Math.PI / 2; // face +Z like humanoids
        this.walkPhase = 0;
        this.setMesh(group);
    }

    handleChaseState(deltaTime) {
        if (!this.target) {
            this.changeState(AIState.ALERT);
            return;
        }
        this.animationState = 'run';
        const distanceToTarget = this.distanceTo(this.target);

        if (distanceToTarget <= this.attackRange) {
            this.changeState(AIState.ATTACK);
            return;
        }

        if (distanceToTarget > this.circleRadius + 3) {
            // Close the distance fast
            this.moveTowards(this.target.position, this.runSpeed, deltaTime);
        } else {
            // Circle the prey, darting in and out
            const toTarget = new THREE.Vector3()
                .subVectors(this.target.position, this.position).normalize();
            const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x)
                .multiplyScalar(this.strafeDir);
            const radial = distanceToTarget > this.circleRadius ? 0.7 : -0.4;
            const move = perp.multiplyScalar(1.4).addScaledVector(toTarget, radial).normalize();
            const dest = this.position.clone().addScaledVector(move, 3);
            this.moveTowards(dest, this.runSpeed * 0.85, deltaTime);
            if (Math.random() < deltaTime * 0.4) this.strafeDir *= -1;
        }
        this.lastKnownTargetPosition.copy(this.target.position);

        // Leg gallop animation
        this.walkPhase = (this.walkPhase || 0) + deltaTime * 14;
        if (this.legPivots) {
            this.legPivots.forEach((leg, i) => {
                leg.position.y = 0.28 + Math.abs(Math.sin(this.walkPhase + i * Math.PI)) * 0.12;
            });
        }
    }

    performAttack() {
        if (!this.target || !this.canAttack) return;
        this.canAttack = false;
        this.attackCooldown = 1 / this.attackRate;
        // Lunge bite
        const dir = new THREE.Vector3()
            .subVectors(this.target.position, this.position).normalize();
        if (this.velocity) this.velocity.addScaledVector(dir, 6);
        if (this.target.takeDamage) {
            this.target.takeDamage(this.damage, this);
        }
        globalEventBus.emit('audio:play', { sound: 'mutant_growl', volume: 0.5 });
    }
}

/**
 * Lurker - Ambush predator that shimmers out of sight.
 * Cycles: visible -> fading -> near-invisible -> ambush burst.
 */
export class Lurker extends Enemy {
    constructor(options = {}) {
        super({
            name: options.name || 'Lurker',
            health: 90,
            damage: 18,
            armor: 2,
            moveSpeed: 3.2,
            runSpeed: 7.5,
            sightRange: 30,
            attackRange: 2.4,
            attackRate: 0.9,
            ...options
        });

        this.tags.add('mutant');
        this.mutantType = 'lurker';
        this.shimmerPhase = 'visible';
        this.shimmerTimer = 4 + Math.random() * 3;
        this.ambushBonus = false;
    }

    createMesh() {
        // Gaunt, pale, long-limbed ambusher with black eye sockets
        const { group, limbs } = buildHumanoid({
            skin: 0x9a9a92, top: 0x4a4a48, bottom: 0x33332f,
            hunch: 0.55, armLen: 1.15, eyeColor: 0x000000
        });
        group.scale.set(1, 1.18, 1);
        this.limbs = limbs;
        this.walkPhase = 0;
        this.setMesh(group);
        // Enable opacity control for shimmer
        group.traverse(o => {
            if (o.isMesh) {
                o.material = o.material.clone();
                o.material.transparent = true;
            }
        });
    }

    setOpacity(v) {
        if (!this.mesh) return;
        this.mesh.traverse(o => {
            if (o.isMesh && o.material.transparent) o.material.opacity = v;
        });
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (!this.alive) return;

        // Shimmer cycle
        this.shimmerTimer -= deltaTime;
        if (this.shimmerTimer <= 0) {
            if (this.shimmerPhase === 'visible') {
                this.shimmerPhase = 'fading';
                this.shimmerTimer = 1.2;
            } else if (this.shimmerPhase === 'fading') {
                this.shimmerPhase = 'hidden';
                this.shimmerTimer = 3.5 + Math.random() * 2;
            } else {
                this.shimmerPhase = 'visible';
                this.shimmerTimer = 5 + Math.random() * 3;
                // Ambush burst if prey is close when we reappear
                if (this.target && this.distanceTo(this.target) < 8) {
                    this.ambushBonus = true;
                    this.runSpeed = 11;
                    globalEventBus.emit('audio:play', { sound: 'mutant_growl', volume: 0.8 });
                }
            }
        }

        const targetOpacity = this.shimmerPhase === 'hidden' ? 0.13 :
            this.shimmerPhase === 'fading' ? 0.45 : 1.0;
        this.setOpacity(targetOpacity);
    }

    performAttack() {
        if (!this.target || !this.canAttack) return;
        this.canAttack = false;
        this.attackCooldown = 1 / this.attackRate;
        let dmg = this.damage;
        if (this.ambushBonus) {
            dmg *= 2.2;
            this.ambushBonus = false;
            this.runSpeed = 7.5;
        }
        if (this.target.takeDamage) {
            this.target.takeDamage(dmg, this);
        }
        globalEventBus.emit('audio:play', { sound: 'anomaly_zap', volume: 0.4 });
    }
}
