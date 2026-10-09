import {playerError} from './shared/PlayerErrors.js';
import {ScavengingOnboarding} from './systems/ScavengingOnboarding.js';
import {GameFeel} from './systems/GameFeel.js';
import {CampaignStatistics} from './systems/CampaignStatistics.js';
import {PhotoMode} from './ui/PhotoMode.js';
import {newSession} from './shared/SaveSchema.js';
import {runStartupCalibration} from './core/startup/StartupCalibration.js';
import {StartupTrace} from './core/startup/StartupTrace.js';
import {preloadAnatomicalActors} from './entities/AnatomicalActor.js';
import {preloadHumanAnimations} from './systems/HumanAnimationSystem.js';
import {TunnelTutorial} from './systems/TunnelTutorial.js';
import { paintLoadingFrame, warmSceneShaders } from './render/ShaderWarmup.ts';
import { WorldDetailSystem } from './systems/WorldDetailSystem.js';
import { PhysicsSystem } from './systems/PhysicsSystem.js';
/**
 * Dark Rain
 * Main Entry Point
 */

import * as THREE from 'three';

// Core
import { Game } from './core/Game.js';
import { globalEventBus, GameEvents, eventBus } from './core/EventBus.js';

// Systems
import { InventorySystem } from './systems/InventorySystem.js';
import { ViewmodelSystem } from './systems/ViewmodelSystem.js';
import { LootSystem } from './systems/LootSystem.js';
import { CompassSystem } from './systems/CompassSystem.js';
import { WeaponManager } from './systems/WeaponSystem.js';
import { SurvivalSystem } from './systems/SurvivalSystem.js';
import { QuestSystem, SampleQuests } from './systems/QuestSystem.js';
import { DialogueSystem, SampleDialogues } from './systems/DialogueSystem.js';
import { EffectsSystem } from './systems/EffectsSystem.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { ArtifactSystem } from './systems/ArtifactSystem.js';
import { EmissionSystem } from './systems/EmissionSystem.js';
import { ALifeSystem } from './systems/ALifeSystem.js';
import { PsySystem } from './systems/PsySystem.js';
import { BoltSystem } from './systems/BoltSystem.js';
import { normalizeCharacter } from './entities/CharacterModel.js';

// UI
import { Minimap } from './ui/Minimap.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { DebugConsole } from './ui/DebugConsole.js';
import { DevMenu } from './ui/DevMenu.js';
import { RagdollSystem } from './systems/RagdollSystem.js';
import { ProgressionSystem } from './systems/ProgressionSystem.js';
import { BodyMotionSystem } from './systems/BodyMotionSystem.js';
import { FieldOperations } from './systems/FieldOperations.js';
import { FieldJournal } from './ui/FieldJournal.js';
import { ReflectionSystem } from './systems/ReflectionSystem.js';

// Make THREE available globally for debugging
window.THREE = THREE;

/**
 * Extended Game class with all systems
 */
class StalkerGame extends Game {
    async init() {
        try {
            // Set loading state
            this.startup=new StartupTrace();this._deferInitialWorld=true;
            this.gameState = 'loading';
            this._bootInitializing=true;
            if(!this._rendererLostHandler){this._rendererLostHandler=()=>{void this.recoverGraphics();};window.addEventListener('darkrain:renderer-lost',this._rendererLostHandler);}
            
            // Show loading screen
            this.uiManager?.showLoadingScreen(true);
            this.uiManager?.updateLoadingProgress(10, 'Initializing...');
            
            // Call parent init
            await super.init();
            
            // Initialize additional systems
            await this.startup.measure('characterAssets',()=>Promise.all([preloadAnatomicalActors(),preloadHumanAnimations()]));
            this.initAdditionalSystems();
            // The first pipeline was created before the first-person scene existed.
            this.buildComposer();
            await this.saveSystem.ready;
            // Construct physics on world entry, after static geometry exists.


            // Base init loaded the level before loot/compass systems existed,
            // so their populate step was skipped - run it now that they do
            if (this.worldManager?.currentLevel) {
                this.compassSystem?.populateLevel(this.worldManager.currentLevel);
                this.lootSystem?.populateLevel(this.worldManager.currentLevel);
            }
            
            // Register sample content
            this.registerSampleContent();
            this.fieldOperations = new FieldOperations(this);
            this.fieldJournal = new FieldJournal(this);
            this.tutorialSystem=new TunnelTutorial(this);this.onboarding=new ScavengingOnboarding(this);this.gameFeel=new GameFeel(this);
            
            // Setup starting equipment
            this.setupStartingEquipment();
            
            // Update loading progress
            this.uiManager?.updateLoadingProgress(90, 'Finalizing setup...');
            
            console.log('All game systems initialized');
            
            // Stop at the main menu - the player chooses New / Continue / Load
            this.gameState = 'menu';
            // Apply the player's stored settings (volume, sensitivity, graphics)
            this.uiManager?.applyStoredSettings();
            this.uiManager?.showLoadingScreen(false);
            this.uiManager?.showMainMenu();
            this.setupStartupOptions();
            this.startup.menuReady();this._bootInitializing=false;this.start();
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.uiManager?.showLoadingScreen(false);
            showError(`Failed to initialize game: ${error.message}`);
            throw error;
        }
    }

    initAdditionalSystems() {
        console.log('Initializing additional systems...');
        this.progressionSystem = new ProgressionSystem(this);
        this.bodyMotionSystem = new BodyMotionSystem(this);
        
        // Route player interaction prompts to world objects (pickups, interactables)
        globalEventBus.on(GameEvents.PLAYER_INTERACT, (data) => {
            const target = data?.target;
            if (!target?.userData) return;
            
            // Item pickup collection
            const pickup = target.userData.pickup;
            if (pickup?.id && this.worldManager) {
                const collected = this.worldManager.collectPickup(pickup.id);
                if (collected && this.inventorySystem) {
                    this.inventorySystem.addItem(collected.item, collected.amount);
                }
                return;
            }
            
            // Generic interactables
            const interactable = target.userData.interactable;
            if (typeof interactable?.onInteract === 'function') {
                interactable.onInteract(this.player);
            }
        });
        
        // Inventory system
        this.inventorySystem = new InventorySystem(this);

        // Loot system (containers, corpses, stashes) - created before the
        // weapon manager so enemy-death loot events have a listener
        this.lootSystem = new LootSystem(this);

        // Compass + sneak indicator (Elder Scrolls-style)
        this.compassSystem = new CompassSystem(this);
        
        // Weapon manager
        this.weaponManager = new WeaponManager(this);

        // First-person viewmodel overlay (weapon/arms/hat render pass)
        this.viewmodelSystem = new ViewmodelSystem(this);

        // Player character customization (hat, skin, sleeves) - the character
        // creator overwrites this on New Game; default keeps old saves working
        this.character = normalizeCharacter(SaveSystem.loadCharacter?.() || ViewmodelSystem.defaultCharacter());
        this.viewmodelSystem.setCharacter(this.character);
        
        // Survival system
        this.survivalSystem = new SurvivalSystem(this);
        
        // Effects system
        this.effectsSystem = new EffectsSystem(this);
        
        // Dialogue system
        this.dialogueSystem = new DialogueSystem(this);
        
        // Quest system
        this.questSystem = new QuestSystem(this);
        
        // Save system
        this.saveSystem = new SaveSystem(this);this.statisticsSystem=new CampaignStatistics(this);this.photoMode=new PhotoMode(this);

        // Zone life systems (S.T.A.L.K.E.R.-inspired)
        this.artifactSystem = new ArtifactSystem(this);
        this.artifactSystem.init(this.scene);
        // Game.loadLevel() ran during super.init() before this system existed -
        // seed the initial level's artifacts now that anomalies are present.
        this.artifactSystem.seedArtifacts();
        this.emissionSystem = new EmissionSystem(this);
        this.alifeSystem = new ALifeSystem(this);
        this.psySystem = new PsySystem(this);
        this.psySystem.init(this.scene);
        this.boltSystem = new BoltSystem(this);
        this.boltSystem.init(this.scene);
        this.ragdollSystem = new RagdollSystem(this);
        
        // UI components
        this.minimap = new Minimap(this);
        this.dialogueUI = new DialogueUI(this);
        
        // Debug console (only in debug mode)
        if (this.debug) {
            this.debugConsole = new DebugConsole(this);
            console.log('Debug console enabled (press ` to open)');
        }
        
        // Dev menu (always available, toggle with F1)
        this.devMenu = new DevMenu(this);
        console.log('Dev menu enabled (press F1 to open)');
        
        // Zone starting kit + briefing (once per game start)
        globalEventBus.on(GameEvents.GAME_START, () => {
            if(this.currentLevelName==='tutorial_tunnel')return;
            if (this.inventorySystem && !this.inventorySystem.hasItem('detector')) {
                this.inventorySystem.addItem('detector', 1);
            }
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Detector issued. Press N to toggle, G to throw a bolt at anomalies.',
                type: 'info', duration: 7000
            });
            globalEventBus.emit('zone:pda_feed', {
                text: 'Welcome to the Zone, stalker. The emission front is quiet... for now.',
                kind: 'info'
            });
        });

        // Play time tracking
        this.playTime = 0;
        
        // Game flags for dialogue/quest conditions
        this.flags = {};
        
        // Update loading progress
        this.uiManager?.updateLoadingProgress(25, 'Setting up inventory system...');
    }

    registerSampleContent() {
        console.log('Registering sample content...');
        
        // Update loading progress
        this.uiManager?.updateLoadingProgress(40, 'Registering sample content...');
        
        // Register sample dialogues
        if (this.dialogueSystem) {
            for (const [id, dialogue] of Object.entries(SampleDialogues)) {
                this.dialogueSystem.registerDialogue(dialogue);
            }
        }
        
        // Register sample quests
        if (this.questSystem) {
            for (const questData of SampleQuests) {
                this.questSystem.registerQuest(questData);
                this.questSystem.makeAvailable(questData.id);
            }
        }
    }

    setupStartingEquipment() {
        if(this._tutorialRequested)return;
        console.log('Setting up starting equipment...');
        
        // Update loading progress
        this.uiManager?.updateLoadingProgress(60, 'Setting up starting equipment...');
        
        // Give starting weapons
        if (this.weaponManager) {
            this.weaponManager.addWeapon('pm_pistol', 1);
            this.weaponManager.addWeapon('knife', 2);
            this.weaponManager.equipSlot(1); // Equip pistol
        }
        
        // Give starting items
        if (this.inventorySystem) {
            this.inventorySystem.addItem('medkit_small', 2);
            this.inventorySystem.addItem('bandage', 5);
            this.inventorySystem.addItem('bread', 3);
            this.inventorySystem.addItem('water_bottle', 2);
            this.inventorySystem.addItem('ammo_pistol', 48);
            this.inventorySystem.addItem('detector_basic', 1);
        }
    }

    /**
     * Apply character-creator choices: persist them and rebuild the
     * first-person arms + hat brim to match.
     * @param {Object} character - full character object (normalized before save)
     */
    applyCharacter(character) {
        this.character = normalizeCharacter(character);
        SaveSystem.saveCharacter(this.character);
        this.viewmodelSystem?.setCharacter(character);
        // Weapons rebuild their arms to match the new look
        for (const weapon of this.weaponManager?.weapons.values() || []) {
            weapon.setCharacter(character);
        }
    }

    /**
     * Begin a play session from the main menu.
     * @param {boolean} fromSave - Load the autosave instead of a fresh start
     */
    setupStartupOptions(){
        const status=document.getElementById('startup-status'),run=document.getElementById('calibrate-btn'),skip=document.getElementById('calibrate-skip-btn'),apply=document.getElementById('calibrate-apply-btn');
        if(!localStorage.getItem('darkrain_settings')){const settings=this.uiManager.getStoredSettings();settings.autoQuality=true;localStorage.setItem('darkrain_settings',JSON.stringify(settings));this.uiManager.applyStoredSettings();}
        if(status)status.textContent='Local session ready. Device check and tunnel training are optional.';
        run?.addEventListener('click',async()=>{if(this._benchmarkController)return;const controller=new AbortController();this._benchmarkController=controller;run.disabled=true;skip.hidden=false;apply.hidden=true;
            try{const result=await runStartupCalibration(this,controller.signal,value=>{if(status)status.textContent=`Checking this device… ${Math.round(value)}%`;});localStorage.setItem('darkrain_calibration',JSON.stringify(result));this._calibrationResult=result;if(status)status.textContent=`Suggested: ${result.recommended}. This short check is provisional; settings remain your choice.`;apply.textContent=`Use ${result.recommended} settings`;apply.hidden=false;}
            catch(error){if(status)status.textContent='Device check skipped. Your settings and saves are kept.';}
            finally{this._benchmarkController=null;run.disabled=false;skip.hidden=true;}
        });
        skip?.addEventListener('click',()=>this._benchmarkController?.abort());
        apply?.addEventListener('click',()=>{if(!this._calibrationResult)return;const settings=this.uiManager.getStoredSettings();settings.quality=this._calibrationResult.recommended;settings.autoQuality=true;this.uiManager.saveStoredSettings(settings);this.uiManager.applyStoredSettings();apply.hidden=true;if(status)status.textContent='Suggested settings applied. You can change them in Options.';});
    }
    async warmWorldGraphics(){
        this.viewmodelSystem?.prepare(this.renderer);
        await this.startup.measure('shaderWarmup',()=>warmSceneShaders(this.renderer,[{scene:this.scene,camera:this.camera},{scene:this.viewmodelSystem.vmScene,camera:this.viewmodelSystem.vmCamera}],value=>this.uiManager?.updateLoadingProgress(75+value*20,'Preparing the first view…')));
        this.dayNightCycle?.update(0);this.tutorialSystem?.update(0);await this.startup.measure('firstView',async()=>{this.render(true);await paintLoadingFrame();});this._graphicsWarmed=true;
    }
    async ensureWorldReady(level='zone_outskirts'){
        if(!this.worldManager._initialized)await this.startup.measure('worldAssets',()=>this.worldManager.init());
        if(!this.worldManager.currentLevel)await this.startup.measure('worldLoad',()=>this.loadLevel(level));
        if(!this.physicsSystem){this.physicsSystem=new PhysicsSystem(this);try{await this.startup.measure('physics',()=>this.physicsSystem.init());}catch(error){try{this.physicsSystem.dispose();}catch{}this.physicsSystem=null;throw error;}}
        if(!this.worldDetailSystem)this.worldDetailSystem=new WorldDetailSystem(this);
        if(!this.reflectionSystem)this.reflectionSystem=new ReflectionSystem(this);
        this._worldReady=true;
    }
    async beginSession(fromSave,saveSlot='autosave') {
        if(this._startingSession)return;
        this._startingSession=true;this.startup.startSession();
        this.inputManager?.requestPointerLock();
        this.isLoading=true;
        this.uiManager?.showLoadingScreen(true);
        this.uiManager?.updateLoadingProgress(5,'Preparing your expedition...');
        await paintLoadingFrame();
        try{
            this.effectsSystem?.blood.clear();

            this._benchmarkController?.abort();
            const freshStart=!(fromSave&&this.saveSystem?.hasSave(saveSlot));
            const saved=fromSave?await this.saveSystem.readValidated(saveSlot):null;if(fromSave&&!saved)throw Error('Save unavailable or campaign ended');this.session=saved?.session?structuredClone(saved.session):newSession(this._newDeathMode);if(freshStart){this.statisticsSystem.reset();this.playTime=0;this.saveSystem.pendingAutosave.clear();this.saveSystem.lastChunk=null;this.saveSystem.nextAutosave=0;this.saveSystem.districts={};this.saveSystem.deathTask=null;this.saveSystem._dropPrepared=false;this.saveSystem._deathPrepared=false;}
            let entryLevel=this._tutorialRequested?'tutorial_tunnel':'zone_outskirts';
            if(!freshStart){try{entryLevel=JSON.parse(this.saveSystem.storage.getItem(this.saveSystem.getSaveKey(saveSlot))).currentLevel||'zone_outskirts';}catch{entryLevel='zone_outskirts';}}
            if(this._sessionStarted){for(const id of [...this.anomalySystem.anomalies.keys()])this.anomalySystem.removeAnomaly(id);this.artifactSystem.clear();this.alifeSystem.dispose();this.psySystem.clear();this.emissionSystem.reset();this.lootSystem.clear();}
            await this.ensureWorldReady(entryLevel);
            if(this._sessionStarted)await this.loadLevel(entryLevel);
            if(freshStart)this.physicsSystem.rebuild();
            if(!freshStart){if(!await this.saveSystem.loadGame(saveSlot))throw new Error('The save could not be loaded.');this.uiManager.showLoadingScreen(true);}
            else if(this._sessionStarted){this.resetPlayerForNewGame();this.player.position.copy(this.worldManager.getPlayerSpawnPosition());}
            if(freshStart&&entryLevel==='tutorial_tunnel')this.tutorialSystem.start();else if(freshStart)this.tutorialSystem.active=false;
            this._sessionStarted=true;this.isPaused=false;this.gameState='playing';
            if(freshStart)globalEventBus.emit(GameEvents.GAME_START,{});
            this.player?.updateCamera(0);
            if(!this._graphicsWarmed){
                this.viewmodelSystem?.prepare(this.renderer);
                await this.startup.measure('shaderWarmup',()=>warmSceneShaders(this.renderer,[{scene:this.scene,camera:this.camera},
                    {scene:this.viewmodelSystem.vmScene,camera:this.viewmodelSystem.vmCamera}],value=>this.uiManager?.updateLoadingProgress(10+value*75,'Preparing lighting and materials...')));
                this._graphicsWarmed=true;
            }
            this.uiManager?.updateLoadingProgress(90,'Preparing nearby woodland...');
            await this.worldManager?.forestStreaming?.prepareAt(this.player.position,{signal:this.worldManager.loadingAbort?.signal});
            this.uiManager?.updateLoadingProgress(95,'Finishing the scene...');
            await paintLoadingFrame();
            // Keep the loading screen painted through the first reflection/post draw.
            this.dayNightCycle?.update(0);this.tutorialSystem?.update(0);
            await this.startup.measure('firstView',async()=>{this.render(true);await paintLoadingFrame();});
            this.uiManager?.showLoadingScreen(false);
            this.isLoading=false;if(freshStart){this.session.respawn={level:this.currentLevelName,position:this.player.position.toArray()};this.saveSystem.requestAutosave('session-start');}this.clock.reset();this._lastFrameStart=performance.now();this._autoQuality.emaMs=1000/60;this._autoQuality.emaFps=60;
            if(document.hidden||this.inputManager?._unfocused)this.pause();
            this.startup.playable();
            this.uiManager?.showNotification('Welcome to Dark Rain. Check your field journal for local routes.','info',5000);
        }catch(error){
            console.error('Session startup failed:',error);
            if(this.renderer?.backendName==='WebGPU'&&(this.renderer._isDeviceLost||/GPUDevice|Instance dropped|out of memory/i.test(String(error)))){await this.recoverGraphics();return;}
            this.gameState='menu';this.isLoading=false;
            this.uiManager?.showLoadingScreen(false);this.uiManager?.showMainMenu();
            this.uiManager?.showNotification(playerError(error,'world'),'danger',6000);
        }finally{this._startingSession=false;}
    }

    async recoverGraphics() {
        if(this._graphicsRecovering||new URLSearchParams(location.search).get('backend')==='webgl')return;
        this._graphicsRecovering=true;
        const wasPlaying=this.gameState==='playing'&&!this.isLoading;
        this.stop();this.isPaused=true;this.isLoading=true;
        this.uiManager?.showLoadingScreen(true);this.uiManager?.updateLoadingProgress(0,'Recovering graphics with the fallback renderer...');
        const url=new URL(location.href);url.searchParams.set('backend','webgl');
        if(wasPlaying&&this.saveSystem){
            try{if(await this.saveSystem.saveGame('renderer_recovery'))url.searchParams.set('resume','renderer_recovery');}catch(error){console.warn('Graphics recovery snapshot failed:',error);}
        }
        if(window.darkRainDesktop?.graphics){await window.darkRainDesktop.graphics.restartFallback(url.searchParams.has('resume'));return;}
        location.replace(url.href);
    }

    /**
     * Reset player state for a fresh run without rebooting the world
     */
    resetPlayerForNewGame() {
        this.powerupSystem?.deserialize({permanentStacks:{},equippedArtifacts:[],activeBuffs:[],cooldowns:[]});if(this.equipmentSystem){this.equipmentSystem.equipped={head:null,body:null,back:null};this.equipmentSystem.updateCharacterModel();}Object.assign(this.alifeSystem,{spawnTimer:8,syncTimer:0,battleSoundTimer:0,partyCounter:0});
        this.progressionSystem?.reset();
        this.perkSystem?.deserialize({perks:[],points:0,level:1});
        this.factionSystem?.deserialize({reputation:{},tradeRep:{}});
        this.flags = {};
        if (this.questSystem) {
            this.questSystem.activeQuests.clear(); this.questSystem.completedQuests.clear();
            for (const q of this.questSystem.quests.values()) {
                q.state='unavailable'; q.startTime=null; q.endTime=null; q.timeRemaining=q.timeLimit;
                for(const o of q.objectives) {o.current=0;o.completed=false;}
            }
            this.questSystem.checkQuestUnlocks();
        }
        this.fieldOperations?.syncWorldState();
        const p = this.player;
        if (p) {
            p.isActive = true;
            p.position.set(0, 1, 0);
            p.velocity?.set(0, 0, 0);
            if (p.stats) {
                p.stats.health = p.stats.maxHealth;
                p.stats.bleeding=0;
                p.stats.stamina = p.stats.maxStamina;
                p.stats.radiation = 0;
                p.stats.hunger = 0;
                p.stats.thirst = 0;
            }
            if (Array.isArray(p.inventory)) p.inventory.length = 0;
        if (typeof this.inventorySystem?.clearInventory === 'function') this.inventorySystem.clearInventory();
        }
        if (this.weaponManager) {
            // Strip extra weapons, keep it simple: clear and re-issue starter kit
            if (typeof this.weaponManager.clearAll === 'function') this.weaponManager.clearAll();
        }
        this.setupStartingEquipment();
    }

    update(deltaTime) {
        // While at the main menu or dead, the world stays frozen
        if (this.gameState === 'menu' || this.gameState === 'dead') return;
        // Call parent update (which already handles inputManager.update())
        super.update(deltaTime);
        
        // Skip additional updates if paused or loading
        if (this.isPaused || this.gameState !== 'playing') return;
        
        // Update additional systems
        this.survivalSystem?.update(deltaTime);
        this.weaponManager?.update(deltaTime);
        this.perfOverlay.updateSystem('Effects',this.effectsSystem,deltaTime);
        this.questSystem?.update(deltaTime);
        this.minimap?.update();
        this.artifactSystem?.update(deltaTime);
        if(!this.tutorialSystem?.active)this.emissionSystem?.update(deltaTime);
        if(!this.tutorialSystem?.active)this.perfOverlay.updateSystem('ALife',this.alifeSystem,deltaTime);
        this.psySystem?.update(deltaTime);
        this.boltSystem?.update(deltaTime);
        this.perfOverlay.updateSystem('Physics',this.physicsSystem,deltaTime);this.tutorialSystem?.update(deltaTime);
        this.worldDetailSystem?.update(deltaTime);
        this.ragdollSystem?.update(deltaTime);
        this.fieldOperations?.update(deltaTime);
        
        // Track play time
        this.gameFeel?.update(deltaTime);this.onboarding?.update(deltaTime);this.statisticsSystem?.update(deltaTime);this.playTime += deltaTime;this.saveSystem?.update();
        
        // Handle weapon input
        this.handleWeaponInput();
        
        // Handle quick save/load
        this.handleSaveLoadInput();
        
        // Handle flashlight toggle
        if (this.inputManager.isActionJustPressed('flashlight')) {
            this.flashlightSystem?.toggle();
        }
    }

    handleWeaponInput() {
        if (!this.weaponManager?.equippedWeapon) return;
        
        // Never fire while interacting with UI: a menu open (inventory,
        // pause, loot, etc.) or pointer unlocked means clicks belong to the UI.
        const ui = this.uiManager;
        const menuOpen = ui && (ui.activeMenu || (ui.isAnyMenuOpen && ui.isAnyMenuOpen()));
        if (menuOpen || (!this.inputManager?.mouse?.locked&&!this.inputManager?.controllerActive)) return;
        
        const weapon = this.weaponManager.equippedWeapon;
        
        // Firing
        if (this.inputManager.isActionActive('fire')||this.inputManager.isActionJustPressed('fire')) {
            if (weapon.data.automatic || this.inputManager.isActionJustPressed('fire')) {
                weapon.fire();
            }
        }
        
        // Aiming
        weapon.setAiming(this.inputManager.isActionActive('aim'));
        
        // Reload
        if (this.inputManager.isActionJustPressed('reload')) {
            weapon.reload();
        }
        
        for(const [action,direction]of [['nextWeapon',1],['previousWeapon',-1]])if(this.inputManager.isActionJustPressed(action)){const slots=this.weaponManager.weaponSlots,start=Math.max(0,slots.indexOf(this.weaponManager.equippedWeapon.id));for(let step=1;step<=slots.length;step++){const slot=(start+step*direction+slots.length)%slots.length;if(slots[slot]){this.weaponManager.equipSlot(slot);break;}}}
        // Weapon switching
        for (let i = 0; i < 3; i++) {
            if (this.inputManager.isActionJustPressed(`slot${i + 1}`)) {
                this.weaponManager.equipSlot(i);
            }
        }
    }

    handleSaveLoadInput() {
        if(this.gameState!=='playing'||this.isLoading)return;
        // Quick save (F5)
        if (this.inputManager.isActionJustPressed('quicksave')) {
            this.saveSystem?.saveGame('quicksave');
        }
        
        // Quick load (F9)
        if (this.inputManager.isActionJustPressed('quickload')) {
            if (this.saveSystem?.hasSave('quicksave')) {
                this.saveSystem?.loadGame('quicksave');
            } else {
                this.uiManager?.showNotification('No quicksave found!', 'danger', 3000);
            }
        }
        
        // Auto-save (F6)
        if (this.inputManager.isActionJustPressed('autosave')) {
            this.saveSystem?.saveGame('autosave');
        }
    }

    dispose() {
        console.log('Disposing game...');
        
        // Dispose additional systems
        this.inventorySystem = null;
        this.weaponManager?.dispose();
        this.survivalSystem?.dispose();
        this.effectsSystem?.dispose();
        this.photoMode?.dispose();this.statisticsSystem?.dispose();this.saveSystem?.dispose();
        this.gameFeel?.dispose();this.onboarding?.dispose();this._benchmarkController?.abort();this.tutorialSystem?.dispose();
        this.fieldJournal?.dispose();
        this.fieldOperations?.dispose();
        this.bodyMotionSystem?.dispose();
        this.reflectionSystem?.dispose();
        this.minimap?.dispose();
        this.debugConsole?.dispose();
        this.devMenu?.dispose();
        if(this._rendererLostHandler)window.removeEventListener('darkrain:renderer-lost',this._rendererLostHandler);
        this.worldDetailSystem?.dispose();
        this.physicsSystem?.dispose();
        this.ragdollSystem?.dispose();
        this.dialogueUI = null;
        
        // Call parent dispose
        super.dispose();
    }
}

/**
 * Check WebGL availability
 */
function isWebGLAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return !!(
            window.WebGLRenderingContext &&
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
        );
    } catch (e) {
        return false;
    }
}

/**
 * Show WebGL error
 */
function showWebGLError() {
    const container = document.getElementById('game-container');
    if (container) {
        container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                background: #0a0a0a;
                color: #b08d4f;
                font-family: 'Courier New', monospace;
                text-align: center;
                padding: 20px;
            ">
                <h1 style="font-size: 36px; margin-bottom: 20px;">⚠ Graphics Not Available</h1>
                <p style="max-width: 500px; line-height: 1.6;">
                    Your browser or device needs WebGPU or WebGL2 support to run Dark Rain.
                </p>
                <p style="margin-top: 20px; color: #888;">
                    Please try using a modern browser like Chrome, Firefox, or Edge,
                    or update your graphics drivers.
                </p>
            </div>
        `;
    }
}

/**
 * Show error message
 */
function showError(message) {
    if (window.__drBootWatchdog) clearTimeout(window.__drBootWatchdog);
    window.__drBooted = true; // boot ended (with an error) — suppress the watchdog overlay
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div class="loading-content">
                <h1 style="color: #ff0000;">ERROR</h1>
                <p style="color: #b08d4f; margin: 20px 0;">${message}</p>
                <button onclick="location.reload()" class="menu-button">
                    Reload Game
                </button>
            </div>
        `;
    }
}

/**
 * Loading tips
 */
const loadingTips = [
    "Stay away from anomalies unless you have a detector.",
    "Bandits roam the Zone at night. Be careful.",
    "Artifacts can give you powerful bonuses, but also emit radiation.",
    "Keep stocked on medical supplies. The Zone is unforgiving.",
    "Listen carefully. You can often hear enemies before you see them.",
    "During emissions, find shelter immediately or face certain death.",
    "Not everyone in the Zone is hostile. Some stalkers may help you.",
    "Manage your weight carefully. Being overloaded slows you down.",
    "Save often. Death can come quickly in the Zone.",
    "Different anomalies require different approaches. Learn their patterns.",
    "The F key toggles your flashlight in dark areas."
];

/**
 * Get random loading tip
 */
function getRandomTip() {
    return loadingTips[Math.floor(Math.random() * loadingTips.length)];
}

/**
 * Persistent error overlay - errors stay visible instead of flashing
 */
function showPersistentError(msg) {
    var el = document.getElementById('dr-error-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'dr-error-overlay';
        el.style.cssText = 'position:fixed;top:10px;left:10px;max-width:600px;background:#1a0000;border:2px solid #ff0000;color:#ffaaaa;padding:12px;font-family:monospace;font-size:12px;z-index:99999;white-space:pre-wrap;word-break:break-word;';
        document.body.appendChild(el);
    }
    el.textContent += msg + '\n';
}

window.addEventListener('error', function(e) {
    showPersistentError('ERROR: ' + (e.message || 'unknown'));
});
window.addEventListener('unhandledrejection', function(e) {
    showPersistentError('PROMISE: ' + ((e.reason && e.reason.message) || e.reason || 'unknown'));
});

/**
 * Main entry point
 */
async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     DARK RAIN                         ║');
    console.log('║     Starting game initialization...    ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Set random loading tip
    const tipElement = document.getElementById('loading-tip');
    if (tipElement) {
        tipElement.textContent = `Tip: ${getRandomTip()}`;
    }
    
    // Check for WebGL support
    if (!navigator.gpu && !isWebGLAvailable()) {
        console.error('WebGL not available');
        showWebGLError();
        return;
    }
    
    // Get canvas element
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        showError('Canvas element not found. Please refresh the page.');
        return;
    }
    
    // Check for debug mode
    const isDebug = window.location.hash === '#debug' || 
                    window.location.search.includes('debug') ||
                    import.meta.env?.DEV;
    
    if (isDebug) {
        console.log('🔧 Debug mode enabled');
    }
    
    // Create and initialize game
    const game = new StalkerGame({
        canvas,
        debug: isDebug
    });
    
    // Store reference globally for debugging
    window.game = game;
    
    try {
        // Show loading screen initially
        game.uiManager?.showLoadingScreen(true);
        game.uiManager?.updateLoadingProgress(5, 'Starting initialization...');
        
        // Initialize the game
        await game.init();
        
        console.log('✓ Game initialized successfully');
        window.__drBooted = true;
        if (window.__drBootWatchdog) clearTimeout(window.__drBootWatchdog);
        if(new URLSearchParams(location.search).get('resume')==='renderer_recovery'&&game.saveSystem?.hasSave('renderer_recovery')) {
            const url=new URL(location.href);url.searchParams.delete('resume');history.replaceState(null,'',url.href);
            game.uiManager.hideMainMenu();await game.beginSession(true,'renderer_recovery');
        }
        
        // Recover pointer lock only during an active play session
        if (game.inputManager) {
            
            // Persistent click-to-lock: recovers pointer lock whenever it is lost
            // (alt-tab, Esc, menu close). Skipped while any menu is open so menu
            // clicks don't steal the cursor.
            document.addEventListener('click', () => {
                const ui = game.uiManager;
                const menuOpen = ui && (ui.activeMenu || (ui.isAnyMenuOpen && ui.isAnyMenuOpen()));
                if (game.gameState === 'playing' && !game.inputManager.mouse.locked && !game.isPaused && !game.isLoading && !menuOpen) {
                    game.inputManager.requestPointerLock();
                }
            });
        }
        
    } catch (error) {
        console.error('Failed to initialize game:', error);
        showError(`Failed to initialize game: ${error.message}`);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}

// Export for potential external use
export { StalkerGame };
