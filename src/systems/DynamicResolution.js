/**
 * DynamicResolution - Automatically adjust render resolution to hit 60 FPS
 *
 * Monitors FPS and scales the render resolution up/down.
 * On crap computers, this drops resolution to maintain playability.
 * On good hardware, it pushes to full res.
 */

export class DynamicResolution {
    constructor(game) {
        this.game = game;
        this.enabled = true;

        // Resolution scale (1.0 = full, 0.5 = half)
        this.scale = 1.0;
        this.minScale = 0.5;
        this.maxScale = 1.0;

        // FPS tracking
        this.frameTimes = [];
        this.checkInterval = 2000; // Check every 2 seconds
        this.lastCheck = performance.now();

        // Target FPS
        this.targetFps = 60;
        this.tolerance = 5;
    }

    update(deltaTime) {
        if (!this.enabled) return;

        // Track frame time
        this.frameTimes.push(deltaTime * 1000);
        if (this.frameTimes.length > 120) {
            this.frameTimes.shift();
        }

        // Check every 2 seconds
        const now = performance.now();
        if (now - this.lastCheck < this.checkInterval) return;
        this.lastCheck = now;

        if (this.frameTimes.length < 30) return;

        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        const fps = 1000 / avg;

        // Adjust scale
        if (fps < this.targetFps - this.tolerance && this.scale > this.minScale) {
            // Too slow, reduce resolution
            this.scale = Math.max(this.minScale, this.scale - 0.1);
            this.apply();
            console.log(`DynamicResolution: FPS ${fps.toFixed(1)} < ${this.targetFps}, scale → ${this.scale.toFixed(2)}`);
        } else if (fps > this.targetFps + this.tolerance && this.scale < this.maxScale) {
            // Fast enough, increase resolution
            this.scale = Math.min(this.maxScale, this.scale + 0.05);
            this.apply();
            console.log(`DynamicResolution: FPS ${fps.toFixed(1)} > ${this.targetFps}, scale → ${this.scale.toFixed(2)}`);
        }

        // Clear history after adjustment
        this.frameTimes = [];
    }

    apply() {
        const renderer = this.game.renderer;
        if (!renderer) return;

        const width = Math.floor(window.innerWidth * this.scale);
        const height = Math.floor(window.innerHeight * this.scale);

        renderer.setSize(width, height, false);
        // CSS keeps it filling the screen (upscaled by browser)
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled && this.scale !== 1.0) {
            this.scale = 1.0;
            this.apply();
        }
    }
}
