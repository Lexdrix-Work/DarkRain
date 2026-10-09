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
                e.preventDefault();
                this.selectOption(num - 1);
                this.game.inputManager?.keysJustPressed.delete(e.code);
            }
            
            // Space/Enter to continue
            if (e.code === 'Space' || e.code === 'Enter') {
                const continueBtn = this.container.querySelector('.dialogue-continue');
                if (continueBtn) {
                    e.preventDefault();
                    continueBtn.click();
                    this.game.inputManager?.keysJustPressed.delete(e.code);
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
                    if (option.locked) {
                        optionEl.classList.add('dialogue-option-locked');
                        optionEl.setAttribute('aria-disabled', 'true');
                        optionEl.style.opacity = '0.45';
                    }
                    optionEl.innerHTML = `
                        <span class="option-number">${index + 1}</span>
                        <span class="option-text">${option.text}</span>
                    `;
                    
                    optionEl.addEventListener('click', () => {
                        if (!option.locked) this.selectOption(index);
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
    typewriterEffect(element,text){
        clearTimeout(this.typeTimer);element.textContent='';let index=0;
        const finish=()=>{clearTimeout(this.typeTimer);element.textContent=text;index=text.length;};
        element.onclick=finish;
        const type=()=>{if(index<text.length){element.textContent+=text.charAt(index++);this.typeTimer=setTimeout(type,20);}};type();
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
        clearTimeout(this.typeTimer);
        this.isVisible = false;
        this.container?.classList.add('hidden');
    }
}
