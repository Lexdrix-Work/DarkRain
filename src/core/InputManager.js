/**
 * InputManager - Handles all input (keyboard, mouse, gamepad)
 * Supports key bindings and input state queries
 */
export class InputManager {
    /**
     * Create an input manager instance
     * @param {Object} [eventBus] - Event bus for communication
     * @param {HTMLElement} [canvas] - Canvas element for pointer lock
     */
    constructor(eventBus = null, canvas = null) {
        this.eventBus = eventBus;
        this.canvas = canvas; // Store the canvas reference for pointer lock
        
        this.keys = new Map();
        this.keysJustPressed = new Set();
        this.keysJustReleased = new Set();
        
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            buttons: new Map(),
            wheel: 0,
            locked: false
        };
        
        this.bindings = new Map();
        
        // Track menu states for toggle functionality
        this.menuStates = new Map();
        this.menuActions = new Set(['inventory', 'map', 'pause', 'favorites']); // Actions that should toggle
        
        // Event listeners for menu state changes
        this.eventListeners = new Map();
        
        this.setupDefaultBindings();
        this.setupEventListeners();
        this.initializeMenuStates();
    }

    /**
     * Initialize all menu states to closed
     */
    initializeMenuStates() {
        for (const menuAction of this.menuActions) {
            this.menuStates.set(menuAction, false);
        }
    }

    setupDefaultBindings() {
        // Movement
        this.bindings.set('moveForward', ['KeyW', 'ArrowUp']);
        this.bindings.set('moveBackward', ['KeyS', 'ArrowDown']);
        this.bindings.set('moveLeft', ['KeyA', 'ArrowLeft']);
        this.bindings.set('moveRight', ['KeyD', 'ArrowRight']);
        this.bindings.set('jump', ['Space']);
        this.bindings.set('crouch', ['KeyC', 'ControlLeft']);
        this.bindings.set('sprint', ['ShiftLeft']);
        
        // Actions
        this.bindings.set('interact', ['KeyE']);
        this.bindings.set('reload', ['KeyR']);
        this.bindings.set('inventory', ['Tab', 'KeyI']);
        this.bindings.set('flashlight', ['KeyF']);
        this.bindings.set('map', ['KeyM']);
        this.bindings.set('favorites', ['KeyQ']);
        this.bindings.set('quicksave', ['F5']);
        this.bindings.set('quickload', ['F9']);
        
        // Weapons
        this.bindings.set('fire', ['Mouse0']);
        this.bindings.set('aim', ['Mouse2']);
        this.bindings.set('melee', ['KeyV']);
        
        // Quick slots
        this.bindings.set('slot1', ['Digit1']);
        this.bindings.set('slot2', ['Digit2']);
        this.bindings.set('slot3', ['Digit3']);
        this.bindings.set('slot4', ['Digit4']);
        
        // System
        this.bindings.set('pause', ['Escape']);
    }

    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Mouse events
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('wheel', (e) => this.onWheel(e));
        
        // Pointer lock
        document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    }

    onKeyDown(event) {
        // Prevent default for game keys
        if (this.shouldPreventDefault(event.code)) {
            event.preventDefault();
        }
        
        // Only process if key wasn't already held
        if (!this.keys.get(event.code)) {
            this.keysJustPressed.add(event.code);
            
            // Check if this key triggers a menu toggle
            this.handleMenuToggle(event.code);
            
            // Handle flashlight
            if (event.code === 'KeyF') {
                this.emit('input:flashlight');
                if (this.eventBus && this.eventBus.emit) {
                    this.eventBus.emit('input:flashlight');
                }
            }
        }
        this.keys.set(event.code, true);
    }

    /**
     * Check if we should prevent default browser behavior
     */
    shouldPreventDefault(code) {
        // Prevent Tab from changing focus
        if (code === 'Tab') return true;
        // Prevent F5 from refreshing
        if (code === 'F5') return true;
        // Add more as needed
        return false;
    }

    /**
     * Handle menu toggle when a key is pressed
     * @param {string} keyCode - The key code that was pressed
     */
    handleMenuToggle(keyCode) {
        for (const menuAction of this.menuActions) {
            const keys = this.bindings.get(menuAction);
            if (keys && keys.includes(keyCode)) {
                this.toggleMenu(menuAction);
                
                // Emit toggle events through EventBus if available
                if (this.eventBus && this.eventBus.emit) {
                    this.eventBus.emit('input:toggle', { action: menuAction });
                    this.eventBus.emit(`input:toggle:${menuAction}`, { action: menuAction });
                }
                break;
            }
        }
    }

    /**
     * Toggle a menu's open/closed state
     * @param {string} menuName - Name of the menu to toggle
     * @param {boolean} [closeOthers=true] - Whether to close other menus when opening
     * @returns {boolean} - The new state of the menu (true = open)
     */
    toggleMenu(menuName, closeOthers = true) {
        const currentState = this.menuStates.get(menuName) || false;
        const newState = !currentState;
        
        if (newState && closeOthers) {
            // Close all other menus when opening a new one
            for (const [menu, isOpen] of this.menuStates) {
                if (menu !== menuName && isOpen) {
                    this.setMenuState(menu, false);
                }
            }
        }
        
        this.setMenuState(menuName, newState);
        return newState;
    }

    /**
     * Set a specific menu's state
     * @param {string} menuName - Name of the menu
     * @param {boolean} isOpen - Whether the menu should be open
     */
    setMenuState(menuName, isOpen) {
        const previousState = this.menuStates.get(menuName);
        this.menuStates.set(menuName, isOpen);
        
        // Only emit if state actually changed
        if (previousState !== isOpen) {
            this.emit(`menu:${menuName}`, { isOpen, menuName });
            this.emit('menu:stateChanged', { menuName, isOpen });
            
            // Also emit to global event bus if available
            if (this.eventBus && this.eventBus.emit) {
                this.eventBus.emit(`menu:${menuName}`, { isOpen, menuName });
                this.eventBus.emit('menu:stateChanged', { menuName, isOpen });
            }
        }
    }

    /**
     * Get a menu's current state
     * @param {string} menuName - Name of the menu
     * @returns {boolean} - Whether the menu is open
     */
    isMenuOpen(menuName) {
        return this.menuStates.get(menuName) || false;
    }

    /**
     * Check if any menu is currently open
     * @returns {boolean}
     */
    isAnyMenuOpen() {
        for (const isOpen of this.menuStates.values()) {
            if (isOpen) return true;
        }
        return false;
    }

    /**
     * Close all menus
     */
    closeAllMenus() {
        for (const menuName of this.menuStates.keys()) {
            this.setMenuState(menuName, false);
        }
    }

    /**
     * Register a menu action for toggle behavior
     * @param {string} menuName - Name of the menu/action
     */
    registerMenuAction(menuName) {
        this.menuActions.add(menuName);
        if (!this.menuStates.has(menuName)) {
            this.menuStates.set(menuName, false);
        }
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }

    onKeyUp(event) {
        this.keys.set(event.code, false);
        this.keysJustReleased.add(event.code);
    }

    onMouseMove(event) {
        if (this.mouse.locked) {
            this.mouse.deltaX = event.movementX;
            this.mouse.deltaY = event.movementY;
        }
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
    }

    onMouseDown(event) {
        this.mouse.buttons.set(`Mouse${event.button}`, true);
        this.keysJustPressed.add(`Mouse${event.button}`);
    }

    onMouseUp(event) {
        this.mouse.buttons.set(`Mouse${event.button}`, false);
        this.keysJustReleased.add(`Mouse${event.button}`);
    }

    onWheel(event) {
        this.mouse.wheel = Math.sign(event.deltaY);
    }

    onPointerLockChange() {
        const wasLocked = this.mouse.locked;
        this.mouse.locked = document.pointerLockElement === this.canvas;
        
        // If we just got pointer lock, reset mouse deltas
        if (this.mouse.locked && !wasLocked) {
            this.mouse.deltaX = 0;
            this.mouse.deltaY = 0;
        }
        // Notify UI so it can show/hide the click-to-resume hint
        if (this.eventBus) {
            this.eventBus.emit('input:pointerlock', { locked: this.mouse.locked });
        }
    }

    /**
     * Request pointer lock for FPS controls
     */
    requestPointerLock() {
        if (this.canvas && !this.mouse.locked) {
            try {
                const result = this.canvas.requestPointerLock();
                // Chrome returns a promise that rejects without a user gesture;
                // the click-to-lock fallback covers that case.
                if (result && typeof result.catch === "function") {
                    result.catch(() => {});
                }
            } catch (_) {
                // Pointer lock unavailable (e.g. no user gesture yet) - ignore.
            }
        }
    }

    /**
     * Exit pointer lock
     */
    exitPointerLock() {
        if (this.mouse.locked) {
            document.exitPointerLock();
        }
    }

    /**
     * Check if an action is currently active
     * @param {string} action - Action name from bindings
     * @returns {boolean}
     */
    isActionActive(action) {
        const keys = this.bindings.get(action);
        if (!keys) return false;
        
        return keys.some(key => {
            if (key.startsWith('Mouse')) {
                return this.mouse.buttons.get(key) === true;
            }
            return this.keys.get(key) === true;
        });
    }

    /**
     * Check if an action was just pressed this frame
     * @param {string} action - Action name from bindings
     * @returns {boolean}
     */
    isActionJustPressed(action) {
        const keys = this.bindings.get(action);
        if (!keys) return false;
        
        return keys.some(key => this.keysJustPressed.has(key));
    }

    /**
     * Check if an action was just released this frame
     * @param {string} action - Action name from bindings
     * @returns {boolean}
     */
    isActionJustReleased(action) {
        const keys = this.bindings.get(action);
        if (!keys) return false;
        
        return keys.some(key => this.keysJustReleased.has(key));
    }

    /**
     * Get mouse delta for camera control
     * @returns {{x: number, y: number}}
     */
    getMouseDelta() {
        return {
            x: this.mouse.deltaX,
            y: this.mouse.deltaY
        };
    }

    /**
     * Get movement input as a normalized vector
     * @returns {{x: number, z: number}}
     */
    getMovementInput() {
        let x = 0;
        let z = 0;
        
        if (this.isActionActive('moveForward')) z -= 1;
        if (this.isActionActive('moveBackward')) z += 1;
        if (this.isActionActive('moveLeft')) x -= 1;
        if (this.isActionActive('moveRight')) x += 1;
        
        // Normalize diagonal movement
        const length = Math.sqrt(x * x + z * z);
        if (length > 0) {
            x /= length;
            z /= length;
        }
        
        return { x, z };
    }

    /**
     * Rebind an action to new keys
     * @param {string} action - Action name
     * @param {string[]} keys - Array of key codes
     */
    rebind(action, keys) {
        this.bindings.set(action, keys);
    }

    /**
     * Register an action as a toggle action
     */
    registerToggleAction(action) {
        this.menuActions.add(action);
        if (!this.menuStates.has(action)) {
            this.menuStates.set(action, false);
        }
    }

    /**
     * Clear frame-specific input states (call at end of frame)
     */
    update() {
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.wheel = 0;
    }

    /**
     * Get current bindings for saving
     * @returns {Object}
     */
    getBindings() {
        return Object.fromEntries(this.bindings);
    }

    /**
     * Load bindings from save data
     * @param {Object} bindings
     */
    loadBindings(bindings) {
        for (const [action, keys] of Object.entries(bindings)) {
            this.bindings.set(action, keys);
        }
    }
}

// Global instance - Note: This should only be used if not using the Game class
// In most cases, you'll want to create InputManager instances through the Game class
export const inputManager = new InputManager(null, null);
