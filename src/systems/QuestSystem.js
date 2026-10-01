import { globalEventBus, GameEvents } from '../core/EventBus.js';
import * as THREE from 'three';

/**
 * Quest states
 */
export const QuestState = {
    UNAVAILABLE: 'unavailable',
    AVAILABLE: 'available',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

/**
 * Objective types
 */
export const ObjectiveType = {
    KILL: 'kill',
    COLLECT: 'collect',
    DELIVER: 'deliver',
    REACH: 'reach',
    TALK: 'talk',
    SURVIVE: 'survive',
    ESCORT: 'escort'
};

/**
 * Quest class - Individual quest instance
 */
export class Quest {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.giver = data.giver || null;
        this.state = QuestState.UNAVAILABLE;
        
        // Objectives
        this.objectives = (data.objectives || []).map(obj => ({
            ...obj,
            target: obj.target ?? 1, // REACH-style objectives are binary
            current: 0,
            completed: false
        }));
        
        // Rewards
        this.rewards = data.rewards || {
            experience: 0,
            money: 0,
            items: [],
            reputation: {}
        };
        
        // Requirements
        this.requirements = data.requirements || {
            level: 1,
            quests: [],
            reputation: {}
        };
        
        // Time limit (optional)
        this.timeLimit = data.timeLimit || null;
        this.timeRemaining = this.timeLimit;
        
        // Tracking
        this.startTime = null;
        this.endTime = null;
    }

    /**
     * Check if quest can be started
     * @param {Object} playerData - Player data for requirement checks
     */
    canStart(playerData) {
        // Check level
        if (playerData.level < this.requirements.level) return false;
        
        // Check prerequisite quests
        for (const questId of this.requirements.quests) {
            if (!playerData.completedQuests?.includes(questId)) return false;
        }
        
        // Check reputation
        for (const [faction, required] of Object.entries(this.requirements.reputation)) {
            if ((playerData.reputation?.[faction] || 0) < required) return false;
        }
        
        return true;
    }

    /**
     * Start the quest
     */
    start() {
        if (this.state !== QuestState.AVAILABLE) return false;
        
        this.state = QuestState.ACTIVE;
        this.startTime = Date.now();
        this.timeRemaining = this.timeLimit;
        
        return true;
    }

    /**
     * Update objective progress
     * @param {string} objectiveId - Objective ID
     * @param {number} amount - Progress amount
     */
    updateObjective(objectiveId, amount = 1) {
        const objective = this.objectives.find(o => o.id === objectiveId);
        if (!objective || objective.completed) return false;
        
        objective.current = Math.min(objective.current + amount, objective.target);
        
        if (objective.current >= objective.target) {
            objective.completed = true;
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `Objective completed: ${objective.description}`,
                type: 'success'
            });
        }
        
        // Check if all objectives complete - route through the system so rewards
        // are granted and quest chains unlock
        if (this.objectives.every(o => o.completed)) {
            if (this.system) {
                this.system.completeQuest(this.id);
            } else {
                this.complete();
            }
        }
        
        return true;
    }

    /**
     * Complete the quest
     */
    complete() {
        if (this.state !== QuestState.ACTIVE) return false;
        
        this.state = QuestState.COMPLETED;
        this.endTime = Date.now();
        
        return true;
    }

    /**
     * Fail the quest
     * @param {string} reason - Failure reason
     */
    fail(reason = '') {
        if (this.state !== QuestState.ACTIVE) return false;
        
        this.state = QuestState.FAILED;
        this.endTime = Date.now();
        
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: `Quest failed: ${this.name}${reason ? ` - ${reason}` : ''}`,
            type: 'danger'
        });
        
        return true;
    }

    /**
     * Update quest timer
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        if (this.state !== QuestState.ACTIVE) return;
        
        if (this.timeLimit) {
            this.timeRemaining -= deltaTime;
            
            if (this.timeRemaining <= 0) {
                this.fail('Time expired');
            }
        }
    }

    /**
     * Get quest progress percentage
     */
    getProgress() {
        if (this.objectives.length === 0) return 0;
        
        const total = this.objectives.reduce((sum, obj) => sum + obj.target, 0);
        const current = this.objectives.reduce((sum, obj) => sum + obj.current, 0);
        
        return (current / total) * 100;
    }

    /**
     * Serialize quest for saving
     */
    serialize() {
        return {
            id: this.id,
            state: this.state,
            objectives: this.objectives.map(o => ({
                id: o.id,
                current: o.current,
                completed: o.completed
            })),
            startTime: this.startTime,
            timeRemaining: this.timeRemaining
        };
    }

    /**
     * Deserialize quest from save
     * @param {Object} data - Save data
     */
    deserialize(data) {
        this.state = data.state;
        this.startTime = data.startTime;
        this.timeRemaining = data.timeRemaining;
        
        for (const savedObj of data.objectives) {
            const obj = this.objectives.find(o => o.id === savedObj.id);
            if (obj) {
                obj.current = savedObj.current;
                obj.completed = savedObj.completed;
            }
        }
    }
}

/**
 * QuestSystem - Manages all quests
 */
export class QuestSystem {
    constructor(game) {
        this.game = game;
        
        // Quest storage
        this.quests = new Map();
        this.activeQuests = new Set();
        this.completedQuests = new Set();
        
        // Quest tracking for objectives
        this.killTracking = new Map(); // enemy type -> quest objectives
        this.collectTracking = new Map(); // item id -> quest objectives
        this.locationTracking = []; // { position, radius, questId, objectiveId }
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Track enemy kills
        globalEventBus.on(GameEvents.ENEMY_DEATH, (data) => {
            this.onEnemyKilled(data.enemy);
        });
        
        // Track item pickups
        globalEventBus.on(GameEvents.PLAYER_PICKUP, (data) => {
            this.onItemCollected(data.item, data.amount);
        });
    }

    /**
     * Register a quest
     * @param {Object} questData - Quest definition
     */
    registerQuest(questData) {
        const quest = new Quest(questData);
        quest.system = this; // Back-reference so objective completion can grant rewards
        this.quests.set(quest.id, quest);
        
        // Build tracking maps for objectives
        for (const obj of quest.objectives) {
            switch (obj.type) {
                case ObjectiveType.KILL:
                    if (!this.killTracking.has(obj.targetType)) {
                        this.killTracking.set(obj.targetType, []);
                    }
                    this.killTracking.get(obj.targetType).push({
                        questId: quest.id,
                        objectiveId: obj.id
                    });
                    break;
                    
                case ObjectiveType.COLLECT:
                    if (!this.collectTracking.has(obj.itemId)) {
                        this.collectTracking.set(obj.itemId, []);
                    }
                    this.collectTracking.get(obj.itemId).push({
                        questId: quest.id,
                        objectiveId: obj.id
                    });
                    break;
                    
                case ObjectiveType.REACH:
                    this.locationTracking.push({
                        position: new THREE.Vector3().fromArray(obj.position),
                        radius: obj.radius || 5,
                        questId: quest.id,
                        objectiveId: obj.id
                    });
                    break;
            }
        }
        
        return quest;
    }

    /**
     * Make a quest available
     * @param {string} questId - Quest ID
     */
    makeAvailable(questId) {
        const quest = this.quests.get(questId);
        if (!quest) return false;
        
        quest.state = QuestState.AVAILABLE;
        return true;
    }

    /**
     * Start a quest
     * @param {string} questId - Quest ID
     */
    startQuest(questId) {
        const quest = this.quests.get(questId);
        if (!quest) return false;
        
        if (quest.start()) {
            this.activeQuests.add(questId);
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `Quest started: ${quest.name}`,
                type: 'info',
                duration: 5000
            });
            
            globalEventBus.emit('quest:started', { quest });
            
            return true;
        }
        
        return false;
    }

    /**
     * Complete a quest and give rewards
     * @param {string} questId - Quest ID
     */
    completeQuest(questId) {
        const quest = this.quests.get(questId);
        if (!quest || quest.state !== QuestState.ACTIVE) return false;
        
        if (quest.complete()) {
            this.activeQuests.delete(questId);
            this.completedQuests.add(questId);
            
            // Give rewards
            this.giveRewards(quest.rewards);
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `Quest completed: ${quest.name}`,
                type: 'success',
                duration: 5000
            });
            
            globalEventBus.emit('quest:completed', { quest });
            
            // Check for unlocked quests
            this.checkQuestUnlocks();
            
            return true;
        }
        
        return false;
    }

    /**
     * Give quest rewards to player
     * @param {Object} rewards - Rewards object
     */
    giveRewards(rewards) {
        const player = this.game.player;
        if (!player) return;
        
        // Experience
        if (rewards.experience) {
            // player.addExperience(rewards.experience);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `+${rewards.experience} XP`,
                type: 'success'
            });
        }
        
        // Money
        if (rewards.money) {
            // player.addMoney(rewards.money);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: `+${rewards.money} RU`,
                type: 'success'
            });
        }
        
        // Items
        if (rewards.items && this.game.inventorySystem) {
            for (const itemReward of rewards.items) {
                this.game.inventorySystem.addItem(itemReward.id, itemReward.amount);
            }
        }
        
        // Reputation
        if (rewards.reputation) {
            for (const [faction, amount] of Object.entries(rewards.reputation)) {
                // player.addReputation(faction, amount);
            }
        }
    }

    /**
     * Check and unlock quests based on completion
     */
    checkQuestUnlocks() {
        const playerData = {
            level: this.game.player?.level || 1,
            completedQuests: Array.from(this.completedQuests),
            reputation: {} // Would come from player/faction system
        };
        
        for (const quest of this.quests.values()) {
            if (quest.state === QuestState.UNAVAILABLE && quest.canStart(playerData)) {
                quest.state = QuestState.AVAILABLE;
                
                globalEventBus.emit('quest:available', { quest });
            }
        }
    }

    /**
     * Handle enemy killed event
     * @param {Enemy} enemy - Killed enemy
     */
    onEnemyKilled(enemy) {
        // Check enemy type
        const enemyTypes = ['enemy'];
        if (enemy.hasTag('mutant')) enemyTypes.push('mutant');
        if (enemy.hasTag('human')) enemyTypes.push('human');
        if (enemy.faction) enemyTypes.push(enemy.faction);
        
        for (const type of enemyTypes) {
            const tracking = this.killTracking.get(type);
            if (tracking) {
                for (const { questId, objectiveId } of tracking) {
                    if (this.activeQuests.has(questId)) {
                        const quest = this.quests.get(questId);
                        quest?.updateObjective(objectiveId, 1);
                    }
                }
            }
        }
    }

    /**
     * Handle item collected event
     * @param {Object} item - Collected item
     * @param {number} amount - Amount collected
     */
    onItemCollected(item, amount = 1) {
        const tracking = this.collectTracking.get(item.id);
        if (tracking) {
            for (const { questId, objectiveId } of tracking) {
                if (this.activeQuests.has(questId)) {
                    const quest = this.quests.get(questId);
                    quest?.updateObjective(objectiveId, amount);
                }
            }
        }
    }

    /**
     * Check location-based objectives
     * @param {THREE.Vector3} playerPosition - Player position
     */
    checkLocationObjectives(playerPosition) {
        for (const loc of this.locationTracking) {
            if (!this.activeQuests.has(loc.questId)) continue;
            
            const distance = playerPosition.distanceTo(loc.position);
            if (distance <= loc.radius) {
                const quest = this.quests.get(loc.questId);
                if (quest) {
                    const objective = quest.objectives.find(o => o.id === loc.objectiveId);
                    if (objective && !objective.completed) {
                        quest.updateObjective(loc.objectiveId, objective.target);
                    }
                }
            }
        }
    }

    /**
     * Get all active quests
     * @returns {Quest[]}
     */
    getActiveQuests() {
        return Array.from(this.activeQuests).map(id => this.quests.get(id)).filter(q => q);
    }

    /**
     * Get all available quests
     * @returns {Quest[]}
     */
    getAvailableQuests() {
        return Array.from(this.quests.values()).filter(q => q.state === QuestState.AVAILABLE);
    }

    /**
     * Get quest by ID
     * @param {string} questId - Quest ID
     * @returns {Quest|undefined}
     */
    getQuest(questId) {
        return this.quests.get(questId);
    }

    /**
     * Update all active quests
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        // Update quest timers
        for (const questId of this.activeQuests) {
            const quest = this.quests.get(questId);
            quest?.update(deltaTime);
        }
        
        // Check location objectives
        if (this.game.player) {
            this.checkLocationObjectives(this.game.player.position);
        }
    }

    /**
     * Serialize quest system for saving
     */
    serialize() {
        const questStates = {};
        for (const [id, quest] of this.quests) {
            questStates[id] = quest.serialize();
        }
        
        return {
            questStates,
            activeQuests: Array.from(this.activeQuests),
            completedQuests: Array.from(this.completedQuests)
        };
    }

    /**
     * Deserialize quest system from save
     * @param {Object} data - Save data
     */
    deserialize(data) {
        this.activeQuests = new Set(data.activeQuests);
        this.completedQuests = new Set(data.completedQuests);
        
        for (const [id, questData] of Object.entries(data.questStates)) {
            const quest = this.quests.get(id);
            if (quest) {
                quest.deserialize(questData);
            }
        }
    }
}

/**
 * Sample quest definitions
 */
export const SampleQuests = [
    {
        id: 'quest_first_hunt',
        name: 'First Hunt',
        description: 'Kill some mutants in the area to prove your worth as a stalker.',
        giver: 'trader_sidorovich',
        objectives: [
            {
                id: 'kill_mutants',
                type: ObjectiveType.KILL,
                description: 'Kill mutants',
                targetType: 'mutant',
                target: 3,
            }
        ],
        rewards: {
            experience: 100,
            money: 500,
            items: [
                { id: 'medkit_small', amount: 2 },
                { id: 'ammo_pistol', amount: 30 }
            ]
        },
        requirements: {
            level: 1,
            quests: [],
            reputation: {}
        }
    },
    {
        id: 'quest_artifact_hunt',
        name: 'Artifact Retrieval',
        description: 'Find an artifact in the anomaly field and bring it back.',
        giver: 'scientist_sakharov',
        objectives: [
            {
                id: 'find_artifact',
                type: ObjectiveType.COLLECT,
                description: 'Find any artifact',
                itemId: 'artifact_moonlight',
                target: 1,
            },
            {
                id: 'return_artifact',
                type: ObjectiveType.REACH,
                description: 'Return to Sakharov',
                position: [100, 0, 50],
                radius: 5
            }
        ],
        rewards: {
            experience: 250,
            money: 2000,
            items: [
                { id: 'detector_advanced', amount: 1 }
            ]
        },
        requirements: {
            level: 1,
            quests: ['quest_first_hunt'],
            reputation: {}
        }
    },
    {
        id: 'quest_clear_camp',
        name: 'Clear the Bandit Camp',
        description: 'A group of bandits has set up camp nearby. Eliminate them.',
        giver: 'stalker_wolf',
        objectives: [
            {
                id: 'kill_bandits',
                type: ObjectiveType.KILL,
                description: 'Eliminate bandits',
                targetType: 'bandit',
                target: 5,
            }
        ],
        rewards: {
            experience: 200,
            money: 1000,
            items: [],
            reputation: { stalkers: 50, bandits: -100 }
        },
        requirements: {
            level: 2,
            quests: [],
            reputation: {}
        },
        timeLimit: 3600 // 1 hour
    }
];