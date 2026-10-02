/**
 * FactionSystem - New Vegas reputation meets STALKER ALife
 *
 * What we loved from New Vegas:
 * - Factions remember your actions (not just binary friend/foe)
 * - Reputation gates quests, prices, and safe zones
 * - You can play factions against each other
 *
 * What we loved from STALKER:
 * - The world lives without you (ALife)
 * - Factions fight each other dynamically
 * - Your actions have ripple effects
 *
 * What we left out:
 * - NV's binary "Vilified" lockouts (too punishing)
 * - STALKER's cryptic hidden reputation (too opaque)
 *
 * Design:
 * - Reputation -100 to +100 per faction
 * - Tiers: Hostile (-100 to -50), Unfriendly (-50 to -10),
 *          Neutral (-10 to +10), Friendly (+10 to +50), Allied (+50 to +100)
 * - Actions have reputation effects (killing, helping, trading, quest choices)
 * - Reputation decays slowly toward 0 (people forget, but slowly)
 * - Faction relations affect each other (helping A hurts B if they're rivals)
 */

import { globalEventBus, GameEvents } from '../core/EventBus.js';

const FACTIONS = {
    loners: {
        name: 'Loners',
        description: 'Independent stalkers. No masters, no leaders.',
        rivals: ['bandits'],
        allies: ['scientists'],
    },
    bandits: {
        name: 'Bandits',
        description: 'Thieves and murderers. The Zone\'s predators.',
        rivals: ['loners', 'duty'],
        allies: [],
    },
    duty: {
        name: 'Duty',
        description: 'Military order. The Zone must be contained.',
        rivals: ['bandits', 'freedom'],
        allies: ['scientists'],
    },
    freedom: {
        name: 'Freedom',
        description: 'Anarchists. The Zone belongs to everyone.',
        rivals: ['duty'],
        allies: ['loners'],
    },
    scientists: {
        name: 'Scientists',
        description: 'Researchers. Knowledge above all.',
        rivals: [],
        allies: ['duty', 'loners'],
    },
    mutants: {
        name: 'Mutants',
        description: 'Twisted by the Zone. Beyond reason.',
        rivals: ['loners', 'duty', 'freedom', 'bandits', 'scientists'],
        allies: [],
    },
};

const TIERS = [
    { min: -100, max: -50, name: 'Hostile', color: '#ff0000' },
    { min: -50, max: -10, name: 'Unfriendly', color: '#ff6600' },
    { min: -10, max: 10, name: 'Neutral', color: '#ffff00' },
    { min: 10, max: 50, name: 'Friendly', color: '#66ff66' },
    { min: 50, max: 100, name: 'Allied', color: '#00ff00' },
];

// Reputation effects for actions
const REP_EFFECTS = {
    kill_member: -15,      // Killing a faction member
    kill_rival: +8,        // Killing a rival faction member
    help_member: +10,       // Completing quest for faction
    trade: +1,             // Trading (small, caps at +20 via trade)
    steal: -10,            // Stealing from faction
    attack_member: -8,     // Attacking (not killing)
};

export class FactionSystem {
    constructor(game) {
        this.game = game;

        // Reputation per faction: { factionId: -100 to 100 }
        this.reputation = {};
        for (const id of Object.keys(FACTIONS)) {
            this.reputation[id] = 0;
        }

        // Trade reputation caps (can't buy your way to Allied)
        this.tradeRep = {};

        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on(GameEvents.ENEMY_DEATH, (data) => this.onKill(data));
        globalEventBus.on('quest:completed', (data) => this.onQuestComplete(data));
        globalEventBus.on('trade:completed', (data) => this.onTrade(data));
    }

    onKill(data) {
        const victim = data.entity;
        if (!victim?.faction) return;

        const faction = victim.faction;
        this.adjustRep(faction, REP_EFFECTS.kill_member, 'Killed ' + FACTIONS[faction]?.name);

        // Bonus for killing rivals of your allies
        for (const [fid, rep] of Object.entries(this.reputation)) {
            if (rep >= 10 && FACTIONS[fid]?.rivals?.includes(faction)) {
                this.adjustRep(fid, REP_EFFECTS.kill_rival, 'Killed rival of ' + FACTIONS[fid].name);
            }
        }
    }

    onQuestComplete(data) {
        if (data.faction) {
            this.adjustRep(data.faction, REP_EFFECTS.help_member, 'Helped ' + FACTIONS[data.faction]?.name);
        }
    }

    onTrade(data) {
        if (!data.faction) return;
        // Trading gives small rep, capped at +20 (can't buy love)
        const current = this.tradeRep[data.faction] || 0;
        if (current < 20) {
            this.tradeRep[data.faction] = current + REP_EFFECTS.trade;
            this.adjustRep(data.faction, REP_EFFECTS.trade, 'Traded with ' + FACTIONS[data.faction]?.name);
        }
    }

    /**
     * Adjust reputation with ripple effects to rivals/allies
     */
    adjustRep(factionId, amount, reason) {
        if (!FACTIONS[factionId]) return;

        const oldTier = this.getTier(factionId);
        this.reputation[factionId] = Math.max(-100, Math.min(100,
            this.reputation[factionId] + amount));

        // Ripple: rivals lose a bit, allies gain a bit
        const faction = FACTIONS[factionId];
        if (amount > 0) {
            // Helping a faction annoys its rivals slightly
            for (const rival of faction.rivals || []) {
                this.reputation[rival] = Math.max(-100,
                    this.reputation[rival] - Math.abs(amount) * 0.3);
            }
            // ...and pleases its allies slightly
            for (const ally of faction.allies || []) {
                this.reputation[ally] = Math.min(100,
                    this.reputation[ally] + Math.abs(amount) * 0.2);
            }
        }

        const newTier = this.getTier(factionId);
        if (oldTier.name !== newTier.name) {
            globalEventBus.emit('faction:tier-changed', {
                faction: factionId,
                oldTier: oldTier.name,
                newTier: newTier.name,
                reason,
            });
            console.log(`Faction ${factionId}: ${oldTier.name} → ${newTier.name} (${reason})`);
        }

        globalEventBus.emit('faction:rep-changed', {
            faction: factionId,
            rep: this.reputation[factionId],
            tier: newTier.name,
        });
    }

    getTier(factionId) {
        const rep = this.reputation[factionId] || 0;
        return TIERS.find(t => rep >= t.min && rep <= t.max) || TIERS[2];
    }

    getRep(factionId) {
        return this.reputation[factionId] || 0;
    }

    isHostile(factionId) {
        return this.getRep(factionId) < -50;
    }

    isFriendly(factionId) {
        return this.getRep(factionId) >= 10;
    }

    /**
     * Slow decay toward neutral (people forget)
     */
    update(deltaTime) {
        // Decay 1 point per 5 minutes toward 0
        const decayRate = deltaTime / 300;
        for (const id of Object.keys(this.reputation)) {
            const rep = this.reputation[id];
            if (rep > 0) {
                this.reputation[id] = Math.max(0, rep - decayRate);
            } else if (rep < 0) {
                this.reputation[id] = Math.min(0, rep + decayRate);
            }
        }
    }

    serialize() {
        return {
            reputation: { ...this.reputation },
            tradeRep: { ...this.tradeRep },
        };
    }

    deserialize(data) {
        if (!data) return;
        this.reputation = { ...data.reputation };
        this.tradeRep = { ...data.tradeRep } || {};
    }
}

export { FACTIONS, TIERS };
