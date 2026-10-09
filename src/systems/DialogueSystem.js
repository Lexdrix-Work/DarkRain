import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * DialogueSystem - Handles NPC conversations
 */
export class DialogueSystem {
    constructor(game) {
        this.game = game;
        
        // Dialogue storage
        this.dialogues = new Map();
        this.currentDialogue = null;
        this.currentNode = null;
        this.dialogueHistory = [];
        
        // State
        this.isActive = false;
        this.currentSpeaker = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('dialogue:start', (data) => {
            this.startDialogue(data.dialogueId, data.speaker);
        });
        
        globalEventBus.on('dialogue:select', (data) => {
            this.selectOption(data.optionIndex);
        });
        
        globalEventBus.on('dialogue:end', () => {
            this.endDialogue();
        });
    }

    /**
     * Register a dialogue tree
     * @param {Object} dialogueData - Dialogue definition
     */
    registerDialogue(dialogueData) {
        this.dialogues.set(dialogueData.id, dialogueData);
    }

    /**
     * Start a dialogue
     * @param {string} dialogueId - Dialogue ID
     * @param {Entity} speaker - NPC speaking
     */
    startDialogue(dialogueId, speaker = null) {
        const dialogue = this.dialogues.get(dialogueId);
        if (this.isActive) return false;
        if (!dialogue) {
            console.warn(`Dialogue not found: ${dialogueId}`);
            return false;
        }
        
        this.currentDialogue = dialogue;
        this.currentSpeaker = speaker;
        this.isActive = true;
        this.dialogueHistory = [];
        this.wasPaused = this.game.isPaused;
        this.game.isPaused = true;
        
        // Pause game
        if (this.game.inputManager) {
            this.game.inputManager.exitPointerLock();
        }
        
        // Go to starting node
        this.goToNode(dialogue.startNode || 'start');
        
        globalEventBus.emit('dialogue:started', {
            dialogue,
            speaker
        });
        
        return true;
    }

    /**
     * Go to a dialogue node
     * @param {string} nodeId - Node ID
     */
    goToNode(nodeId) {
        if (!this.currentDialogue) return;
        
        const node = this.currentDialogue.nodes[nodeId];
        if (!node) {
            console.warn(`Dialogue node not found: ${nodeId}`);
            this.endDialogue();
            return;
        }
        
        this.currentNode = { id: nodeId, ...node };
        // Keep the filtered options the UI displayed so selectOption indexes the same array
        this.dialogueHistory.push(nodeId);
        
        // Execute node actions
        if (node.actions) {
            this.executeActions(node.actions);
        }
        this.currentNode.availableOptions = this.filterOptions(node.options || []);
        
        // Filter available options based on conditions
        const availableOptions = this.currentNode.availableOptions;
        
        // Auto-advance if no options and has next
        if (availableOptions.length === 0 && node.next) {
            setTimeout(() => this.goToNode(node.next), 100);
            return;
        }
        
        // End if no options and no next
        if (availableOptions.length === 0 && !node.next) {
            globalEventBus.emit('dialogue:node', {
                node: this.currentNode,
                options: [],
                isEnd: true
            });
            return;
        }
        
        globalEventBus.emit('dialogue:node', {
            node: this.currentNode,
            options: availableOptions,
            isEnd: false
        });
    }

    /**
     * Filter options based on conditions
     * @param {Array} options - Option list
     * @returns {Array} Filtered options
     */
    filterOptions(options) {
        return options.filter(option => {
            if (!option.condition) return true;
            return option.showLocked || this.evaluateCondition(option.condition);
        }).map((option, index) => ({
            ...option,
            text: typeof option.text === 'function' ? option.text(this.game) : option.text,
            index,
            locked: !!option.condition && !this.evaluateCondition(option.condition)
        }));
    }

    /**
     * Evaluate a condition
     * @param {Object} condition - Condition object
     * @returns {boolean}
     */
    evaluateCondition(condition) {
        const player = this.game.player;
        const questSystem = this.game.questSystem;
        const inventorySystem = this.game.inventorySystem;
        
        switch (condition.type) {
            case 'hasItem':
                return inventorySystem?.hasItem(condition.itemId, condition.amount || 1);
                
            case 'questState':
                const quest = questSystem?.getQuest(condition.questId);
                return quest?.state === condition.state;
                
            case 'questCompleted':
                return questSystem?.completedQuests.has(condition.questId);
                
            case 'reputation':
                return (this.game.factionSystem?.getRep(condition.faction) || 0) >= condition.value;
            case 'skill':
                return (this.game.progressionSystem?.getSkill(condition.skill) || 0) >= condition.value;
            case 'flag':
                return this.game.flags?.[condition.flag] === condition.value;
            case 'all':
                return condition.conditions.every(c => this.evaluateCondition(c));
                
            case 'stat':
                return (player?.stats?.[condition.stat] || 0) >= condition.value;
                
            case 'money':
                return (player?.money || 0) >= condition.amount;
                
            case 'custom':
                // Custom condition evaluation
                if (typeof condition.evaluate === 'function') {
                    return condition.evaluate(this.game);
                }
                return true;
                
            default:
                return true;
        }
    }

    /**
     * Execute dialogue actions
     * @param {Array} actions - Action list
     */
    executeActions(actions) {
        for (const action of actions) {
            this.executeAction(action);
        }
    }

    /**
     * Execute a single action
     * @param {Object} action - Action object
     */
    executeAction(action) {
        switch (action.type) {
            case 'giveItem':
                this.game.inventorySystem?.addItem(action.itemId, action.amount || 1);
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: `Received ${action.itemName || action.itemId}`,
                    type: 'success'
                });
                break;
                
            case 'takeItem':
                this.game.inventorySystem?.removeItemById(action.itemId, action.amount || 1);
                break;
                
            case 'giveMoney':
                this.game.progressionSystem?.addMoney(action.amount);
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: `Received ${action.amount} RU`,
                    type: 'success'
                });
                break;
                
            case 'takeMoney':
                this.game.progressionSystem?.spendMoney(action.amount);
                break;
                
            case 'startQuest':
                this.game.questSystem?.startQuest(action.questId);
                break;
                
            case 'completeQuest':
                this.game.questSystem?.completeQuest(action.questId);
                break;
                
            case 'failQuest':
                const quest = this.game.questSystem?.getQuest(action.questId);
                quest?.fail(action.reason);
                break;
                
            case 'updateObjective':
                const targetQuest = this.game.questSystem?.getQuest(action.questId);
                targetQuest?.updateObjective(action.objectiveId, action.amount || 1);
                break;
                
            case 'addReputation':
                this.game.factionSystem?.adjustRep(action.faction, action.amount, 'Dialogue choice');
                break;
                
            case 'teleport':
                if (this.game.player) {
                    this.game.player.position.fromArray(action.position);
                }
                break;
                
            case 'spawn':
                // Spawn entity/enemy
                if (this.game.worldManager) {
                    this.game.worldManager.spawnEnemy(action.entityData);
                }
                break;
                
            case 'playSound':
                globalEventBus.emit('audio:play', {
                    sound: action.sound,
                    volume: action.volume || 1
                });
                break;
                
            case 'setFlag':
                // Set a game flag
                this.game.flags = this.game.flags || {};
                this.game.flags[action.flag] = action.value;
                break;
                
            case 'custom':
                if (typeof action.execute === 'function') {
                    action.execute(this.game);
                }
                break;
        }
    }

    /**
     * Select a dialogue option
     * @param {number} optionIndex - Option index
     */
    selectOption(optionIndex) {
        const shownOptions = this.currentNode?.availableOptions || this.currentNode?.options;
        if (!shownOptions) return;
        
        const option = shownOptions[optionIndex];
        if (!option || option.locked || (option.condition && !this.evaluateCondition(option.condition))) return;
        
        // Execute option actions
        if (option.actions) {
            this.executeActions(option.actions);
        }
        
        // Go to next node or end
        if (option.next) {
            this.goToNode(option.next);
        } else if (option.end) {
            this.endDialogue();
        } else {
            // No next specified, end dialogue
            this.endDialogue();
        }
    }

    /**
     * End the current dialogue
     */
    endDialogue() {
        if (!this.isActive) return;
        
        const dialogue = this.currentDialogue;
        const speaker = this.currentSpeaker;
        
        this.isActive = false;
        this.currentDialogue = null;
        this.currentNode = null;
        this.currentSpeaker = null;
        this.game.isPaused = !!this.wasPaused;
        this.game.inputManager?.mouse?.buttons.clear();
        this.game.inputManager?.keysJustPressed?.delete('Mouse0');
        
        // Resume game
        if (this.game.canvas) {
            this.game.inputManager?.requestPointerLock(this.game.canvas);
        }
        
        globalEventBus.emit('dialogue:ended', {
            dialogue,
            speaker
        });
    }

    /**
     * Check if dialogue is active
     * @returns {boolean}
     */
    isDialogueActive() {
        return this.isActive;
    }
}

/**
 * Sample dialogue definitions
 */
export const SampleDialogues = {
    trader_intro: {
        id: 'trader_intro',
        speaker: 'Mara Voss',
        startNode: 'start',
        nodes: {
            start: {
                text: "Well, well... another stalker fresh from the outside. What do you want?",
                options: [
                    {
                        text: "I'm looking for work.",
                        next: 'work'
                    },
                    {
                        text: "What do you have for sale?",
                        next: 'trade',
                        actions: [{ type: 'setFlag', flag: 'asked_about_trade', value: true }]
                    },
                    {
                        text: "Tell me about the Zone.",
                        next: 'zone_info'
                    },
                    {
                        text: "Goodbye.",
                        end: true
                    }
                ]
            },
            work: {
                text: "Work, eh? I might have something. There's been mutant activity near the old farm. Clear them out and I'll make it worth your while.",
                options: [
                    {
                        text: "I'll take care of it.",
                        next: 'accept_quest',
                        actions: [{ type: 'startQuest', questId: 'quest_first_hunt' }]
                    },
                    {
                        text: "Maybe later.",
                        next: 'start'
                    }
                ]
            },
            accept_quest: {
                text: "Good. Come back when it's done. And try not to get yourself killed.",
                options: [
                    {
                        text: "I'll be back.",
                        end: true
                    }
                ]
            },
            trade: {
                text: "Browse my wares. I've got supplies, weapons, medical kits... everything a stalker needs to survive.",
                actions: [{ type: 'custom', execute: (game) => globalEventBus.emit('ui:openTrade') }],
                options: [
                    {
                        text: "Let me see what you have.",
                        end: true,
                        actions: [{ type: 'custom', execute: (game) => globalEventBus.emit('ui:openShop', { trader: 'sidorovich' }) }]
                    },
                    {
                        text: "Actually, I had a question.",
                        next: 'start'
                    }
                ]
            },
            zone_info: {
                text: "The Zone is no place for the faint-hearted. Anomalies will rip you apart, mutants will eat you alive, and other stalkers... well, let's just say not everyone plays nice. Keep your wits about you.",
                options: [
                    {
                        text: "What about artifacts?",
                        next: 'artifacts'
                    },
                    {
                        text: "Tell me about the factions.",
                        next: 'factions'
                    },
                    {
                        text: "Thanks for the info.",
                        next: 'start'
                    }
                ]
            },
            artifacts: {
                text: "Artifacts are valuable finds created by the anomalies. They have unique properties - some heal, some protect, some... well, some are just radioactive junk. Get yourself a detector and you might find some.",
                options: [
                    {
                        text: "Where can I find them?",
                        next: 'artifact_locations'
                    },
                    {
                        text: "Thanks.",
                        next: 'start'
                    }
                ]
            },
            artifact_locations: {
                text: "Anomaly fields are your best bet. The more dangerous the anomaly, the better the artifact. Of course, 'better' also means 'more likely to kill you trying to get it.'",
                options: [
                    {
                        text: "I'll keep that in mind.",
                        next: 'start'
                    }
                ]
            },
            factions: {
                text: "You've got stalkers like us - free agents looking to make a living. Then there's the military, bandits, mercenaries, and some more... unusual groups. My advice? Stay neutral until you know who you're dealing with.",
                options: [
                    {
                        text: "Good to know.",
                        next: 'start'
                    }
                ]
            }
        }
    }
};
