import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * DebugConsole - Developer console for testing and debugging
 */
export class DebugConsole {
    constructor(game) {
        this.game = game;
        this.isVisible = false;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        // Command registry
        this.commands = new Map();
        
        // UI elements
        this.container = null;
        this.input = null;
        this.output = null;
        
        this.init();
    }

    init() {
        this.createUI();
        this.registerDefaultCommands();
        this.setupEventListeners();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'debug-console';
        this.container.className = 'hidden';
        this.container.innerHTML = `
            <div class="console-output" id="console-output"></div>
            <div class="console-input-wrapper">
                <span class="console-prompt">></span>
                <input type="text" id="console-input" class="console-input" placeholder="Enter command...">
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #debug-console {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 40%;
                background: rgba(0, 0, 0, 0.9);
                font-family: 'Courier New', monospace;
                font-size: 14px;
                color: #00ff00;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                border-bottom: 2px solid #00ff00;
            }
            
            #debug-console.hidden {
                display: none;
            }
            
            .console-output {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            }
            
            .console-line {
                margin: 2px 0;
                white-space: pre-wrap;
            }
            
            .console-line.error {
                color: #ff4444;
            }
            
            .console-line.warning {
                color: #ffaa00;
            }
            
            .console-line.info {
                color: #4488ff;
            }
            
            .console-line.success {
                color: #44ff44;
            }
            
            .console-input-wrapper {
                display: flex;
                align-items: center;
                padding: 10px;
                background: rgba(0, 50, 0, 0.5);
            }
            
            .console-prompt {
                margin-right: 10px;
                color: #00ff00;
            }
            
            .console-input {
                flex: 1;
                background: transparent;
                border: none;
                color: #00ff00;
                font-family: inherit;
                font-size: inherit;
                outline: none;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        this.output = document.getElementById('console-output');
        this.input = document.getElementById('console-input');
    }

    setupEventListeners() {
        // Toggle console
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Backquote') {
                e.preventDefault();
                this.toggle();
            }
            
            if (!this.isVisible) return;
            
            if (e.code === 'Enter') {
                this.executeInput();
            } else if (e.code === 'ArrowUp') {
                this.navigateHistory(-1);
            } else if (e.code === 'ArrowDown') {
                this.navigateHistory(1);
            } else if (e.code === 'Tab') {
                e.preventDefault();
                this.autocomplete();
            }
        });
    }

    /**
     * Register default commands
     */
    registerDefaultCommands() {
        // Help
        this.register('help', 'Show available commands', () => {
            this.log('Available commands:', 'info');
            for (const [name, cmd] of this.commands) {
                this.log(`  ${name} - ${cmd.description}`);
            }
        });
        
        // Clear console
        this.register('clear', 'Clear console output', () => {
            this.output.innerHTML = '';
        });
        
        // God mode
        this.register('god', 'Toggle god mode', () => {
            if (this.game.player) {
                this.game.player.godMode = !this.game.player.godMode;
                this.log(`God mode: ${this.game.player.godMode ? 'ON' : 'OFF'}`, 'success');
            }
        });
        
        // Give health
        this.register('heal', 'Restore full health', (args) => {
            if (this.game.player) {
                const amount = parseInt(args[0]) || this.game.player.stats.maxHealth;
                this.game.player.heal(amount);
                this.log(`Healed ${amount} HP`, 'success');
            }
        });
        
        // Give item
        this.register('give', 'Give item (give <item_id> [amount])', (args) => {
            if (!args[0]) {
                this.log('Usage: give <item_id> [amount]', 'warning');
                return;
            }
            const amount = parseInt(args[1]) || 1;
            if (this.game.inventorySystem?.addItem(args[0], amount)) {
                this.log(`Given ${amount}x ${args[0]}`, 'success');
            } else {
                this.log(`Failed to give item: ${args[0]}`, 'error');
            }
        });
        
        // Spawn enemy
        this.register('spawn', 'Spawn enemy (spawn <type>)', (args) => {
            const type = args[0] || 'enemy';
            const player = this.game.player;
            if (player && this.game.worldManager) {
                const forward = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation);
                const spawnPos = player.position.clone().addScaledVector(forward, 5);
                spawnPos.y = 0;
                
                this.game.worldManager.spawnEnemy({
                    type,
                    position: spawnPos.toArray()
                });
                this.log(`Spawned ${type}`, 'success');
            }
        });
        
        // Teleport
        this.register('tp', 'Teleport (tp <x> <y> <z>)', (args) => {
            if (args.length < 3) {
                this.log('Usage: tp <x> <y> <z>', 'warning');
                return;
            }
            if (this.game.player) {
                this.game.player.position.set(
                    parseFloat(args[0]),
                    parseFloat(args[1]),
                    parseFloat(args[2])
                );
                this.log(`Teleported to ${args.join(', ')}`, 'success');
            }
        });
        
        // Set time
        this.register('time', 'Set time (time <hours> [minutes])', (args) => {
            if (!args[0]) {
                const time = this.game.dayNightCycle?.getTime();
                this.log(`Current time: ${time?.formatted || 'N/A'}`, 'info');
                return;
            }
            const hours = parseInt(args[0]);
            const minutes = parseInt(args[1]) || 0;
            this.game.dayNightCycle?.setTime(hours, minutes);
            this.log(`Time set to ${hours}:${minutes.toString().padStart(2, '0')}`, 'success');
        });
        
        // Set weather
        this.register('weather', 'Set weather (weather <type>)', (args) => {
            if (!args[0]) {
                this.log(`Current weather: ${this.game.weatherSystem?.currentWeather || 'N/A'}`, 'info');
                this.log('Types: clear, cloudy, overcast, rain, heavy_rain, thunderstorm, fog, emission', 'info');
                return;
            }
            this.game.weatherSystem?.setWeather(args[0], 5);
            this.log(`Weather changing to: ${args[0]}`, 'success');
        });
        
        // Kill all enemies
        this.register('killall', 'Kill all enemies', () => {
            if (this.game.worldManager) {
                let count = 0;
                for (const enemy of this.game.worldManager.enemies.values()) {
                    enemy.takeDamage(9999, null);
                    count++;
                }
                this.log(`Killed ${count} enemies`, 'success');
            }
        });
        
        // Noclip
        this.register('noclip', 'Toggle noclip mode', () => {
            if (this.game.player) {
                this.game.player.noclip = !this.game.player.noclip;
                this.log(`Noclip: ${this.game.player.noclip ? 'ON' : 'OFF'}`, 'success');
            }
        });
        
        // Show FPS
        this.register('fps', 'Show FPS', () => {
            this.log(`FPS: ${this.game.fps || 0}`, 'info');
        });
        
        // Show position
        this.register('pos', 'Show player position', () => {
            const pos = this.game.player?.position;
            if (pos) {
                this.log(`Position: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`, 'info');
            }
        });
        
        // Start quest
        this.register('quest', 'Quest commands (quest start/complete/list <id>)', (args) => {
            const subCmd = args[0];
            const questId = args[1];
            
            switch (subCmd) {
                case 'start':
                    if (this.game.questSystem?.startQuest(questId)) {
                        this.log(`Started quest: ${questId}`, 'success');
                    } else {
                        this.log(`Failed to start quest: ${questId}`, 'error');
                    }
                    break;
                case 'complete':
                    if (this.game.questSystem?.completeQuest(questId)) {
                        this.log(`Completed quest: ${questId}`, 'success');
                    } else {
                        this.log(`Failed to complete quest: ${questId}`, 'error');
                    }
                    break;
                case 'list':
                    const quests = this.game.questSystem?.getActiveQuests() || [];
                    this.log(`Active quests (${quests.length}):`, 'info');
                    quests.forEach(q => this.log(`  - ${q.id}: ${q.name}`));
                    break;
                default:
                    this.log('Usage: quest <start|complete|list> [quest_id]', 'warning');
            }
        });
        
        // Save/Load
        this.register('save', 'Save game (save [slot])', (args) => {
            const slot = args[0] || 'console';
            this.game.saveSystem?.saveGame(slot);
        });
        
        this.register('load', 'Load game (load [slot])', (args) => {
            const slot = args[0] || 'console';
            this.game.saveSystem?.loadGame(slot);
        });
    }

    /**
     * Register a command
     * @param {string} name - Command name
     * @param {string} description - Command description
     * @param {Function} handler - Command handler
     */
    register(name, description, handler) {
        this.commands.set(name.toLowerCase(), { description, handler });
    }

    /**
     * Execute current input
     */
    executeInput() {
        const input = this.input.value.trim();
        if (!input) return;
        
        // Add to history
        this.history.push(input);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = this.history.length;
        
        // Log input
        this.log(`> ${input}`);
        
        // Parse and execute
        const parts = input.split(/\s+/);
        const cmdName = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        const command = this.commands.get(cmdName);
        if (command) {
            try {
                command.handler(args);
            } catch (error) {
                this.log(`Error: ${error.message}`, 'error');
            }
        } else {
            this.log(`Unknown command: ${cmdName}`, 'error');
        }
        
        // Clear input
        this.input.value = '';
    }

    /**
     * Navigate command history
     * @param {number} direction - -1 for up, 1 for down
     */
    navigateHistory(direction) {
        this.historyIndex += direction;
        this.historyIndex = Math.max(-1, Math.min(this.history.length, this.historyIndex));
        
        if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
            this.input.value = this.history[this.historyIndex];
        } else {
            this.input.value = '';
        }
    }

    /**
     * Autocomplete command
     */
    autocomplete() {
        const input = this.input.value.toLowerCase();
        if (!input) return;
        
        const matches = Array.from(this.commands.keys()).filter(cmd => cmd.startsWith(input));
        
        if (matches.length === 1) {
            this.input.value = matches[0] + ' ';
        } else if (matches.length > 1) {
            this.log(`Matching commands: ${matches.join(', ')}`, 'info');
        }
    }

    /**
     * Log message to console
     * @param {string} message - Message to log
     * @param {string} type - Message type (error, warning, info, success)
     */
    log(message, type = '') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = message;
        this.output.appendChild(line);
        this.output.scrollTop = this.output.scrollHeight;
    }

    /**
     * Toggle console visibility
     */
    toggle() {
        this.isVisible = !this.isVisible;
        this.container.classList.toggle('hidden', !this.isVisible);
        
        if (this.isVisible) {
            this.input.focus();
            // Exit pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        } else {
            // Re-request pointer lock
            if (this.game.canvas && !this.game.isPaused) {
                this.game.canvas.requestPointerLock();
            }
        }
    }

    dispose() {
        this.container?.remove();
    }
}