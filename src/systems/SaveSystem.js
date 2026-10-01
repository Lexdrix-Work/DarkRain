import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * SaveSystem - Handles game save/load functionality
 */
export class SaveSystem {
    constructor(game) {
        this.game = game;
        
        // Save configuration
        this.savePrefix = 'stalker_save_';
        this.maxSaveSlots = 10;
        this.autoSaveInterval = 300000; // 5 minutes
        this.autoSaveEnabled = true;
        
        // Auto-save timer
        this.autoSaveTimer = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAutoSave();
    }

    setupEventListeners() {
        globalEventBus.on(GameEvents.SAVE_GAME, (data) => {
            this.saveGame(data?.slot || 'manual');
        });
        
        globalEventBus.on(GameEvents.LOAD_GAME, (data) => {
            this.loadGame(data?.slot || 'manual');
        });
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
        
        if (this.autoSaveEnabled) {
            this.autoSaveTimer = setInterval(() => {
                this.saveGame('autosave');
            }, this.autoSaveInterval);
        }
    }

    /**
     * Stop auto-save
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Get save key for slot
     * @param {string} slot - Save slot name
     */
    getSaveKey(slot) {
        return `${this.savePrefix}${slot}`;
    }

    /**
     * Save the game
     * @param {string} slot - Save slot name
     * @returns {boolean} Success
     */
    saveGame(slot = 'quicksave') {
        try {
            const saveData = this.createSaveData();
            const saveKey = this.getSaveKey(slot);
            
            localStorage.setItem(saveKey, JSON.stringify(saveData));
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: slot === 'autosave' ? 'Auto-saved' : 'Game saved',
                type: 'success',
                duration: 2000
            });
                        console.log(`Game saved to slot: ${slot}`);
            return true;
        } catch (error) {
            console.error('Failed to save game:', error);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Failed to save game',
                type: 'danger'
            });
            return false;
        }
    }

    /**
     * Create save data object
     * @returns {Object} Save data
     */
    createSaveData() {
        const game = this.game;
        
        return {
            // Meta information
            meta: {
                version: '1.0.0',
                timestamp: Date.now(),
                playTime: game.playTime || 0,
                saveDate: new Date().toISOString()
            },
            
            // Player data
            player: game.player ? {
                position: game.player.position.toArray(),
                rotation: [game.player.rotation.x, game.player.rotation.y, game.player.rotation.z],
                cameraYaw: game.player.cameraYaw,
                cameraPitch: game.player.cameraPitch,
                stats: { ...game.player.stats },
                level: game.player.level || 1,
                experience: game.player.experience || 0
            } : null,
            
            // Inventory
            inventory: game.inventorySystem?.serialize() || null,
            
            // Weapons
            weapons: game.weaponManager ? {
                equipped: game.weaponManager.equippedWeapon?.id || null,
                weapons: Array.from(game.weaponManager.weapons.entries()).map(([id, weapon]) => ({
                    id,
                    currentAmmo: weapon.currentAmmo,
                    reserveAmmo: weapon.reserveAmmo
                })),
                slots: game.weaponManager.weaponSlots
            } : null,
            
            // World state
            world: game.worldManager?.serialize() || null,
            
            // Time and weather
            environment: {
                time: game.dayNightCycle?.currentTime || 0,
                weather: game.weatherSystem?.currentWeather || 'clear'
            },
            
            // Quests
            quests: game.questSystem?.serialize() || null,
            
            // Game flags
            flags: game.flags || {},
            
            // Current level
            currentLevel: game.worldManager?.currentLevel?.name || null
        };
    }

    /**
     * Load a saved game
     * @param {string} slot - Save slot name
     * @returns {boolean} Success
     */
    async loadGame(slot = 'quicksave') {
        try {
            const saveKey = this.getSaveKey(slot);
            const saveJson = localStorage.getItem(saveKey);
            
            if (!saveJson) {
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'No save found in this slot',
                    type: 'warning'
                });
                return false;
            }
            
            const saveData = JSON.parse(saveJson);
            
            // Validate save version
            if (!this.validateSaveData(saveData)) {
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'Save file is corrupted or incompatible',
                    type: 'danger'
                });
                return false;
            }
            
            // Show loading screen
            this.game.uiManager?.showLoadingScreen(true);
            this.game.uiManager?.updateLoadingProgress(0, 'Loading save...');
            
            // Apply save data
            await this.applySaveData(saveData);
            
            // Hide loading screen
            this.game.uiManager?.showLoadingScreen(false);
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Game loaded',
                type: 'success'
            });
            
            console.log(`Game loaded from slot: ${slot}`);
            return true;
        } catch (error) {
            console.error('Failed to load game:', error);
            this.game.uiManager?.showLoadingScreen(false);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Failed to load game',
                type: 'danger'
            });
            return false;
        }
    }

    /**
     * Validate save data structure
     * @param {Object} saveData - Save data to validate
     * @returns {boolean} Is valid
     */
    validateSaveData(saveData) {
        if (!saveData) return false;
        if (!saveData.meta) return false;
        if (!saveData.meta.version) return false;
        // Add more validation as needed
        return true;
    }

    /**
     * Apply save data to game
     * @param {Object} saveData - Save data
     */
    async applySaveData(saveData) {
        const game = this.game;
        
        // Load level if different
        if (saveData.currentLevel && saveData.currentLevel !== game.worldManager?.currentLevel?.name) {
            this.game.uiManager?.updateLoadingProgress(20, 'Loading level...');
            await game.loadLevel(saveData.currentLevel);
        }
        
        this.game.uiManager?.updateLoadingProgress(40, 'Restoring player...');
        
        // Restore player
        if (saveData.player && game.player) {
            game.player.position.fromArray(saveData.player.position);
            game.player.rotation.fromArray(saveData.player.rotation);
            game.player.cameraYaw = saveData.player.cameraYaw;
            game.player.cameraPitch = saveData.player.cameraPitch;
            game.player.stats = { ...saveData.player.stats };
            game.player.level = saveData.player.level;
            game.player.experience = saveData.player.experience;
        }
        
        this.game.uiManager?.updateLoadingProgress(60, 'Restoring inventory...');
        
        // Restore inventory
        if (saveData.inventory && game.inventorySystem) {
            game.inventorySystem.deserialize(saveData.inventory);
        }
        
        // Restore weapons
        if (saveData.weapons && game.weaponManager) {
            for (const weaponData of saveData.weapons.weapons) {
                const weapon = game.weaponManager.weapons.get(weaponData.id);
                if (weapon) {
                    weapon.currentAmmo = weaponData.currentAmmo;
                    weapon.reserveAmmo = weaponData.reserveAmmo;
                }
            }
            game.weaponManager.weaponSlots = saveData.weapons.slots;
            if (saveData.weapons.equipped) {
                game.weaponManager.equipWeapon(saveData.weapons.equipped);
            }
        }
        
        this.game.uiManager?.updateLoadingProgress(80, 'Restoring world...');
        
        // Restore environment
        if (saveData.environment) {
            if (game.dayNightCycle) {
                game.dayNightCycle.currentTime = saveData.environment.time;
            }
            if (game.weatherSystem) {
                game.weatherSystem.setWeather(saveData.environment.weather, 0);
            }
        }
        
        // Restore quests
        if (saveData.quests && game.questSystem) {
            game.questSystem.deserialize(saveData.quests);
        }
        
        // Restore flags
        game.flags = saveData.flags || {};
        
        // Restore play time
        game.playTime = saveData.meta.playTime || 0;
        
        this.game.uiManager?.updateLoadingProgress(100, 'Done');
    }

    /**
     * Get list of all save slots
     * @returns {Array} Save slot info
     */
    getSaveSlots() {
        const slots = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.savePrefix)) {
                try {
                    const saveData = JSON.parse(localStorage.getItem(key));
                    const slotName = key.replace(this.savePrefix, '');
                    
                    slots.push({
                        slot: slotName,
                        key: key,
                        timestamp: saveData.meta?.timestamp || 0,
                        date: saveData.meta?.saveDate || 'Unknown',
                        playTime: saveData.meta?.playTime || 0,
                        level: saveData.currentLevel || 'Unknown'
                    });
                } catch (e) {
                    // Invalid save data
                }
            }
        }
        
        // Sort by timestamp (newest first)
        slots.sort((a, b) => b.timestamp - a.timestamp);
        
        return slots;
    }

    /**
     * Delete a save slot
     * @param {string} slot - Save slot name
     */
    deleteSave(slot) {
        const saveKey = this.getSaveKey(slot);
        localStorage.removeItem(saveKey);
        
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: 'Save deleted',
            type: 'info'
        });
    }

    /**
     * Check if a save exists
     * @param {string} slot - Save slot name
     * @returns {boolean}
     */
    hasSave(slot) {
        return localStorage.getItem(this.getSaveKey(slot)) !== null;
    }

    /**
     * Export save to file
     * @param {string} slot - Save slot name
     */
    exportSave(slot) {
        const saveKey = this.getSaveKey(slot);
        const saveData = localStorage.getItem(saveKey);
        
        if (!saveData) {
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'No save to export',
                type: 'warning'
            });
            return;
        }
        
        const blob = new Blob([saveData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `stalker_save_${slot}_${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    /**
     * Import save from file
     * @param {File} file - Save file
     * @param {string} slot - Target slot
     */
    async importSave(file, slot = 'imported') {
        try {
            const text = await file.text();
            const saveData = JSON.parse(text);
            
            if (!this.validateSaveData(saveData)) {
                throw new Error('Invalid save file');
            }
            
            const saveKey = this.getSaveKey(slot);
            localStorage.setItem(saveKey, JSON.stringify(saveData));
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Save imported successfully',
                type: 'success'
            });
        } catch (error) {
            console.error('Failed to import save:', error);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Failed to import save file',
                type: 'danger'
            });
        }
    }

    dispose() {
        this.stopAutoSave();
    }

    /** Persist the character-creator choices separately from world saves */
    static saveCharacter(character) {
        try {
            localStorage.setItem('darkrain_character', JSON.stringify(character));
        } catch (e) { /* storage unavailable */ }
    }

    /** Load character-creator choices (null when the player never made one) */
    static loadCharacter() {
        try {
            const raw = localStorage.getItem('darkrain_character');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }
}