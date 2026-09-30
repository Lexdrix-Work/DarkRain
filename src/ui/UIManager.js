import { globalEventBus, GameEvents } from '../core/EventBus.js';
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
        
        this.eventBus.on('input:toggle:pause', () => {
            this.toggleMenu('pause');
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
                this.elements.flashlightUI.style.display = data.isOn ? 'block' : 'none';
            }
        });
    }

    setupPauseMenu() {
        const resumeBtn = document.getElementById('resume-btn');
        const settingsBtn = document.getElementById('settings-btn');
        const quitBtn = document.getElementById('quit-btn');
        
        if (resumeBtn) {
            resumeBtn.addEventListener('click', () => {
                this.eventBus.emit(GameEvents.GAME_RESUME);
            });
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }
        
        if (quitBtn) {
            quitBtn.addEventListener('click', () => {
                this.confirmQuit();
            });
        }
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
            menu.classList.remove('hidden');
            menu.style.display = 'flex';
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
            menu.classList.add('hidden');
            menu.style.display = 'none';
        }
        this.setHudVisible(true);
    }

    /**
     * Start a new game session from the main menu
     */
    startNewGame() {
        this.hideMainMenu();
        if (this.game && typeof this.game.beginSession === 'function') {
            this.game.beginSession(false);
        }
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
            el.classList.remove('hidden');
            el.style.display = 'flex';
        }
        const r = document.getElementById('death-reason');
        if (r && reason) r.textContent = reason;
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
        const confirmed = confirm('Quit to the main menu? Unsaved progress will be lost.');
        if (confirmed) this.quitToMenu();
    }

    /**
     * Create flashlight UI elements
     */
    createFlashlightUI() {
        // Create battery indicator
        this.elements.flashlightUI = document.createElement('div');
        this.elements.flashlightUI.id = 'flashlight-ui';
        this.elements.flashlightUI.innerHTML = `
            <div class="flashlight-indicator">
                <span class="flashlight-icon">🔦</span>
                <div class="battery-bar">
                    <div class="battery-fill" id="battery-fill"></div>
                </div>
                <span class="battery-text" id="battery-text">100%</span>
            </div>
        `;
        this.elements.flashlightUI.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            display: none;
            background: rgba(0,0,0,0.6);
            padding: 8px 12px;
            border-radius: 4px;
            color: white;
            font-family: monospace;
            z-index: 100;
            border: 1px solid #c4a000;
        `;
        
        // Style the battery bar
        const style = document.createElement('style');
        style.textContent = `
            .battery-bar {
                width: 60px;
                height: 12px;
                background: #333;
                border: 1px solid #666;
                margin: 0 8px;
                display: inline-block;
                vertical-align: middle;
            }
            .battery-fill {
                height: 100%;
                width: 100%;
                background: #4a4;
                transition: width 0.3s, background 0.3s;
            }
            .flashlight-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
            }
        `;
        document.head.appendChild(style);
        
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
        
        // Show the menu
        const menuElement = this.getMenuElement(menuName);
        if (menuElement) {
            menuElement.classList.remove('hidden');
            menuElement.classList.add('visible');
            menuElement.style.display = 'flex';
            
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
            
            // Hide the menu
            menuElement.classList.add('hidden');
            menuElement.classList.remove('visible');
            menuElement.style.display = 'none';
            
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
    showInteractionPrompt(text = 'Press [E] to interact') {
        if (this.elements.interactionPrompt) {
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
        
        // Style based on type
        const colors = {
            info: '#c4a000',
            warning: '#ff8800',
            danger: '#ff0000',
            success: '#00ff00'
        };
        
        notification.style.borderLeftColor = colors[type] || colors.info;
        
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
                slot.innerHTML = `
                    <div class="item-icon" style="background-color: ${this.getItemColor(item.type)}"></div>
                    <span class="item-name">${item.name}</span>
                    ${item.stackable ? `<span class="item-count">${item.count}</span>` : ''}
                `;
                slot.classList.add('has-item');
                
                // Click handlers
                slot.addEventListener('click', () => this.onInventorySlotClick(i, item));
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showItemContextMenu(e, i, item);
                });
            }
            
            this.elements.inventoryGrid.appendChild(slot);
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
        menu.style.position = 'absolute';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.style.background = 'rgba(20, 20, 20, 0.95)';
        menu.style.border = '1px solid #c4a000';
        menu.style.padding = '5px 0';
        menu.style.zIndex = '1000';
        
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
            option.style.padding = '8px 20px';
            option.style.cursor = 'pointer';
            option.style.color = '#c4a000';
            
            option.addEventListener('mouseenter', () => {
                option.style.background = 'rgba(196, 160, 0, 0.2)';
            });
            option.addEventListener('mouseleave', () => {
                option.style.background = 'transparent';
            });
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
     * Show settings panel
     */
    showSettings() {
        // Never stack duplicate panels
        document.getElementById('settings-panel')?.remove();
        // Create settings panel dynamically
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'settings-panel';
        settingsPanel.className = 'settings-panel';
        settingsPanel.innerHTML = `
            <h2>SETTINGS</h2>
            
            <div class="settings-section">
                <h3>Audio</h3>
                <div class="setting-row">
                    <label>Master Volume</label>
                    <input type="range" id="master-volume" min="0" max="100" value="100">
                </div>
                <div class="setting-row">
                    <label>Music Volume</label>
                    <input type="range" id="music-volume" min="0" max="100" value="50">
                </div>
                <div class="setting-row">
                    <label>SFX Volume</label>
                    <input type="range" id="sfx-volume" min="0" max="100" value="80">
                </div>
            </div>
            
            <div class="settings-section">
                <h3>Controls</h3>
                <div class="setting-row">
                    <label>Mouse Sensitivity</label>
                    <input type="range" id="mouse-sensitivity" min="1" max="100" value="50">
                </div>
                <div class="setting-row">
                    <label>Invert Y-Axis</label>
                    <input type="checkbox" id="invert-y">
                </div>
            </div>
            
            <div class="settings-section">
                <h3>Graphics</h3>
                <div class="setting-row">
                    <label>Quality</label>
                    <select id="graphics-quality">
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="ultra">Ultra</option>
                    </select>
                </div>
                <div class="setting-row">
                    <label>Shadows</label>
                    <input type="checkbox" id="shadows-enabled" checked>
                </div>
            </div>
            
            <div class="settings-buttons">
                <button id="settings-apply">Apply</button>
                <button id="settings-back">Back</button>
            </div>
        `;
        
        // Style the panel
        settingsPanel.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 20, 0.95);
            border: 2px solid #c4a000;
            padding: 30px;
            min-width: 400px;
            color: #c4a000;
            font-family: 'Courier New', monospace;
            z-index: 1001;
        `;
        
        document.body.appendChild(settingsPanel);
        this.populateSettingsPanel();
        
        // Event handlers
        document.getElementById('settings-back').addEventListener('click', () => {
            this.closeMenu('settings');  // Close first (updates state)
            settingsPanel.remove();       // Then remove element
        });

        document.getElementById('settings-apply').addEventListener('click', () => {
            this.applySettings();
            this.closeMenu('settings');
            settingsPanel.remove();
        });
        
        this.openMenu('settings');
    }

    getStoredSettings() {
        const defaults = {
            masterVolume: 100, musicVolume: 50, sfxVolume: 80,
            sensitivity: 50, invertY: false,
            quality: 'medium', shadows: true
        };
        try {
            const raw = localStorage.getItem('darkrain_settings');
            if (raw) return { ...defaults, ...JSON.parse(raw) };
        } catch (_) { /* corrupted storage - use defaults */ }
        return defaults;
    }

    populateSettingsPanel() {
        const st = this.getStoredSettings();
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
        set('master-volume', st.masterVolume);
        set('music-volume', st.musicVolume);
        set('sfx-volume', st.sfxVolume);
        set('mouse-sensitivity', st.sensitivity);
        setChecked('invert-y', st.invertY);
        set('graphics-quality', st.quality);
        setChecked('shadows-enabled', st.shadows);
    }

    /**
     * Apply stored settings to the live game (called once after boot)
     */
    applyStoredSettings() {
        const st = this.getStoredSettings();
        if (this.game?.audioManager) {
            this.game.audioManager.setMasterVolume(st.masterVolume / 100);
            this.game.audioManager.setMusicVolume(st.musicVolume / 100);
            this.game.audioManager.setSFXVolume(st.sfxVolume / 100);
        }
        if (this.game?.player) {
            this.game.player.mouseSensitivity = 0.001 * (st.sensitivity / 50);
            this.game.player.invertY = st.invertY;
        }
        this.eventBus.emit('settings:graphics', { quality: st.quality, shadows: st.shadows });
    }

    /**
     * Apply settings from settings panel
     */
    applySettings() {
        const masterVolume = document.getElementById('master-volume')?.value / 100;
        const musicVolume = document.getElementById('music-volume')?.value / 100;
        const sfxVolume = document.getElementById('sfx-volume')?.value / 100;
        const sensitivity = document.getElementById('mouse-sensitivity')?.value / 50;
        const invertY = document.getElementById('invert-y')?.checked;
        const quality = document.getElementById('graphics-quality')?.value;
        const shadows = document.getElementById('shadows-enabled')?.checked;
        
        // Apply to game systems
        if (this.game?.audioManager) {
            this.game.audioManager.setMasterVolume(masterVolume);
            this.game.audioManager.setMusicVolume(musicVolume);
            this.game.audioManager.setSFXVolume(sfxVolume);
        }
        
        if (this.game?.player) {
            this.game.player.mouseSensitivity = 0.001 * sensitivity;
            this.game.player.invertY = invertY;
        }
        
        // Graphics settings
        this.eventBus.emit('settings:graphics', { quality, shadows });
        
        // Persist
        try {
            localStorage.setItem('darkrain_settings', JSON.stringify({
                masterVolume: document.getElementById('master-volume')?.value,
                musicVolume: document.getElementById('music-volume')?.value,
                sfxVolume: document.getElementById('sfx-volume')?.value,
                sensitivity: document.getElementById('mouse-sensitivity')?.value,
                invertY: document.getElementById('invert-y')?.checked,
                quality, shadows
            }));
        } catch (_) { /* storage unavailable */ }
        
        this.showNotification('Settings applied', 'success');
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
     */
    updateCompass(rotation) {
        if (!this.elements.compass) return;
        
        const degrees = THREE.MathUtils.radToDeg(rotation);
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(((degrees % 360) + 360) % 360 / 45) % 8;
        
        this.elements.compass.textContent = directions[index];
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
        
        // Update interaction prompt
        if (this.game.player.lookingAt) {
            this.showInteractionPrompt();
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
    }
}
