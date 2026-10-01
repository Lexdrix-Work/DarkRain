import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * CompassSystem - Elder Scrolls-style compass.
 *
 * A scrolling strip at the top of the screen: cardinal/intercardinal ticks
 * drift with the player's view, with markers for quest targets, discovered
 * anomaly fields and nearby stashes. Also owns the sneak indicator (the
 * eye): hidden while undetected, amber when something is suspicious, red
 * when the player is blown.
 */

const PX_PER_DEG = 3;
const STRIP_W = 420;

export class CompassSystem {
    constructor(game) {
        this.game = game;
        this.markers = new Map();   // id -> { x, z, icon, label, color, type, revealDist }
        this.discovered = new Set();
        this.questTarget = null;    // { x, z, label }
        this._buildDom();

        globalEventBus.on('quest:target', (data) => this.setQuestTarget(data));
        globalEventBus.on(GameEvents?.QUEST_COMPLETED || 'quest:completed', () => this.clearQuestTarget());
    }

    _buildDom() {
        const el = document.getElementById('compass');
        if (!el) return;
        el.innerHTML = '';
        el.classList.add('compass-strip');
        this.strip = el;
        this.ticks = document.createElement('div');
        this.ticks.className = 'compass-ticks';
        el.appendChild(this.ticks);
        const caret = document.createElement('div');
        caret.className = 'compass-caret';
        caret.textContent = '▼';
        el.appendChild(caret);

        // Sneak indicator lives just under the compass
        this.sneakEl = document.createElement('div');
        this.sneakEl.id = 'sneak-indicator';
        this.sneakEl.className = 'hidden';
        document.getElementById('hud')?.appendChild(this.sneakEl);
    }

    /* ------------------------------ markers ------------------------------ */

    addMarker(id, { x, z, icon = '◆', label = '', color = '#e8e4da', revealDist = 60 }) {
        this.markers.set(id, { x, z, icon, label, color, revealDist });
    }

    removeMarker(id) {
        this.markers.delete(id);
    }

    setQuestTarget({ x, z, label = 'Objective' }) {
        this.questTarget = x !== undefined ? { x, z, label } : null;
    }

    clearQuestTarget() {
        this.questTarget = null;
    }

    /** Register level points of interest after world gen */
    populateLevel(levelData) {
        this.markers.clear();
        this.discovered.clear();
        for (const field of (levelData.anomalyFields || [])) {
            const c = field.center || [field.x || 0, 0, field.z || 0];
            const id = `anomaly_${c[0]}_${c[2]}`;
            this.addMarker(id, {
                x: c[0], z: c[2],
                icon: '⚠', label: `${this._title(field.type)} Anomaly`,
                color: '#ff9a3c', revealDist: 90,
            });
        }
    }

    _title(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
    }

    /* ------------------------------ update ------------------------------ */

    update(_deltaTime) {
        if (!this.strip || !this.game.player) return;
        const player = this.game.player;
        const yaw = player.cameraYaw || 0;
        const px = player.position.x, pz = player.position.z;

        // Discovery: anomaly fields reveal when close
        for (const [id, m] of this.markers) {
            if (!this.discovered.has(id)) {
                const d = Math.hypot(m.x - px, m.z - pz);
                if (d < 45) {
                    this.discovered.add(id);
                    globalEventBus.emit(GameEvents.NOTIFICATION, {
                        message: `Discovered: ${m.label}`, type: 'info',
                    });
                }
            }
        }

        // Build ticks: cardinals every 15 degrees
        let html = '';
        const cx = STRIP_W / 2;
        for (let deg = 0; deg < 360; deg += 15) {
            const rel = this._wrapDeg(deg - this._yawToDeg(yaw));
            const x = cx - rel * PX_PER_DEG;
            if (x < -20 || x > STRIP_W + 20) continue;
            const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
            const label = names[deg];
            if (label) {
                const major = deg % 90 === 0;
                html += `<span class="ctick ${major ? 'major' : ''}" style="left:${x}px">${label}</span>`;
            } else {
                html += `<span class="ctick minor" style="left:${x}px">|</span>`;
            }
        }

        // Markers
        const drawMarker = (m, icon, color, label) => {
            const bearing = this._bearingTo(px, pz, m.x, m.z);
            const rel = this._wrapDeg(bearing - this._yawToDeg(yaw));
            if (Math.abs(rel) > 65) return;
            const x = cx - rel * PX_PER_DEG;
            const dist = Math.hypot(m.x - px, m.z - pz);
            const showLabel = Math.abs(rel) < 20 && dist < m.revealDist;
            html += `<span class="cmarker" style="left:${x}px;color:${color}" title="${label}">${icon}` +
                (showLabel ? `<em>${label} · ${Math.round(dist)}m</em>` : '') + `</span>`;
        };

        for (const [id, m] of this.markers) {
            if (!this.discovered.has(id)) continue;
            drawMarker(m, m.icon, m.color, m.label);
        }
        if (this.questTarget) {
            drawMarker({ ...this.questTarget, revealDist: 1e9 }, '◈', '#ffd75e', this.questTarget.label);
        }

        this.ticks.innerHTML = html;
        this._updateSneak();
    }

    _yawToDeg(yaw) {
        // yaw=0 faces north(-Z); compass degrees clockwise from north
        return ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    }

    _wrapDeg(d) {
        d = ((d + 180) % 360 + 360) % 360;
        return d - 180;
    }

    _bearingTo(px, pz, tx, tz) {
        const dx = tx - px, dz = tz - pz;
        const beta = Math.atan2(-dx, -dz); // matches yaw convention
        return ((-beta * 180 / Math.PI) % 360 + 360) % 360;
    }

    /* ------------------------------ sneak eye ------------------------------ */

    _updateSneak() {
        const player = this.game.player;
        const wm = this.game.worldManager;
        if (!player || !wm) return;

        let maxAlert = 0;
        const px = player.position.x, pz = player.position.z;
        for (const enemy of wm.enemies?.values() || []) {
            if (enemy.isDead?.() || enemy.aiState === 'DEAD') continue;
            const d = Math.hypot(enemy.position.x - px, enemy.position.z - pz);
            if (d < 55) maxAlert = Math.max(maxAlert, enemy.alertLevel || 0);
        }

        const crouching = player.isCrouching;
        let state = 'hidden', text = '';
        if (maxAlert > 60) { state = 'detected'; text = 'DETECTED'; }
        else if (maxAlert > 25) { state = 'caution'; text = '...'; }
        else if (crouching) { state = 'sneaking'; }

        if (state === 'hidden') {
            this.sneakEl.classList.add('hidden');
            return;
        }
        this.sneakEl.classList.remove('hidden');
        this.sneakEl.className = `sneak-${state}`;
        this.sneakEl.innerHTML = `<span class="sneak-eye">◉</span>${text ? `<span class="sneak-text">${text}</span>` : ''}`;
    }
}
