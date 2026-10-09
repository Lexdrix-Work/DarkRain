/**
 * EquipmentSystem - Manage equipped armor, helmets, backpacks
 *
 * Players start with NOTHING. All equipment must be found in the world.
 * Equipped items provide buffs that integrate with PowerupSystem.
 *
 * Slots:
 * - head: Helmets (perception, headshot resist)
 * - body: Armor (damage resist, carry weight)
 * - back: Backpacks (inventory slots, move speed)
 */

import { globalEventBus } from '../core/EventBus.js';
import { Items } from '../data/items.js';

export class EquipmentSystem {
    constructor(game) {
        this.game = game;

        // Equipped items: { head: itemId|null, body: itemId|null, back: itemId|null }
        this.equipped = {
            head: null,
            body: null,
            back: null,
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('equipment:equip', (data) => this.equip(data.itemId));
        globalEventBus.on('equipment:unequip', (data) => this.unequip(data.slot));
    }

    /**
     * Equip an item (must be in inventory, type='equipment')
     */
    equip(itemId) {
        const item = this.game.inventorySystem?.findItem(itemId);
        if (!item || item.type !== 'equipment') {
            console.log(`Cannot equip ${itemId}: not equipment or not in inventory`);
            return false;
        }

        const slot = item.slot;
        if (!slot || !this.equipped.hasOwnProperty(slot)) {
            console.log(`Invalid equipment slot: ${slot}`);
            return false;
        }

        if(this.equipped[slot]===itemId)return false;
        // Free the incoming item's slot before returning the outgoing item.
        this.game.inventorySystem.removeItemById(itemId,1);
        if (this.equipped[slot]) {
            if(!this.unequip(slot)){this.game.inventorySystem.addItem(itemId,1);return false;}
        }

        // Remove from inventory, equip it
        this.equipped[slot] = itemId;

        globalEventBus.emit('equipment:equipped', { slot, itemId, item });
        this.updateCharacterModel();
        this.game.powerupSystem?.recalculateStats();

        return true;
    }

    /**
     * Unequip item from slot (returns to inventory)
     */
    unequip(slot) {
        const itemId = this.equipped[slot];
        if (!itemId) return false;

        if(!this.game.inventorySystem?.addItem(itemId,1))return false;
        this.equipped[slot] = null;

        globalEventBus.emit('equipment:unequipped', { slot, itemId });
        this.updateCharacterModel();
        this.game.powerupSystem?.recalculateStats();

        return true;
    }

    /**
     * Get total buffs from all equipped items
     */
    getEquipmentBuffs() {
        const buffs = {};
        for (const [slot, itemId] of Object.entries(this.equipped)) {
            if (!itemId) continue;
            const item = this.getItemDef(itemId);
            if (item?.buffs) {
                for (const [stat, value] of Object.entries(item.buffs)) {
                    buffs[stat] = (buffs[stat] || 0) + value;
                }
            }
        }
        return buffs;
    }

    getItemDef(itemId) {
        return Items[itemId] || null;
    }

    /**
     * Update the 3D character model to show equipped items
     */
    updateCharacterModel() {
        const character = this.game.character;
        if (!character) return;

        // Map equipment to character visual fields
        const headItem = this.equipped.head ? this.getItemDef(this.equipped.head) : null;
        const backItem = this.equipped.back ? this.getItemDef(this.equipped.back) : null;
        character.armor=this.equipped.body || 'none';

        // Hats: cap -> 'cap', military -> 'military_cap', exo -> 'helmet'
        if (headItem) {
            if (headItem.id === 'helmet_cap') character.hat = 'cap';
            else if (headItem.id === 'helmet_military') character.hat = 'helmet';
            else if (headItem.id === 'helmet_exo') character.hat = 'helmet';
        } else {
            character.hat = 'none';
        }

        // Backpacks
        if (backItem) {
            if (backItem.id === 'backpack_daypack') character.backpack = 'daypack';
            else if (backItem.id === 'backpack_rucksack') character.backpack = 'rucksack';
            else if (backItem.id === 'backpack_military') character.backpack = 'military_pack';
        } else {
            character.backpack = 'none';
        }

        // Rebuild character model
        this.game.applyCharacter?.(character);
    }

    /**
     * Check if a slot is equipped
     */
    isEquipped(slot) {
        return !!this.equipped[slot];
    }

    getEquipped(slot) {
        return this.equipped[slot];
    }

    // Save/load
    serialize() {
        return { equipped: { ...this.equipped } };
    }

    deserialize(data) {
        if (!data?.equipped) return;
        this.equipped = { ...data.equipped };
        this.updateCharacterModel();
    }
}
