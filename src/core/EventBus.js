/**
 * EventBus - Global event system for decoupled communication
 * Allows different game systems to communicate without direct references
 */
export class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event once
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            callback(...args);
        };
        this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Clear all listeners for an event or all events
     * @param {string} [event] - Optional specific event to clear
     */
    clear(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}

// Global event bus instance
export const globalEventBus = new EventBus();
export const eventBus = globalEventBus; // alias for convenience

// Common event types
export const GameEvents = {
    // Game State
    GAME_START: 'game:start',
    GAME_PAUSE: 'game:pause',
    GAME_RESUME: 'game:resume',
    GAME_OVER: 'game:over',

    // Player Events
    PLAYER_DAMAGE: 'player:damage',
    PLAYER_HEAL: 'player:heal',
    PLAYER_DEATH: 'player:death',
    PLAYER_INTERACT: 'player:interact',
    PLAYER_PICKUP: 'player:pickup',

    // Combat Events
    WEAPON_FIRE: 'weapon:fire',
    WEAPON_RELOAD: 'weapon:reload',
    WEAPON_SWITCH: 'weapon:switch',

    // World Events
    WEATHER_CHANGE: 'weather:change',
    TIME_UPDATE: 'time:update',
    ANOMALY_TRIGGER: 'anomaly:trigger',

    // UI Events
    NOTIFICATION: 'ui:notification',
    INVENTORY_OPEN: 'ui:inventory:open',
    INVENTORY_CLOSE: 'ui:inventory:close',

    // Entity Events
    ENEMY_SPAWN: 'enemy:spawn',
    ENEMY_DEATH: 'enemy:death',
    ENEMY_ALERT: 'enemy:alert',

    // Save/Load
    SAVE_GAME: 'save:game',
    LOAD_GAME: 'load:game'
};
