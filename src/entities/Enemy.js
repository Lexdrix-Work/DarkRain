import * as THREE from 'three';
import { Entity } from './Entity.js';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * AI States for enemy behavior
 */
export const AIState = {
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
        // Placeholder enemy mesh - replace with loaded model
        const geometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x4a4a4a,
            roughness: 0.8
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Add eyes (for visual feedback)
        const eyeGeometry = new THREE.SphereGeometry(0.08);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 0.8, -0.35);
        mesh.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 0.8, -0.35);
        mesh.add(rightEye);
        
        this.setMesh(mesh);
    }

    update(deltaTime) {
        if (!this.isActive || this.aiState === AIState.DEAD) return;
        
        this.updatePerception(deltaTime);
        this.updateAI(deltaTime);
        this.updateMovement(deltaTime);
        this.updateCombat(deltaTime);
        
        super.update(deltaTime);
    }

    updatePerception(deltaTime) {
        // Get player reference
        const player = this.game?.player;
        if (!player) return;
        
        const distanceToPlayer = this.distanceTo(player);
        const directionToPlayer = new THREE.Vector3()
            .subVectors(player.position, this.position)
            .normalize();
        
        const forward = new THREE.Vector3(0, 0, -1)
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

    performAttack() {
        if (!this.target || !this.canAttack) return;
        
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
        
        // Visual feedback
        if (this.mesh) {
            // Flash red
            const originalColor = this.mesh.material.color.clone();
            this.mesh.material.color.setHex(0xff0000);
            setTimeout(() => {
                if (this.mesh && this.mesh.material) {
                    this.mesh.material.color.copy(originalColor);
                }
            }, 100);
        }
        
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.aiState = AIState.DEAD;
        this.isActive = false;
        this.isCollidable = false;
        
        // Death animation (placeholder - rotate mesh)
        if (this.mesh) {
            this.mesh.rotation.x = Math.PI / 2;
            this.mesh.position.y = 0.3;
        }
        
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
        
        // Emit loot drop event for world manager to handle
        globalEventBus.emit('loot:drop', {
            position: this.position.clone(),
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
        // Different mesh based on mutant type
        const geometry = new THREE.SphereGeometry(0.6, 8, 6);
        const material = new THREE.MeshStandardMaterial({
            color: 0x2d4a2d,
            roughness: 0.9
        });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Add spikes/details
        const spikeGeometry = new THREE.ConeGeometry(0.1, 0.4, 4);
        const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        
        for (let i = 0; i < 8; i++) {
            const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
            const angle = (i / 8) * Math.PI * 2;
            spike.position.set(Math.cos(angle) * 0.5, 0.3, Math.sin(angle) * 0.5);
            spike.rotation.x = Math.PI / 4;
            spike.rotation.y = angle;
            mesh.add(spike);
        }
        
        mesh.castShadow = true;
        this.setMesh(mesh);
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