import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * SurvivalSystem - Manages hunger, thirst, radiation, and survival mechanics
 */
export class SurvivalSystem {
    constructor(game) {
        this.game = game;
        
        // Survival rates (per second)
        this.hungerRate = 0.05;      // ~3 hours to starve
        this.thirstRate = 0.08;      // ~2 hours to dehydrate
        this.staminaRegenRate = 10;
        this.healthRegenRate = 0.5;  // When well-fed
        
        // Thresholds
        this.criticalHunger = 80;
        this.criticalThirst = 80;
        this.criticalRadiation = 70;
        
        // Status effects
        this.statusEffects = new Map();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('item:use', (data) => {
            this.onItemUsed(data.item);
        });
        
        globalEventBus.on('emission:damage', (data) => {
            if (this.game.player && !this.isInShelter()) {
                this.game.player.takeDamage(data.damage, null);
            }
        });
    }

    /**
     * Check if player is in shelter (for emissions)
     */
    isInShelter() {
        // Check if player is inside a building/bunker
        // Simplified - would use collision/trigger volumes
        return false;
    }

    /**
     * Handle item usage
     * @param {Object} item - Used item
     */
    onItemUsed(item) {
        const player = this.game.player;
        if (!player) return;
        
        switch (item.type) {
            case 'medical':
                this.applyMedicalItem(item, player);
                break;
            case 'food':
                this.applyFoodItem(item, player);
                break;
            case 'antirad':
                this.applyAntiRadItem(item, player);
                break;
        }
    }

    /**
     * Apply medical item effects
     * @param {Object} item - Medical item
     * @param {Player} player - Player instance
     */
    applyMedicalItem(item, player) {
        if (item.healAmount) {
            player.heal(item.healAmount);
        }
        
        if (item.stopsBleeding) {
            this.removeStatusEffect(player, 'bleeding');
        }
        
        if (item.curesRadiation) {
            player.removeRadiation(item.radiationRemoval || 20);
        }
    }

    /**
     * Apply food item effects
     * @param {Object} item - Food item
     * @param {Player} player - Player instance
     */
    applyFoodItem(item, player) {
        if (item.hungerReduction) {
            player.stats.hunger = Math.max(0, player.stats.hunger - item.hungerReduction);
        }
        
        if (item.thirstReduction) {
            player.stats.thirst = Math.max(0, player.stats.thirst - item.thirstReduction);
        }
        
        // Some food might add radiation
        if (item.radiationAmount) {
            player.addRadiation(item.radiationAmount);
        }
        
        // Some food heals
        if (item.healAmount) {
            player.heal(item.healAmount);
        }
    }

    /**
     * Apply anti-radiation item
     * @param {Object} item - Anti-rad item
     * @param {Player} player - Player instance
     */
    applyAntiRadItem(item, player) {
        player.removeRadiation(item.radiationRemoval || 30);
        
        // Temporary radiation resistance
        if (item.radiationResistance) {
            this.applyStatusEffect(player, 'rad_resistance', item.duration || 60, {
                radiationResistance: item.radiationResistance
            });
        }
    }

    /**
     * Apply a status effect
     * @param {Entity} entity - Target entity
     * @param {string} effectName - Effect name
     * @param {number} duration - Effect duration in seconds
     * @param {Object} data - Effect data
     */
    applyStatusEffect(entity, effectName, duration, data = {}) {
        const key = `${entity.id}_${effectName}`;
        
        this.statusEffects.set(key, {
            entity,
            name: effectName,
            duration,
            remaining: duration,
            data
        });
        
        globalEventBus.emit('status:applied', { entity, effect: effectName, duration });
    }

    /**
     * Remove a status effect
     * @param {Entity} entity - Target entity
     * @param {string} effectName - Effect name
     */
    removeStatusEffect(entity, effectName) {
        const key = `${entity.id}_${effectName}`;
        this.statusEffects.delete(key);
        
        globalEventBus.emit('status:removed', { entity, effect: effectName });
    }

    /**
     * Check if entity has status effect
     * @param {Entity} entity - Target entity
     * @param {string} effectName - Effect name
     */
    hasStatusEffect(entity, effectName) {
        const key = `${entity.id}_${effectName}`;
        return this.statusEffects.has(key);
    }

    /**
     * Get status effect data
     * @param {Entity} entity - Target entity
     * @param {string} effectName - Effect name
     */
    getStatusEffect(entity, effectName) {
        const key = `${entity.id}_${effectName}`;
        return this.statusEffects.get(key);
    }

    /**
     * Update survival mechanics
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        const player = this.game.player;
        if (!player || !player.isActive) return;
        
        // Update hunger and thirst
        this.updateHungerThirst(player, deltaTime);
        
        // Update radiation effects
        this.updateRadiation(player, deltaTime);
        
        // Update status effects
        this.updateStatusEffects(deltaTime);
        
        // Update health regeneration
        this.updateHealthRegen(player, deltaTime);
    }

    /**
     * Update hunger and thirst
     * @param {Player} player - Player instance
     * @param {number} deltaTime - Frame delta
     */
    updateHungerThirst(player, deltaTime) {
        // Increase hunger
        player.stats.hunger = Math.min(
            player.stats.maxHunger,
            player.stats.hunger + this.hungerRate * deltaTime
        );
        
        // Increase thirst
        player.stats.thirst = Math.min(
            player.stats.maxThirst,
            player.stats.thirst + this.thirstRate * deltaTime
        );
        
        // Critical hunger damage
        if (player.stats.hunger >= this.criticalHunger) {
            player.stats.health -= 0.5 * deltaTime;
            
            if (!this.hasStatusEffect(player, 'starving')) {
                this.applyStatusEffect(player, 'starving', Infinity, {});
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'You are starving!',
                    type: 'danger'
                });
            }
        } else {
            this.removeStatusEffect(player, 'starving');
        }
        
        // Critical thirst damage
        if (player.stats.thirst >= this.criticalThirst) {
            player.stats.health -= 0.8 * deltaTime;
            
            if (!this.hasStatusEffect(player, 'dehydrated')) {
                this.applyStatusEffect(player, 'dehydrated', Infinity, {});
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'You are severely dehydrated!',
                    type: 'danger'
                });
            }
        } else {
            this.removeStatusEffect(player, 'dehydrated');
        }
    }

    /**
     * Update radiation effects
     * @param {Player} player - Player instance
     * @param {number} deltaTime - Frame delta
     */
    updateRadiation(player, deltaTime) {
        // Radiation resistance modifier
        let radResistance = 0;
        const radResistEffect = this.getStatusEffect(player, 'rad_resistance');
        if (radResistEffect) {
            radResistance = radResistEffect.data.radiationResistance || 0;
        }
        
        // Radiation damage scaling with level
        if (player.stats.radiation > 0) {
            const radLevel = player.stats.radiation / player.stats.maxRadiation;
            
            // Light radiation - stamina penalty
            if (radLevel > 0.3) {
                player.stats.maxStamina = 100 * (1 - (radLevel - 0.3) * 0.5);
            } else {
                player.stats.maxStamina = 100;
            }
            
            // Heavy radiation - health damage
            if (radLevel > 0.5) {
                const damage = (radLevel - 0.5) * 2 * deltaTime * (1 - radResistance);
                player.stats.health -= damage;
            }
            
            // Critical radiation
            if (radLevel > this.criticalRadiation / 100) {
                if (!this.hasStatusEffect(player, 'radiation_sickness')) {
                    this.applyStatusEffect(player, 'radiation_sickness', Infinity, {});
                    globalEventBus.emit(GameEvents.NOTIFICATION, {
                        message: 'You are suffering from radiation sickness!',
                        type: 'danger'
                    });
                }
            } else {
                this.removeStatusEffect(player, 'radiation_sickness');
            }
        }
    }

    /**
     * Update all status effects
     * @param {number} deltaTime - Frame delta
     */
    updateStatusEffects(deltaTime) {
        for (const [key, effect] of this.statusEffects.entries()) {
            // Skip infinite duration effects
            if (effect.duration === Infinity) continue;
            
            effect.remaining -= deltaTime;
            
            // Apply tick effects
            this.applyStatusEffectTick(effect, deltaTime);
            
            // Remove expired effects
            if (effect.remaining <= 0) {
                this.statusEffects.delete(key);
                globalEventBus.emit('status:removed', {
                    entity: effect.entity,
                    effect: effect.name
                });
            }
        }
    }

    /**
     * Apply per-tick status effect
     * @param {Object} effect - Status effect
     * @param {number} deltaTime - Frame delta
     */
    applyStatusEffectTick(effect, deltaTime) {
        const entity = effect.entity;
        if (!entity || !entity.isActive) return;
        
        switch (effect.name) {
            case 'bleeding':
                entity.stats.health -= (effect.data.damagePerSecond || 2) * deltaTime;
                break;
                
            case 'burning':
                entity.stats.health -= (effect.data.damagePerSecond || 5) * deltaTime;
                break;
                
            case 'poisoned':
                entity.stats.health -= (effect.data.damagePerSecond || 1) * deltaTime;
                break;
                
            case 'stunned':
                // Handled in entity movement
                break;
        }
    }

    /**
     * Update health regeneration
     * @param {Player} player - Player instance
     * @param {number} deltaTime - Frame delta
     */
    updateHealthRegen(player, deltaTime) {
        // Only regenerate if not hungry/thirsty and low radiation
        if (
            player.stats.hunger < 50 &&
            player.stats.thirst < 50 &&
            player.stats.radiation < 30 &&
            player.stats.health < player.stats.maxHealth
        ) {
            player.stats.health = Math.min(
                player.stats.maxHealth,
                player.stats.health + this.healthRegenRate * deltaTime
            );
        }
    }

    dispose() {
        this.statusEffects.clear();
    }
}