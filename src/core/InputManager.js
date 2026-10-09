import {compileBindings,winners,bindingMatches,eventMask,parseBinding,modifierBit} from './input/Bindings.js';
import {Controller} from './input/Controller.js';
import {MouseResponse} from './input/Response.js';
import {ACTIONS,validBinding,normalizeSettings} from './settings/SettingsSchema.js';
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
        
        this.bindings = new Map();this.actionPressed=new Set();this.actionReleased=new Set();this.controller=new Controller();this.mouseResponse=new MouseResponse();this.lookDevice='mouse';this.lastDevice='mouse';this.modifierMask=0;this.latency=[];this._mouseOut={x:0,y:0};this._moveOut={x:0,z:0};this._padLook={x:0,y:0};this.listeners=[];
        
        // Track menu states for toggle functionality
        this.menuStates = new Map();
        this.menuActions = new Set(['inventory', 'map', 'pause', 'favorites']); // Actions that should toggle
        
        // Event listeners for menu state changes
        this.eventListeners = new Map();
        
        this.setupDefaultBindings();
        try{this.loadBindings(normalizeSettings(JSON.parse(globalThis.localStorage?.getItem('darkrain_settings')||'{}')).bindings);}catch{}
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
        this.bindings.set('throw_bolt',['KeyG']);this.bindings.set('toggle_detector',['KeyN']);
        this.bindings.set('map', ['KeyM']);
        this.bindings.set('favorites', ['KeyQ']);
        this.bindings.set('screenshot',['F12']);this.bindings.set('quicksave', ['F5']);
        this.bindings.set('quickload', ['F9']);
        
        // Weapons
        this.bindings.set('fire', ['Mouse0']);
        this.bindings.set('aim', ['Mouse2']);
        this.bindings.set('steadyAim', ['AltLeft']);
        this.bindings.set('leanLeft',['KeyZ']);this.bindings.set('leanRight',['KeyX']);this.bindings.set('nextWeapon',['WheelUp']);this.bindings.set('previousWeapon',['WheelDown']);
        
        // Quick slots
        this.bindings.set('slot1', ['Digit1']);
        this.bindings.set('slot2', ['Digit2']);
        this.bindings.set('slot3', ['Digit3']);

        
        for(let i=0;i<4;i++)this.bindings.set('quick'+(i+1),['Digit'+(i+5)]);
        // System
        this.bindings.set('pause', ['Escape']);this.compiled=compileBindings(this.bindings);
    }

    setupEventListeners(){
        const on=(target,name,handler)=>{target.addEventListener(name,handler);this.listeners.push([target,name,handler]);};
        for(const [name,method]of [['keydown','onKeyDown'],['keyup','onKeyUp'],['mousemove','onMouseMove'],['mousedown','onMouseDown'],['mouseup','onMouseUp'],['wheel','onWheel'],['pointerlockchange','onPointerLockChange']])on(document,name,event=>this[method](event));
        on(window,'blur',()=>{this.clearHeldInput();this._unfocused=true;if(this.game?.gameState==='playing'&&!this.game.isPaused&&!this.game.isLoading)this.game.pause();});on(window,'focus',()=>{this._unfocused=false;});on(document,'visibilitychange',()=>{if(document.hidden){this.clearHeldInput();this._unfocused=true;if(this.game?.gameState==='playing'&&!this.game.isPaused&&!this.game.isLoading)this.game.pause();}else this._unfocused=false;});
    }
    gameplay(){return !this.game||this.game.gameState==='playing'&&!this.game.isPaused&&!this.game.isLoading&&!this.game.uiManager?.isAnyMenuOpen?.();}
    dispatchBase(base,mask,resolvingModifier=false){
        this.compiled ||=compileBindings(this.bindings);this.deferredModifiers ||=new Map();const bit=modifierBit(base);
        if(bit&&!resolvingModifier){let usedInChord=false;for(const entries of this.compiled.byAction.values())if(entries.some(b=>b.mask&bit)){usedInChord=true;break;}if(usedInChord){this.deferredModifiers.set(base,{mask,used:false});return;}}

        this.actionPressed ||=new Set();this.compiled ||=compileBindings(this.bindings);
        for(const binding of winners(this.compiled,base,mask)){
            if(binding.mask)for(const [key,pending]of this.deferredModifiers)if(binding.mask&modifierBit(key))pending.used=true;
            this.actionPressed.add(binding.action);
            if(binding.action==='fire'&&this.gameplay()){this.pendingFire={at:performance.now(),source:this.lastDevice||'mouse'};}
            if(this.menuActions?.has(binding.action)&&binding.action!=='pause'&&this.gameplay())this.handleMenuToggle(binding.code);
            if(this.gameplay()&&['throw_bolt','toggle_detector'].includes(binding.action)){this.emit('input:'+binding.action);this.eventBus?.emit('input:'+binding.action);}
        }
    }
    onKeyDown(event){
        if(event.repeat&&!this.keys.get(event.code))return;
        if(!this.gameplay()&&event.code!=='Escape'&&!this.compiled?.byBase.get(event.code)?.some(b=>b.action==='pause'||b.action==='screenshot'))return;
        if((['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||event.target?.isContentEditable)&&event.code!=='Escape')return;
        this.modifierMask=eventMask(event);if(this.shouldPreventDefault(event.code))event.preventDefault();
        if(!this.keys.get(event.code)){this.keysJustPressed.add(event.code);this.keys.set(event.code,true);this.lastDevice='keyboard';this.dispatchBase(event.code,this.modifierMask);}this.keys.set(event.code,true);
    }

    /**
     * Check if we should prevent default browser behavior
     */
    shouldPreventDefault(code){return !!this.compiled?.byBase.has(code);}

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

    clearHeldInput() {
        this.actionPressed?.clear();this.actionReleased?.clear();this.deferredModifiers?.clear();this.controller?.neutralize();this.mouseResponse?.reset();this.modifierMask=0;this.pendingFire=null;this._sampled=false;
        this.keys.clear();
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.mouse.buttons.clear();
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.mouse.wheel = 0;
    }

    onKeyUp(event){
        const oldMask=this.modifierMask||0,pending=this.deferredModifiers?.get(event.code);if(pending&&!pending.used&&this.gameplay())this.dispatchBase(event.code,oldMask,true);this.deferredModifiers?.delete(event.code);this.actionReleased ||=new Set();this.compiled ||=compileBindings(this.bindings);for(const b of winners(this.compiled,event.code,oldMask))this.actionReleased.add(b.action);this.keys.set(event.code,false);this.keysJustReleased.add(event.code);this.modifierMask=eventMask(event);
    }
    onMouseMove(event){if(this.mouse.locked){this.mouse.deltaX+=event.movementX;this.mouse.deltaY+=event.movementY;if(event.movementX||event.movementY){this.lookDevice='mouse';this.lastDevice='mouse';}}this.mouse.x=event.clientX;this.mouse.y=event.clientY;}
    onMouseDown(event){const base='Mouse'+event.button;this.mouse.buttons.set(base,true);this.keysJustPressed.add(base);this.modifierMask=eventMask(event);this.lastDevice='mouse';if(this.gameplay()){event.preventDefault?.();this.dispatchBase(base,this.modifierMask);}}
    onMouseUp(event){const base='Mouse'+event.button;this.actionReleased ||=new Set();for(const b of winners(this.compiled||compileBindings(this.bindings),base,this.modifierMask||0))this.actionReleased.add(b.action);this.mouse.buttons.set(base,false);this.keysJustReleased.add(base);this.modifierMask=eventMask(event);}
    onWheel(event){this.mouse.wheel=Math.sign(event.deltaY);if(this.gameplay()){this.dispatchBase(event.deltaY<0?'WheelUp':'WheelDown',eventMask(event));event.preventDefault?.();}}

    onPointerLockChange() {
        const wasLocked = this.mouse.locked;
        this.mouse.locked = document.pointerLockElement === this.canvas;
        
        // If we just got pointer lock, reset mouse deltas
        if (this.mouse.locked && !wasLocked) {
            this.mouse.deltaX = 0;
            this.mouse.deltaY = 0;
        }
        if (!this.mouse.locked) this.clearHeldInput();
        // Notify UI so it can show/hide the click-to-resume hint
        if (this.eventBus) {
            this.eventBus.emit('input:pointerlock', { locked: this.mouse.locked });
        }
    }

    /**
     * Request pointer lock for FPS controls
     */
    requestPointerLock() {
        if(!this.canvas||this.mouse.locked)return;
        const raw=!!this.rawInput&&this.rawInputAvailable!==false;
        const fallback=()=>{this.rawInputAvailable=false;this.eventBus?.emit('input:raw-unavailable');try{this.canvas.requestPointerLock()?.catch?.(()=>{});}catch{}};
        try{const result=this.canvas.requestPointerLock(raw?{unadjustedMovement:true}:{});if(result?.then)result.then(()=>{if(raw)this.rawInputAvailable=true;}).catch(error=>{if(raw&&error.name==='NotSupportedError')fallback();});}
        catch(error){if(raw&&error.name==='NotSupportedError')fallback();}
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
    get controllerActive(){return this.options?.controllerEnabled!==false&&!!this.controller?.connected&&this.lookDevice==='gamepad';}
    isActionActive(action){
        if(this.controllerActive&&this.controller.down.has(action))return true;this.compiled ||=compileBindings(this.bindings);
        for(const b of this.compiled.byAction.get(action)||[]){const held=b.base.startsWith('Mouse')?this.mouse.buttons.get(b.base):this.keys.get(b.base);if(held&&bindingMatches(this.compiled,b,this.modifierMask||0))return true;}return false;
    }
    isActionJustPressed(action){if(action==='pause'&&this.keysJustPressed.has('Escape'))return true;return !!this.actionPressed?.has(action)||this.controllerActive&&this.controller.pressed.has(action);}
    isActionJustReleased(action){return !!this.actionReleased?.has(action)||this.controllerActive&&this.controller.released.has(action);}
    claimsCode(event){this.compiled ||=compileBindings(this.bindings);return winners(this.compiled,event.code,eventMask(event)).length>0;}
    getMouseDelta(){this._mouseOut ||= {x:0,y:0};const processed=this._sampled&&this.mouseResponse?this.mouseResponse.out:this.mouse;this._mouseOut.x=this._sampled?processed.x:this.mouse.deltaX;this._mouseOut.y=this._sampled?processed.y:this.mouse.deltaY;return this._mouseOut;}
    getControllerLook(dt){this._padLook ||= {x:0,y:0};return this.controller.lookDelta(dt,this.options||{},this.isActionActive('aim'),this._padLook);}
    getMovementInput(){this._moveOut ||= {x:0,z:0};let x=(this.isActionActive('moveRight')?1:0)-(this.isActionActive('moveLeft')?1:0),z=(this.isActionActive('moveBackward')?1:0)-(this.isActionActive('moveForward')?1:0);if(this.controllerActive){x+=this.controller.move.x;z+=this.controller.move.y;}const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}this._moveOut.x=x;this._moveOut.z=z;return this._moveOut;}
    sampleFrame(dt,now=performance.now(),pads){
        this.controller ||=new Controller();this.mouseResponse ||=new MouseResponse();const gameplay=this.gameplay()&&!this._unfocused&&!globalThis.document?.hidden,wasActive=this.controllerActive;
        if(pads===undefined){try{pads=globalThis.navigator?.getGamepads?.()||[];}catch{pads=[];}}
        const result=this.controller.poll(this._unfocused||globalThis.document?.hidden?[]:pads,this.options||{},gameplay);
        if(result.disconnected&&wasActive&&this.game?.gameState==='playing'&&!this.game.isPaused)this.game.pause();
        if(result.activity){this.lookDevice='gamepad';this.lastDevice='gamepad';}
        if(gameplay&&this.controllerActive){if(this.game?.player?.stats.stamina<=.5)this.controller.sprint=false;for(const action of this.controller.pressed){if(action==='fire')this.pendingFire={at:now,source:'gamepad'};if(['throw_bolt','toggle_detector'].includes(action)){this.emit('input:'+action);this.eventBus?.emit('input:'+action);}if(this.menuActions?.has(action)&&action!=='pause')this.handleMenuToggle((this.bindings.get(action)||[])[0]);}}
        if(!gameplay&&this.controller.connected&&!this._unfocused&&!globalThis.document?.hidden)this.navigateMenu(now);
        if(this.mouse.locked&&gameplay&&!this.controllerActive)this.mouseResponse.process(this.mouse.deltaX,this.mouse.deltaY,dt,this.options?.mouseCurve,this.options?.mouseSmoothing,this.options?.mouseSmoothingMs||8);else this.mouseResponse.reset();this._sampled=true;
        const status=globalThis.document?.getElementById?.('controller-status'),text=this.controller.connected?`${this.controller.layout==='playstation'?'PlayStation':'Xbox'} layout connected. ${this.controllerActive?'Controller look active.':'Move a stick to use controller look.'}`:'No standard controller detected. Connect and press a button.';if(status&&status.textContent!==text)status.textContent=text;
    }
    navigateMenu(now){
        const pad=this.controller,ui=this.game?.uiManager;if(!ui)return;
        let direction=pad.held[12]?1:pad.held[13]?2:pad.held[14]?3:pad.held[15]?4:Math.abs(pad.move.y)>.55?pad.move.y<0?1:2:Math.abs(pad.move.x)>.55?pad.move.x<0?3:4:0;
        if(direction!==this._menuDirection){this._menuDirection=direction;this._nextMenuRepeat=now;this._menuRepeating=false;}
        let root=ui.elements?.confirmDialog?.getClientRects().length?ui.elements.confirmDialog:this.game?.dialogueUI?.isVisible?this.game.dialogueUI.container:ui.activeMenu?document.getElementById(ui.activeMenu+'-menu'):null;if(!root||!root.getClientRects().length){const roots=[...document.querySelectorAll('.menu')].filter(el=>el.getClientRects().length);root=roots.at(-1);}if(!root)return;
        if(!(direction&&now>=(this._nextMenuRepeat||0))&&!pad.menuAccept&&!pad.menuBack)return;
        let focused=document.activeElement;if(!root.contains(focused)){const preferred={ 'main-menu':'new-game-btn','pause-menu':'resume-btn','creator-menu':'creator-begin' }[root.id];focused=(preferred?document.getElementById(preferred):null)||root.querySelector('button:not([disabled])')||root.querySelector('input:not([disabled]),select:not([disabled])');focused?.focus();}
        if(direction&&now>=(this._nextMenuRepeat||0)){this._nextMenuRepeat=now+(this._menuRepeating?150:350);this._menuRepeating=true;
            if((direction===3||direction===4)&&root.contains(focused)&&['range','select-one'].includes(focused.type)){if(focused.type==='range'){const value=Number(focused.value)+(direction===4?1:-1)*Number(focused.step||1);focused.value=Math.min(Number(focused.max),Math.max(Number(focused.min),value));focused.dispatchEvent(new Event('input',{bubbles:true}));}else focused.selectedIndex=Math.min(focused.options.length-1,Math.max(0,focused.selectedIndex+(direction===4?1:-1)));focused.dispatchEvent(new Event('change',{bubbles:true}));}
            else{const list=[...root.querySelectorAll('button,input,select,summary,[tabindex]')].filter(el=>!el.disabled&&el.getClientRects().length),index=list.indexOf(focused),next=index<0?(direction===1?list.length-1:0):(index+(direction===1||direction===3?-1:1)+list.length)%list.length;list[next]?.focus();list[next]?.scrollIntoView({block:'nearest'});}
        }
        if(pad.menuAccept){if(root.contains(focused)&&focused.type==='checkbox'){focused.checked=!focused.checked;focused.dispatchEvent(new Event('change',{bubbles:true}));}else if(root.contains(focused)){focused.click();if(focused.classList.contains('inventory-slot'))document.querySelector('#gear-description button')?.focus();}else root.querySelector('button:not([disabled])')?.focus();}
        if(pad.menuBack){if(root===ui.elements?.confirmDialog)ui.hideConfirm();else if(ui.activeMenu==='settings')ui.closeSettings();else if(ui.activeMenu==='controls')ui.closeControls();else if(ui.activeMenu==='saves')ui.saveMenu.close();else if(ui.activeMenu==='pause')this.game.resume();else if(ui.activeMenu==='creator')ui.characterCreator?.cancel();else if(ui.activeMenu)ui.closeMenu(ui.activeMenu);else if(document.getElementById('creator-menu')?.getClientRects().length)document.getElementById('creator-back')?.click();}
    }
    actionLabel(action){
        if(this.controllerActive){if(['sprint','steadyAim'].includes(action))return this.controller.layout==='playstation'?'L3':'LS';const map={jump:0,crouch:1,reload:2,nextWeapon:3,leanLeft:4,leanRight:5,aim:6,fire:7,map:8,pause:9,interact:11,flashlight:12,inventory:13,throw_bolt:14,toggle_detector:15},labels=this.controller.layout==='playstation'?['Cross','Circle','Square','Triangle','L1','R1','L2','R2','Create','Options','L3','R3','D-pad Up','D-pad Down','D-pad Left','D-pad Right']:['A','B','X','Y','LB','RB','LT','RT','View','Menu','LS','RS','D-pad Up','D-pad Down','D-pad Left','D-pad Right'];if(Object.hasOwn(map,action))return labels[map[action]];if(action==='quicksave')return 'Pause → Save Game';if(action==='quickload')return 'Pause → Load Game';}
        const code=this.bindings.get(action)?.[0]||'Unbound';return this.game?.uiManager?.formatKeyCode(code)||code.replace('Key','');
    }
    recordShot(){if(!this.pendingFire)return;this.latency.push({source:this.pendingFire.source,eventToShotMs:Math.max(0,performance.now()-this.pendingFire.at),eventToSubmissionMs:null,at:this.pendingFire.at});if(this.latency.length>32)this.latency.shift();this.pendingFire=null;}
    recordSubmission(now=performance.now()){for(const entry of this.latency||[])if(entry.eventToSubmissionMs===null)entry.eventToSubmissionMs=Math.max(0,now-entry.at);}
    diagnosticSnapshot(){return {source:this.lastDevice||'mouse',controllerConnected:!!this.controller?.connected,controllerLayout:this.controller?.layout||null,rawRequested:!!this.rawInput,rawAvailable:this.rawInputAvailable??null,mouseSmoothing:!!this.options?.mouseSmoothing,latencyMetric:'DOM event receipt / controller poll to shot logic and render submission; not photon latency',samples:(this.latency||[]).slice()};}
    dispose(){for(const [target,name,handler]of this.listeners||[])target.removeEventListener(name,handler);this.clearHeldInput();}

    /**
     * Rebind an action to new keys
     * @param {string} action - Action name
     * @param {string[]} keys - Array of key codes
     */
    rebind(action, keys) {
        if(!Object.hasOwn(ACTIONS,action))return;const next=keys.filter(validBinding).map(code=>parseBinding(code).code).slice(0,2),old=this.bindings.get(action)||[];if(next.length===old.length&&next.every((v,i)=>v===old[i]))return;this.bindings.set(action,next);this.compiled=compileBindings(this.bindings);
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
        this.actionPressed?.clear();this.actionReleased?.clear();this.controller?.finish();this.pendingFire=null;this._sampled=false;
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
    loadBindings(bindings) {for(const [action,keys]of Object.entries(bindings||{}))if(Object.hasOwn(ACTIONS,action)&&Array.isArray(keys))this.rebind(action,keys);}

}
