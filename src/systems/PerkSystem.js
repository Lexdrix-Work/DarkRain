/**
 * PerkSystem - Meaningful character builds (New Vegas inspired)
 *
 * What we loved from New Vegas:
 * - Perks define your playstyle (not just +5% stats)
 * - Meaningful choices with tradeoffs
 * - Perks unlock new gameplay options
 *
 * What we left out:
 * - NV's "take every perk eventually" (no build identity)
 * - Useless joke perks (wasted choices)
 *
 * Design:
 * - Earn perk points from leveling (1 per level)
 * - Max 15 perks (can't have everything — build identity matters)
 * - Perks have requirements (level, stats, faction rep)
 * - Some perks are mutually exclusive (choose a path)
 * - Perks do interesting things, not just numbers
 */

import { globalEventBus } from '../core/EventBus.js';

const PERKS = {
    // === COMBAT ===
    gunslinger: {
        name: 'Gunslinger',
        description: '+25% pistol damage, +20% pistol fire rate',
        level: 2,
        effects: { pistolDamage: 0.25, pistolFireRate: 0.20 },
    },
    rifleman: {
        name: 'Rifleman',
        description: '+25% rifle damage, -20% rifle spread',
        level: 2,
        effects: { rifleDamage: 0.25, spread: -0.20 },
        exclusive: ['gunslinger'], // Choose pistols OR rifles
    },
    demolitions: {
        name: 'Demolitions Expert',
        description: '+50% explosive damage, +2m blast radius',
        level: 4,
        effects: { explosiveDamage: 0.50, blastRadius: 2.0 },
    },
    ninja: {
        name: 'Ninja',
        description: '+50% melee damage, silent movement',
        level: 3,
        effects: { meleeDamage: 0.50, silent: true },
    },

    // === SURVIVAL ===
    rad_child: {
        name: 'Rad Child',
        description: 'Heal from radiation instead of taking damage (slow)',
        level: 6,
        effects: { radHeal: true },
    },
    lead_belly: {
        name: 'Lead Belly',
        description: 'No radiation from food/water',
        level: 2,
        effects: { foodRadImmune: true },
    },
    traveler: {
        name: 'Traveler',
        description: '+25% move speed, -25% stamina drain while traveling',
        level: 3,
        effects: { moveSpeed: 0.25, staminaDrain: -0.25 },
    },

    // === SOCIAL ===
    negotiator: {
        name: 'Negotiator',
        description: '+25% better prices, +10 faction rep gain',
        level: 2,
        effects: { prices: 0.25, repGain: 0.10 },
    },
    terrifying_presence: {
        name: 'Terrifying Presence',
        description: 'Enemies 20% more likely to flee when hurt',
        level: 5,
        effects: { fearChance: 0.20 },
        exclusive: ['negotiator'], // Fear OR diplomacy
    },

    // === SPECIAL ===
    jury_rigging: {
        name: 'Jury Rigging',
        description: 'Repair weapons with similar parts (not exact matches)',
        level: 4,
        effects: { juryRig: true },
    },
    pack_rat: {
        name: 'Pack Rat',
        description: 'Items weigh 50% less',
        level: 3,
        effects: { weightReduction: 0.50 },
    },
    quick_draw: {
        name: 'Quick Draw',
        description: '+50% weapon swap speed, +25% reload speed',
        level: 2,
        effects: { swapSpeed: 0.50, reloadSpeed: 0.25 },
    },
    mysterious_stranger: {
        name: 'Mysterious Stranger',
        description: 'Chance for a stranger to appear and help in combat',
        level: 8,
        effects: { strangerChance: 0.10 },
    },
};

export class PerkSystem {
    constructor(game) {
        this.game = game;

        // Taken perks: Set of perk IDs
        this.perks = new Set();

        // Available perk points
        this.points = 0;

        // Player level (for requirements)
        this.level = 1;
    }

    /**
     * Award a perk point (called on level up)
     */
    addPoint() {
        this.points++;
        globalEventBus.emit('perk:point-earned', { points: this.points });
    }

    /**
     * Check if a perk can be taken
     */
    canTake(perkId) {
        const perk = PERKS[perkId];
        if (!perk) return { ok: false, reason: 'Unknown perk' };
        if (this.perks.has(perkId)) return { ok: false, reason: 'Already taken' };
        if (this.points < 1) return { ok: false, reason: 'No perk points' };
        if (this.perks.size >= 15) return { ok: false, reason: 'Max 15 perks' };
        if (this.level < perk.level) return { ok: false, reason: `Requires level ${perk.level}` };

        // Check exclusivity
        for (const excl of perk.exclusive || []) {
            if (this.perks.has(excl)) {
                return { ok: false, reason: `Exclusive with ${PERKS[excl].name}` };
            }
        }

        return { ok: true };
    }

    /**
     * Take a perk
     */
    takePerk(perkId) {
        const check = this.canTake(perkId);
        if (!check.ok) {
            console.log(`Cannot take ${perkId}: ${check.reason}`);
            return false;
        }

        this.perks.add(perkId);
        this.points--;

        globalEventBus.emit('perk:taken', {
            perkId,
            perk: PERKS[perkId],
            remaining: this.points,
        });

        // Recalculate stats
        this.game.powerupSystem?.recalculateStats();

        return true;
    }

    /**
     * Get all active perk effects (merged)
     */
    getEffects() {
        const effects = {};
        for (const id of this.perks) {
            const perk = PERKS[id];
            for (const [stat, value] of Object.entries(perk.effects)) {
                if (typeof value === 'boolean') {
                    effects[stat] = true;
                } else if (typeof value === 'number') {
                    effects[stat] = (effects[stat] || 0) + value;
                }
            }
        }
        return effects;
    }

    hasPerk(perkId) {
        return this.perks.has(perkId);
    }

    getPerkCount() {
        return this.perks.size;
    }

    serialize() {
        return {
            perks: [...this.perks],
            points: this.points,
            level: this.level,
        };
    }

    deserialize(data) {
        if (!data) return;
        this.perks = new Set(data.perks || []);
        this.points = data.points || 0;
        this.level = data.level || 1;
    }
}

export { PERKS };
