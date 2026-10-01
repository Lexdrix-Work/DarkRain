import { globalEventBus, GameEvents } from '../core/EventBus.js';
import * as THREE from 'three';
import { Items, getItem, createItem } from '../data/items.js';

/**
 * InventorySystem - Manages player inventory
 */
export class InventorySystem {
    constructor(game) {
        this.game = game;
        
        // Inventory configuration
        this.maxSlots = 24;
        this.maxWeight = 50; // kg
        
        // Inventory data
        this.slots = new Array(this.maxSlots).fill(null);
        this.currentWeight = 0;
        
        // Quick slots (belt)
        this.quickSlots = [null, null, null, null];
        
        // Favorites (Elder Scrolls-style quick access, max 8 item ids)
        this.favorites = [];
        
        // Equipment slots
        this.equipment = {
            armor: null,
            helmet: null,
            artifact1: null,
            artifact2: null,
            artifact3: null
        };
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('item:use', (data) => {
            this.useItem(data.index);
        });
        
        globalEventBus.on('item:drop', (data) => {
            this.dropItem(data.index);
        });
        
        globalEventBus.on(GameEvents.PLAYER_PICKUP, (data) => {
            this.addItem(data.item, data.amount);
        });
    }

    /**
     * Add item to inventory
     * @param {string|Object} itemOrId - Item ID or item object
     * @param {number} amount - Amount to add
     * @returns {boolean} Whether item was added
     */
    addItem(itemOrId, amount = 1) {
        const item = typeof itemOrId === 'string' ? createItem(itemOrId, amount) : itemOrId;
        if (!item) return false;
        
        // Check weight
        const itemWeight = (item.weight || 0) * amount;
        if (this.currentWeight + itemWeight > this.maxWeight) {
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Inventory too heavy!',
                type: 'warning'
            });
            return false;
        }

        // Transactional add: verify the FULL amount fits before touching any
        // slot. A partial add that returns false would let loot sources keep
        // the whole stack and hand it out again (item duplication).
        let remaining = amount;
        if (item.stackable) {
            for (const slot of this.slots) {
                if (slot && slot.id === item.id && slot.count < slot.maxStack) {
                    remaining -= Math.min(remaining, slot.maxStack - slot.count);
                    if (remaining <= 0) break;
                }
            }
        }
        if (remaining > 0) {
            const perSlot = item.stackable ? item.maxStack : 1;
            const slotsNeeded = Math.ceil(remaining / perSlot);
            const emptySlots = this.slots.filter(s => s === null).length;
            if (emptySlots < slotsNeeded) {
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'Inventory full!',
                    type: 'warning'
                });
                return false;
            }
        }

        // Try to stack with existing items
        if (item.stackable) {
            for (let i = 0; i < this.slots.length; i++) {
                const slot = this.slots[i];
                if (slot && slot.id === item.id && slot.count < slot.maxStack) {
                    const canAdd = Math.min(amount, slot.maxStack - slot.count);
                    slot.count += canAdd;
                    amount -= canAdd;

                    if (amount <= 0) {
                        this.recalculateWeight();
                        this.notifyChange();
                        return true;
                    }
                }
            }
        }

        // Find empty slot for remaining items
        while (amount > 0) {
            const emptySlot = this.slots.findIndex(s => s === null);
            if (emptySlot === -1) {
                // Unreachable after the capacity pre-check, but stay safe
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'Inventory full!',
                    type: 'warning'
                });
                return false;
            }

            const stackAmount = item.stackable ? Math.min(amount, item.maxStack) : 1;
            this.slots[emptySlot] = createItem(item.id, stackAmount);
            amount -= stackAmount;
        }
        
        this.recalculateWeight();
        this.notifyChange();
        this._checkEncumbranceWarnings();
        
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: `Picked up ${item.name}`,
            type: 'info'
        });
        
        return true;
    }

    /**
     * Remove item from inventory
     * @param {number} slotIndex - Slot index
     * @param {number} amount - Amount to remove
     * @returns {Object|null} Removed item
     */
    /**
     * Empty every slot (fresh start)
     */
    clearInventory() {
        this.slots = new Array(this.maxSlots).fill(null);
        this.quickSlots = [null, null, null, null];
        this.equipment = { armor: null, helmet: null, artifact1: null, artifact2: null, artifact3: null };
        this.currentWeight = 0;
    }

    removeItem(slotIndex, amount = 1) {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return null;
        
        const item = this.slots[slotIndex];
        if (!item) return null;
        
        if (item.stackable && item.count > amount) {
            item.count -= amount;
            this.recalculateWeight();
            this.notifyChange();
            return createItem(item.id, amount);
        } else {
            this.slots[slotIndex] = null;
            this.recalculateWeight();
            this.notifyChange();
            return item;
        }
    }

    /**
     * Remove item by id (finds first matching slot)
     * @param {string} itemId - Item id to remove
     * @param {number} amount - Amount to remove
     * @returns {Object|null} Removed item
     */
    removeItemById(itemId, amount = 1) {
        const slotIndex = this.slots.findIndex(slot => slot && slot.id === itemId);
        if (slotIndex === -1) return null;
        return this.removeItem(slotIndex, amount);
    }

    /**
     * Use an item
     * @param {number} slotIndex - Slot index
     */
    useItem(slotIndex) {
        const item = this.slots[slotIndex];
        if (!item) return;
        
        const player = this.game.player;
        if (!player) return;
        
        let consumed = false;
        
        switch (item.type) {
            case 'medical':
                // Effects are applied by SurvivalSystem (the single 'item:use' effect handler);
                // here we only decide whether the item is consumed.
                if (item.healAmount || item.stopsBleeding || item.curesRadiation) {
                    consumed = true;
                }
                break;
                
            case 'food':
                // Effects are applied by SurvivalSystem (the single 'item:use' effect handler);
                // here we only decide whether the item is consumed.
                if (item.hungerReduction || item.thirstReduction || item.healAmount || item.radiationAmount) {
                    consumed = true;
                }
                break;
                
            case 'antirad':
                // Effects are applied by SurvivalSystem (the single 'item:use' effect handler);
                // here we only decide whether the item is consumed.
                if (item.radiationRemoval) {
                    consumed = true;
                }
                break;
                
            case 'ammo':
                // Ammo is used automatically when reloading
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'Ammo is used automatically when reloading',
                    type: 'info'
                });
                break;
                
            case 'artifact':
                // Equip artifact
                this.equipArtifact(slotIndex);
                break;
                
            case 'detector':
                // Activate detector
                this.activateDetector(item);
                break;
        }
        
        if (consumed) {
            this.removeItem(slotIndex, 1);
        }
    }

    /**
     * Drop an item into the world
     * @param {number} slotIndex - Slot index
     * @param {number} amount - Amount to drop
     */
    dropItem(slotIndex, amount = 1) {
        const item = this.removeItem(slotIndex, amount);
        if (!item) return;
        
        const player = this.game.player;
        if (!player) return;
        
        // Calculate drop position in front of player
        const dropPosition = player.position.clone();
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation);
        dropPosition.addScaledVector(forward, 1.5);
        dropPosition.y = 0.5;
        
        // Create pickup in world
        if (this.game.worldManager) {
            this.game.worldManager.createPickup({
                item: item.id,
                amount: item.count || 1,
                position: dropPosition.toArray()
            });
        }
    }

    /**
     * Move item between slots
     * @param {number} fromSlot - Source slot
     * @param {number} toSlot - Destination slot
     */
    moveItem(fromSlot, toSlot) {
        if (fromSlot < 0 || fromSlot >= this.slots.length) return;
        if (toSlot < 0 || toSlot >= this.slots.length) return;
        if (fromSlot === toSlot) return;
        
        const fromItem = this.slots[fromSlot];
        const toItem = this.slots[toSlot];
        
        // Try to stack
        if (fromItem && toItem && fromItem.id === toItem.id && fromItem.stackable) {
            const canStack = toItem.maxStack - toItem.count;
            const toMove = Math.min(canStack, fromItem.count);
            
            toItem.count += toMove;
            fromItem.count -= toMove;
            
            if (fromItem.count <= 0) {
                this.slots[fromSlot] = null;
            }
        } else {
            // Swap items
            this.slots[fromSlot] = toItem;
            this.slots[toSlot] = fromItem;
        }
        
        this.notifyChange();
    }

    /**
     * Set quick slot
     * @param {number} quickSlotIndex - Quick slot index (0-3)
     * @param {number} inventorySlotIndex - Inventory slot index
     */
    setQuickSlot(quickSlotIndex, inventorySlotIndex) {
        if (quickSlotIndex < 0 || quickSlotIndex >= this.quickSlots.length) return;
        
        this.quickSlots[quickSlotIndex] = inventorySlotIndex;
        this.notifyChange();
    }

    /**
     * Use quick slot item
     * @param {number} quickSlotIndex - Quick slot index
     */
    useQuickSlot(quickSlotIndex) {
        if (quickSlotIndex < 0 || quickSlotIndex >= this.quickSlots.length) return;
        
        const slotIndex = this.quickSlots[quickSlotIndex];
        if (slotIndex !== null && slotIndex >= 0) {
            this.useItem(slotIndex);
        }
    }

    /**
     * Equip an artifact
     * @param {number} slotIndex - Inventory slot with artifact
     */
    equipArtifact(slotIndex) {
        const item = this.slots[slotIndex];
        if (!item || item.type !== 'artifact') return;
        
        // Find empty artifact slot
        for (let i = 1; i <= 3; i++) {
            const slotName = `artifact${i}`;
            if (!this.equipment[slotName]) {
                this.equipment[slotName] = this.removeItem(slotIndex);
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: `Equipped ${item.name}`,
                    type: 'success'
                });
                this.applyEquipmentEffects();
                return;
            }
        }
        
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: 'No empty artifact slots!',
            type: 'warning'
        });
    }

    /**
     * Unequip an artifact
     * @param {string} slotName - Equipment slot name
     */
    unequipArtifact(slotName) {
        const item = this.equipment[slotName];
        if (!item) return;
        
        if (this.addItem(item)) {
            this.equipment[slotName] = null;
            this.applyEquipmentEffects();
        }
    }

    /**
     * Apply effects from equipped items
     */
    applyEquipmentEffects() {
        const player = this.game.player;
        if (!player) return;
        
        // Reset bonuses
        player.equipmentBonuses = {
            healthRegen: 0,
            staminaBonus: 0,
            radiationResist: 0,
            damageResist: 0
        };
        
        // Apply artifact effects
        for (let i = 1; i <= 3; i++) {
            const artifact = this.equipment[`artifact${i}`];
            if (artifact && artifact.effects) {
                if (artifact.effects.healthRegen) {
                    player.equipmentBonuses.healthRegen += artifact.effects.healthRegen;
                }
                if (artifact.effects.staminaBonus) {
                    player.equipmentBonuses.staminaBonus += artifact.effects.staminaBonus;
                }
                // Add radiation from artifacts
                if (artifact.effects.radiationEmit) {
                    // This would be applied over time
                }
            }
        }
    }

    /**
     * Activate detector
     * @param {Object} item - Detector item
     */
    activateDetector(item) {
        if (this.game.anomalySystem) {
            this.game.anomalySystem.setDetectorActive(true);
            this.game.anomalySystem.detectorRange = item.detectorRange || 10;
        }
    }

    /**
     * Check if inventory has item
     * @param {string} itemId - Item ID
     * @param {number} amount - Required amount
     * @returns {boolean}
     */
    hasItem(itemId, amount = 1) {
        let total = 0;
        for (const slot of this.slots) {
            if (slot && slot.id === itemId) {
                total += slot.count || 1;
            }
        }
        return total >= amount;
    }

    /**
     * Get count of item
     * @param {string} itemId - Item ID
     * @returns {number}
     */
    getItemCount(itemId) {
        let total = 0;
        for (const slot of this.slots) {
            if (slot && slot.id === itemId) {
                total += slot.count || 1;
            }
        }
        return total;
    }

    /**
     * Get ammo count for weapon type
     * @param {string} ammoType - Ammo type
     * @returns {number}
     */
    getAmmoCount(ammoType) {
        let total = 0;
        for (const slot of this.slots) {
            if (slot && slot.ammoType === ammoType) {
                total += slot.count || 1;
            }
        }
        return total;
    }

    /**
     * Consume ammo for reloading
     * @param {string} ammoType - Ammo type
     * @param {number} amount - Amount needed
     * @returns {number} Amount actually consumed
     */
    consumeAmmo(ammoType, amount) {
        let consumed = 0;
        
        for (let i = 0; i < this.slots.length && consumed < amount; i++) {
            const slot = this.slots[i];
            if (slot && slot.ammoType === ammoType) {
                const toTake = Math.min(amount - consumed, slot.count || 1);
                consumed += toTake;
                
                if (slot.stackable) {
                    slot.count -= toTake;
                    if (slot.count <= 0) {
                        this.slots[i] = null;
                    }
                } else {
                    this.slots[i] = null;
                }
            }
        }
        
        this.recalculateWeight();
        this.notifyChange();
        
        return consumed;
    }

    /**
     * Recalculate total inventory weight
     */
    recalculateWeight() {
        this.currentWeight = 0;
        
        for (const slot of this.slots) {
            if (slot) {
                this.currentWeight += (slot.weight || 0) * (slot.count || 1);
            }
        }
        
        // Add equipment weight
        for (const [key, item] of Object.entries(this.equipment)) {
            if (item) {
                this.currentWeight += item.weight || 0;
            }
        }
    }

    /**
     * Encumbrance ratio 0..1 (Elder Scrolls-style carry weight feedback)
     * @returns {number}
     */
    getEncumbrance() {
        return this.maxWeight > 0 ? this.currentWeight / this.maxWeight : 0;
    }

    /**
     * Warn once per threshold crossing as the pack fills up
     */
    _checkEncumbranceWarnings() {
        const enc = this.getEncumbrance();
        const prev = this._lastEncWarn || 0;
        // Check the higher threshold first so a single big pickup that jumps
        // straight past 80% still fires the over-encumbered warning
        if (enc >= 0.95 && prev < 0.95) {
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Over-encumbered! Drop something or you can barely move', type: 'danger'
            });
        } else if (enc >= 0.8 && prev < 0.8) {
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'You are heavily loaded - movement slowed', type: 'warning'
            });
        }
        this._lastEncWarn = enc;
    }

    /**
     * Notify UI of inventory change
     */
    notifyChange() {
        globalEventBus.emit('inventory:changed', {
            slots: this.slots,
            quickSlots: this.quickSlots,
            equipment: this.equipment,
            weight: this.currentWeight,
            maxWeight: this.maxWeight
        });
    }

    /**
     * Get inventory data for saving
     */
    serialize() {
        return {
            slots: this.slots.map(s => s ? { ...s } : null),
            quickSlots: [...this.quickSlots],
            equipment: { ...this.equipment },
            favorites: [...this.favorites]
        };
    }

    /**
     * Load inventory from save data
     * @param {Object} data - Save data
     */
    deserialize(data) {
        this.slots = data.slots || new Array(this.maxSlots).fill(null);
        this.quickSlots = data.quickSlots || [null, null, null, null];
        this.favorites = Array.isArray(data.favorites) ? data.favorites.slice(0, 8) : [];
        this.equipment = data.equipment || {
            armor: null,
            helmet: null,
            artifact1: null,
            artifact2: null,
            artifact3: null
        };
        
        this.recalculateWeight();
        this.applyEquipmentEffects();
        this.notifyChange();
    }

    /* ------------------------------ favorites ------------------------------ */

    /**
     * Toggle an item id in the favorites list (max 8)
     * @param {string} itemId
     * @returns {boolean} true if now favorited
     */
    toggleFavorite(itemId) {
        const i = this.favorites.indexOf(itemId);
        if (i >= 0) {
            this.favorites.splice(i, 1);
            this.notifyChange();
            return false;
        }
        if (this.favorites.length >= 8) {
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Favorites full (8 max) - remove one first', type: 'warning'
            });
            return false;
        }
        this.favorites.push(itemId);
        this.notifyChange();
        return true;
    }

    isFavorite(itemId) {
        return this.favorites.includes(itemId);
    }

    /**
     * Favorites that the player actually carries right now
     * @returns {Array} slots with a favorite item id
     */
    getCarriedFavorites() {
        const out = [];
        for (const favId of this.favorites) {
            const idx = this.slots.findIndex(s => s && s.id === favId);
            if (idx >= 0) out.push({ index: idx, item: this.slots[idx] });
        }
        return out;
    }
}