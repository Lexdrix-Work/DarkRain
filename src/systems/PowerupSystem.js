/**
 * PowerupSystem - Dungeon crawler style powerups with anti-abuse caps
 *
 * Categories:
 * - Temporary buffs: timed effects, no stacking (refresh only)
 * - Permanent upgrades: capped stacks with diminishing returns
 * - Artifacts: powerful but with continuous costs
 *
 * Anti-abuse:
 * - Hard stat caps (damage +100%, speed +50%, resist 75% max)
 * - Diminishing returns on permanent upgrades
 * - Buffs refresh duration, never stack
 * - Rare+ items can't be bought, only found in dangerous areas
 */

import { globalEventBus } from '../core/EventBus.js';

// Permanent upgrade definitions with diminishing returns
const PERMANENT_UPGRADES = {
    military_training: {
        name: 'Military Training',
        description: '+Damage (diminishing)',
        bonuses: [0.10, 0.08, 0.06], // 10%, 8%, 6% = +24% total
        maxStacks: 3,
        stat: 'damage',
    },
    athletic_conditioning: {
        name: 'Athletic Conditioning',
        description: '+Move Speed (diminishing)',
        bonuses: [0.10, 0.08, 0.06],
        maxStacks: 3,
        stat: 'moveSpeed',
    },
    body_armor_weave: {
        name: 'Body Armor Weave',
        description: '+Damage Resist (diminishing)',
        bonuses: [0.10, 0.08, 0.06],
        maxStacks: 3,
        stat: 'damageResist',
    },
    expanded_pack: {
        name: 'Expanded Pack',
        description: '+4 Inventory Slots',
        bonuses: [4, 4],
        maxStacks: 2,
        stat: 'inventorySlots',
    },
    // === NEW PERMANENT UPGRADES ===
    scavenger_instinct: {
        name: 'Scavenger Instinct',
        description: '+Loot Detection Radius (diminishing)',
        bonuses: [0.15, 0.12, 0.10],
        maxStacks: 3,
        stat: 'perception',
    },
    iron_lungs: {
        name: 'Iron Lungs',
        description: '+Stamina Regen (diminishing)',
        bonuses: [0.20, 0.15, 0.10],
        maxStacks: 3,
        stat: 'staminaRegen',
    },
    field_medic: {
        name: 'Field Medic Training',
        description: '+Healing Effectiveness (diminishing)',
        bonuses: [0.25, 0.20, 0.15],
        maxStacks: 3,
        stat: 'healing',
    },
    rad_resistance: {
        name: 'Radiation Adaptation',
        description: '+Radiation Resist (diminishing)',
        bonuses: [0.15, 0.12, 0.10],
        maxStacks: 3,
        stat: 'radResist',
    },
    steady_hands: {
        name: 'Steady Hands',
        description: '-Weapon Sway/Recoil (diminishing)',
        bonuses: [0.20, 0.15, 0.10],
        maxStacks: 3,
        stat: 'recoilControl',
    },
    night_vision: {
        name: 'Night Adaptation',
        description: '+Night Visibility (diminishing)',
        bonuses: [0.30, 0.25, 0.20],
        maxStacks: 3,
        stat: 'nightVision',
    },
};

// Temporary buff definitions (no stacking, refresh only)
const TEMPORARY_BUFFS = {
    adrenaline_shot: {
        name: 'Adrenaline Shot',
        description: '+30% speed, +20% fire rate (60s)',
        duration: 60,
        effects: { moveSpeed: 0.30, fireRate: 0.20 },
        rarity: 'uncommon',
    },
    combat_stim: {
        name: 'Combat Stim',
        description: '+40% damage (45s)',
        duration: 45,
        effects: { damage: 0.40 },
        rarity: 'uncommon',
    },
    iron_skin: {
        name: 'Iron Skin Serum',
        description: '50% damage reduction (30s)',
        duration: 30,
        effects: { damageResist: 0.50 },
        rarity: 'rare',
    },
    hunters_eye: {
        name: "Hunter's Eye",
        description: 'See enemies/loot through walls (60s)',
        duration: 60,
        effects: { wallhack: true },
        rarity: 'rare',
    },
};

// Artifact definitions (benefit + continuous cost)
const ARTIFACTS = {
    ember_heart: {
        name: 'Ember Heart',
        description: '+25% damage, -10 HP/min',
        benefit: { damage: 0.25 },
        cost: { hpPerMin: 10 },
        rarity: 'epic',
    },
    frost_core: {
        name: 'Frost Core',
        description: '30% resist, -15% speed',
        benefit: { damageResist: 0.30 },
        cost: { moveSpeed: -0.15 },
        rarity: 'epic',
    },
    volt_cell: {
        name: 'Volt Cell',
        description: '+35% fire rate, 2x stamina drain',
        benefit: { fireRate: 0.35 },
        cost: { staminaDrain: 2.0 },
        rarity: 'epic',
    },
};

// Hard caps (anti-abuse)
const STAT_CAPS = {
    damage: 1.0,        // Max +100%
    moveSpeed: 0.5,     // Max +50%
    damageResist: 0.75, // Max 75% (multiplicative)
    fireRate: 0.5,      // Max +50%
};

export class PowerupSystem {
    constructor(game) {
        this.game = game;

        // Permanent upgrade stacks: { upgradeId: count }
        this.permanentStacks = {};

        // Active temporary buffs: { buffId: { expiresAt, effects } }
        this.activeBuffs = new Map();

        // Equipped artifacts: Set of artifactIds (one of each type max)
        this.equippedArtifacts = new Set();

        // Cooldowns for consumables: { buffId: availableAt }
        this.cooldowns = new Map();

        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('powerup:apply', (data) => this.applyPowerup(data));
        globalEventBus.on('powerup:use-buff', (data) => this.useBuff(data.buffId));
    }

    /**
     * Apply a permanent upgrade (with diminishing returns and caps)
     */
    applyPermanentUpgrade(upgradeId) {
        const def = PERMANENT_UPGRADES[upgradeId];
        if (!def) return false;

        const current = this.permanentStacks[upgradeId] || 0;
        if (current >= def.maxStacks) {
            console.log(`${def.name} already at max stacks`);
            return false;
        }

        this.permanentStacks[upgradeId] = current + 1;
        globalEventBus.emit('powerup:permanent-applied', {
            upgradeId,
            stacks: current + 1,
            bonus: def.bonuses[current],
        });

        this.recalculateStats();
        return true;
    }

    /**
     * Use a temporary buff (refreshes if active, never stacks)
     */
    useBuff(buffId) {
        const def = TEMPORARY_BUFFS[buffId];
        if (!def) return false;

        // Check cooldown (5 min for rare+)
        const now = Date.now() / 1000;
        const availableAt = this.cooldowns.get(buffId) || 0;
        if (now < availableAt) {
            console.log(`${def.name} on cooldown`);
            return false;
        }

        // Refresh or apply
        this.activeBuffs.set(buffId, {
            expiresAt: now + def.duration,
            effects: def.effects,
        });

        // Set cooldown for rare+
        if (def.rarity === 'rare' || def.rarity === 'epic') {
            this.cooldowns.set(buffId, now + 300); // 5 min
        }

        globalEventBus.emit('powerup:buff-applied', { buffId, duration: def.duration });
        this.recalculateStats();
        return true;
    }

    /**
     * Equip an artifact (one of each type, has continuous cost)
     */
    equipArtifact(artifactId) {
        const def = ARTIFACTS[artifactId];
        if (!def) return false;

        if (this.equippedArtifacts.has(artifactId)) {
            console.log(`${def.name} already equipped`);
            return false;
        }

        this.equippedArtifacts.add(artifactId);
        globalEventBus.emit('powerup:artifact-equipped', { artifactId });
        this.recalculateStats();
        return true;
    }

    unequipArtifact(artifactId) {
        if (this.equippedArtifacts.delete(artifactId)) {
            globalEventBus.emit('powerup:artifact-unequipped', { artifactId });
            this.recalculateStats();
            return true;
        }
        return false;
    }

    /**
     * Recalculate all stats with caps applied
     */
    recalculateStats() {
        const stats = {
            damage: 0,
            moveSpeed: 0,
            damageResist: 0,
            fireRate: 0,
            inventorySlots: 0,
        };

        // Permanent upgrades (diminishing)
        for (const [id, count] of Object.entries(this.permanentStacks)) {
            const def = PERMANENT_UPGRADES[id];
            for (let i = 0; i < count; i++) {
                if (def.stat === 'inventorySlots') {
                    stats.inventorySlots += def.bonuses[i];
                } else {
                    stats[def.stat] += def.bonuses[i];
                }
            }
        }

        // Temporary buffs
        const now = Date.now() / 1000;
        for (const [id, buff] of this.activeBuffs) {
            if (now >= buff.expiresAt) {
                this.activeBuffs.delete(id);
                globalEventBus.emit('powerup:buff-expired', { buffId: id });
                continue;
            }
            for (const [stat, value] of Object.entries(buff.effects)) {
                if (stat !== 'wallhack') {
                    stats[stat] = (stats[stat] || 0) + value;
                }
            }
        }

        // Artifacts (benefits)
        for (const id of this.equippedArtifacts) {
            const def = ARTIFACTS[id];
            for (const [stat, value] of Object.entries(def.benefit)) {
                stats[stat] = (stats[stat] || 0) + value;
            }
        }

        // Equipment buffs (from EquipmentSystem)
        if (this.game?.equipmentSystem) {
            const eqBuffs = this.game.equipmentSystem.getEquipmentBuffs();
            for (const [stat, value] of Object.entries(eqBuffs)) {
                if (stat === 'inventorySlots') {
                    stats.inventorySlots += value;
                } else {
                    stats[stat] = (stats[stat] || 0) + value;
                }
            }
        }

        // Apply hard caps (anti-abuse)
        for (const [stat, cap] of Object.entries(STAT_CAPS)) {
            if (stats[stat] > cap) {
                stats[stat] = cap;
            }
        }

        // Artifact costs (applied separately, not capped)
        const costs = {};
        for (const id of this.equippedArtifacts) {
            const def = ARTIFACTS[id];
            Object.assign(costs, def.cost);
        }

        this.currentStats = stats;
        this.currentCosts = costs;

        globalEventBus.emit('powerup:stats-updated', { stats, costs });
        return { stats, costs };
    }

    /**
     * Get current effective stat multiplier
     */
    getStat(stat) {
        if (!this.currentStats) this.recalculateStats();
        return this.currentStats[stat] || 0;
    }

    /**
     * Check if wallhack is active
     */
    hasWallhack() {
        const now = Date.now() / 1000;
        for (const [id, buff] of this.activeBuffs) {
            if (now < buff.expiresAt && buff.effects.wallhack) {
                return true;
            }
        }
        return false;
    }

    update(deltaTime) {
        // Clean up expired buffs
        const now = Date.now() / 1000;
        let changed = false;
        for (const [id, buff] of this.activeBuffs) {
            if (now >= buff.expiresAt) {
                this.activeBuffs.delete(id);
                globalEventBus.emit('powerup:buff-expired', { buffId: id });
                changed = true;
            }
        }
        if (changed) this.recalculateStats();

        // Apply artifact HP costs
        for (const id of this.equippedArtifacts) {
            const def = ARTIFACTS[id];
            if (def.cost.hpPerMin && this.game.player) {
                const dps = def.cost.hpPerMin / 60;
                this.game.player.takeDamage(dps * deltaTime, 'radiation', true);
            }
        }
    }

    // Save/load
    serialize() {
        return {
            permanentStacks: this.permanentStacks,
            equippedArtifacts: [...this.equippedArtifacts],
        };
    }

    deserialize(data) {
        if (!data) return;
        this.permanentStacks = data.permanentStacks || {};
        this.equippedArtifacts = new Set(data.equippedArtifacts || []);
        this.recalculateStats();
    }
}
