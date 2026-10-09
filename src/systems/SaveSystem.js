import {playerError} from '../shared/PlayerErrors.js';
import {validSaveData,inCombat,newSession,indexChunks} from '../shared/SaveSchema.js';
import {getItem} from '../data/items.js';
import { SaveStorage } from './SaveStorage.ts';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * SaveSystem - Handles game save/load functionality
 */
export class SaveSystem {
    constructor(game) {
        this.game = game;
        
        // Save configuration
        this.savePrefix = 'stalker_save_';
        this.storage=new SaveStorage(this.savePrefix,globalThis.window?.darkRainDesktop);
        this.ready=this.storage.initialize();
        this.maxSaveSlots = 10;
        this.autoSaveInterval = 300000; // 5 minutes
        this.autoSaveEnabled = true;
        
        // Auto-save timer
        this.autoSaveTimer = null;this.pendingAutosave=new Set();this.districts={};this.lastChunk=null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAutoSave();
    }

    setupEventListeners() {
        this.offQuest=globalEventBus.on('quest:completed',()=>this.requestAutosave('quest-milestone'));
        this.offObjective=globalEventBus.on('quest:objective_completed',()=>this.requestAutosave('quest-milestone'));
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
                if(this.game.gameState==='playing'&&!this.game.isLoading)this.requestAutosave('interval');
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
    async saveGame(slot = 'quicksave',options={}) {
        if(this.game.session?.status==='ended')return false;
        if(slot==='autosave'&&!options.terminal&&(inCombat(this.game)||this.game.isPaused||this.game.isLoading||this.game.gameState!=='playing')){this.requestAutosave(options.reason||'deferred');return false;}
        if(this._saving){if(slot==='autosave')this.requestAutosave('busy');return false;}this._saving=true;
        try {
            await this.ready;
            this.game.session ||= newSession();const saveData = this.createSaveData();if(!this.validateSaveData(saveData))throw Error('Invalid snapshot');
            const saveKey = this.getSaveKey(slot);
            
            await this.storage.setItem(saveKey, JSON.stringify(saveData));
            this.game.uiManager?.refreshSaveAvailability?.();
            
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
                message: playerError(error,'save'),
                type: 'danger'
            });
            return false;
        }finally{this._saving=false;}
    }

    /**
     * Create save data object
     * @returns {Object} Save data
     */
    createSaveData() {
        const game = this.game;game.session ||=newSession();const world=game.worldManager?.serialize()||null,physics=game.physicsSystem?.serialize()||null,loot=game.lootSystem?.serialize()||null,alife=game.alifeSystem?.serialize()||null;
        return {
            // Meta information
            meta: {
                version: '2.0.0',schema:2,campaignId:game.session?.campaignId,worldSeed:game.session?.worldSeed,deathMode:game.session?.deathMode,ended:game.session?.status==='ended',
                timestamp: Date.now(),
                playTime: game.playTime || 0,
                saveDate: new Date().toISOString()
            },
            
            statistics:game.statisticsSystem?.serialize(),session:structuredClone(game.session),character:structuredClone(game.character||null),equipment:game.equipmentSystem?.serialize()||null,powerups:game.powerupSystem?.serialize?.()||null,flashlight:game.flashlightSystem?.serialize()||null,artifacts:game.artifactSystem?.serialize()||null,psy:game.psySystem?.serialize()||null,
            districts:structuredClone(this.districts),loot,alife,emission:game.emissionSystem?.serialize()||null,
            chunkIndex:indexChunks(world,loot,alife,game.session?.worldSeed,physics,game.physicsSystem?.panes),
            // Player data
            player: game.player ? {
                position: game.player.position.toArray(),
                rotation: [game.player.rotation.x, game.player.rotation.y, game.player.rotation.z],
                cameraYaw: game.player.cameraYaw,
                cameraPitch: game.player.cameraPitch,
                stats: { ...game.player.stats },
                level: game.player.level || 1,
                experience: game.player.experience || 0,
                money: game.player.money || 0
            } : null,
            
            // Inventory
            inventory: game.inventorySystem?.serialize() || null,
            
            // Weapons
            weapons: game.weaponManager ? {
                equipped: game.weaponManager.equippedWeapon?.id || null,
                weapons: Array.from(game.weaponManager.weapons.entries()).map(([id, weapon]) => ({
                    id,
                    currentAmmo: Number.isFinite(weapon.currentAmmo)?weapon.currentAmmo:null,
                    reserveAmmo: Number.isFinite(weapon.reserveAmmo)?weapon.reserveAmmo:null,unlimited:weapon.data.type==='melee'
                })),
                slots: game.weaponManager.weaponSlots
            } : null,
            
            // World state
            world,physics,
            tutorial:game.tutorialSystem?.serialize()||null,
            
            // Time and weather
            environment: {
                time: game.dayNightCycle?.currentTime || 0,
                weather: game.weatherSystem?.currentWeather || 'clear'
            },
            
            // Quests
            quests: game.questSystem?.serialize() || null,
            progression: game.progressionSystem?.serialize() || null,
            factions: game.factionSystem?.serialize() || null,
            perks: game.perkSystem?.serialize() || null,
            
            // Game flags
            flags: structuredClone(game.flags || {}),
            
            // Current level
            currentLevel: game.currentLevelName || null
        };
    }

    /**
     * Load a saved game
     * @param {string} slot - Save slot name
     * @returns {boolean} Success
     */
    async loadGame(slot = 'quicksave') {
        if(this._loading)return false;this._loading=true;this._restoreFailed=false;const entryPause=this.game.isPaused,entryLoading=this.game.isLoading;this.game.isPaused=true;this.game.inputManager?.clearHeldInput();this.game.uiManager?.showLoadingScreen(true);
        try {
            await this.ready;await this.storage.initialize();
            const saveKey = this.getSaveKey(slot);
            const saveJson = await this.storage.readItem(saveKey);
            
            if (!saveJson) {
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'No save found in this slot',
                    type: 'warning'
                });
                return false;
            }
            
            const saveData = JSON.parse(saveJson);if(saveData.meta?.ended||this.storage.isEnded(saveData.meta?.campaignId))return false;
            
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
            const previousLoading=entryLoading,previousPause=entryPause;
            this.game.isLoading=true;this.game.isPaused=true;
            try{
                const rollback=this.createSaveData();try{await this.applySaveData(saveData);}catch(error){try{await this.applySaveData(rollback);}catch{this._restoreFailed=true;}throw error;}
                await this.game.worldManager?.forestStreaming?.prepareAt(this.game.player.position,{signal:this.game.worldManager.loadingAbort?.signal});
            }finally{this.game.isLoading=previousLoading;this.game.isPaused=previousPause;}
            
            // Hide loading screen
            this.game.uiManager?.showLoadingScreen(false);
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message:JSON.parse(this.storage.getItem(saveKey)||'{}').meta?.recovered?'Backup recovered and loaded':'Game loaded',
                type: 'success'
            });
            
            console.log(`Game loaded from slot: ${slot}`);
            return true;
        } catch (error) {
            console.error('Failed to load game:', error);
            this.game.uiManager?.showLoadingScreen(false);if(this._restoreFailed){this.game.isPaused=true;this.game.uiManager?.openMenu('pause');}
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: playerError(error,'load'),
                type: 'danger'
            });
            return false;
        }finally{this._loading=false;this.game.isLoading=entryLoading;this.game.isPaused=this._restoreFailed?true:entryPause;this.game.uiManager?.showLoadingScreen(false);}
    }

    /**
     * Validate save data structure
     * @param {Object} saveData - Save data to validate
     * @returns {boolean} Is valid
     */
    validateSaveData(saveData) {return validSaveData(saveData);}

    /**
     * Apply save data to game
     * @param {Object} saveData - Save data
     */
    async applySaveData(saveData) {
        const game = this.game;game.onboarding?.clear();game.statisticsSystem?.restore(saveData.statistics);game.playTime=saveData.meta.playTime||0;const previousCampaign=game.session?.campaignId;game.session=saveData.session?structuredClone(saveData.session):newSession();this.districts=structuredClone(saveData.districts||{});
        if(saveData.character)game.applyCharacter?.(saveData.character);
        // Load level if different
        const legacyLevels = {'Pripyat Downtown':'pripyat_downtown'};
        const savedLevel = game.getAvailableLevels?.().find(id =>
            id === saveData.currentLevel || game.getLevelInfo(id)?.name === saveData.currentLevel) || saveData.currentLevel;
        const levelId=legacyLevels[savedLevel] || savedLevel;
        if (levelId && (levelId !== game.currentLevelName||previousCampaign&&previousCampaign!==game.session.campaignId)) {
            this.game.uiManager?.updateLoadingProgress(20, 'Loading level...');
            await game.loadLevel(levelId);
        }
        
        this.game.uiManager?.updateLoadingProgress(40, 'Restoring player...');
        
        // Restore player
        if (saveData.player && game.player) {
            game.player.position.fromArray(saveData.player.position);
            game.player.rotation.fromArray(saveData.player.rotation);
            game.player.cameraYaw = saveData.player.cameraYaw;
            game.player.cameraPitch = saveData.player.cameraPitch;
            game.player.stats = { ...saveData.player.stats };game.player.isActive=true;game.player.alive=true;game.player.velocity?.set(0,0,0);
            game.player.level = saveData.player.level;
            game.player.experience = saveData.player.experience;
            game.player.money = saveData.player.money ?? 100;
        }
        
        this.game.uiManager?.updateLoadingProgress(60, 'Restoring inventory...');
        
        // Restore inventory
        if (saveData.inventory && game.inventorySystem) {
            game.inventorySystem.deserialize(saveData.inventory);
        }
        
        // Restore weapons
        if (saveData.weapons && game.weaponManager) {
            game.weaponManager.clearAll();for (const weaponData of saveData.weapons.weapons) {
                game.weaponManager.addWeapon(weaponData.id);
                const weapon = game.weaponManager.weapons.get(weaponData.id);
                if (weapon) {
                    weapon.currentAmmo = weapon.data.type==='melee'?Infinity:weaponData.currentAmmo;
                    weapon.reserveAmmo = weapon.data.type==='melee'?Infinity:weaponData.reserveAmmo;
                }
            }
            game.weaponManager.weaponSlots = saveData.weapons.slots;
            if (saveData.weapons.equipped) {
                game.weaponManager.equipWeapon(saveData.weapons.equipped);
            }
        }
        
        this.game.uiManager?.updateLoadingProgress(80, 'Restoring world...');
        
        game.worldManager?.restoreSaved?.(saveData.world);game.lootSystem?.restore(saveData.loot);game.alifeSystem?.restore(saveData.alife);game.equipmentSystem?.deserialize(saveData.equipment);game.powerupSystem?.deserialize?.(saveData.powerups);if(saveData.flashlight)game.flashlightSystem?.deserialize(saveData.flashlight);game.artifactSystem?.restore?.(saveData.artifacts);game.psySystem?.restore(saveData.psy);
        game.physicsSystem?.restore(saveData.physics);game.emissionSystem?.restore(saveData.emission);
        game.tutorialSystem?.restore(saveData.tutorial);
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
        game.flags = structuredClone(saveData.flags || {});
        game.progressionSystem?.deserialize(saveData.progression);
        game.factionSystem?.deserialize(saveData.factions || {});
        game.perkSystem?.deserialize(saveData.perks || {perks:[],points:0,level:game.player?.level || 1});
        game.powerupSystem?.recalculateStats();
        game.fieldOperations?.syncWorldState();game.onboarding?.syncWorld();
        
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
        
        for (const key of this.storage.keys()) {
            if (key.startsWith(this.savePrefix)) {
                try {
                    const saveData = JSON.parse(this.storage.getItem(key));
                    const slotName = key.replace(this.savePrefix, '');
                    
                    slots.push({
                        slot: slotName,
                        key: key,
                        timestamp: saveData.meta?.timestamp || 0,
                        date: saveData.meta?.saveDate || 'Unknown',
                        playTime: saveData.meta?.playTime || 0,
                        level: saveData.currentLevel || 'Unknown',ended:!!saveData.meta?.ended,recovered:!!saveData.meta?.recovered,deathMode:saveData.meta?.deathMode||'legacy'
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
    async deleteSave(slot) {
        const saveKey = this.getSaveKey(slot);
        await this.storage.removeItem(saveKey);
        
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
        const json=this.storage.getItem(this.getSaveKey(slot));if(!json)return false;try{return !JSON.parse(json).meta?.ended;}catch{return false;}
    }

    /**
     * Export save to file
     * @param {string} slot - Save slot name
     */
    async exportSave(slot) {
        const saveKey = this.getSaveKey(slot);
        const saveData = await this.storage.readItem(saveKey);
        
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
        a.download = `darkrain_save_${slot}_${Date.now()}.json`;
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
            await this.storage.setItem(saveKey, JSON.stringify(saveData));
            this.game.uiManager?.refreshSaveAvailability?.();
            
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
        this.stopAutoSave();this.offQuest?.();this.offObjective?.();
    }

    requestAutosave(reason){this.pendingAutosave.add(reason);}
    update(){const g=this.game;if(g.gameState!=='playing'||g.isLoading||g.isPaused)return;const key=g.currentLevelName+':'+Math.floor(g.player.position.x/128)+':'+Math.floor(g.player.position.z/128);if(this.lastChunk!==null&&key!==this.lastChunk)this.requestAutosave('chunk-transition');this.lastChunk=key;
        if(this.pendingAutosave.size&&!inCombat(g)&&!this._saving&&performance.now()>=(this.nextAutosave||0)){const reasons=[...this.pendingAutosave];this.pendingAutosave.clear();this.nextAutosave=performance.now()+10000;void this.saveGame('autosave',{reason:reasons.join(',')}).then(ok=>{if(!ok)reasons.forEach(r=>this.requestAutosave(r));});}}
    captureDistrict(){const g=this.game;if(!g.currentLevelName)return;this.districts[g.currentLevelName]={world:g.worldManager.serialize(),loot:g.lootSystem?.serialize(),physics:g.physicsSystem?.serialize(),artifacts:g.artifactSystem?.serialize(),alife:g.alifeSystem?.serialize(),chunks:indexChunks(g.worldManager.serialize(),g.lootSystem?.serialize(),g.alifeSystem?.serialize(),g.session?.worldSeed)};}
    restoreDistrict(level){const d=this.districts[level],g=this.game;if(!d)return;g.worldManager.restoreSaved(d.world);g.lootSystem?.restore(d.loot);g.physicsSystem?.restore(d.physics);g.alifeSystem?.restore(d.alife);g.artifactSystem?.restore(d.artifacts);}
    async readValidated(slot){await this.ready;const json=await this.storage.readItem(this.getSaveKey(slot));if(!json)return null;const d=JSON.parse(json);return this.validateSaveData(d)&&!d.meta?.ended&&!this.storage.isEnded(d.meta?.campaignId)&&!(this.game.session?.status==='ended'&&this.game.session.campaignId===d.meta?.campaignId)?d:null;}
    newestSlot(){return this.getSaveSlots().find(s=>!s.ended&&!['renderer_recovery','settings_restart'].includes(s.slot))?.slot||null;}
    handleDeath(){if(this.deathTask)return this.deathTask;const g=this.game;g.gameState='dead';g.isPaused=true;this.pendingAutosave.clear();this.deathTask=(async()=>{g.session ||=newSession();if(!this._deathPrepared){g.session.deaths++;this._deathPrepared=true;}
        if(g.session.deathMode==='permadeath'){g.session.status='ended';await this.storage.markEnded(g.session.campaignId);g.uiManager?.refreshSaveAvailability();return 'ended';}
        if(!this._dropPrepared){const items=(g.inventorySystem?.slots||[]).filter(Boolean).map(i=>({id:i.id,count:i.count}));for(const id of Object.values(g.equipmentSystem?.equipped||{}))if(id)items.push({id,count:1});for(const id of g.weaponManager?.weapons.keys()||[])if(getItem('weapon_'+id)&&!items.some(i=>i.id==='weapon_'+id))items.push({id:'weapon_'+id,count:1});for(const item of items){const w=g.weaponManager?.weapons.get(item.id.replace('weapon_',''));if(w&&w.data.type!=='melee')item.weaponState={currentAmmo:w.currentAmmo,reserveAmmo:w.reserveAmmo};}
        const grave=g.lootSystem?.spawnContainer('stash',g.player.position.x,g.player.position.z,{items,supportY:g.player.position.y});if(grave)grave.label='Your dropped pack';g.inventorySystem?.clearInventory();g.inventorySystem?.applyEquipmentEffects();g.inventorySystem?.notifyChange();if(g.powerupSystem){g.powerupSystem.equippedArtifacts=new Set();g.powerupSystem.activeBuffs.clear();g.powerupSystem.recalculateStats();}if(g.equipmentSystem){g.equipmentSystem.equipped={head:null,body:null,back:null};g.equipmentSystem.updateCharacterModel();}g.weaponManager?.clearAll();
        const p=g.player,spawn=g.session.respawn?.position||g.worldManager.getPlayerSpawnPosition().toArray();p.position.fromArray(spawn);g.physicsSystem?.playerBody?.setTranslation({x:p.position.x,y:p.position.y+.9,z:p.position.z},true);p.velocity.set(0,0,0);p.stats.health=p.stats.maxHealth;p.stats.stamina=p.stats.maxStamina;p.stats.bleeding=0;p.stats.radiation=0;p.stats.hunger=0;p.stats.thirst=0;this._dropPrepared=true;}
        while(this._saving)await new Promise(r=>setTimeout(r,10));const ok=await this.saveGame('autosave',{terminal:true});if(!ok)throw Error('Death checkpoint failed to save');return 'drop';})();return this.deathTask;}
    async respawn(){await this.deathTask;if(this.game.session?.status==='ended')return false;this.deathTask=null;this._deathPrepared=false;this._dropPrepared=false;this.game.player.isActive=true;this.game.player.alive=true;this.game.player.updateCamera(0);this.game.gameState='playing';this.game.isPaused=false;this.game.clock.reset();return true;}

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
