import * as THREE from 'three';
import { Items } from '../data/items.js';
import { WeatherType } from '../systems/WeatherSystem.js';

/**
 * DevMenu - Visual developer menu for tweaking game values at runtime.
 * Toggle with F1. Sections: Time, Weather, Spawn (enemy/item), Player, World.
 */
export class DevMenu {
    constructor(game) {
        this.game = game;
        this.isVisible = false;
        this.container = null;
        this._els = {};
        this._prevTimeScale = 60;
        this.init();
    }

    init() {
        this.createUI();
        this.setupEventListeners();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'dev-menu';
        this.container.className = 'hidden';

        const enemyTypes = [
            ['mutant', 'Mutant'],
            ['human', 'Human'],
            ['packhound', 'Pack Hound'],
            ['lurker', 'Lurker'],
        ];
        const weatherTypes = [
            ['clear', 'Clear'],
            ['cloudy', 'Cloudy'],
            ['overcast', 'Overcast'],
            ['rain', 'Rain'],
            ['heavy_rain', 'Heavy Rain'],
            ['thunderstorm', 'Storm'],
            ['fog', 'Fog'],
            ['emission', 'Emission'],
        ];
        const itemOptions = Object.values(Items)
            .map(it => `<option value="${it.id}">${it.name} (${it.id})</option>`)
            .join('');

        this.container.innerHTML = `
            <div class="dev-menu-header">
                <span>DEV MENU</span>
                <span class="dev-menu-hint">F1 to close</span>
            </div>
            <div class="dev-menu-body">
                <div class="dev-section">
                    <div class="dev-section-title">Time of Day</div>
                    <div class="dev-row">
                        <span class="dev-label" id="dev-time-label">--:--</span>
                        <input type="range" id="dev-time-slider" min="0" max="24" step="0.25" value="12">
                    </div>
                    <div class="dev-btn-grid">
                        <button data-time="6">Dawn</button>
                        <button data-time="12">Noon</button>
                        <button data-time="18.5">Dusk</button>
                        <button data-time="0">Midnight</button>
                    </div>
                    <div class="dev-row">
                        <span class="dev-label">Time scale</span>
                        <input type="range" id="dev-timescale-slider" min="0" max="300" step="1" value="60">
                        <span class="dev-value" id="dev-timescale-label">60x</span>
                    </div>
                </div>
                <div class="dev-section">
                    <div class="dev-section-title">Weather</div>
                    <div class="dev-btn-grid" id="dev-weather-grid">
                        ${weatherTypes.map(([v, l]) => `<button data-weather="${v}">${l}</button>`).join('')}
                    </div>
                    <div class="dev-row">
                        <button id="dev-weather-lock" style="flex:1">Lock Weather: OFF</button>
                    </div>
                </div>
                <div class="dev-section">
                    <div class="dev-section-title">Spawn Enemy</div>
                    <div class="dev-btn-grid" id="dev-spawn-grid">
                        ${enemyTypes.map(([v, l]) => `<button data-enemy="${v}">${l}</button>`).join('')}
                    </div>
                    <div class="dev-row">
                        <span class="dev-label">Distance</span>
                        <input type="range" id="dev-spawn-dist" min="3" max="30" step="1" value="8">
                        <span class="dev-value" id="dev-spawn-dist-label">8m</span>
                    </div>
                </div>
                <div class="dev-section">
                    <div class="dev-section-title">Spawn Item</div>
                    <div class="dev-row">
                        <select id="dev-item-select">${itemOptions}</select>
                        <input type="number" id="dev-item-amount" min="1" max="99" value="1">
                        <button id="dev-item-give">Give</button>
                    </div>
                </div>
                <div class="dev-section">
                    <div class="dev-section-title">Player</div>
                    <div class="dev-btn-grid">
                        <button id="dev-god">God: OFF</button>
                        <button id="dev-noclip">Noclip: OFF</button>
                        <button id="dev-heal">Heal</button>
                    </div>
                    <div class="dev-row">
                        <span class="dev-label">Move speed</span>
                        <input type="range" id="dev-speed-slider" min="1" max="20" step="0.5" value="5">
                        <span class="dev-value" id="dev-speed-label">5</span>
                    </div>
                    <div class="dev-row">
                        <span class="dev-label" id="dev-pos-label">Pos: --</span>
                    </div>
                </div>
                <div class="dev-section">
                    <div class="dev-section-title">World</div>
                    <div class="dev-btn-grid">
                        <button id="dev-killall">Kill All Enemies</button>
                    </div>
                    <div class="dev-row">
                        <span class="dev-label" id="dev-enemy-count">Enemies: --</span>
                    </div>
                </div>
                <div class="dev-section">
                    <div class="dev-section-title">Destruction building</div>
                    <div class="dev-btn-grid">
                        <button data-fixture="visit">Visit / create</button>
                        <button data-fixture="reset">Reset building</button>
                        <button data-fixture="weak">Charge weak column</button>
                        <button data-fixture="collapse">Charge all supports</button>
                    </div>
                    <div id="dev-fixture-stats">Create the test building to inspect its joints.</div>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #dev-menu {
                position: absolute;
                top: 60px;
                right: 16px;
                width: 300px;
                max-height: calc(100vh - 120px);
                display: flex;
                flex-direction: column;
                background: rgba(10, 10, 12, 0.94);
                border: 1px solid var(--accent-border, rgba(176,141,79,0.45));
                border-radius: 8px;
                color: #d8d4c8;
                font-family: inherit;
                font-size: 13px;
                z-index: 9000;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            }
            #dev-menu.hidden { display: none; }
            .dev-menu-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                border-bottom: 1px solid var(--accent-border, rgba(176,141,79,0.45));
                color: var(--accent, #b08d4f);
                font-weight: bold;
                letter-spacing: 2px;
            }
            .dev-menu-hint { font-size: 11px; font-weight: normal; opacity: 0.6; letter-spacing: 0; }
            .dev-menu-body { overflow-y: auto; padding: 8px 12px 12px; }
            .dev-section { margin-bottom: 14px; }
            .dev-section-title {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                color: var(--accent, #b08d4f);
                margin-bottom: 8px;
                border-bottom: 1px solid rgba(176,141,79,0.2);
                padding-bottom: 4px;
            }
            .dev-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
            .dev-label { min-width: 70px; opacity: 0.8; }
            .dev-value { min-width: 44px; text-align: right; color: var(--accent, #b08d4f); }
            #dev-menu input[type="range"] { flex: 1; accent-color: var(--accent, #b08d4f); }
            #dev-menu input[type="number"] {
                width: 52px; background: rgba(255,255,255,0.06);
                border: 1px solid rgba(176,141,79,0.3); color: inherit;
                border-radius: 4px; padding: 4px;
            }
            #dev-menu select {
                flex: 1; background: rgba(255,255,255,0.06);
                border: 1px solid rgba(176,141,79,0.3); color: inherit;
                border-radius: 4px; padding: 5px; max-width: 170px;
            }
            #dev-menu select option { background: #141416; }
            .dev-btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            #dev-menu button {
                background: rgba(176,141,79,0.12);
                border: 1px solid rgba(176,141,79,0.4);
                color: #e8e2d2;
                border-radius: 4px;
                padding: 7px 6px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.15s;
            }
            #dev-menu button:hover { background: rgba(176,141,79,0.28); }
            #dev-menu button.active {
                background: rgba(176,141,79,0.45);
                border-color: var(--accent, #b08d4f);
                color: #fff;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.container);

        const $ = (id) => this.container.querySelector('#' + id);
        ['dev-time-slider', 'dev-time-label', 'dev-timescale-slider', 'dev-timescale-label',
         'dev-spawn-dist', 'dev-spawn-dist-label', 'dev-item-select', 'dev-item-amount',
         'dev-item-give', 'dev-god', 'dev-noclip', 'dev-heal', 'dev-speed-slider',
         'dev-speed-label', 'dev-pos-label', 'dev-enemy-count', 'dev-killall', 'dev-weather-lock',
        ].forEach(id => { this._els[id.replace('dev-', '').replace(/-/g, '_')] = $(id); });

        this.wireEvents();
    }

    wireEvents() {
        const el = this._els;
        const game = () => this.game;
        this.container.querySelectorAll('[data-fixture]').forEach(button=>button.addEventListener('click',()=>{
            const physics=this.game.physicsSystem;if(!physics||this.game.gameState!=='playing')return;
            const action=button.dataset.fixture;
            if(action==='visit'||action==='reset') {
                const fixture=action==='reset'||!physics.fixture?physics.spawnFixture(physics.fixture?.origin):physics.fixture;
                const player=this.game.player;player.position.copy(fixture.origin).add(new THREE.Vector3(-3.6,.15,12));player.velocity.set(0,0,0);
                const direction=fixture.origin.clone().add(new THREE.Vector3(-3.6,1.5,4.5)).sub(player.position.clone().add(new THREE.Vector3(0,1.65,0))).normalize();
                player.cameraYaw=Math.atan2(-direction.x,-direction.z);player.cameraPitch=Math.asin(direction.y);player.updateCamera(0);
            }else if(physics.fixture){if(action==='weak')physics.fixture.demolishColumn(0);else physics.fixture.demolishAllSupports();}
            this.syncFromGame();
        }));

        // Time slider (live)
        el.time_slider.addEventListener('input', () => {
            const v = parseFloat(el.time_slider.value);
            const h = Math.floor(v), m = Math.floor((v - h) * 60);
            game().dayNightCycle?.setTime(h, m);
            this.refreshTimeLabel();
        });

        // Time presets
        this.container.querySelectorAll('[data-time]').forEach(btn => {
            btn.addEventListener('click', () => {
                const v = parseFloat(btn.dataset.time);
                game().dayNightCycle?.setTime(Math.floor(v), Math.floor((v % 1) * 60));
                this.syncFromGame();
            });
        });

        // Time scale
        el.timescale_slider.addEventListener('input', () => {
            const v = parseFloat(el.timescale_slider.value);
            if (game().dayNightCycle) game().dayNightCycle.timeScale = v;
            el.timescale_label.textContent = v === 0 ? 'paused' : `${v}x`;
        });

        // Weather
        this.container.querySelectorAll('[data-weather]').forEach(btn => {
            btn.addEventListener('click', () => {
                game().weatherSystem?.setWeather(btn.dataset.weather, 30);
                this.syncFromGame();
            });
        });

        // Weather lock
        el.weather_lock.addEventListener('click', () => {
            const ws = game().weatherSystem;
            if (!ws) return;
            ws.weatherLocked = !ws.weatherLocked;
            this.syncFromGame();
        });

        // Spawn distance
        el.spawn_dist.addEventListener('input', () => {
            el.spawn_dist_label.textContent = `${el.spawn_dist.value}m`;
        });

        // Spawn enemy
        this.container.querySelectorAll('[data-enemy]').forEach(btn => {
            btn.addEventListener('click', () => this.spawnEnemy(btn.dataset.enemy));
        });

        // Give item
        el.item_give.addEventListener('click', () => {
            const id = el.item_select.value;
            const amount = Math.max(1, parseInt(el.item_amount.value) || 1);
            if (game().inventorySystem?.addItem(id, amount)) {
                this.flash(el.item_give);
            }
        });

        // God / noclip / heal
        el.god.addEventListener('click', () => {
            const p = game().player;
            if (!p) return;
            p.godMode = !p.godMode;
            this.syncFromGame();
        });
        el.noclip.addEventListener('click', () => {
            const p = game().player;
            if (!p) return;
            p.noclip = !p.noclip;
            p.collisionEnabled = !p.noclip;
            this.syncFromGame();
        });
        el.heal.addEventListener('click', () => {
            game().player?.heal(game().player.stats.maxHealth);
            this.flash(el.heal);
        });

        // Speed
        el.speed_slider.addEventListener('input', () => {
            const v = parseFloat(el.speed_slider.value);
            if (game().player) game().player.moveSpeed = v;
            el.speed_label.textContent = `${v}`;
        });

        // Kill all
        el.killall.addEventListener('click', () => {
            let count = 0;
            const enemies = game().worldManager?.enemies;
            if (enemies) {
                for (const enemy of enemies.values()) {
                    enemy.takeDamage(9999, null);
                    count++;
                }
            }
            this.syncFromGame();
            this.flash(el.killall);
        });
    }

    spawnEnemy(type) {
        const g = this.game;
        const player = g.player;
        if (!player || !g.worldManager) return;
        const dist = parseFloat(this._els.spawn_dist.value) || 8;
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(player.rotation);
        const pos = player.position.clone().addScaledVector(forward, dist);
        pos.y = Math.max(0, player.position.y);
        g.worldManager.spawnEnemy({ type, position: pos.toArray() });
        this.syncFromGame();
    }

    flash(btn) {
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 300);
    }

    refreshTimeLabel() {
        const t = this.game.dayNightCycle?.getTime();
        if (t) {
            this._els.time_label.textContent = t.formatted;
            const v = t.hours + t.minutes / 60;
            if (document.activeElement !== this._els.time_slider) {
                this._els.time_slider.value = v;
            }
        }
    }

    syncFromGame() {
        const g = this.game;
        if (!g) return;
        this.refreshTimeLabel();
        const ts = g.dayNightCycle?.timeScale ?? 60;
        this._els.timescale_slider.value = ts;
        this._els.timescale_label.textContent = ts === 0 ? 'paused' : `${ts}x`;
        const p = g.player;
        this._els.god.textContent = `God: ${p?.godMode ? 'ON' : 'OFF'}`;
        this._els.god.classList.toggle('active', !!p?.godMode);
        this._els.noclip.textContent = `Noclip: ${p?.noclip ? 'ON' : 'OFF'}`;
        this._els.noclip.classList.toggle('active', !!p?.noclip);
        if (p) {
            this._els.speed_slider.value = p.moveSpeed;
            this._els.speed_label.textContent = `${p.moveSpeed}`;
            this._els.pos_label.textContent =
                `Pos: ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}`;
        }
        const n = g.worldManager?.enemies?.size ?? 0;
        this._els.enemy_count.textContent = `Enemies: ${n}`;
        const fixture=this.game.physicsSystem?.fixture;
        if(fixture){const s=fixture.stats();this.container.querySelector('#dev-fixture-stats').textContent=`Pieces ${s.pieces} · moving ${s.awake} · joints ${s.joints} · failed ${s.failed}`;}
        // Highlight active weather
        const cur = g.weatherSystem?.currentWeather;
        this.container.querySelectorAll('[data-weather]').forEach(b =>
            b.classList.toggle('active', b.dataset.weather === cur));
        const locked = !!g.weatherSystem?.weatherLocked;
        this._els.weather_lock.textContent = `Lock Weather: ${locked ? 'ON' : 'OFF'}`;
        this._els.weather_lock.classList.toggle('active', locked);
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'F1' && !this.game.inputManager?.claimsCode(e)) {
                e.preventDefault();
                this.toggle();
            }
        });
        // Live refresh while open (time label, enemy count, position)
        setInterval(() => { if (this.isVisible) this.syncFromGame(); }, 500);
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.container.classList.toggle('hidden', !this.isVisible);
        const ui = this.game.uiManager;
        if (this.isVisible) {
            this.syncFromGame();
            if (ui) ui.activeMenu = 'devmenu';
            if (document.pointerLockElement) document.exitPointerLock();
        } else {
            if (ui && ui.activeMenu === 'devmenu') ui.activeMenu = null;
            if (this.game.canvas && !this.game.isPaused && this.game.gameState === 'playing') {
                this.game.canvas.requestPointerLock();
            }
        }
    }

    dispose() {
        this.container?.remove();
    }
}
