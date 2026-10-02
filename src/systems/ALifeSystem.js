import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * ALifeSystem - The Zone lives even when you're not looking.
 *
 * Simulated parties (loner stalkers, bandits, mutant packs) roam the city
 * as data, fight each other offscreen, and generate PDA feed reports.
 * Parties near the player get real meshes: neutral wanderers you can watch,
 * avoid, or engage. Firefights leave corpses you can loot.
 */
const FACTIONS = ['loner', 'bandit', 'mutant'];

function hostileTo(a, b) {
    if (a === b) return false;
    if (a === 'mutant' || b === 'mutant') return true;
    return (a === 'loner' && b === 'bandit') || (a === 'bandit' && b === 'loner');
}

const FACTION_NAMES = {
    loner: 'Loners',
    bandit: 'Bandits',
    mutant: 'Mutants'
};

export class ALifeSystem {
    constructor(game) {
        this.game = game;
        this.parties = new Map();
        this.maxParties = 5;
        this.spawnTimer = 25; // first parties appear ~25s in
        this.syncTimer = 0;
        this.battleSoundTimer = 0;
        this.partyCounter = 0;

        globalEventBus.on(GameEvents.ENEMY_DEATH, (data) => this.onEntityDeath(data));
    }

    randomGroundPoint(center, minDist, maxDist) {
        const angle = Math.random() * Math.PI * 2;
        const dist = minDist + Math.random() * (maxDist - minDist);
        const x = center.x + Math.cos(angle) * dist;
        const z = center.z + Math.sin(angle) * dist;
        const wm = this.game.worldManager;
        const y = wm?.getTerrainHeight ? wm.getTerrainHeight(x, z) : 0;
        return new THREE.Vector3(x, y, z);
    }

    spawnParty() {
        const player = this.game.player;
        if (!player) return;
        const faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
        const members = faction === 'mutant'
            ? 3 + Math.floor(Math.random() * 3)
            : 2 + Math.floor(Math.random() * 3);

        const pos = this.randomGroundPoint(player.position, 130, 200);
        const party = {
            id: `party_${++this.partyCounter}`,
            faction,
            pos,
            members,
            hp: members * 60,
            waypoint: this.randomGroundPoint(pos, 40, 120),
            state: 'roam',
            fightTargetId: null,
            visuals: new Set()
        };
        this.parties.set(party.id, party);
    }

    update(deltaTime) {
        const player = this.game.player;
        if (!player || this.game.isPaused) return;

        // Spawn upkeep
        this.spawnTimer -= deltaTime;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = 45 + Math.random() * 40;
            if (this.parties.size < this.maxParties) this.spawnParty();
        }

        // Roam + fight detection
        const list = [...this.parties.values()];
        for (const p of list) {
            if (p.state === 'roam') {
                const to = new THREE.Vector3().subVectors(p.waypoint, p.pos);
                to.y = 0;
                if (to.length() < 6) {
                    p.waypoint = this.randomGroundPoint(player.position, 100, 220);
                } else {
                    p.pos.addScaledVector(to.normalize(), 2.2 * deltaTime);
                }
                // Look for enemies
                for (const q of list) {
                    if (q === p || q.state === 'fight') continue;
                    if (hostileTo(p.faction, q.faction) && p.pos.distanceTo(q.pos) < 32) {
                        p.state = 'fight'; p.fightTargetId = q.id;
                        q.state = 'fight'; q.fightTargetId = p.id;
                        globalEventBus.emit('zone:pda_feed', {
                            text: `Gunfire reported: ${FACTION_NAMES[p.faction]} engaged ${FACTION_NAMES[q.faction]} nearby.`,
                            kind: 'combat'
                        });
                        break;
                    }
                }
            } else if (p.state === 'fight') {
                const q = this.parties.get(p.fightTargetId);
                if (!q) { p.state = 'roam'; p.fightTargetId = null; continue; }
                // Drift toward each other
                const to = new THREE.Vector3().subVectors(q.pos, p.pos);
                to.y = 0;
                if (to.length() > 14) p.pos.addScaledVector(to.normalize(), 1.5 * deltaTime);

                // Abstract DPS exchange
                const dpsP = p.members * 7;
                const dpsQ = q.members * 7;
                q.hp -= dpsP * deltaTime;
                p.hp -= dpsQ * deltaTime;
                this.applyCasualties(p);
                this.applyCasualties(q);
            }
        }

        // Resolve wiped parties
        for (const p of [...this.parties.values()]) {
            if (p.members <= 0) this.wipeParty(p);
        }

        // Distant battle audio
        this.battleSoundTimer -= deltaTime;
        if (this.battleSoundTimer <= 0) {
            this.battleSoundTimer = 2.5 + Math.random() * 3;
            for (const p of this.parties.values()) {
                if (p.state !== 'fight') continue;
                const d = p.pos.distanceTo(player.position);
                if (d < 170) {
                    const vol = Math.max(0.08, 0.6 * (1 - d / 170));
                    const sound = p.faction === 'mutant' ? 'mutant_growl' : 'gunshot_distant';
                    globalEventBus.emit('audio:play', { sound, volume: vol });
                }
            }
        }

        // Visual sync (throttled)
        this.syncTimer -= deltaTime;
        if (this.syncTimer <= 0) {
            this.syncTimer = 2.0;
            this.syncVisuals(player);
        }
    }

    applyCasualties(party) {
        const expected = Math.max(0, Math.ceil(party.hp / 60));
        let guard = 0;
        while (party.members > expected && guard++ < 12) {
            const visId = [...party.visuals][0];
            const enemy = visId ? this.game.worldManager?.enemies.get(visId) : null;
            if (enemy && enemy.alive) {
                // Kill one visual; onEntityDeath does the decrement (single path)
                enemy._alifeSilent = true;
                enemy.takeDamage(99999, null);
                party.visuals.delete(visId);
            } else {
                if (visId) party.visuals.delete(visId);
                // No live visual to kill - decrement directly
                party.members--;
                party.hp = Math.min(party.hp, party.members * 60);
            }
        }
    }

    wipeParty(party) {
        const killer = party.fightTargetId ? this.parties.get(party.fightTargetId) : null;
        const killerName = killer ? FACTION_NAMES[killer.faction] : 'the Zone';

        const landmarks = ['the depot', 'the warehouses', 'the old market', 'the collapsed overpass', 'the clinic ruins'];
        const where = landmarks[Math.floor(Math.random() * landmarks.length)];
        globalEventBus.emit('zone:pda_feed', {
            text: `${FACTION_NAMES[party.faction]} wiped out by ${killerName} near ${where}.`,
            kind: 'combat'
        });

        // Leave corpses to discover
        const loot = this.game.lootSystem;
        if (loot) {
            const n = 1 + Math.floor(Math.random() * 2);
            for (let i = 0; i < n; i++) {
                const p = party.pos.clone();
                p.x += (Math.random() - 0.5) * 8;
                p.z += (Math.random() - 0.5) * 8;
                loot.spawnCorpse(p, party.faction === 'mutant' ? 'mutant' : 'human');
            }
        }

        // Despawn visuals
        for (const visId of party.visuals) {
            const enemy = this.game.worldManager?.enemies.get(visId);
            if (enemy) this.despawnVisual(enemy);
        }
        if (killer) { killer.state = 'roam'; killer.fightTargetId = null; }
        this.parties.delete(party.id);
    }

    syncVisuals(player) {
        const wm = this.game.worldManager;
        if (!wm) return;

        for (const party of this.parties.values()) {
            const dist = party.pos.distanceTo(player.position);
            if (dist < 78 && party.visuals.size === 0 && party.members > 0) {
                // Spawn ambient meshes - neutral (sightRange 0), retaliate if shot
                const count = Math.min(party.members, 3);
                for (let i = 0; i < count; i++) {
                    const p = party.pos.clone();
                    p.x += (Math.random() - 0.5) * 10;
                    p.z += (Math.random() - 0.5) * 10;
                    let type = 'human', opts = {};
                    if (party.faction === 'mutant') {
                        const r = Math.random();
                        type = r < 0.45 ? 'packhound' : r < 0.75 ? 'lurker' : 'mutant';
                    } else {
                        opts = { faction: party.faction, sightRange: 0 };
                    }
                    const enemy = wm.spawnEnemy({
                        type,
                        position: [p.x, p.y, p.z],
                        sightRange: 0,
                        ...opts
                    });
                    if (enemy) {
                        enemy.alifePartyId = party.id;
                        party.visuals.add(enemy.id);
                    }
                }
            } else if (dist > 110 && party.visuals.size > 0) {
                for (const visId of party.visuals) {
                    const enemy = wm.enemies.get(visId);
                    if (enemy) this.despawnVisual(enemy);
                }
                party.visuals.clear();
            } else if (party.visuals.size > 0) {
                // Drift visuals with the party
                let i = 0;
                for (const visId of party.visuals) {
                    const enemy = wm.enemies.get(visId);
                    if (enemy && enemy.alive) {
                        const angle = (i / party.visuals.size) * Math.PI * 2;
                        const tx = party.pos.x + Math.cos(angle) * 4;
                        const tz = party.pos.z + Math.sin(angle) * 4;
                        const dx = tx - enemy.position.x;
                        const dz = tz - enemy.position.z;
                        const d = Math.hypot(dx, dz);
                        if (d > 3) {
                            enemy.position.x += (dx / d) * Math.min(d, 3 * 2.0);
                            enemy.position.z += (dz / d) * Math.min(d, 3 * 2.0);
                        }
                    }
                    i++;
                }
            }
        }
    }

    despawnVisual(enemy) {
        const wm = this.game.worldManager;
        if (wm) {
            if (enemy.mesh) wm.scene.remove(enemy.mesh);
            wm.removeEnemy(enemy);
        }
    }

    onEntityDeath(data) {
        const enemy = data?.enemy;
        if (!enemy?.alifePartyId) return;
        const party = this.parties.get(enemy.alifePartyId);
        if (!party) return;
        party.visuals.delete(enemy.id);
        party.members--;
        party.hp = Math.min(party.hp, party.members * 60);
        const silent = enemy._alifeSilent;
        if (party.members <= 0) this.wipeParty(party);
        else if (!silent && Math.random() < 0.5) {
            // Survivors go loud on the PDA
            globalEventBus.emit('zone:pda_feed', {
                text: `${FACTION_NAMES[party.faction]} patrol lost a member. They know someone is out here.`,
                kind: 'warning'
            });
        }
    }

    dispose() {
        for (const party of this.parties.values()) {
            for (const visId of party.visuals) {
                const enemy = this.game.worldManager?.enemies.get(visId);
                if (enemy) this.despawnVisual(enemy);
            }
        }
        this.parties.clear();
    }
}
