import { globalEventBus } from '../core/EventBus.js';

/**
 * DialogueUI - Handles dialogue display
 */
export class DialogueUI {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.isVisible = false;
        
        this.createUI();
        this.setupEventListeners();
    }

    createUI() {
        // Create dialogue container
        this.container = document.createElement('div');
        this.container.id = 'dialogue-container';
        this.container.className = 'hidden';
        this.container.innerHTML = `
            <div class="dialogue-panel">
                <div class="dialogue-header">
                    <span class="speaker-name" id="dialogue-speaker"></span>
                </div>
                <div class="dialogue-content">
                    <p class="dialogue-text" id="dialogue-text"></p>
                </div>
                <div class="dialogue-options" id="dialogue-options"></div>
                <div class="dialogue-footer">
                    <span class="dialogue-hint">Click option or press number key to select</span>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #dialogue-container {
                position: absolute;
                bottom: 20%;
                left: 50%;
                transform: translateX(-50%);
                width: 70%;
                max-width: 800px;
                z-index: 100;
                pointer-events: auto;
            }
            
            #dialogue-container.hidden {
                display: none;
            }
            
            .dialogue-panel {
                background: rgba(10, 10, 10, 0.95);
                border: 2px solid #c4a000;
                border-radius: 5px;
                padding: 20px;
                font-family: 'Courier New', monospace;
                color: #e0e0e0;
            }
            
            .dialogue-header {
                border-bottom: 1px solid rgba(196, 160, 0, 0.3);
                padding-bottom: 10px;
                margin-bottom: 15px;
            }
            
            .speaker-name {
                font-size: 18px;
                color: #c4a000;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 2px;
            }
            
            .dialogue-text {
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 20px;
                min-height: 60px;
            }
            
            .dialogue-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .dialogue-option {
                padding: 12px 15px;
                background: rgba(196, 160, 0, 0.1);
                border: 1px solid rgba(196, 160, 0, 0.3);
                border-radius: 3px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
            }
            
            .dialogue-option:hover {
                background: rgba(196, 160, 0, 0.25);
                border-color: #c4a000;
            }
            
            .dialogue-option .option-number {
                display: inline-block;
                width: 25px;
                height: 25px;
                line-height: 25px;
                text-align: center;
                background: rgba(196, 160, 0, 0.3);
                border-radius: 3px;
                margin-right: 12px;
                font-weight: bold;
                color: #c4a000;
            }
            
            .dialogue-option .option-text {
                flex: 1;
            }
            
            .dialogue-option.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .dialogue-option.condition-failed {
                color: #666;
            }
            
            .dialogue-option.condition-failed::after {
                content: ' [Requirements not met]';
                color: #ff4444;
                font-size: 12px;
            }
            
            .dialogue-footer {
                margin-top: 15px;
                padding-top: 10px;
                border-top: 1px solid rgba(196, 160, 0, 0.2);
            }
            
            .dialogue-hint {
                font-size: 12px;
                color: #666;
            }
            
            .dialogue-continue {
                text-align: center;
                padding: 15px;
                color: #c4a000;
                cursor: pointer;
                animation: pulse 1.5s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        document.getElementById('hud')?.appendChild(this.container);
    }

    setupEventListeners() {
        globalEventBus.on('dialogue:started', () => {
            this.show();
        });
        
        globalEventBus.on('dialogue:node', (data) => {
            this.displayNode(data.node, data.options, data.isEnd);
        });
        
        globalEventBus.on('dialogue:ended', () => {
            this.hide();
        });
        
        // Keyboard shortcuts for options
        document.addEventListener('keydown', (e) => {
            if (!this.isVisible) return;
            
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                this.selectOption(num - 1);
            }
            
            // Space/Enter to continue
            if (e.code === 'Space' || e.code === 'Enter') {
                const continueBtn = this.container.querySelector('.dialogue-continue');
                if (continueBtn) {
                    continueBtn.click();
                }
            }
        });
    }

    /**
     * Display a dialogue node
     * @param {Object} node - Dialogue node
     * @param {Array} options - Available options
     * @param {boolean} isEnd - Whether this is an end node
     */
    displayNode(node, options, isEnd) {
        const speakerEl = document.getElementById('dialogue-speaker');
        const textEl = document.getElementById('dialogue-text');
        const optionsEl = document.getElementById('dialogue-options');
        
        // Set speaker name
        if (speakerEl) {
            speakerEl.textContent = node.speaker || this.game.dialogueSystem?.currentSpeaker?.name || 'Unknown';
        }
        
        // Set text with typewriter effect
        if (textEl) {
            this.typewriterEffect(textEl, node.text);
        }
        
        // Set options
        if (optionsEl) {
            optionsEl.innerHTML = '';
            
            if (isEnd) {
                // End node - show continue button
                const continueDiv = document.createElement('div');
                continueDiv.className = 'dialogue-continue';
                continueDiv.textContent = 'Click to continue...';
                continueDiv.addEventListener('click', () => {
                    globalEventBus.emit('dialogue:end');
                });
                optionsEl.appendChild(continueDiv);
            } else if (options.length === 0 && node.next) {
                // Auto-continue node
                const continueDiv = document.createElement('div');
                continueDiv.className = 'dialogue-continue';
                continueDiv.textContent = 'Continue...';
                continueDiv.addEventListener('click', () => {
                    globalEventBus.emit('dialogue:select', { optionIndex: -1 });
                });
                optionsEl.appendChild(continueDiv);
            } else {
                // Display options
                options.forEach((option, index) => {
                    const optionEl = document.createElement('div');
                    optionEl.className = 'dialogue-option';
                    optionEl.innerHTML = `
                        <span class="option-number">${index + 1}</span>
                        <span class="option-text">${option.text}</span>
                    `;
                    
                    optionEl.addEventListener('click', () => {
                        this.selectOption(index);
                    });
                    
                    optionsEl.appendChild(optionEl);
                });
            }
        }
    }

    /**
     * Typewriter text effect
     * @param {HTMLElement} element - Target element
     * @param {string} text - Text to display
     */
    typewriterEffect(element, text) {
        element.textContent = '';
        let index = 0;
        const speed = 20;
        
        const type = () => {
            if (index < text.length) {
                element.textContent += text.charAt(index);
                index++;
                setTimeout(type, speed);
            }
        };
        
        type();
        
        // Allow skipping
        element.addEventListener('click', () => {
            element.textContent = text;
            index = text.length;
        }, { once: true });
    }

    /**
     * Select a dialogue option
     * @param {number} index - Option index
     */
    selectOption(index) {
        globalEventBus.emit('dialogue:select', { optionIndex: index });
    }

    /**
     * Show dialogue UI
     */
    show() {
        this.isVisible = true;
        this.container?.classList.remove('hidden');
    }

    /**
     * Hide dialogue UI
     */
    hide() {
        this.isVisible = false;
        this.container?.classList.add('hidden');
    }
}