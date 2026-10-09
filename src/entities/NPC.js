import * as THREE from 'three';
import { Entity } from './Entity.js';
import { HumanAnimationController } from '../systems/HumanAnimationSystem.js';
import { buildAnatomicalActor } from './AnatomicalActor.js';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * NPC Types
 */
export const NPCType = {
    TRADER: 'trader',
    QUEST_GIVER: 'quest_giver',
    FRIENDLY: 'friendly',
    NEUTRAL: 'neutral'
};

/**
 * NPC - Non-player character for interactions
 */
export class NPC extends Entity {
    constructor(options = {}) {
        super({ name: options.name || 'NPC', tags: ['npc', 'interactable'], ...options });
        
        this.npcType = options.type || NPCType.NEUTRAL;
        this.faction = options.faction || 'neutral';
        
        // Dialogue
        this.dialogueId = options.dialogueId || null;
        this.greetingDialogue = options.greetingDialogue || null;
        
        // Trading
        this.isTrader = options.isTrader || false;
        this.inventory = options.inventory || [];
        this.buyMultiplier = options.buyMultiplier || 0.5; // Buy at 50% value
        this.sellMultiplier = options.sellMultiplier || 1.2; // Sell at 120% value
        
        // Quests
        this.availableQuests = options.quests || [];
        
        // State
        this.isTalking = false;
        this.lookAtPlayer = true;
        this.interactionRange = options.interactionRange || 3;
        
        // Visual
        this.mesh = null;
        this.nameplate = null;
    }

    init(game) {
        super.init(game);
        this.createMesh();
        this.createNameplate();
    }

    createMesh() {
        const {group} = buildAnatomicalActor({skinTone:0xc9a186,jacketColor:0x4b5143});
        group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.setMesh(group);
        this.humanAnimations=new HumanAnimationController(this);
    }

    // Names belong in the interaction HUD, not as floating world geometry.
    createNameplate() {}
    destroy() {this.humanAnimations?.dispose();super.destroy();}
    update(deltaTime) {
        this.humanAnimations?.update(deltaTime);
        super.update(deltaTime);
        
        // Look at player if nearby
        if (this.lookAtPlayer && this.game?.player) {
            const distance = this.distanceTo(this.game.player);
            if (distance < 10) {
                this.lookAtTarget(this.game.player.position, deltaTime);
            }
        }
        
        // Animate indicator
        const indicator = this.mesh?.getObjectByName('indicator');
        if (indicator) {
            indicator.position.y = 2.1 + Math.sin(Date.now() * 0.003) * 0.1;
        }
        
        // Update nameplate to face camera
        if (this.nameplate && this.game?.player?.camera) {
            this.nameplate.quaternion.copy(this.game.player.camera.quaternion);
        }
    }

    /**
     * Look at target position
     * @param {THREE.Vector3} target - Target position
     * @param {number} deltaTime - Frame delta
     */
    lookAtTarget(target, deltaTime) {
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .setY(0);
        
        if (direction.lengthSq() > 0.001) {
            const targetRotation = Math.atan2(direction.x, direction.z);
            
            // Smooth rotation
            let diff = targetRotation - this.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            
            this.rotation.y += diff * 5 * deltaTime;
        }
    }

    /**
     * Interact with this NPC
     * @param {Entity} interactor - Entity interacting
     */
    interact(interactor) {
        if (this.isTalking) return;
        
        this.isTalking = true;
        
        // Start dialogue
        if (this.dialogueId) {
            globalEventBus.emit('dialogue:start', {
                dialogueId: this.dialogueId,
                speaker: this
            });
        } else if (this.isTrader) {
            // Open trade window
            globalEventBus.emit('ui:openShop', {
                trader: this,
                inventory: this.inventory
            });
        } else {
            // Generic greeting
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `${this.name}: "Hello, stalker."`,
                type: 'info'
            });
        }
        
        if (this.dialogueId) {
            // Release the talking lock when the dialogue ends
            globalEventBus.once('dialogue:ended', () => {
                this.isTalking = false;
            });
        } else {
            // No dialogue to wait for - release immediately so traders and
            // greeters can be interacted with again
            this.isTalking = false;
        }
    }

    /**
     * Check if NPC can be interacted with
     * @param {Entity} interactor - Entity trying to interact
     */
    canInteract(interactor) {
        const distance = this.distanceTo(interactor);
        return distance <= this.interactionRange && !this.isTalking;
    }

    /**
     * Get available quest IDs from this NPC
     */
    getAvailableQuestIds() {
        if (!this.game?.questSystem) return [];
        
        return this.availableQuests.filter(questId => {
            const quest = this.game.questSystem.getQuest(questId);
            return quest && quest.state === 'available';
        });
    }

    /**
     * Add item to trader inventory
     * @param {Object} item - Item to add
     */
    addToInventory(item) {
        if (!this.isTrader) return;
        this.inventory.push(item);
    }

    /**
     * Remove item from trader inventory
     * @param {string} itemId - Item ID
     */
    removeFromInventory(itemId) {
        const index = this.inventory.findIndex(i => i.id === itemId);
        if (index !== -1) {
            this.inventory.splice(index, 1);
        }
    }

    serialize() {
        return {
            ...super.serialize(),
            npcType: this.npcType,
            faction: this.faction,
            dialogueId: this.dialogueId,
            isTrader: this.isTrader,
            inventory: this.inventory,
            availableQuests: this.availableQuests
        };
    }
}
