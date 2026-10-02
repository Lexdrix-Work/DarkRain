import { globalEventBus, GameEvents } from '../core/EventBus.js';
import { getItem } from '../data/items.js';
import { CharacterCreator } from './CharacterCreator.js';
import { ItemIcons } from './ItemIcons.js';
import * as THREE from 'three';

/**
 * UIManager - Handles all UI elements, menus, and interactions
 * Combines comprehensive UI features with robust menu state management
 */
export class UIManager {
    /**
     * Create a UI manager instance
     * @param {Object} [options] - Configuration options
     * @param {Object} [options.game] - Game instance reference
     * @param {Object} [options.eventBus] - Custom event bus (uses globalEventBus if not provided)
     */
    constructor(options = {}) {
        this.game = options.game || null;
        this.eventBus = options.eventBus || globalEventBus;
        
        // UI Element references
        this.elements = {
            hud: document.getElementById('hud'),
            healthFill: document.getElementById('health-fill'),
            staminaFill: document.getElementById('stamina-fill'),
            radiationFill: document.getElementById('radiation-fill'),
            currentAmmo: document.getElementById('current-ammo'),
            reserveAmmo: document.getElementById('reserve-ammo'),
            interactionPrompt: document.getElementById('interaction-prompt'),
            inventoryPanel: document.getElementById('inventory-panel'),
            inventoryGrid: document.getElementById('inventory-grid'),
            notificationArea: document.getElementById('notification-area'),
            pauseMenu: document.getElementById('pause-menu'),
            settingsMenu: document.getElementById('settings-menu'),
            confirmDialog: document.getElementById('confirm-dialog'),
            fpsCounter: document.getElementById('fps-counter'),
            loadingScreen: document.getElementById('loading-screen'),
            loadingProgress: document.getElementById('loading-progress'),
            loadingText: document.getElementById('loading-text'),
            crosshair: document.getElementById('crosshair'),
            compass: document.getElementById('compass'),
            flashlightUI: null
        };
        
        // Track menu states
        this.menuStates = {
            inventory: false,
            map: false,
            pause: false,
            settings: false
        };
        
        // Current active menu (only one at a time)
        this.activeMenu = null;
        
        // State
        this.notifications = [];
        this.maxNotifications = 5;
        
        // Initialize
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupPauseMenu();
        this.setupMainMenu();
        this.createFlashlightUI();
        this.createZoneUI();
        this.hideAllMenus();
    }

    setupEventListeners() {
        // Game events - from first implementation
        this.eventBus.on(GameEvents.NOTIFICATION, (data) => {
            this.showNotification(data.message, data.type, data.duration);
        });
        
        this.eventBus.on(GameEvents.INVENTORY_OPEN, () => {
            this.openMenu('inventory');
        });
        
        this.eventBus.on(GameEvents.INVENTORY_CLOSE, () => {
            this.closeMenu('inventory', true);
        });
        
        this.eventBus.on(GameEvents.GAME_PAUSE, () => {
            this.openMenu('pause');
        });
        
        this.eventBus.on(GameEvents.GAME_RESUME, () => {
            this.closeMenu('pause', true);
        });
        
        this.eventBus.on(GameEvents.PLAYER_DAMAGE, (data) => {
            this.showDamageIndicator(data.direction);
        });
        
        this.eventBus.on(GameEvents.TIME_UPDATE, (time) => {
            this.updateTimeDisplay(time);
        });
        
        this.eventBus.on(GameEvents.WEAPON_FIRE, () => {
            this.animateCrosshair();
        });
        
        // Input toggle events - from second implementation
        this.eventBus.on('input:toggle:inventory', () => {
            this.toggleMenu('inventory');
        });
        
        this.eventBus.on('input:toggle:map', () => {
            this.toggleMenu('map');
        });
        
        // Pause is owned by the Game (single source of truth for isPaused).
        // Esc in the game loop calls game.pause()/resume(), which emit
        // GAME_PAUSE/GAME_RESUME — the UI only mirrors that state here.
        // (There is intentionally no input:toggle:pause -> toggleMenu path;
        // that dual path left the game simulating behind the pause menu.)

        this.eventBus.on('input:toggle:favorites', () => {
            this.toggleFavorites();
        });

        // Digit keys 1-8 select a favorite while the favorites menu is open
        document.addEventListener('keydown', (e) => {
            if (this.activeMenu !== 'favorites') return;
            const m = e.code.match(/^Digit([1-8])$/);
            if (m) {
                const carried = this.game?.inventorySystem?.getCarriedFavorites() || [];
                const entry = carried[parseInt(m[1], 10) - 1];
                if (entry) this.useFavorite(entry.index);
            }
        });

        // Show a click-to-resume hint when pointer lock is lost mid-game
        this.eventBus.on('input:pointerlock', ({ locked }) => {
            this.updatePointerHint(!locked);
        });
        
        // Listen for flashlight events
        this.eventBus.on('flashlight:battery', (data) => {
            this.updateFlashlightUI(data);
        });
        
        this.eventBus.on('flashlight:toggle', (data) => {
            if (this.elements.flashlightUI) {
                this.elements.flashlightUI.style.display = data.isOn ? '' : 'none';
            }
        });
    }

    setupPauseMenu() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        on('resume-btn', () => this.eventBus.emit(GameEvents.GAME_RESUME));
        on('save-btn', () => this.saveFromPause());
        on('load-btn', () => this.loadFromPause());
        on('settings-btn', () => this.showSettings());
        on('quit-btn', () => this.confirmQuit());
        // In-game confirm dialog buttons
        on('confirm-cancel', () => this.hideConfirm());
        on('confirm-ok', () => {
            const cb = this._confirmCallback;
            this.hideConfirm();
            if (typeof cb === 'function') cb();
        });
    }

    /**
     * Save from the pause menu without leaving it
     */
    saveFromPause() {
        if (!this.game) return;
        this.eventBus.emit(GameEvents.SAVE_GAME);
        this.showNotification('Game saved', 'success');
    }

    /**
     * Load the autosave from the pause menu (resume into the loaded game)
     */
    loadFromPause() {
        if (!this.game?.saveSystem?.hasSave || !this.game.saveSystem.hasSave('autosave')) {
            this.showNotification('No saved game found', 'warning');
            return;
        }
        this.showConfirm('Load Game', 'Load the last save? Unsaved progress will be lost.', () => {
            this.eventBus.emit(GameEvents.GAME_RESUME);
            this.eventBus.emit(GameEvents.LOAD_GAME);
        });
    }

    /**
     * In-game confirm dialog (replaces the native confirm() popup)
     */
    showConfirm(title, message, onConfirm) {
        this._confirmCallback = onConfirm;
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        const dlg = this.elements.confirmDialog || document.getElementById('confirm-dialog');
        if (dlg) this._showEl(dlg);
    }

    hideConfirm() {
        this._confirmCallback = null;
        const dlg = this.elements.confirmDialog || document.getElementById('confirm-dialog');
        if (dlg) this._hideEl(dlg);
    }

    /**
     * Wire up the main menu buttons
     */
    setupMainMenu() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        on('new-game-btn', () => this.startNewGame());
        on('continue-btn', () => this.continueGame());
        on('load-game-btn', () => this.continueGame());
        on('options-btn', () => this.showSettings());
        on('main-menu-btn', () => this.quitToMenu());
        on('reload-btn', () => this.respawnFromSave());
        this.eventBus.on(GameEvents.PLAYER_DEATH, () => this.showDeathScreen());
    }

    /**
     * Show the main menu (called on boot and when quitting to menu)
     */
    /**
     * Show the HUD only during active gameplay.
     */
    setHudVisible(visible) {
        const hud = this.elements.hud || document.getElementById('hud');
        if (hud) hud.style.display = visible ? '' : 'none';
    }

    showMainMenu() {
        this.hideAllMenus();
        const menu = document.getElementById('main-menu');
        if (menu) {
            this._showEl(menu);
        }
        // Disable Continue/Load when no save exists
        const hasSave = this.game?.saveSystem?.hasSave('autosave');
        for (const id of ['continue-btn', 'load-game-btn']) {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !hasSave;
        }
        if (document.pointerLockElement) document.exitPointerLock();
        this.updatePointerHint(false);
        this.setHudVisible(false);
    }

    hideMainMenu() {
        const menu = document.getElementById('main-menu');
        if (menu) {
            this._hideEl(menu);
        }
        this.setHudVisible(true);
    }

    /**
     * Start a new game session from the main menu - goes through the
     * character creator first so the player picks their look
     */
    startNewGame() {
        this.hideMainMenu();
        this.showCharacterCreator();
    }

    /**
     * Open the character creator (New Game only - Continue/Load skip it)
     */
    showCharacterCreator() {
        if (!this.characterCreator) {
            this.characterCreator = new CharacterCreator(this.game);
        }
        this.characterCreator.show();
    }

    /**
     * Continue from the autosave
     */
    continueGame() {
        if (!this.game?.saveSystem?.hasSave('autosave')) {
            this.showNotification('No saved game found', 'warning');
            return;
        }
        this.hideMainMenu();
        if (this.game && typeof this.game.beginSession === 'function') {
            this.game.beginSession(true);
        }
    }

    /**
     * Return to the main menu (from pause menu or death screen)
     */
    quitToMenu() {
        if (!this.game) return;
        this.game.gameState = 'menu';
        this.game.isPaused = false;
        this.showMainMenu();
        this.showNotification('Returned to main menu', 'info');
    }

    showDeathScreen(reason) {
        if (this.game) this.game.gameState = 'dead';
        if (document.pointerLockElement) document.exitPointerLock();
        const el = document.getElementById('death-screen');
        if (el) {
            this._showEl(el);
        }
        const r = document.getElementById('death-reason');
        const reasonText = typeof reason === 'string' ? reason : (reason?.message || reason?.cause || '');
        if (r && reasonText) r.textContent = reasonText;
        const rb = document.getElementById('reload-btn');
        if (rb) rb.disabled = !this.game?.saveSystem?.hasSave('autosave');
        this.updatePointerHint(false);
        this.setHudVisible(false);
    }

    hideDeathScreen() {
        const el = document.getElementById('death-screen');
        if (el) {
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    }

    respawnFromSave() {
        if (!this.game?.saveSystem?.hasSave('autosave')) {
            this.showNotification('No saved game found', 'warning');
            return;
        }
        this.hideDeathScreen();
        this.game.saveSystem.loadGame('autosave');
        if (this.game.player) this.game.player.isActive = true;
        this.game.gameState = 'playing';
        this.game.isPaused = false;
        this.setHudVisible(true);
        this.game.inputManager?.requestPointerLock();
    }

    /**
     * Confirm quit dialog
     */
    confirmQuit() {
        this.showConfirm('Quit to Menu', 'Return to the main menu? Unsaved progress will be lost.', () => {
            this.quitToMenu();
        });
    }

    /**
     * Create flashlight UI elements
     */
    /**
     * Zone UI - PDA feed, emission banner, detector HUD, psy + emission overlays.
     * Styling lives in the stylesheet; this builds the elements and wires events.
     */
    createZoneUI() {
        // PDA feed - bottom-left event ticker
        this.pdaFeed = document.createElement('div');
        this.pdaFeed.id = 'pda-feed';
        document.body.appendChild(this.pdaFeed);
        this.pdaEntries = [];

        // Emission banner - top-center warning
        this.emissionBanner = document.createElement('div');
        this.emissionBanner.id = 'emission-banner';
        this.emissionBanner.style.display = 'none';
        document.body.appendChild(this.emissionBanner);

        // Detector HUD - top-left status
        this.detectorHud = document.createElement('div');
        this.detectorHud.id = 'detector-hud';
        this.detectorHud.style.display = 'none';
        this.detectorHud.innerHTML = '<span class="det-label">DETECTOR</span><span class="det-ping"></span>';
        document.body.appendChild(this.detectorHud);
        this.detectorPingTimer = 0;

        // Psy overlay - fullscreen surreal distortion
        this.psyOverlay = document.createElement('div');
        this.psyOverlay.id = 'psy-overlay';
        document.body.appendChild(this.psyOverlay);

        // Emission sky overlay - red psy tint
        this.emissionOverlay = document.createElement('div');
        this.emissionOverlay.id = 'emission-overlay';
        document.body.appendChild(this.emissionOverlay);

        // Zone event subscriptions
        this.eventBus.on('zone:pda_feed', (data) => this.addPdaEntry(data));
        this.eventBus.on('zone:emission_phase', (data) => this.onEmissionPhase(data));
        this.eventBus.on('zone:emission_tick', (data) => this.onEmissionTick(data));
        this.eventBus.on('zone:detector_state', (data) => this.onDetectorState(data));
        this.eventBus.on('zone:detector_ping', (data) => this.onDetectorPing(data));
        this.eventBus.on('zone:psy_tier', (data) => this.onPsyTier(data));
        this.eventBus.on('zone:reality_flicker', () => this.onRealityFlicker());
        this.eventBus.on('zone:emission_sky', (data) => {
            if (this.emissionOverlay) {
                this.emissionOverlay.style.opacity = (data.intensity * 0.32).toFixed(2);
            }
        });
    }

    addPdaEntry(data) {
        if (!this.pdaFeed) return;
        const entry = document.createElement('div');
        entry.className = `pda-entry pda-${data.kind || 'info'}`;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        entry.innerHTML = `<span class="pda-time">${time}</span><span class="pda-text"></span>`;
        entry.querySelector('.pda-text').textContent = data.text;
        this.pdaFeed.appendChild(entry);
        this.pdaEntries.push(entry);
        while (this.pdaEntries.length > 4) {
            const old = this.pdaEntries.shift();
            old.remove();
        }
        setTimeout(() => {
            entry.classList.add('out');
            setTimeout(() => {
                entry.remove();
                const i = this.pdaEntries.indexOf(entry);
                if (i >= 0) this.pdaEntries.splice(i, 1);
            }, 600);
        }, 14000);
    }

    onEmissionPhase(data) {
        if (!this.emissionBanner) return;
        if (data.phase === 'warning' || data.phase === 'emission') {
            this.emissionBanner.style.display = '';
            this.emissionBanner.className = data.phase === 'emission' ? 'critical' : '';
            this.onEmissionTick({ phase: data.phase, timeLeft: data.phase === 'warning' ? 60 : 45 });
        } else {
            this.emissionBanner.style.display = 'none';
        }
    }

    onEmissionTick(data) {
        if (!this.emissionBanner || this.emissionBanner.style.display === 'none') return;
        const mm = Math.floor(data.timeLeft / 60);
        const ss = String(data.timeLeft % 60).padStart(2, '0');
        if (data.phase === 'warning') {
            this.emissionBanner.innerHTML =
                `<span class="em-icon">⚠</span> EMISSION INCOMING — TAKE COVER <span class="em-timer">${mm}:${ss}</span>`;
        } else if (data.phase === 'emission') {
            this.emissionBanner.innerHTML =
                `<span class="em-icon">☢</span> EMISSION — STAY UNDER COVER <span class="em-timer">${mm}:${ss}</span>`;
        }
    }

    onDetectorState(data) {
        if (!this.detectorHud) return;
        this.detectorHud.style.display = data.active ? '' : 'none';
        this.detectorHud.classList.toggle('active', !!data.active);
        if (data.active) this.onDetectorPing({ distance: null, kind: null });
    }

    onDetectorPing(data) {
        if (!this.detectorHud || this.detectorHud.style.display === 'none') return;
        const ping = this.detectorHud.querySelector('.det-ping');
        if (!ping) return;
        if (data.distance == null) {
            ping.textContent = 'scanning…';
            ping.className = 'det-ping idle';
        } else {
            const what = data.kind === 'artifact' ? '◉ artifact' : '◎ anomaly';
            ping.textContent = `${what} — ${Math.round(data.distance)}m`;
            ping.className = 'det-ping hot';
        }
        this.detectorPingTimer = 4;
    }

    onPsyTier(data) {
        if (!this.psyOverlay) return;
        const opacity = [0, 0.14, 0.3, 0.48][data.tier] || 0;
        this.psyOverlay.style.opacity = opacity.toFixed(2);
        this.psyOverlay.classList.toggle('peak', data.tier >= 3);
    }

    onRealityFlicker() {
        if (!this.psyOverlay) return;
        this.psyOverlay.classList.add('flicker');
        setTimeout(() => this.psyOverlay.classList.remove('flicker'), 450);
    }

    createFlashlightUI() {
        // Battery indicator — visual styling lives in the stylesheet
        // (.flashlight-indicator, .battery-bar, .battery-fill, .battery-text)
        this.elements.flashlightUI = document.createElement('div');
        this.elements.flashlightUI.id = 'flashlight-ui';
        this.elements.flashlightUI.className = 'flashlight-indicator';
        this.elements.flashlightUI.style.display = 'none';
        this.elements.flashlightUI.innerHTML = `
            <span class="flashlight-icon">🔦</span>
            <div class="battery-bar">
                <div class="battery-fill" id="battery-fill"></div>
            </div>
            <span class="battery-text" id="battery-text">100%</span>
        `;
        document.body.appendChild(this.elements.flashlightUI);
    }

    /**
     * Update flashlight UI
     * @param {Object} data - Battery data
     */
    updateFlashlightUI(data) {
        const fill = document.getElementById('battery-fill');
        const text = document.getElementById('battery-text');
        
        if (fill) {
            fill.style.width = `${data.battery}%`;
            
            // Color based on level
            if (data.battery > 50) {
                fill.style.background = '#4a4';
            } else if (data.battery > 20) {
                fill.style.background = '#aa4';
            } else {
                fill.style.background = '#a44';
            }
        }
        
        if (text) {
            text.textContent = `${Math.round(data.battery)}%`;
        }
    }

    /**
     * Fluid show: mount the element, then transition it in on the next frame.
     * @param {HTMLElement} el
     */
    _showEl(el) {
        el.classList.remove('hidden');
        el.style.display = 'flex';
        // Force a reflow so the transition runs from the hidden state
        void el.offsetWidth;
        el.classList.add('visible');
    }

    /**
     * Fluid hide: transition out, then unmount when the transition ends.
     * @param {HTMLElement} el
     */
    _hideEl(el) {
        if (el.classList.contains('hidden')) return;
        el.classList.remove('visible');
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            el.classList.add('hidden');
            el.style.display = 'none';
            el.removeEventListener('transitionend', cleanup);
        };
        el.addEventListener('transitionend', cleanup);
        // Fallback in case transitionend never fires
        setTimeout(cleanup, 260);
    }

    /**
     * Toggle a menu open/closed
     * @param {string} menuName - Name of the menu
     */
    toggleMenu(menuName) {
        const isCurrentlyOpen = this.menuStates[menuName];
        
        if (isCurrentlyOpen) {
            this.closeMenu(menuName, true);
        } else {
            this.openMenu(menuName);
        }
    }

    /**
     * Open a specific menu
     * @param {string} menuName - Name of the menu to open
     */
    openMenu(menuName) {
        // Close any currently active menu first
        if (this.activeMenu && this.activeMenu !== menuName) {
            this.closeMenu(this.activeMenu);
        }
        
        // Update state
        this.menuStates[menuName] = true;
        this.activeMenu = menuName;
        
        // Show the menu (fluid transition)
        const menuElement = this.getMenuElement(menuName);
        if (menuElement) {
            this._showEl(menuElement);
            // Exit pointer lock when menu opens
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            
            // Emit events
            this.eventBus.emit('ui:menuOpened', { menu: menuName });
            this.eventBus.emit(`ui:${menuName}Opened`);
            // A menu is open: the pointer hint must not show
            this.updatePointerHint(false);
            // Refresh dynamic content when opening
            if (menuName === 'inventory') this.updateInventoryDisplay();
        }
    }

    /**
     * Show or hide the click-to-resume pointer hint.
     * Only ever visible while actually playing with no menu open.
     */
    updatePointerHint(show) {
        const hint = document.getElementById('pointer-hint');
        if (!hint) return;
        const playing = this.game && this.game.gameState === 'playing' && !this.game.isPaused;
        const menuOpen = this.activeMenu || this.isAnyMenuOpen();
        const visible = show && playing && !menuOpen;
        hint.classList.toggle('hidden', !visible);
    }

    /**
     * Show the loot container menu for a searched container
     * @param {Object} container - { id, label, items: [{id, count}] }
     */
    showLootContainer(container) {
        this.currentLootId = container.id;
        const title = document.getElementById('loot-title');
        if (title) title.textContent = container.label.toUpperCase();

        const list = document.getElementById('loot-items');
        if (list) {
            list.innerHTML = '';
            if (container.items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'loot-empty';
                empty.textContent = 'Nothing left to take';
                list.appendChild(empty);
            } else {
                container.items.forEach((entry, index) => {
                    const def = getItem(entry.id);
                    const row = document.createElement('div');
                    row.className = 'loot-row';
                    const icon = document.createElement('img');
                    icon.className = 'loot-icon';
                    icon.src = ItemIcons.get(def?.icon || entry.id);
                    icon.alt = '';
                    icon.draggable = false;
                    row.appendChild(icon);
                    const name = document.createElement('span');
                    name.className = 'loot-name';
                    name.textContent = (def?.name || entry.id) + (entry.count > 1 ? ` ×${entry.count}` : '');
                    const take = document.createElement('button');
                    take.className = 'loot-take-btn';
                    take.textContent = 'Take';
                    take.addEventListener('click', () => {
                        this.game.lootSystem?.takeItem(container.id, index);
                    });
                    row.appendChild(name);
                    row.appendChild(take);
                    list.appendChild(row);
                });
            }
        }

        const takeAll = document.getElementById('loot-take-all');
        if (takeAll) {
            takeAll.onclick = () => this.game.lootSystem?.takeAll(container.id);
        }
        const closeBtn = document.getElementById('loot-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.closeLootContainer();
        }

        this.openMenu('loot');
    }

    /**
     * Toggle the favorites quick-access menu (Q)
     */
    toggleFavorites() {
        if (this.activeMenu === 'favorites') {
            this.closeMenu('favorites');
        } else {
            this.showFavorites();
        }
    }

    /**
     * Show the favorites menu - carried favorited items, 1-8 to use/equip
     */
    showFavorites() {
        const list = document.getElementById('favorites-list');
        const invSys = this.game?.inventorySystem;
        if (list && invSys) {
            list.innerHTML = '';
            const carried = invSys.getCarriedFavorites();
            if (carried.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'favorites-empty';
                empty.textContent = 'No favorites yet - star items in your inventory';
                list.appendChild(empty);
            } else {
                carried.forEach(({ index, item }, i) => {
                    const row = document.createElement('div');
                    row.className = 'favorite-row';
                    row.innerHTML = `<span class="favorite-key">${i + 1}</span><span class="favorite-name">${item.name}${item.stackable ? ` ×${item.count}` : ''}</span>`;
                    row.addEventListener('click', () => this.useFavorite(index));
                    list.appendChild(row);
                });
            }
        }
        this.openMenu('favorites');
    }

    /**
     * Use or equip a favorited inventory slot, then close the menu
     */
    useFavorite(slotIndex) {
        const item = this.game?.inventorySystem?.slots[slotIndex];
        if (!item) return;
        this.closeMenu('favorites');
        this.onInventorySlotClick(slotIndex, item);
    }

    /**
     * Close the loot container menu (pointer lock re-engages for play)
     */
    closeLootContainer() {
        this.currentLootId = null;
        if (this.activeMenu === 'loot') {
            this.closeMenu('loot');
        }
    }

    /**
     * Close a specific menu
     * @param {string} menuName - Name of the menu to close
     * @param {boolean} [requestPointerLock=true] - Whether to request pointer lock after closing
     */
    closeMenu(menuName, requestPointerLock = true) {
        const menuElement = this.getMenuElement(menuName);
        if (menuElement) {
            // Update state
            this.menuStates[menuName] = false;
            if (this.activeMenu === menuName) {
                this.activeMenu = null;
            }
            
            // Hide the menu (fluid transition out)
            this._hideEl(menuElement);
            
            // Emit events
            this.eventBus.emit('ui:menuClosed', { menu: menuName });
            this.eventBus.emit(`ui:${menuName}Closed`);
            
            // Request pointer lock if needed and game is running
            if (requestPointerLock && this.game && !this.game.isPaused && !this.game.isLoading && this.game.inputManager) {
                this.game.inputManager.requestPointerLock();
            }
            // If the lock request silently failed, prompt the user to click
            setTimeout(() => this.updatePointerHint(true), 350);
        }
    }

    /**
     * Get the DOM element for a menu
     * @param {string} menuName - Name of the menu
     * @returns {HTMLElement|null}
     */
    getMenuElement(menuName) {
        // Special handling for inventory (panel id is inventory-menu)
        if (menuName === 'inventory') {
            if (!this.elements.inventoryPanel) {
                this.elements.inventoryPanel = document.getElementById('inventory-menu');
            }
            return this.elements.inventoryPanel;
        }
        // Special handling for pause
        if (menuName === 'pause') {
            return this.elements.pauseMenu;
        }
        // Settings menu (static element id is settings-menu)
        if (menuName === 'settings') {
            if (!this.elements.settingsMenu) {
                this.elements.settingsMenu = document.getElementById('settings-menu');
            }
            return this.elements.settingsMenu;
        }
        // Loot container menu
        if (menuName === 'loot') {
            if (!this.elements.lootMenu) {
                this.elements.lootMenu = document.getElementById('loot-menu');
            }
            return this.elements.lootMenu;
        }
        // Character creator menu
        if (menuName === 'creator') {
            if (!this.elements.creatorMenu) {
                this.elements.creatorMenu = document.getElementById('creator-menu');
            }
            return this.elements.creatorMenu;
        }
        // Favorites menu
        if (menuName === 'favorites') {
            if (!this.elements.favoritesMenu) {
                this.elements.favoritesMenu = document.getElementById('favorites-menu');
            }
            return this.elements.favoritesMenu;
        }
        // Fallback to generic naming
        const elementKey = `${menuName}Panel`;
        return this.elements[elementKey] || document.getElementById(`${menuName}-panel`);
    }

    /**
     * Hide all menus
     */
    hideAllMenus() {
        for (const menuName of Object.keys(this.menuStates)) {
            this.closeMenu(menuName, false); // Don't request pointer lock when hiding all
        }
    }

    /**
     * Check if any menu is open
     * @returns {boolean}
     */
    isAnyMenuOpen() {
        return this.activeMenu !== null;
    }

    /**
     * Check if a specific menu is open
     * @param {string} menuName - Name of the menu
     * @returns {boolean}
     */
    isMenuOpen(menuName) {
        return this.menuStates[menuName] === true;
    }

    /**
     * Update player stats display
     * @param {Object} stats - Player stats object
     */
    updateStats(stats) {
        if (this.elements.healthFill) {
            const healthPercent = (stats.health / stats.maxHealth) * 100;
            this.elements.healthFill.style.width = `${healthPercent}%`;
            
            // Color change based on health
            if (healthPercent <= 25) {
                this.elements.healthFill.style.background = 'linear-gradient(90deg, #8b0000, #ff0000)';
                this.pulseElement(this.elements.healthFill.parentElement);
            } else if (healthPercent <= 50) {
                this.elements.healthFill.style.background = 'linear-gradient(90deg, #8b4500, #ff6600)';
            } else {
                this.elements.healthFill.style.background = 'linear-gradient(90deg, #8b0000, #ff0000)';
            }
        }
        
        if (this.elements.staminaFill) {
            const staminaPercent = (stats.stamina / stats.maxStamina) * 100;
            this.elements.staminaFill.style.width = `${staminaPercent}%`;
        }
        
        if (this.elements.radiationFill) {
            const radPercent = (stats.radiation / stats.maxRadiation) * 100;
            this.elements.radiationFill.style.width = `${radPercent}%`;
            
            // Warning effect for high radiation
            if (radPercent > 50) {
                this.elements.radiationFill.parentElement.classList.add('warning');
            } else {
                this.elements.radiationFill.parentElement.classList.remove('warning');
            }
        }
    }

    /**
     * Update ammo display
     * @param {number} current - Current magazine ammo
     * @param {number} reserve - Reserve ammo
     */
    updateAmmo(current, reserve) {
        if (this.elements.currentAmmo) {
            this.elements.currentAmmo.textContent = current;
        }
        if (this.elements.reserveAmmo) {
            this.elements.reserveAmmo.textContent = reserve;
        }
    }

    /**
     * Show interaction prompt
     * @param {string} text - Prompt text
     */
    showInteractionPrompt(text = 'Press [E] to interact') {        if (this.elements.interactionPrompt) {
            this.elements.interactionPrompt.textContent = text;
            this.elements.interactionPrompt.classList.remove('hidden');
        }
    }

    /**
     * Hide interaction prompt
     */
    hideInteractionPrompt() {
        if (this.elements.interactionPrompt) {
            this.elements.interactionPrompt.classList.add('hidden');
        }
    }

    /**
     * Show notification message
     * @param {string} message - Notification text
     * @param {string} type - Notification type (info, warning, danger, success)
     * @param {number} duration - Display duration in ms
     */
    showNotification(message, type = 'info', duration = 3000) {
        if (!this.elements.notificationArea) return;
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${this.getNotificationIcon(type)}</span>
            <span class="notification-text">${message}</span>
        `;
        
        // Type styling comes from the stylesheet (.notification-<type>)
        this.elements.notificationArea.appendChild(notification);
        this.notifications.push(notification);
        
        // Limit notifications
        while (this.notifications.length > this.maxNotifications) {
            const old = this.notifications.shift();
            old.remove();
        }
        
        // Auto remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                notification.remove();
                const index = this.notifications.indexOf(notification);
                if (index > -1) {
                    this.notifications.splice(index, 1);
                }
            }, 300);
        }, duration);
    }

    /**
     * Get icon for notification type
     * @param {string} type - Notification type
     */
    getNotificationIcon(type) {
        const icons = {
            info: 'ℹ',
            warning: '⚠',
            danger: '☠',
            success: '✓'
        };
        return icons[type] || icons.info;
    }

    /**
     * Update inventory display
     */
    updateInventoryDisplay() {
        // Re-query: the grid is cached at construction, possibly before DOM ready
        if (!this.elements.inventoryGrid) {
            this.elements.inventoryGrid = document.getElementById('inventory-grid');
        }
        if (!this.elements.inventoryGrid || !this.game?.player) return;
        
        // The live inventory lives in InventorySystem, not on the player
        const invSys = this.game.inventorySystem;
        const inventory = invSys ? invSys.slots : this.game.player.inventory;
        const maxSlots = invSys ? invSys.maxSlots : this.game.player.maxInventorySlots;
        this.elements.inventoryGrid.innerHTML = '';
        
        // Create inventory slots
        
        for (let i = 0; i < maxSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.index = i;
            
            const item = inventory[i];
            if (item) {
                const isFav = invSys?.isFavorite(item.id);
                slot.innerHTML = `
                    <img class="item-icon" src="${ItemIcons.get(item.icon || item.id)}" alt="" draggable="false">
                    <span class="item-name">${item.name}</span>
                    ${item.stackable ? `<span class="item-count">${item.count}</span>` : ''}
                    <span class="fav-star ${isFav ? 'favorited' : ''}" title="Toggle favorite">★</span>
                `;
                slot.classList.add('has-item');

                // Star toggle (stopPropagation so it doesn't use the item)
                const star = slot.querySelector('.fav-star');
                star.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nowFav = invSys.toggleFavorite(item.id);
                    star.classList.toggle('favorited', nowFav);
                    this.showNotification(nowFav ? `Favorited ${item.name}` : `Unfavorited ${item.name}`, 'info', 1500);
                });
                
                // Click handlers
                slot.addEventListener('click', () => this.onInventorySlotClick(i, item));
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showItemContextMenu(e, i, item);
                });
            }
            
            this.elements.inventoryGrid.appendChild(slot);
        }

        // Carry-weight readout with encumbrance state
        const weightEl = document.getElementById('weight-display');
        if (weightEl && invSys) {
            const w = invSys.currentWeight.toFixed(1);
            weightEl.textContent = `Weight: ${w}/${invSys.maxWeight} kg`;
            const enc = invSys.getEncumbrance();
            weightEl.classList.toggle('enc-warn', enc >= 0.8 && enc < 0.95);
            weightEl.classList.toggle('enc-danger', enc >= 0.95);
        }
    }

    /**
     * Get color for item type
     * @param {string} type - Item type
     */
    getItemColor(type) {
        const colors = {
            weapon: '#888888',
            ammo: '#ffaa00',
            medical: '#00ff00',
            food: '#8b4513',
            artifact: '#ff00ff',
            armor: '#4444ff',
            misc: '#cccccc'
        };
        return colors[type] || colors.misc;
    }

    /**
     * Handle inventory slot click
     * @param {number} index - Slot index
     * @param {Object} item - Item data
     */
    onInventorySlotClick(index, item) {
        if (!item) return;
        
        // Use consumable items on click
        if (item.type === 'medical' || item.type === 'food') {
            this.useItem(index, item);
        } else if (item.type === 'weapon') {
            this.equipItem(index, item);
        }
    }

    /**
     * Show context menu for item
     * @param {MouseEvent} event - Mouse event
     * @param {number} index - Slot index
     * @param {Object} item - Item data
     */
    showItemContextMenu(event, index, item) {
        // Remove existing context menu
        const existing = document.querySelector('.item-context-menu');
        if (existing) existing.remove();
        
        const menu = document.createElement('div');
        menu.className = 'item-context-menu';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        
        const options = [
            { label: 'Use', action: () => this.useItem(index, item) },
            { label: 'Examine', action: () => this.examineItem(item) },
            { label: 'Drop', action: () => this.dropItem(index, item) }
        ];
        
        if (item.type === 'weapon') {
            options.unshift({ label: 'Equip', action: () => this.equipItem(index, item) });
        }
        
        options.forEach(opt => {
            const option = document.createElement('div');
            option.className = 'context-menu-option';
            option.textContent = opt.label;
            option.addEventListener('click', () => {
                opt.action();
                menu.remove();
            });
            
            menu.appendChild(option);
        });
        
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * Use an item
     * @param {number} index - Slot index
     * @param {Object} item - Item data
     */
    useItem(index, item) {
        this.eventBus.emit('item:use', { index, item });
        this.showNotification(`Used ${item.name}`, 'info');
        this.updateInventoryDisplay();
    }

    /**
     * Equip an item
     * @param {number} index - Slot index
     * @param {Object} item - Item data
     */
    equipItem(index, item) {
        this.eventBus.emit('item:equip', { index, item });
        this.showNotification(`Equipped ${item.name}`, 'info');
        this.updateInventoryDisplay();
    }

    /**
     * Drop an item
     * @param {number} index - Slot index
     * @param {Object} item - Item data
     */
    dropItem(index, item) {
        this.eventBus.emit('item:drop', { index, item });
        this.showNotification(`Dropped ${item.name}`, 'info');
        this.updateInventoryDisplay();
    }

    /**
     * Examine an item (show description)
     * @param {Object} item - Item data
     */
    examineItem(item) {
        this.showNotification(item.description || `${item.name}: No description available.`, 'info', 5000);
    }

    /**
     * Show the settings menu (static DOM, styled by CSS).
     * Remembers whether it was opened over the pause menu so Done
     * returns there instead of resuming the game.
     */
    showSettings() {
        this._settingsReturn = this.activeMenu === 'pause' ? 'pause' : null;
        this.populateSettingsPanel();
        this.openMenu('settings');
    }

    /**
     * Close settings, returning to the pause menu when it was opened from there
     */
    closeSettings() {
        this.closeMenu('settings', false);
        if (this._settingsReturn === 'pause' && this.game?.isPaused) {
            this.openMenu('pause');
        }
        this._settingsReturn = null;
    }

    getStoredSettings() {
        const defaults = {
            fullscreen: false, fov: 75, showFps: false,
            quality: 'medium', renderScale: 100, renderDistance: 500,
            shadows: true, autoQuality: false,
            post: true, bloom: true, aa: true, grain: true, vignette: true, chroma: false,
            masterVolume: 100, musicVolume: 50, sfxVolume: 80,
            sensitivity: 50, invertY: false
        };
        try {
            const raw = localStorage.getItem('darkrain_settings');
            if (raw) return { ...defaults, ...JSON.parse(raw) };
        } catch (_) { /* corrupted storage - use defaults */ }
        return defaults;
    }

    saveStoredSettings(st) {
        try {
            localStorage.setItem('darkrain_settings', JSON.stringify(st));
        } catch (_) { /* storage unavailable */ }
    }

    populateSettingsPanel() {
        const st = this.getStoredSettings();
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
        const setLabel = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        setChecked('set-fullscreen', st.fullscreen);
        setVal('set-fov', st.fov); setLabel('set-fov-val', st.fov);
        setChecked('set-show-fps', st.showFps);

        setVal('set-quality', st.quality);
        setVal('set-render-scale', st.renderScale); setLabel('set-render-scale-val', st.renderScale + '%');
        setVal('set-render-distance', st.renderDistance); setLabel('set-render-distance-val', st.renderDistance + 'm');
        setChecked('set-shadows', st.shadows);
        setChecked('set-auto-quality', st.autoQuality);

        setChecked('set-post', st.post);
        setChecked('set-bloom', st.bloom);
        setChecked('set-aa', st.aa);
        setChecked('set-grain', st.grain);
        setChecked('set-vignette', st.vignette);
        setChecked('set-chroma', st.chroma);

        setVal('set-master-volume', st.masterVolume); setLabel('set-master-volume-val', st.masterVolume);
        setVal('set-music-volume', st.musicVolume); setLabel('set-music-volume-val', st.musicVolume);
        setVal('set-sfx-volume', st.sfxVolume); setLabel('set-sfx-volume-val', st.sfxVolume);

        setVal('set-sensitivity', st.sensitivity); setLabel('set-sensitivity-val', st.sensitivity);
        setChecked('set-invert-y', st.invertY);

        this._wireSettingsControls();
    }

    /**
     * Wire live-apply listeners once (guarded so we never double-bind)
     */
    _wireSettingsControls() {
        if (this._settingsWired) return;
        this._settingsWired = true;

        const live = () => this.applySettings({ silent: true });

        // Range inputs: update the value label live, apply on change
        const ranges = [
            ['set-fov', 'set-fov-val', v => `${v}`],
            ['set-render-scale', 'set-render-scale-val', v => `${v}%`],
            ['set-render-distance', 'set-render-distance-val', v => `${v}m`],
            ['set-master-volume', 'set-master-volume-val', v => `${v}`],
            ['set-music-volume', 'set-music-volume-val', v => `${v}`],
            ['set-sfx-volume', 'set-sfx-volume-val', v => `${v}`],
            ['set-sensitivity', 'set-sensitivity-val', v => `${v}`],
        ];
        for (const [id, labelId, fmt] of ranges) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.addEventListener('input', () => {
                const label = document.getElementById(labelId);
                if (label) label.textContent = fmt(el.value);
            });
            el.addEventListener('change', live);
        }

        // Toggles and selects apply immediately
        for (const id of ['set-fullscreen', 'set-show-fps', 'set-quality', 'set-shadows',
                          'set-auto-quality', 'set-post', 'set-bloom', 'set-aa',
                          'set-grain', 'set-vignette', 'set-chroma', 'set-invert-y']) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', live);
        }

        document.getElementById('settings-back')?.addEventListener('click', () => this.closeSettings());
        document.getElementById('settings-reset')?.addEventListener('click', () => {
            try { localStorage.removeItem('darkrain_settings'); } catch (_) {}
            this.populateSettingsPanel();
            this.applySettings({ silent: true });
            this.showNotification('Settings reset to defaults', 'info');
        });
    }

    /**
     * Read the settings panel into a settings object
     */
    readSettingsPanel() {
        const val = (id) => document.getElementById(id)?.value;
        const checked = (id) => !!document.getElementById(id)?.checked;
        return {
            fullscreen: checked('set-fullscreen'),
            fov: parseInt(val('set-fov'), 10) || 75,
            showFps: checked('set-show-fps'),
            quality: val('set-quality') || 'medium',
            renderScale: parseInt(val('set-render-scale'), 10) || 100,
            renderDistance: parseInt(val('set-render-distance'), 10) || 500,
            shadows: checked('set-shadows'),
            autoQuality: checked('set-auto-quality'),
            post: checked('set-post'),
            bloom: checked('set-bloom'),
            aa: checked('set-aa'),
            grain: checked('set-grain'),
            vignette: checked('set-vignette'),
            chroma: checked('set-chroma'),
            masterVolume: parseInt(val('set-master-volume'), 10) ?? 100,
            musicVolume: parseInt(val('set-music-volume'), 10) ?? 50,
            sfxVolume: parseInt(val('set-sfx-volume'), 10) ?? 80,
            sensitivity: parseInt(val('set-sensitivity'), 10) || 50,
            invertY: checked('set-invert-y')
        };
    }

    /**
     * Apply stored settings to the live game (called once after boot)
     */
    applyStoredSettings() {
        const st = this.getStoredSettings();
        this._applySettingsObject(st);
    }

    /**
     * Apply settings from the settings panel (live as the user changes them)
     */
    applySettings(opts = {}) {
        const st = this.readSettingsPanel();
        this.saveStoredSettings(st);
        this._applySettingsObject(st);
        if (!opts.silent) this.showNotification('Settings applied', 'success');
    }

    /**
     * Push a settings object into the live game systems
     */
    _applySettingsObject(st) {
        if (this.game?.audioManager) {
            this.game.audioManager.setMasterVolume((st.masterVolume ?? 100) / 100);
            this.game.audioManager.setMusicVolume((st.musicVolume ?? 50) / 100);
            this.game.audioManager.setSFXVolume((st.sfxVolume ?? 80) / 100);
        }
        if (this.game?.player) {
            this.game.player.mouseSensitivity = 0.001 * ((st.sensitivity ?? 50) / 50);
            this.game.player.invertY = !!st.invertY;
        }
        // Fullscreen is applied here (not in the graphics event)
        this._applyFullscreen(!!st.fullscreen);
        // FPS overlay visibility
        this.updateFpsVisibility(!!st.showFps);
        // Everything render-related goes through the graphics event
        this.eventBus.emit('settings:graphics', {
            quality: st.quality,
            renderScale: (st.renderScale ?? 100) / 100,
            renderDistance: st.renderDistance,
            shadows: st.shadows,
            autoQuality: st.autoQuality,
            postProcessing: st.post,
            bloom: st.bloom,
            antiAliasing: st.aa,
            filmGrain: st.grain,
            vignette: st.vignette,
            chroma: st.chroma,
            fov: st.fov
        });
    }

    /**
     * Toggle fullscreen on the document element
     */
    _applyFullscreen(on) {
        try {
            if (on && !document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => {});
            } else if (!on && document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
            }
        } catch (_) { /* fullscreen unavailable */ }
    }

    /**
     * Show/hide the FPS overlay
     */
    updateFpsVisibility(show) {
        const el = this.elements.fpsCounter || document.getElementById('fps-counter');
        if (el) el.classList.toggle('hidden', !show);
    }

    /**
     * Update the FPS overlay text (called by the game loop)
     */
    updateFps(fps, ms) {
        const el = this.elements.fpsCounter || document.getElementById('fps-counter');
        if (el && !el.classList.contains('hidden')) {
            el.textContent = `${fps} FPS · ${ms.toFixed(1)} ms`;
        }
    }

    /**
     * Show loading screen
     * @param {boolean} show - Whether to show loading screen
     */
    showLoadingScreen(show) {
        if (this.elements.loadingScreen) {
            if (show) {
                this.elements.loadingScreen.classList.remove('hidden');
            } else {
                // Fade out
                this.elements.loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    this.elements.loadingScreen.classList.add('hidden');
                    this.elements.loadingScreen.style.opacity = '1';
                }, 500);
            }
        }
    }

    /**
     * Update loading progress
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} text - Loading text
     */
    updateLoadingProgress(progress, text = '') {
        if (this.elements.loadingProgress) {
            this.elements.loadingProgress.style.width = `${progress}%`;
        }
        if (this.elements.loadingText && text) {
            this.elements.loadingText.textContent = text;
        }
    }

    /**
     * Show damage indicator
     * @param {THREE.Vector3} direction - Direction damage came from
     */
    showDamageIndicator(direction) {
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            background: radial-gradient(ellipse at center, transparent 50%, rgba(255,0,0,0.3) 100%);
            animation: damageFlash 0.3s ease-out forwards;
        `;
        
        // Add keyframes if not exists
        if (!document.getElementById('damage-flash-style')) {
            const style = document.createElement('style');
            style.id = 'damage-flash-style';
            style.textContent = `
                @keyframes damageFlash {
                    0% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        this.elements.hud?.appendChild(indicator);
        
        setTimeout(() => indicator.remove(), 300);
    }

    /**
     * Update time display
     * @param {Object} time - Time object with hours, minutes, formatted
     */
    updateTimeDisplay(time) {
        // Could add a time display element to HUD
        // For now, update compass or add to existing UI
        this.updateCompass(this.game?.player?.cameraYaw || 0);
    }

    /**
     * Animate crosshair on fire
     */
    animateCrosshair() {
        if (!this.elements.crosshair) return;
        
        this.elements.crosshair.style.transform = 'translate(-50%, -50%) scale(1.5)';
        setTimeout(() => {
            this.elements.crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 50);
    }

    /**
     * Pulse element effect
     * @param {HTMLElement} element - Element to pulse
     */
    pulseElement(element) {
        if (!element || element.classList.contains('pulsing')) return;
        
        element.classList.add('pulsing');
        element.style.animation = 'pulse 0.5s ease-in-out infinite';
        
        // Add pulse keyframes if not exists
        if (!document.getElementById('pulse-style')) {
            const style = document.createElement('style');
            style.id = 'pulse-style';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Stop pulsing element
     * @param {HTMLElement} element - Element to stop pulsing
     */
    stopPulse(element) {
        if (!element) return;
        element.classList.remove('pulsing');
        element.style.animation = '';
    }

    /**
     * Update compass direction
     * @param {number} rotation - Player Y rotation in radians
     * @deprecated Compass strip is owned by CompassSystem now; this is a no-op.
     */
    updateCompass(rotation) {
        // No-op: CompassSystem renders the compass strip each frame.
    }

    /**
     * Main update loop
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        if (!this.game?.player) return;
        
        // Update stats
        this.updateStats(this.game.player.stats);
        
        // Update compass
        this.updateCompass(this.game.player.cameraYaw);
        
        // Update ammo if weapon equipped
        if (this.game.player.equippedWeapon) {
            this.updateAmmo(
                this.game.player.equippedWeapon.currentAmmo,
                this.game.player.equippedWeapon.reserveAmmo
            );
        }
        
        // Decay detector ping readout
        if (this.detectorPingTimer > 0) {
            this.detectorPingTimer -= deltaTime;
            if (this.detectorPingTimer <= 0) this.onDetectorPing({ distance: null });
        }

        // Update interaction prompt
        if (this.game.player.lookingAt) {
            const prompt = this.game.player.lookingAt.userData.promptText;
            this.showInteractionPrompt(prompt ? `Press [E] - ${prompt}` : undefined);
        } else {
            this.hideInteractionPrompt();
        }
    }

    dispose() {
        // Clean up notifications
        this.notifications.forEach(n => n.remove());
        this.notifications = [];
        
        // Clean up flashlight UI
        if (this.elements.flashlightUI) {
            this.elements.flashlightUI.remove();
        }
        
        // Clean up Zone UI
        for (const el of [this.pdaFeed, this.emissionBanner, this.detectorHud, this.psyOverlay, this.emissionOverlay]) {
            if (el) el.remove();
        }
    }
}
