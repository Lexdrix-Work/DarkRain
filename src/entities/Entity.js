import * as THREE from 'three';

/**
 * Base Entity class - Foundation for all game objects
 * Uses a component-like pattern for flexibility
 */
export class Entity {
    constructor(options = {}) {
        this.id = Entity.generateId();
        this.name = options.name || 'Entity';
        this.tags = new Set(options.tags || []);
        
        // Transform
        this.position = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.scale = new THREE.Vector3(1, 1, 1);
        
        // 3D Object
        this.mesh = null;
        this.boundingBox = new THREE.Box3();
        
        // State
        this.isActive = true;
        this.isVisible = true;
        this.isCollidable = true;
        
        // Components
        this.components = new Map();
        
        // Reference to game
        this.game = null;
    }

    static generateId() {
        return `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize entity (called after adding to world)
     * @param {Game} game - Game instance
     */
    init(game) {
        this.game = game;
        this.components.forEach(component => {
            if (component.init) {
                component.init(this, game);
            }
        });
    }

    /**
     * Update entity each frame
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        if (!this.isActive) return;
        
        this.components.forEach(component => {
            if (component.update) {
                component.update(deltaTime);
            }
        });
        
        // Sync mesh transform
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.copy(this.rotation);
            this.mesh.scale.copy(this.scale);
            this.mesh.visible = this.isVisible;
        }
    }

    /**
     * Fixed update for physics (called at fixed timestep)
     * @param {number} fixedDeltaTime - Fixed time step
     */
    fixedUpdate(fixedDeltaTime) {
        this.components.forEach(component => {
            if (component.fixedUpdate) {
                component.fixedUpdate(fixedDeltaTime);
            }
        });
    }

    /**
     * Add a component to this entity
     * @param {string} name - Component identifier
     * @param {Object} component - Component instance
     */
    addComponent(name, component) {
        this.components.set(name, component);
        component.entity = this;
        
        if (this.game && component.init) {
            component.init(this, this.game);
        }
    }

    /**
     * Get a component by name
     * @param {string} name - Component identifier
     * @returns {Object|undefined}
     */
    getComponent(name) {
        return this.components.get(name);
    }

    /**
     * Remove a component
     * @param {string} name - Component identifier
     */
    removeComponent(name) {
        const component = this.components.get(name);
        if (component && component.destroy) {
            component.destroy();
        }
        this.components.delete(name);
    }

    /**
     * Check if entity has a tag
     * @param {string} tag - Tag to check
     * @returns {boolean}
     */
    hasTag(tag) {
        return this.tags.has(tag);
    }

    /**
     * Set the 3D mesh for this entity
     * @param {THREE.Object3D} mesh - Three.js mesh
     */
    setMesh(mesh) {
        this.mesh = mesh;
        this.updateBoundingBox();
    }

    /**
     * Update the bounding box
     */
    updateBoundingBox() {
        if (this.mesh) {
            this.boundingBox.setFromObject(this.mesh);
        }
    }

    /**
     * Get distance to another entity or position
     * @param {Entity|THREE.Vector3} target - Target entity or position
     * @returns {number}
     */
    distanceTo(target) {
        const targetPos = target instanceof Entity ? target.position : target;
        return this.position.distanceTo(targetPos);
    }

    /**
     * Look at a target
     * @param {THREE.Vector3} target - Target position
     */
    lookAt(target) {
        if (this.mesh) {
            this.mesh.lookAt(target);
            this.rotation.copy(this.mesh.rotation);
        }
    }

    /**
     * Take damage (override in subclasses)
     * @param {number} amount - Damage amount
     * @param {Entity} source - Damage source
     */
    takeDamage(amount, source) {
        // Override in subclasses
    }

    /**
     * Destroy this entity
     */
    destroy() {
        this.isActive = false;
        
        // Destroy components
        this.components.forEach(component => {
            if (component.destroy) {
                component.destroy();
            }
        });
        this.components.clear();
        
        // Remove mesh from scene
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        
        // Dispose geometry and materials
        if (this.mesh) {
            this.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }

    /**
     * Serialize entity for saving
     * @returns {Object}
     */
    serialize() {
        return {
            id: this.id,
            name: this.name,
            tags: Array.from(this.tags),
            position: this.position.toArray(),
            rotation: [this.rotation.x, this.rotation.y, this.rotation.z],
            scale: this.scale.toArray(),
            isActive: this.isActive
        };
    }

    /**
     * Deserialize entity from save data
     * @param {Object} data - Saved data
     */
    deserialize(data) {
        this.id = data.id;
        this.name = data.name;
        this.tags = new Set(data.tags);
        this.position.fromArray(data.position);
        this.rotation.set(...data.rotation);
        this.scale.fromArray(data.scale);
        this.isActive = data.isActive;
    }
}