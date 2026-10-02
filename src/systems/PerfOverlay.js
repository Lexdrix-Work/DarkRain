/**
 * PerfOverlay - GPU/CPU performance monitor (toggle with F3)
 *
 * Shows:
 * - FPS and frame time (avg/p95)
 * - Draw calls, triangles, geometries, textures
 * - Scene objects (meshes, lights)
 * - JS heap usage
 * - System update times
 */

export class PerfOverlay {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.element = null;

        // Frame time history
        this.frameTimes = [];
        this.maxHistory = 120;

        // System timings
        this.systemTimes = new Map();

        this.createElement();
        this.setupInput();
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.id = 'perf-overlay';
        this.element.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: #0f0;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 12px;
            border: 1px solid #0f0;
            border-radius: 4px;
            z-index: 10000;
            display: none;
            min-width: 280px;
            line-height: 1.6;
            pointer-events: none;
        `;
        document.body.appendChild(this.element);
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'F3') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    toggle() {
        this.visible = !this.visible;
        this.element.style.display = this.visible ? 'block' : 'none';
    }

    /**
     * Call at start of frame
     */
    beginFrame() {
        this.frameStart = performance.now();
    }

    /**
     * Call at end of frame
     */
    endFrame() {
        if (!this.frameStart) return;
        const dt = performance.now() - this.frameStart;
        this.frameTimes.push(dt);
        if (this.frameTimes.length > this.maxHistory) {
            this.frameTimes.shift();
        }
        if (this.visible) this.update();
    }

    /**
     * Time a system update
     */
    timeSystem(name, fn) {
        const start = performance.now();
        const result = fn();
        const dt = performance.now() - start;
        this.systemTimes.set(name, dt);
        return result;
    }

    getStats() {
        const times = [...this.frameTimes].sort((a, b) => a - b);
        const avg = times.reduce((a, b) => a + b, 0) / times.length || 0;
        const p95 = times[Math.floor(times.length * 0.95)] || 0;
        const fps = avg > 0 ? 1000 / avg : 0;

        return { fps, avg, p95, count: times.length };
    }

    update() {
        const { fps, avg, p95 } = this.getStats();
        const renderer = this.game.renderer;
        const info = renderer?.info;

        let html = `<div style="color:#ff0;font-weight:bold;margin-bottom:8px;">PERF (F3 to hide)</div>`;

        // FPS
        const fpsColor = fps >= 55 ? '#0f0' : fps >= 30 ? '#ff0' : '#f00';
        html += `<div>FPS: <span style="color:${fpsColor}">${fps.toFixed(1)}</span> `;
        html += `(${avg.toFixed(1)}ms avg, ${p95.toFixed(1)}ms p95)</div>`;

        // Renderer info (GPU)
        if (info) {
            html += `<div style="margin-top:8px;color:#0ff;">— GPU —</div>`;
            html += `<div>Draw calls: ${info.render.calls}</div>`;
            html += `<div>Triangles: ${(info.render.triangles / 1000).toFixed(1)}k</div>`;
            html += `<div>Geometries: ${info.memory.geometries}</div>`;
            html += `<div>Textures: ${info.memory.textures}</div>`;
        }

        // Scene info (CPU)
        if (this.game.scene) {
            let meshes = 0, lights = 0;
            this.game.scene.traverse(o => {
                if (o.isMesh) meshes++;
                if (o.isLight) lights++;
            });
            html += `<div style="margin-top:8px;color:#0ff;">— CPU Scene —</div>`;
            html += `<div>Meshes: ${meshes}</div>`;
            html += `<div>Lights: ${lights}</div>`;
        }

        // Memory
        if (performance.memory) {
            const mb = performance.memory.usedJSHeapSize / 1048576;
            html += `<div>JS Heap: ${mb.toFixed(1)} MB</div>`;
        }

        // System times
        if (this.systemTimes.size > 0) {
            html += `<div style="margin-top:8px;color:#0ff;">— Systems —</div>`;
            const sorted = [...this.systemTimes.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8);
            for (const [name, time] of sorted) {
                const color = time > 5 ? '#f00' : time > 2 ? '#ff0' : '#0f0';
                html += `<div>${name}: <span style="color:${color}">${time.toFixed(2)}ms</span></div>`;
            }
        }

        this.element.innerHTML = html;
    }
}
