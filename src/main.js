/**
 * Zone: Heart of Darkness
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

// Make THREE available globally for debugging
window.THREE = THREE;

/**
 * Extended Game class with all systems
 */
class StalkerGame extends Game {
    async init() {
        try {
            // Set loading state
            this.gameState = 'loading';
            
            // Show loading screen
            this.uiManager?.showLoadingScreen(true);
            this.uiManager?.updateLoadingProgress(10, 'Initializing...');
            
            // Call parent init
            await super.init();
            
            // Initialize additional systems
            this.initAdditionalSystems();

            // Base init loaded the level before loot/compass systems existed,
            // so their populate step was skipped - run it now that they do
            if (this.worldManager?.currentLevel) {
                this.compassSystem?.populateLevel(this.worldManager.currentLevel);
                this.lootSystem?.populateLevel(this.worldManager.currentLevel);
            }
            
            // Register sample content
            this.registerSampleContent();
            
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
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.uiManager?.showLoadingScreen(false);
            showError(`Failed to initialize game: ${error.message}`);
            throw error;
        }
    }

    initAdditionalSystems() {
        console.log('Initializing additional systems...');
        
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
        this.saveSystem = new SaveSystem(this);

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
        
        // UI components
        this.minimap = new Minimap(this);
        this.dialogueUI = new DialogueUI(this);
        
        // Debug console (only in debug mode)
        if (this.debug) {
            this.debugConsole = new DebugConsole(this);
            console.log('Debug console enabled (press ` to open)');
        }
        
        // Zone starting kit + briefing (once per game start)
        globalEventBus.on(GameEvents.GAME_START, () => {
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
    beginSession(fromSave) {
        const freshStart = !(fromSave && this.saveSystem?.hasSave('autosave'));
        if (!freshStart) {
            this.saveSystem.loadGame('autosave');
        } else if (this._sessionStarted) {
            // New game after quitting to menu: reset the player, keep the world
            this.resetPlayerForNewGame();
        }
        this._sessionStarted = true;
        this.isPaused = false;
        this.gameState = 'playing';
        // Pointer lock needs a user gesture - the menu button click qualifies
        this.inputManager?.requestPointerLock();
        setTimeout(() => {
            this.uiManager?.showNotification('Welcome to the Zone, Stalker. Good hunting.', 'info', 5000);
        }, 800);
        if (freshStart) {
            globalEventBus.emit(GameEvents.GAME_START, {});
        }
    }

    /**
     * Reset player state for a fresh run without rebooting the world
     */
    resetPlayerForNewGame() {
        const p = this.player;
        if (p) {
            p.position.set(0, 1, 0);
            p.velocity?.set(0, 0, 0);
            if (p.stats) {
                p.stats.health = p.stats.maxHealth;
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
        this.effectsSystem?.update(deltaTime);
        this.questSystem?.update(deltaTime);
        this.minimap?.update();
        this.artifactSystem?.update(deltaTime);
        this.emissionSystem?.update(deltaTime);
        this.alifeSystem?.update(deltaTime);
        this.psySystem?.update(deltaTime);
        this.boltSystem?.update(deltaTime);
        
        // Track play time
        this.playTime += deltaTime;
        
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
        if (menuOpen || !this.inputManager?.mouse?.locked) return;
        
        const weapon = this.weaponManager.equippedWeapon;
        
        // Firing
        if (this.inputManager.isActionActive('fire')) {
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
        
        // Weapon switching
        for (let i = 0; i < 3; i++) {
            if (this.inputManager.isActionJustPressed(`slot${i + 1}`)) {
                this.weaponManager.equipSlot(i);
            }
        }
    }

    handleSaveLoadInput() {
        // Quick save (F5)
        if (this.inputManager.isActionJustPressed('quicksave')) {
            this.saveSystem?.saveGame('quicksave');
            this.uiManager?.showNotification('Game saved!', 'success', 2000);
        }
        
        // Quick load (F9)
        if (this.inputManager.isActionJustPressed('quickload')) {
            if (this.saveSystem?.hasSave('quicksave')) {
                this.saveSystem?.loadGame('quicksave');
                this.uiManager?.showNotification('Game loaded!', 'success', 2000);
            } else {
                this.uiManager?.showNotification('No quicksave found!', 'danger', 3000);
            }
        }
        
        // Auto-save (F6)
        if (this.inputManager.isActionJustPressed('autosave')) {
            this.saveSystem?.saveGame('autosave');
            this.uiManager?.showNotification('Auto-saved!', 'success', 2000);
        }
    }

    dispose() {
        console.log('Disposing game...');
        
        // Dispose additional systems
        this.inventorySystem = null;
        this.weaponManager?.dispose();
        this.survivalSystem?.dispose();
        this.effectsSystem?.dispose();
        this.saveSystem?.dispose();
        this.minimap?.dispose();
        this.debugConsole?.dispose();
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
                <h1 style="font-size: 36px; margin-bottom: 20px;">⚠ WebGL Not Available</h1>
                <p style="max-width: 500px; line-height: 1.6;">
                    Your browser or device does not support WebGL, which is required to run this game.
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
    console.log('║     ZONE: HEART OF DARKNESS            ║');
    console.log('║     Starting game initialization...    ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Set random loading tip
    const tipElement = document.getElementById('loading-tip');
    if (tipElement) {
        tipElement.textContent = `Tip: ${getRandomTip()}`;
    }
    
    // Check for WebGL support
    if (!isWebGLAvailable()) {
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
        
        // Request pointer lock after initialization
        if (game.inputManager) {
            game.inputManager.requestPointerLock();
            
            // Persistent click-to-lock: recovers pointer lock whenever it is lost
            // (alt-tab, Esc, menu close). Skipped while any menu is open so menu
            // clicks don't steal the cursor.
            document.addEventListener('click', () => {
                const ui = game.uiManager;
                const menuOpen = ui && (ui.activeMenu || (ui.isAnyMenuOpen && ui.isAnyMenuOpen()));
                if (!game.inputManager.mouse.locked && !game.isPaused && !game.isLoading && !menuOpen &&
                    game.gameState === 'playing') {
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
