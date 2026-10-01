import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Minimap - Renders a top-down view of the area
 */
export class Minimap {
    constructor(game) {
        this.game = game;
        
        // Configuration
        this.size = 150;
        this.zoom = 0.5;
        this.range = 100;
        this.rotation = true;
        
        // Canvas
        this.canvas = null;
        this.ctx = null;
        
        // Tracked objects
        this.markers = new Map();
        
        // Colors
        this.colors = {
            background: 'rgba(10, 10, 10, 0.8)',
            player: '#00ff00',
            enemy: '#ff0000',
            npc: '#00ffff',
            quest: '#ffff00',
            anomaly: '#ff00ff',
            loot: '#ffffff',
            waypoint: '#ffa500'
        };
        
        this.init();
    }

    init() {
        this.createCanvas();
        this.setupEventListeners();
    }

    createCanvas() {
        // Create container
        const container = document.createElement('div');
        container.id = 'minimap-container';
        // Tell the stylesheet the minimap exists so the ammo readout shifts up
        document.body.classList.add('has-minimap');
        // Position comes from the stylesheet (#minimap-container: bottom-right,
        // clear of the quest tracker). Only the dynamic size is set here.
        container.style.cssText = `
            width: ${this.size}px;
            height: ${this.size}px;
            pointer-events: none;
        `;
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.size * 2; // Higher res for quality
        this.canvas.height = this.size * 2;
        this.canvas.style.cssText = `
            width: 100%;
            height: 100%;
        `;
        
        this.ctx = this.canvas.getContext('2d');
        
        container.appendChild(this.canvas);
        document.getElementById('hud')?.appendChild(container);
        
        // Create compass markers
        this.createCompass(container);
    }

    createCompass(container) {
        const directions = ['N', 'E', 'S', 'W'];
        const positions = [
            { top: '5px', left: '50%', transform: 'translateX(-50%)' },
            { top: '50%', right: '5px', transform: 'translateY(-50%)' },
            { bottom: '5px', left: '50%', transform: 'translateX(-50%)' },
            { top: '50%', left: '5px', transform: 'translateY(-50%)' }
        ];
        
        directions.forEach((dir, i) => {
            const marker = document.createElement('span');
            marker.textContent = dir;
            marker.className = 'minimap-direction';
            // Theme visuals come from .minimap-direction; only the
            // per-direction placement is inline.
            marker.style.cssText = `
                ${Object.entries(positions[i]).map(([k, v]) => `${k}: ${v}`).join('; ')}
            `;
            container.appendChild(marker);
        });
    }

    setupEventListeners() {
        globalEventBus.on(GameEvents.ENEMY_SPAWN, (data) => {
            this.addMarker(data.enemy.id, 'enemy', data.enemy);
        });
        
        globalEventBus.on(GameEvents.ENEMY_DEATH, (data) => {
            this.removeMarker(data.enemy.id);
        });
        
        globalEventBus.on('waypoint:set', (data) => {
            this.setWaypoint(data.position);
        });
        
        globalEventBus.on('waypoint:clear', () => {
            this.clearWaypoint();
        });
    }

    /**
     * Add a marker to the minimap
     * @param {string} id - Marker ID
     * @param {string} type - Marker type
     * @param {Object} entity - Entity reference
     */
    addMarker(id, type, entity) {
        this.markers.set(id, { type, entity });
    }

    /**
     * Remove a marker
     * @param {string} id - Marker ID
     */
    removeMarker(id) {
        this.markers.delete(id);
    }

    /**
     * Set waypoint
     * @param {THREE.Vector3} position - Waypoint position
     */
    setWaypoint(position) {
        this.waypoint = position.clone();
    }

    /**
     * Clear waypoint
     */
    clearWaypoint() {
        this.waypoint = null;
    }

    /**
     * Update minimap
     */
    update() {
        if (!this.ctx || !this.game.player) return;
        
        const ctx = this.ctx;
        const player = this.game.player;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const scale = this.canvas.width / (this.range * 2);
        
        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save context for rotation
        ctx.save();
        ctx.translate(centerX, centerY);
        
        if (this.rotation) {
            ctx.rotate(player.cameraYaw);
        }
        
        // Draw grid
        this.drawGrid(ctx, scale);
        
        // Draw anomalies
        if (this.game.anomalySystem) {
            for (const anomaly of this.game.anomalySystem.anomalies.values()) {
                if (anomaly.isVisible) {
                    this.drawMarker(ctx, anomaly.position, player.position, scale, this.colors.anomaly, 4);
                }
            }
        }
        
        // Draw enemies
        if (this.game.worldManager) {
            for (const enemy of this.game.worldManager.enemies.values()) {
                if (enemy.isActive) {
                    const color = enemy.alertLevel > 50 ? '#ff0000' : '#aa0000';
                    this.drawMarker(ctx, enemy.position, player.position, scale, color, 5, true);
                }
            }
        }
        
        // Draw NPCs
        for (const [id, marker] of this.markers) {
            if (marker.type === 'npc' && marker.entity?.position) {
                this.drawMarker(ctx, marker.entity.position, player.position, scale, this.colors.npc, 5);
            }
        }
        
        // Draw pickups
        if (this.game.worldManager) {
            for (const pickup of this.game.worldManager.pickups.values()) {
                if (pickup.isActive) {
                    this.drawMarker(ctx, pickup.mesh.position, player.position, scale, this.colors.loot, 3);
                }
            }
        }
        
        // Draw waypoint
        if (this.waypoint) {
            this.drawMarker(ctx, this.waypoint, player.position, scale, this.colors.waypoint, 8, false, true);
        }
        
        ctx.restore();
        
        // Draw player indicator (always centered, always on top)
        ctx.save();
        ctx.translate(centerX, centerY);
        
        // Player direction indicator
        ctx.fillStyle = this.colors.player;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(-6, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(6, 8);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // Draw range circle
        ctx.strokeStyle = 'rgba(196, 160, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.canvas.width / 2 - 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    /**
     * Draw grid lines
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} scale - Scale factor
     */
    drawGrid(ctx, scale) {
        ctx.strokeStyle = 'rgba(196, 160, 0, 0.1)';
        ctx.lineWidth = 1;
        
        const gridSize = 20 * scale;
        const count = Math.ceil(this.canvas.width / gridSize);
        
        for (let i = -count; i <= count; i++) {
            // Vertical lines
            ctx.beginPath();
            ctx.moveTo(i * gridSize, -this.canvas.height);
            ctx.lineTo(i * gridSize, this.canvas.height);
            ctx.stroke();
            
            // Horizontal lines
            ctx.beginPath();
            ctx.moveTo(-this.canvas.width, i * gridSize);
            ctx.lineTo(this.canvas.width, i * gridSize);
            ctx.stroke();
        }
    }

    /**
     * Draw a marker on the minimap
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {THREE.Vector3} position - World position
     * @param {THREE.Vector3} playerPos - Player position
     * @param {number} scale - Scale factor
     * @param {string} color - Marker color
     * @param {number} size - Marker size
     * @param {boolean} triangle - Draw as triangle
     * @param {boolean} pulse - Add pulse effect
     */
    drawMarker(ctx, position, playerPos, scale, color, size = 5, triangle = false, pulse = false) {
        const relX = (position.x - playerPos.x) * scale;
        const relZ = (position.z - playerPos.z) * scale;
        
        // Check if in range
        const distance = Math.sqrt(relX * relX + relZ * relZ);
        const maxDist = this.canvas.width / 2 - 10;
        
        if (distance > maxDist) {
            // Clamp to edge
            const angle = Math.atan2(relZ, relX);
            const clampedX = Math.cos(angle) * maxDist;
            const clampedZ = Math.sin(angle) * maxDist;
            
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(clampedX, clampedZ, size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            return;
        }
        
        ctx.fillStyle = color;
        
        if (pulse) {
            const pulseSize = size + Math.sin(Date.now() * 0.005) * 3;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(relX, relZ, pulseSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        
        if (triangle) {
            ctx.beginPath();
            ctx.moveTo(relX, relZ - size);
            ctx.lineTo(relX - size * 0.7, relZ + size * 0.5);
            ctx.lineTo(relX + size * 0.7, relZ + size * 0.5);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(relX, relZ, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Set minimap zoom
     * @param {number} zoom - Zoom level (0.1 - 2.0)
     */
    setZoom(zoom) {
        this.range = 100 / Math.max(0.1, Math.min(2.0, zoom));
    }

    /**
     * Toggle rotation mode
     * @param {boolean} enabled - Whether rotation is enabled
     */
    setRotation(enabled) {
        this.rotation = enabled;
    }

    dispose() {
        const container = document.getElementById('minimap-container');
        if (container) {
            container.remove();
        }
        this.markers.clear();
    }
}