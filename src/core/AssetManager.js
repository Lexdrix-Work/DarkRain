import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * AssetManager - Handles loading and caching of all game assets
 */
export class AssetManager {
    constructor() {
        this.textures = new Map();
        this.models = new Map();
        this.sounds = new Map();
        this.materials = new Map();
        
        this.loadingManager = new THREE.LoadingManager();
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.gltfLoader = new GLTFLoader(this.loadingManager);
        this.audioLoader = new THREE.AudioLoader(this.loadingManager);
        this.cubeTextureLoader = new THREE.CubeTextureLoader(this.loadingManager);
        
        this.loadProgress = 0;
        this.onProgress = null;
        this.onComplete = null;
        
        this.setupLoadingManager();
    }

    setupLoadingManager() {
        this.loadingManager.onProgress = (url, loaded, total) => {
            this.loadProgress = (loaded / total) * 100;
            if (this.onProgress) {
                this.onProgress(this.loadProgress, url);
            }
        };

        this.loadingManager.onLoad = () => {
            if (this.onComplete) {
                this.onComplete();
            }
        };

        this.loadingManager.onError = (url) => {
            console.error(`Error loading: ${url}`);
        };
    }

    /**
     * Load a texture
     * @param {string} name - Asset identifier
     * @param {string} url - Path to texture
     * @param {Object} options - Texture options
     * @returns {Promise<THREE.Texture>}
     */
    async loadTexture(name, url, options = {}) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                url,
                (texture) => {
                    // Apply options
                    if (options.repeat) {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(options.repeat.x, options.repeat.y);
                    }
                    if (options.filter === 'nearest') {
                        texture.magFilter = THREE.NearestFilter;
                        texture.minFilter = THREE.NearestFilter;
                    }
                    if (options.anisotropy) {
                        texture.anisotropy = options.anisotropy;
                    }
                    
                    this.textures.set(name, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load a GLTF/GLB model
     * @param {string} name - Asset identifier
     * @param {string} url - Path to model
     * @returns {Promise<THREE.Group>}
     */
    async loadModel(name, url) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                url,
                (gltf) => {
                    this.models.set(name, gltf);
                    resolve(gltf);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load an audio file
     * @param {string} name - Asset identifier
     * @param {string} url - Path to audio
     * @returns {Promise<AudioBuffer>}
     */
    async loadSound(name, url) {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(
                url,
                (buffer) => {
                    this.sounds.set(name, buffer);
                    resolve(buffer);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load a cubemap for skybox/reflections
     * @param {string} name - Asset identifier  
     * @param {string[]} urls - Array of 6 image paths
     * @returns {Promise<THREE.CubeTexture>}
     */
    async loadCubeTexture(name, urls) {
        return new Promise((resolve, reject) => {
            this.cubeTextureLoader.load(
                urls,
                (texture) => {
                    this.textures.set(name, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load multiple assets in parallel
     * @param {Array} manifest - Array of {type, name, url, options}
     * @returns {Promise<void>}
     */
    async loadManifest(manifest) {
        const promises = manifest.map(item => {
            switch (item.type) {
                case 'texture':
                    return this.loadTexture(item.name, item.url, item.options);
                case 'model':
                    return this.loadModel(item.name, item.url);
                case 'sound':
                    return this.loadSound(item.name, item.url);
                case 'cubemap':
                    return this.loadCubeTexture(item.name, item.urls);
                default:
                    console.warn(`Unknown asset type: ${item.type}`);
                    return Promise.resolve();
            }
        });
        
        await Promise.all(promises);
    }

    /**
     * Get a cached texture
     * @param {string} name - Asset identifier
     * @returns {THREE.Texture|undefined}
     */
    getTexture(name) {
        return this.textures.get(name);
    }

    /**
     * Get a cached model (cloned for instancing)
     * @param {string} name - Asset identifier
     * @param {boolean} clone - Whether to clone the model
     * @returns {THREE.Group|undefined}
     */
    getModel(name, clone = true) {
        const model = this.models.get(name);
        if (model && clone) {
            return model.scene.clone();
        }
        return model?.scene;
    }

    /**
     * Get a cached sound buffer
     * @param {string} name - Asset identifier
     * @returns {AudioBuffer|undefined}
     */
    getSound(name) {
        return this.sounds.get(name);
    }

    /**
     * Create and cache a standard material
     * @param {string} name - Material identifier
     * @param {Object} options - Material options
     * @returns {THREE.Material}
     */
    createMaterial(name, options = {}) {
        const material = new THREE.MeshStandardMaterial(options);
        this.materials.set(name, material);
        return material;
    }

    /**
     * Get a cached material
     * @param {string} name - Material identifier
     * @returns {THREE.Material|undefined}
     */
    getMaterial(name) {
        return this.materials.get(name);
    }

    /**
     * Dispose of all loaded assets
     */
    dispose() {
        this.textures.forEach(texture => texture.dispose());
        this.materials.forEach(material => material.dispose());
        this.textures.clear();
        this.models.clear();
        this.sounds.clear();
        this.materials.clear();
    }
}