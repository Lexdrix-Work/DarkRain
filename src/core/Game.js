import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

import { EventBus, globalEventBus, GameEvents } from './EventBus.js';
import { InputManager } from './InputManager.js';
import { AssetManager } from './AssetManager.js';
import { Player } from '../entities/Player.js';
import { WorldManager } from '../world/WorldManager.js';
import { WeatherSystem } from '../systems/WeatherSystem.js';
import { DayNightCycle } from '../systems/DayNightCycle.js';
import { AudioManager } from '../systems/AudioManager.js';
import { AnomalySystem } from '../world/AnomalySystem.js';
import { UIManager } from '../ui/UIManager.js';
import { FlashlightSystem } from '../systems/FlashlightSystem.js';
import { PowerupSystem } from '../systems/PowerupSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { PerfOverlay } from '../systems/PerfOverlay.js';
import { DynamicResolution } from '../systems/DynamicResolution.js';
import { FactionSystem } from '../systems/FactionSystem.js';
import { PerkSystem } from '../systems/PerkSystem.js';

/**
 * Level Configurations
 */
const LEVEL_CONFIGS = {
    'zone_outskirts': {
        name: 'Zone Outskirts',
        // City generation configuration
        city: {
            blocksX: 12,
            blocksZ: 12,
            blockSize: 30,
            roadWidth: 6,
            buildingSpacing: 8,
            maxFloors: 8,
            streetLightEvery: 1,
            district: 'outskirts',
            ruinLevel: 0.55,
            terrainAmplitude: 11
        },
        spawnPoints: {
            player: [[0, 1, 10]],
            enemy: [
                [40, 0, 40],
                [-40, 0, 40],
                [40, 0, -40],
                [-40, 0, -40],
                [60, 0, 0],
                [-60, 0, 0]
            ],
            loot: [
                [15, 0, 15],
                [-15, 0, 15],
                [15, 0, -15]
            ]
        },
        enemies: [
            { type: 'human', name: 'Bandit Scout', position: [45, 0, 45] },
            { type: 'human', name: 'Bandit', position: [-45, 0, 30] },
            { type: 'mutant', name: 'Bloodsucker', position: [70, 0, -50] }
        ],
        staticObjects: [
            { 
                geometry: 'box', 
                size: { x: 4, y: 1.5, z: 2 }, 
                position: [25, 0.75, -15],
                color: 0x4a4a4a
            },
            {
                geometry: 'box',
                size: { x: 3, y: 1.2, z: 0.5 },
                position: [10, 0.6, 5],
                color: 0x666666
            }
        ],
        anomalyFields: [
            { type: 'gravitational', center: [80, 0, 80], radius: 15, count: 5 },
            { type: 'electrical', center: [-80, 0, -80], radius: 10, count: 3 },
            { type: 'chemical', center: [0, 0, 90], radius: 12, count: 4 }
        ],
        weather: 'cloudy',
        time: { hour: 14, minute: 30 }
    },
    
    'pripyat_downtown': {
        name: 'Pripyat Downtown',
        city: {
            blocksX: 14,
            blocksZ: 14,
            blockSize: 35,
            roadWidth: 8,
            buildingSpacing: 10,
            maxFloors: 15,
            streetLightEvery: 1,
            district: 'downtown',
            ruinLevel: 0.3,
            terrainAmplitude: 5
        },
        spawnPoints: {
            player: [[0, 1, 0]],
            enemy: [
                [50, 0, 50],
                [-50, 0, 50],
                [50, 0, -50],
                [-50, 0, -50]
            ],
            loot: []
        },
        enemies: [
            { type: 'mutant', name: 'Bloodsucker', position: [60, 0, 60] },
            { type: 'mutant', name: 'Bloodsucker', position: [-60, 0, -60] }
        ],
        staticObjects: [],
        anomalyFields: [
            { type: 'gravitational', center: [100, 0, 0], radius: 20, count: 8 },
            { type: 'electrical', center: [-100, 0, 0], radius: 15, count: 5 }
        ],
        weather: 'fog',
        time: { hour: 6, minute: 0 }
    },
    
    'industrial_zone': {
        name: 'Industrial Zone',
        city: {
            blocksX: 10,
            blocksZ: 10,
            blockSize: 40,
            roadWidth: 8,
            buildingSpacing: 12,
            maxFloors: 5,
            streetLightEvery: 2,
            district: 'industrial',
            ruinLevel: 0.45,
            terrainAmplitude: 6
        },
        spawnPoints: {
            player: [[0, 1, 0]],
            enemy: [
                [30, 0, 30],
                [-30, 0, -30]
            ],
            loot: []
        },
        enemies: [
            { type: 'human', name: 'Bandit', position: [35, 0, 35] }
        ],
        staticObjects: [],
        anomalyFields: [
            { type: 'chemical', center: [50, 0, 50], radius: 25, count: 10 }
        ],
        weather: 'overcast',
        time: { hour: 18, minute: 0 }
    },
    
    'dead_city': {
        name: 'Dead City',
        city: {
            blocksX: 16,
            blocksZ: 16,
            blockSize: 32,
            roadWidth: 7,
            buildingSpacing: 9,
            maxFloors: 12,
            streetLightEvery: 1,
            district: 'outskirts',
            ruinLevel: 0.75,
            terrainAmplitude: 7
        },
        spawnPoints: {
            player: [[0, 1, 0]],
            enemy: [
                [60, 0, 60],
                [-60, 0, 60],
                [60, 0, -60],
                [-60, 0, -60],
                [90, 0, 0],
                [-90, 0, 0],
                [0, 0, 90],
                [0, 0, -90]
            ],
            loot: [
                [20, 0, 20],
                [-20, 0, 20],
                [20, 0, -20],
                [-20, 0, -20]
            ]
        },
        enemies: [
            { type: 'mutant', name: 'Bloodsucker', position: [70, 0, 70] },
            { type: 'mutant', name: 'Bloodsucker', position: [-70, 0, -70] },
            { type: 'human', name: 'Bandit Leader', position: [50, 0, 0] },
            { type: 'human', name: 'Bandit', position: [55, 0, 5] },
            { type: 'human', name: 'Bandit', position: [55, 0, -5] }
        ],
        staticObjects: [],
        anomalyFields: [
            { type: 'gravitational', center: [100, 0, 100], radius: 20, count: 8 },
            { type: 'electrical', center: [-100, 0, -100], radius: 18, count: 6 },
            { type: 'chemical', center: [100, 0, -100], radius: 15, count: 5 },
            { type: 'gravitational', center: [-100, 0, 100], radius: 22, count: 7 }
        ],
        weather: 'thunderstorm',
        time: { hour: 22, minute: 0 }
    },
    
    // Fallback terrain-only level
    'wilderness': {
        name: 'Wilderness',
        terrain: {
            width: 500,
            depth: 500,
            segments: 100,
            color: 0x3d5c3d
        },
        spawnPoints: {
            player: [[0, 1, 0]],
            enemy: [
                [30, 0, 30],
                [-30, 0, 30],
                [30, 0, -30],
                [-30, 0, -30]
            ],
            loot: []
        },
        enemies: [
            { type: 'mutant', name: 'Wild Dog', position: [35, 0, 35] },
            { type: 'mutant', name: 'Wild Dog', position: [-35, 0, 35] }
        ],
        staticObjects: [
            { 
                geometry: 'box', 
                size: { x: 10, y: 4, z: 8 }, 
                position: [30, 2, -20],
                color: 0x555555
            }
        ],
        anomalyFields: [
            { type: 'gravitational', center: [50, 0, 50], radius: 15, count: 5 },
            { type: 'chemical', center: [-50, 0, -50], radius: 12, count: 4 }
        ],
        weather: 'clear',
        time: { hour: 12, minute: 0 }
    }
};

/**
 * Main Game class - Core game loop and system management
 */
export class Game {
    constructor(options = {}) {
        this.canvas = options.canvas || document.getElementById('game-canvas');
        this.debug = options.debug || false;
        
        // Core Three.js
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.composer = null;
        
        // Game Systems
        this.inputManager = null;
        this.assetManager = null;
        this.worldManager = null;
        this.weatherSystem = null;
        this.dayNightCycle = null;
        this.audioManager = null;
        this.anomalySystem = null;
        this.uiManager = null;
        this.flashlightSystem = null;
        
        // Player
        this.player = null;
        
        // Game State
        this.isRunning = false;
        this.isPaused = false;
        this.isLoading = true;
        this.currentLevelName = null;
        
        // Timing
        this.clock = new THREE.Clock();
        this.deltaTime = 0;
        this.fixedTimeStep = 1 / 60;
        this.accumulator = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.lastFpsUpdate = 0;
        
        // Camera shake
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.shakeOffset = new THREE.Vector3();
        
        // Settings (defaults; the settings menu persists overrides in localStorage
        // and pushes them through the 'settings:graphics' event -> applyGraphicsSettings)
        this.settings = {
            quality: 'medium',
            renderScale: 1.0,      // 0.5..1.0 fraction of native resolution
            shadows: true,
            postProcessing: true,  // master post-processing switch
            bloom: true,
            antiAliasing: true,    // FXAA
            filmGrain: true,
            vignette: true,
            chroma: false,         // chromatic aberration
            fov: 75,
            renderDistance: 500,
            autoQuality: false
        };
        // Auto-quality governor state
        this._autoQuality = {
            lastCheck: 0,
            emaFps: 60,
            emaMs: 16.6,
            goodStreak: 0,
            effRenderScale: 1.0   // governor-adjusted scale (<= settings.renderScale)
        };
    }

    /**
     * Initialize the game
     */
    async init() {
        console.log('Initializing game...');
        
        try {
            // Setup renderer
            this.setupRenderer();
            
            // Setup scene
            this.setupScene();
            
            // Setup post-processing
            this.setupPostProcessing();
            
            // Initialize managers
            this.inputManager = new InputManager(globalEventBus, this.canvas); // Pass canvas to InputManager
            this.assetManager = new AssetManager();
            
            // Setup asset loading callbacks
            this.assetManager.onProgress = (progress, url) => {
                this.uiManager?.updateLoadingProgress(progress, `Loading: ${url}`);
            };
            
            this.assetManager.onComplete = () => {
                console.log('Assets loaded');
            };
            
            // Initialize UI (needs to exist before loading for progress display)
            this.uiManager = new UIManager({ game: this });
            this.uiManager.showLoadingScreen(true);
            this.uiManager.updateLoadingProgress(0, 'Initializing...');
            
            // Load assets
            await this.loadAssets();
            
            this.uiManager.updateLoadingProgress(20, 'Creating world manager...');
            
            // Initialize world manager
            this.worldManager = new WorldManager(this);
            
            // Ensure WorldManager is initialized (if it has async init)
            if (this.worldManager.init && typeof this.worldManager.init === 'function') {
                if (!this.worldManager._initialized) {
                    await this.worldManager.init();
                }
            }
            
            this.uiManager.updateLoadingProgress(30, 'Creating player...');
            
            // Initialize player
            this.player = new Player();
            this.player.init(this);
            this.player.position.set(0, 1, 0);
            
            // Set camera reference
            this.camera = this.player.camera;
            // Camera must be in the scene graph for its children (gun viewmodel,
            // audio listener) to render and update their world matrices
            this.scene.add(this.player.camera);
            
            // Initialize flashlight system
            this.flashlightSystem = new FlashlightSystem(this);
            this.flashlightSystem.setPlayer(this.player);
            
            this.uiManager.updateLoadingProgress(40, 'Initializing systems...');
            
            // Initialize game systems
            this.weatherSystem = new WeatherSystem(this);
            this.dayNightCycle = new DayNightCycle(this);
            this.audioManager = new AudioManager(this);
            this.anomalySystem = new AnomalySystem(this);
            this.powerupSystem = new PowerupSystem(this);
            this.equipmentSystem = new EquipmentSystem(this);
            this.perfOverlay = new PerfOverlay(this);
            this.dynamicResolution = new DynamicResolution(this);
            this.factionSystem = new FactionSystem(this);
            this.perkSystem = new PerkSystem(this);
            
            // Attach audio listener to camera
            if (this.audioManager.listener) {
                this.camera.add(this.audioManager.listener);
            }
            
            this.uiManager.updateLoadingProgress(50, 'Loading level...');
            
            // Load initial level
            await this.loadLevel('zone_outskirts');
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Hide loading screen
            this.uiManager.showLoadingScreen(false);
            this.isLoading = false;
            
            // Start game
            this.start();
            
            console.log('Game initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.uiManager?.updateLoadingProgress(0, `Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Setup Three.js renderer
     */
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        // Cap at 1.5: on high-DPI screens the difference vs 2.0 is imperceptible
        // but it cuts fragment shader cost by ~44%
        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Static scene: don't re-render shadow maps every frame
        // (flashlight shadow updates on movement via needsUpdate)
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    /**
     * Setup Three.js scene
     */
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        
        // Add fog for atmosphere
        this.scene.fog = new THREE.Fog(0x87ceeb, 100, 500);
        
        // Temporary camera until player is initialized
        this.camera = new THREE.PerspectiveCamera(
            this.settings.fov,
            window.innerWidth / window.innerHeight,
            0.1,
            this.settings.renderDistance
        );
    }

    /**
     * Quality tier baselines. User-facing toggles/sliders override these.
     */
    static qualityTiers() {
        return {
            low:    { pixelRatioCap: 1.0, shadowSize: 0,    bloom: false, aa: false, grain: false, renderDistance: 300,  rain: 6000 },
            medium: { pixelRatioCap: 1.5, shadowSize: 1024, bloom: true,  aa: false, grain: true,  renderDistance: 500,  rain: 10000 },
            high:   { pixelRatioCap: 2.0, shadowSize: 2048, bloom: true,  aa: true,  grain: true,  renderDistance: 750,  rain: 15000 },
            ultra:  { pixelRatioCap: 3.0, shadowSize: 4096, bloom: true,  aa: true,  grain: true,  renderDistance: 1000, rain: 20000 }
        };
    }

    /**
     * Setup post-processing (initial build; rebuilt on graphics changes)
     */
    setupPostProcessing() {
        this.buildComposer();
    }

    /**
     * (Re)build the EffectComposer chain from the current settings.
     * Disposes the previous chain so toggling effects never leaks targets.
     */
    buildComposer() {
        const s = this.settings;
        const tier = (Game.qualityTiers()[s.quality] || Game.qualityTiers().medium);

        // Dispose the old chain first
        if (this.composer) {
            for (const pass of this.composer.passes) {
                pass.dispose?.();
            }
            this.composer.dispose?.();
            this.composer = null;
        }
        this.gradePass = null;
        this.grainPass = null;
        this.fxaaPass = null;

        const usePost = s.postProcessing !== false;
        if (!usePost) return; // direct rendering, no composer

        this.composer = new EffectComposer(this.renderer);

        // 1. Scene render
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // 2. Bloom for emissives, muzzle flash, anomaly glow
        const wantBloom = s.bloom && tier.bloom;
        if (wantBloom) {
            const bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                s.quality === 'ultra' ? 0.38 : 0.3,  // strength
                0.5,   // radius
                0.82   // threshold
            );
            this.composer.addPass(bloomPass);
        }

        // 3. Color grade: vignette / saturation / contrast / brightness / lift
        const gradePass = new ShaderPass(Game.gradeShader());
        gradePass.uniforms.vignetteAmount.value = s.vignette ? 0.32 : 0.0;
        gradePass.uniforms.saturation.value = 0.92;
        gradePass.uniforms.contrast.value = 1.08;
        gradePass.uniforms.lift.value = 0.015;
        this.composer.addPass(gradePass);
        this.gradePass = gradePass;

        // 4. Animated film grain (separate pass, subtle)
        if (s.filmGrain && tier.grain) {
            const grainPass = new ShaderPass(Game.grainShader());
            grainPass.uniforms.amount.value = 0.028;
            this.composer.addPass(grainPass);
            this.grainPass = grainPass;
        }

        // 5. Chromatic aberration (optional, very subtle)
        if (s.chroma) {
            const chromaPass = new ShaderPass(Game.chromaShader());
            chromaPass.uniforms.amount.value = 0.0012;
            this.composer.addPass(chromaPass);
        }

        // 6. FXAA in linear space before output transform (quality-gated)
        if (s.antiAliasing && tier.aa) {
            const fxaaPass = new ShaderPass(FXAAShader);
            this._updateFxaaResolution(fxaaPass);
            this.composer.addPass(fxaaPass);
            this.fxaaPass = fxaaPass;
        }

        // 7. Output: tone mapping + sRGB. Must stay last — without this the
        // composer writes raw linear HDR to the canvas and everything
        // renders near-black.
        this.composer.addPass(new OutputPass());

        this._syncComposerSize();
    }

    /**
     * Keep the composer on the same pixel ratio / size as the renderer
     */
    _syncComposerSize() {
        if (!this.composer) return;
        const pr = this.renderer.getPixelRatio();
        this.composer.setPixelRatio(pr);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        if (this.fxaaPass) this._updateFxaaResolution(this.fxaaPass);
    }

    _updateFxaaResolution(fxaaPass) {
        const pr = this.renderer.getPixelRatio();
        const res = fxaaPass.material.uniforms.resolution;
        res.value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
    }

    /**
     * Filmic color-grade shader: vignette, saturation, contrast, lift, brightness
     */
    static gradeShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                vignetteAmount: { value: 0.32 },
                saturation: { value: 0.92 },
                contrast: { value: 1.08 },
                brightness: { value: 0.0 },
                lift: { value: 0.015 }
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D tDiffuse;
                uniform float vignetteAmount;
                uniform float saturation;
                uniform float contrast;
                uniform float brightness;
                uniform float lift;
                varying vec2 vUv;

                // Filmic-ish soft vignette with smooth falloff
                float vignette(vec2 uv, float amount) {
                    vec2 d = (uv - 0.5) * vec2(1.15, 1.0);
                    float v = smoothstep(0.95, 0.35, dot(d, d) * amount * 2.2);
                    return mix(1.0, v, clamp(amount * 2.4, 0.0, 1.0));
                }

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);

                    // Lift blacks slightly for a filmic toe
                    color.rgb = color.rgb * (1.0 - lift) + lift;

                    // Saturation (luma-weighted)
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    color.rgb = mix(vec3(gray), color.rgb, saturation);

                    // Contrast around mid-gray
                    color.rgb = (color.rgb - 0.5) * contrast + 0.5;

                    // Brightness
                    color.rgb += brightness;

                    // Vignette
                    color.rgb *= vignette(vUv, vignetteAmount);

                    gl_FragColor = color;
                }
            `
        };
    }

    /**
     * Animated film grain shader (hash without texture lookups)
     */
    static grainShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                amount: { value: 0.028 }
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform float amount;
                varying vec2 vUv;

                float hash(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    // Two decorrelated samples: finer, less "crawly" grain
                    float g = hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 271.0) - 0.5;
                    float g2 = hash(vUv * vec2(1280.0, 720.0) - fract(time * 1.7) * 173.0) - 0.5;
                    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    // Grain is stronger in shadows, gentler in highlights
                    float mask = mix(1.0, 0.35, smoothstep(0.0, 0.9, luma));
                    color.rgb += (g * 0.7 + g2 * 0.3) * amount * mask;
                    gl_FragColor = color;
                }
            `
        };
    }

    /**
     * Subtle radial chromatic aberration
     */
    static chromaShader() {
        return {
            uniforms: {
                tDiffuse: { value: null },
                amount: { value: 0.0012 }
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D tDiffuse;
                uniform float amount;
                varying vec2 vUv;
                void main() {
                    vec2 dir = vUv - 0.5;
                    float r2 = dot(dir, dir);
                    vec2 off = dir * r2 * amount * 8.0;
                    float r = texture2D(tDiffuse, vUv - off).r;
                    float g = texture2D(tDiffuse, vUv).g;
                    float b = texture2D(tDiffuse, vUv + off).b;
                    gl_FragColor = vec4(r, g, b, 1.0);
                }
            `
        };
    }

    /**
     * Load game assets
     */
    async loadAssets() {
        this.uiManager?.updateLoadingProgress(0, 'Loading assets...');
        
        // Define asset manifest
        const manifest = [
            // Textures
            // { type: 'texture', name: 'ground_diffuse', url: 'assets/textures/ground_diffuse.jpg' },
            // { type: 'texture', name: 'ground_normal', url: 'assets/textures/ground_normal.jpg' },
            
            // Models
            // { type: 'model', name: 'weapon_ak74', url: 'assets/models/weapons/ak74.glb' },
            // { type: 'model', name: 'mutant_bloodsucker', url: 'assets/models/enemies/bloodsucker.glb' },
            
            // Sounds
            // { type: 'sound', name: 'gunshot_ak', url: 'assets/sounds/weapons/ak_shot.mp3' },
            // { type: 'sound', name: 'ambient_wind', url: 'assets/sounds/ambient/wind.mp3' },
            // { type: 'sound', name: 'thunder', url: 'assets/sounds/weather/thunder.mp3' },
            // { type: 'sound', name: 'detector_beep', url: 'assets/sounds/items/detector_beep.mp3' },
        ];
        
        // Load assets (if any)
        if (manifest.length > 0) {
            await this.assetManager.loadManifest(manifest);
        }
        
        this.uiManager?.updateLoadingProgress(15, 'Assets loaded');
    }

    /**
     * Load a game level
     * @param {string} levelName - Level identifier
     */
    async loadLevel(levelName) {
        console.log(`Loading level: ${levelName}`);
        
        this.uiManager?.updateLoadingProgress(50, `Loading ${levelName}...`);
        
        // Get level configuration
        const levelData = LEVEL_CONFIGS[levelName] || LEVEL_CONFIGS['wilderness'];
        
        if (!levelData) {
            console.error(`Level "${levelName}" not found, using fallback`);
        }
        
        console.log('Level configuration:', levelData);
        
        // Store current level name
        this.currentLevelName = levelName;
        
        try {
            this.uiManager?.updateLoadingProgress(55, 'Generating world...');
            
            // Load level through world manager
            if (this.worldManager) {
                await this.worldManager.loadLevel(levelData);
            } else {
                console.error('WorldManager not available!');
            }
            
            this.uiManager?.updateLoadingProgress(75, 'Spawning anomalies...');
            
            // Spawn anomaly fields
            if (levelData.anomalyFields && this.anomalySystem) {
                for (const field of levelData.anomalyFields) {
                    this.anomalySystem.spawnAnomalyField(
                        new THREE.Vector3(field.center[0], field.center[1], field.center[2]),
                        field.radius,
                        field.type,
                        field.count
                    );
                }
            }

            // Artifacts crystallize at the edges of anomaly fields
            this.uiManager?.updateLoadingProgress(80, 'Seeding artifacts...');
            this.artifactSystem?.seedArtifacts();
            
            this.uiManager?.updateLoadingProgress(85, 'Setting up environment...');

            // Scatter lootable containers through the world (crates, corpses,
            // stashes) - needs buildings + anomaly fields to exist first.
            // Compass markers go first so loot can add stash markers after.
            if (this.compassSystem) {
                this.compassSystem.populateLevel(levelData);
            }
            if (this.lootSystem) {
                this.uiManager?.updateLoadingProgress(88, 'Hiding loot...');
                this.lootSystem.populateLevel(levelData);
            }
            
            // Set initial weather
            if (this.weatherSystem && levelData.weather) {
                this.weatherSystem.setWeather(levelData.weather, 0);
            }
            
            // Set time
            if (this.dayNightCycle && levelData.time) {
                this.dayNightCycle.setTime(levelData.time.hour, levelData.time.minute);
            }
            
            this.uiManager?.updateLoadingProgress(95, 'Positioning player...');
            
            // Position player at spawn point
            if (this.player && levelData.spawnPoints?.player?.length > 0) {
                const spawn = levelData.spawnPoints.player[0];
                this.player.position.set(spawn[0], spawn[1], spawn[2]);
                
                // Reset player velocity if they have physics
                if (this.player.velocity) {
                    this.player.velocity.set(0, 0, 0);
                }
                
                console.log('Player spawned at:', spawn);
            }
            
            this.uiManager?.updateLoadingProgress(100, 'Level loaded!');
            
            // Emit level loaded event
            globalEventBus.emit('level:loaded', { 
                name: levelData.name, 
                levelName: levelName 
            });
            
            console.log(`Level "${levelData.name}" loaded successfully`);
            
        } catch (error) {
            console.error('Error loading level:', error);
            this.uiManager?.updateLoadingProgress(0, `Error: ${error.message}`);
            
            // Try to load fallback level
            if (levelName !== 'wilderness') {
                console.log('Attempting to load fallback level...');
                await this.loadLevel('wilderness');
            }
        }
    }

    /**
     * Change to a different level
     * @param {string} levelName - Level identifier
     */
    async changeLevel(levelName) {
        this.isLoading = true;
        this.uiManager?.showLoadingScreen(true);
        
        // Clear anomalies from previous level
        if (this.anomalySystem) {
            for (const id of [...this.anomalySystem.anomalies.keys()]) {
                this.anomalySystem.removeAnomaly(id);
            }
        }

        // Clear Zone systems from previous level
        this.artifactSystem?.clear();
        this.alifeSystem?.dispose();
        this.boltSystem?.clear();
        this.psySystem?.clear();
        this.emissionSystem?.reset();
        
        // Load new level
        await this.loadLevel(levelName);
        
        this.uiManager?.showLoadingScreen(false);
        this.isLoading = false;
    }

    /**
     * Get available level names
     * @returns {string[]} Array of level names
     */
    getAvailableLevels() {
        return Object.keys(LEVEL_CONFIGS);
    }

    /**
     * Get level info
     * @param {string} levelName - Level identifier
     * @returns {Object} Level configuration
     */
    getLevelInfo(levelName) {
        return LEVEL_CONFIGS[levelName] || null;
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Handle pointer lock through InputManager
        // The click handler is now managed by InputManager's requestPointerLock method
        
        // Pause on escape (handled in input manager, but also here for menu)
        globalEventBus.on(GameEvents.GAME_PAUSE, () => {
            this.pause();
        });
        
        globalEventBus.on(GameEvents.GAME_RESUME, () => {
            this.resume();
        });
        
        // Graphics settings
        globalEventBus.on('settings:graphics', (settings) => {
            this.applyGraphicsSettings(settings);
        });
        
        // Save/Load
        globalEventBus.on(GameEvents.SAVE_GAME, () => {
            this.saveGame();
        });
        
        globalEventBus.on(GameEvents.LOAD_GAME, () => {
            this.loadGame();
        });
        
        // Level change requests
        globalEventBus.on('level:change', (data) => {
            this.changeLevel(data.levelName);
        });
        
        // Flashlight toggle
        globalEventBus.on('input:flashlight', () => {
            this.flashlightSystem?.toggle();
        });

        // Anomaly detector toggle (requires detector item)
        globalEventBus.on('input:toggle_detector', () => {
            if (this.isPaused || this.gameState === 'menu') return;
            const inv = this.inventorySystem;
            if (!inv || !inv.hasItem('detector')) {
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'You need an anomaly detector (search the Zone).',
                    type: 'warning', duration: 3000
                });
                return;
            }
            inv.toggleDetector(inv.slots?.find?.(s => s?.id === 'detector'));
        });
    }

    /**
     * Start the game loop
     */
    start() {
        this.isRunning = true;
        this.clock.start();
        this.gameLoop();
        
        console.log('Game loop started');
    }

    /**
     * Stop the game loop
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Pause the game. Single source of truth for the paused state:
     * sets isPaused, releases the pointer, and tells the UI to show
     * the pause menu via GAME_PAUSE.
     */
    pause() {
        if (this.gameState !== 'playing' || this.isPaused) return;
        this.isPaused = true;

        // Release pointer lock when pausing
        if (this.inputManager) {
            this.inputManager.exitPointerLock();
        }

        globalEventBus.emit(GameEvents.GAME_PAUSE);
    }

    /**
     * Resume the game. Mirrors pause(): clears isPaused, tells the UI to
     * close the pause menu via GAME_RESUME, then re-locks the pointer.
     */
    resume() {
        if (!this.isPaused) return;
        this.isPaused = false;

        globalEventBus.emit(GameEvents.GAME_RESUME);

        // Request pointer lock when resuming
        if (this.inputManager && this.canvas) {
            this.inputManager.requestPointerLock();
        }
    }

    /**
     * Main game loop
     */
    gameLoop() {
        if (!this.isRunning) return;
        
        requestAnimationFrame(() => this.gameLoop());
        
        // Calculate delta time
        this.deltaTime = Math.min(this.clock.getDelta(), 0.1); // Cap at 100ms
        
        // FPS counter + frame-time EMA (feeds the overlay and auto-quality)
        const frameStart = performance.now();
        this.frameCount++;
        if (frameStart - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = frameStart;

            // Debug FPS display
            if (this.debug) {
                console.log(`FPS: ${this.fps}`);
            }
            this.uiManager?.updateFps(this.fps, this._autoQuality.emaMs);
        }
        
        // Check for pause input (only during active gameplay, never in menus)
        if (this.inputManager && this.gameState === 'playing' && !this.isLoading &&
            this.inputManager.isActionJustPressed('pause')) {
            const ui = this.uiManager;
            const openMenu = ui?.activeMenu;
            if (openMenu && openMenu !== 'pause' && openMenu !== 'settings') {
                // Esc first closes whatever is open (inventory, map, loot...)
                ui.closeMenu(openMenu);
            } else if (openMenu === 'settings') {
                // ...and backs out of settings to the pause menu
                ui.closeSettings();
            } else if (this.isPaused) {
                this.resume();
            } else {
                this.pause();
            }
        }
        
        // Update game if not paused
        if (!this.isPaused && !this.isLoading) {
            this.update(this.deltaTime);
            this.fixedUpdate(this.deltaTime);
        }
        
        // Always render
        this.render();

        // Frame-time EMA + auto-quality governor
        const frameMs = performance.now() - frameStart;
        const aq = this._autoQuality;
        aq.emaMs += (frameMs - aq.emaMs) * 0.06;
        aq.emaFps += ((1000 / Math.max(frameMs, 0.01)) - aq.emaFps) * 0.06;
        this._tickAutoQuality(frameStart);
        
        // Clear input state for next frame
        if (this.inputManager) {
            this.inputManager.update();
        }
    }

    /**
     * Auto-quality governor: holds frame rate by easing the render scale
     * between 0.6 and the user's chosen render scale. Only acts when the
     * user enabled "Auto Quality" in settings.
     */
    _tickAutoQuality(now) {
        const aq = this._autoQuality;
        if (!this.settings.autoQuality) {
            // Governor off: track the user's scale directly
            if (aq.effRenderScale !== this.settings.renderScale) {
                aq.effRenderScale = this.settings.renderScale;
                this._applyRenderScale();
            }
            return;
        }
        if (now - aq.lastCheck < 2000) return;
        aq.lastCheck = now;

        const target = this.settings.renderScale;
        const fps = aq.emaFps;
        if (fps < 45 && aq.effRenderScale > 0.6) {
            aq.effRenderScale = Math.max(0.6, aq.effRenderScale - 0.1);
            aq.goodStreak = 0;
            this._applyRenderScale();
        } else if (fps > 57 && aq.effRenderScale < target) {
            aq.goodStreak++;
            if (aq.goodStreak >= 3) {
                aq.goodStreak = 0;
                aq.effRenderScale = Math.min(target, aq.effRenderScale + 0.05);
                this._applyRenderScale();
            }
        } else if (fps >= 45) {
            aq.goodStreak = 0;
        }
    }

    /**
     * Apply the effective render scale (user scale x governor scale)
     */
    _applyRenderScale() {
        const tier = (Game.qualityTiers()[this.settings.quality] || Game.qualityTiers().medium);
        const pr = Math.min(window.devicePixelRatio || 1, tier.pixelRatioCap) * this._autoQuality.effRenderScale;
        this.renderer.setPixelRatio(pr);
        this._syncComposerSize();
    }

    /**
     * Update game logic
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime) {
        // Update player
        this.perfOverlay?.beginFrame();
        this.player?.update(deltaTime);
        
        // Update world
        this.worldManager?.update(deltaTime);
        
        // Update systems
        this.weatherSystem?.update(deltaTime);
        this.dayNightCycle?.update(deltaTime);
        this.anomalySystem?.update(deltaTime);
        this.powerupSystem?.update(deltaTime);
        this.audioManager?.update(deltaTime);
        this.flashlightSystem?.update(deltaTime);
        // Update shadow maps only when player moves (static scene optimization)
        if (this.player && this.renderer.shadowMap.enabled) {
            const pos = this.player.position;
            if (!this._lastShadowPos) {
                this._lastShadowPos = pos.clone();
                this.renderer.shadowMap.needsUpdate = true;
            } else if (pos.distanceToSquared(this._lastShadowPos) > 1.0) {
                this._lastShadowPos.copy(pos);
                this.renderer.shadowMap.needsUpdate = true;
            }
        }
        
        // Update UI
        this.uiManager?.update(deltaTime);
        this.perfOverlay?.endFrame();
        this.dynamicResolution?.update(deltaTime);
        this.factionSystem?.update(deltaTime);

        // First-person overlay (weapon viewmodel, arms, hat brim)
        this.viewmodelSystem?.update(deltaTime);

        // Loot containers (bobbing, prompt refresh)
        this.lootSystem?.update(deltaTime);

        // Compass + sneak indicator
        this.compassSystem?.update(deltaTime);
        
        // Update camera shake
        this.updateCameraShake(deltaTime);
    }

    /**
     * Fixed timestep update for physics
     * @param {number} deltaTime - Time since last frame
     */
    fixedUpdate(deltaTime) {
        this.accumulator += deltaTime;
        
        while (this.accumulator >= this.fixedTimeStep) {
            // Fixed update for physics-based systems
            this.player?.fixedUpdate(this.fixedTimeStep);
            
            // Update world entities fixed
            if (this.worldManager?.entities) {
                for (const entity of this.worldManager.entities.values()) {
                    if (entity.fixedUpdate) {
                        entity.fixedUpdate(this.fixedTimeStep);
                    }
                }
            }
            
            this.accumulator -= this.fixedTimeStep;
        }
    }

    /**
     * Render the scene
     */
    render() {
        // Update camera from player
        if (this.player?.camera) {
            this.camera = this.player.camera;
            
            // Apply camera shake
            if (this.shakeIntensity > 0) {
                this.camera.position.add(this.shakeOffset);
            }
            
            // Update composer camera reference
            if (this.composer?.passes[0]) {
                this.composer.passes[0].camera = this.camera;
            }
        }
        
        // Render with post-processing or standard
        // If composer fails, fall back to direct rendering (never black screen)
        try {
            if (this.composer && this.settings.postProcessing) {
                if (this.grainPass?.uniforms?.time) {
                    this.grainPass.uniforms.time.value = performance.now() * 0.001;
                }
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (renderErr) {
            if (!this._renderFallbackWarned) {
                this._renderFallbackWarned = true;
                console.error('[Render] Composer failed, falling back to direct:', renderErr);
                this.composer = null; // permanent fallback
            }
            this.renderer.render(this.scene, this.camera);
        }

        // First-person overlay (weapon viewmodel, arms, hat brim): separate
        // scene + camera rendered after the main pass with depth cleared, so
        // the viewmodel can never clip through walls.
        this.viewmodelSystem?.render(this.renderer);
    }

    /**
     * Apply camera shake effect
     * @param {number} intensity - Shake intensity
     * @param {number} duration - Shake duration in seconds
     */
    cameraShake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
    }

    /**
     * Update camera shake
     * @param {number} deltaTime - Frame delta
     */
    updateCameraShake(deltaTime) {
        if (this.shakeDuration > 0) {
            this.shakeDuration -= deltaTime;
            
            // Random offset based on intensity
            this.shakeOffset.set(
                (Math.random() - 0.5) * 2 * this.shakeIntensity,
                (Math.random() - 0.5) * 2 * this.shakeIntensity,
                (Math.random() - 0.5) * 2 * this.shakeIntensity
            );
            
            // Decay intensity
            this.shakeIntensity *= 0.9;
        } else {
            this.shakeIntensity = 0;
            this.shakeOffset.set(0, 0, 0);
        }
    }

    /**
     * Handle window resize
     */
    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Update camera
        if (this.camera) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
        
        // Update renderer
        this.renderer.setSize(width, height);
        
        // Update composer (keeps pixel ratio + FXAA resolution in sync)
        this._syncComposerSize();
    }

    /**
     * Apply graphics settings. The quality tier sets baselines; individual
     * toggles/sliders from the settings menu override the tier.
     * @param {Object} settings - Graphics settings
     */
    applyGraphicsSettings(settings) {
        const s = this.settings;
        const tiers = Game.qualityTiers();
        const prevQuality = s.quality;
        const prevFlags = [s.postProcessing, s.bloom, s.antiAliasing, s.filmGrain, s.vignette, s.chroma].join('|');

        if (settings.quality && tiers[settings.quality]) s.quality = settings.quality;
        const tier = tiers[s.quality];

        if (settings.renderScale !== undefined) {
            s.renderScale = Math.min(1, Math.max(0.5, settings.renderScale));
            this._autoQuality.effRenderScale = s.renderScale;
            this._autoQuality.goodStreak = 0;
        }
        if (settings.shadows !== undefined) s.shadows = !!settings.shadows;
        if (settings.postProcessing !== undefined) s.postProcessing = !!settings.postProcessing;
        if (settings.bloom !== undefined) s.bloom = !!settings.bloom;
        if (settings.antiAliasing !== undefined) s.antiAliasing = !!settings.antiAliasing;
        if (settings.filmGrain !== undefined) s.filmGrain = !!settings.filmGrain;
        if (settings.vignette !== undefined) s.vignette = !!settings.vignette;
        if (settings.chroma !== undefined) s.chroma = !!settings.chroma;
        if (settings.autoQuality !== undefined) s.autoQuality = !!settings.autoQuality;

        // Pixel ratio: tier cap x effective render scale
        this._applyRenderScale();

        // Shadows
        this.renderer.shadowMap.enabled = s.shadows;
        this.renderer.shadowMap.type = s.quality === 'low' ? THREE.BasicShadowMap
            : s.quality === 'medium' ? THREE.PCFShadowMap
            : THREE.PCFSoftShadowMap;
        this._applyShadowSize(s.shadows ? tier.shadowSize : 0);

        // FOV
        if (settings.fov && this.camera) {
            s.fov = settings.fov;
            this.camera.fov = settings.fov;
            this.camera.updateProjectionMatrix();
        }

        // Render distance
        const rd = settings.renderDistance || tier.renderDistance;
        if (rd !== s.renderDistance) {
            s.renderDistance = rd;
            if (this.camera) {
                this.camera.far = rd;
                this.camera.updateProjectionMatrix();
            }
            if (this.scene?.fog) this.scene.fog.far = rd;
        }

        // Rebuild the composer when the pass set may have changed
        const nextFlags = [s.postProcessing, s.bloom, s.antiAliasing, s.filmGrain, s.vignette, s.chroma].join('|');
        if (s.quality !== prevQuality || nextFlags !== prevFlags) {
            this.buildComposer();
        } else if (this.gradePass && settings.vignette !== undefined) {
            // Cheap path: just retune the vignette amount
            this.gradePass.uniforms.vignetteAmount.value = s.vignette ? 0.32 : 0.0;
        }

        // Tell the weather system to scale precipitation with quality
        globalEventBus.emit('settings:rainCount', { count: tier.rain });

        // Materials may need a refresh when the shadow type changes
        if (this.scene) {
            this.scene.traverse((obj) => {
                if (obj.material) obj.material.needsUpdate = true;
            });
        }
    }

    /**
     * Resize shadow maps on the sun/moon lights (DayNightCycle owns them)
     */
    _applyShadowSize(px) {
        const dn = this.dayNightCycle;
        if (!dn) return;
        for (const light of [dn.sunLight, dn.moonLight]) {
            if (!light?.shadow) continue;
            if (px <= 0) {
                light.castShadow = false;
                continue;
            }
            light.castShadow = true;
            if (light.shadow.mapSize.x !== px) {
                light.shadow.mapSize.set(px, px);
                if (light.shadow.map) {
                    light.shadow.map.dispose();
                    light.shadow.map = null;
                }
            }
        }
    }

    /**
     * Save game state
     * @param {string} slot - Save slot name
     */
    saveGame(slot = 'quicksave') {
        const saveData = {
            version: '1.0.0',
            timestamp: Date.now(),
            levelName: this.currentLevelName,
            player: this.player?.serialize ? this.player.serialize() : null,
            world: this.worldManager?.serialize ? this.worldManager.serialize() : null,
            time: this.dayNightCycle?.currentTime || 12,
            weather: this.weatherSystem?.currentWeather || 'clear'
        };
        
        try {
            localStorage.setItem(`stalker_save_${slot}`, JSON.stringify(saveData));
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Game saved',
                type: 'success'
            });
            console.log(`Game saved to slot: ${slot}`);
        } catch (e) {
            console.error('Failed to save game:', e);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Failed to save game',
                type: 'danger'
            });
        }
    }

    /**
     * Load game state
     * @param {string} slot - Save slot name
     */
    async loadGame(slot = 'quicksave') {
        try {
            const saveJson = localStorage.getItem(`stalker_save_${slot}`);
            if (!saveJson) {
                globalEventBus.emit(GameEvents.NOTIFICATION, {
                    message: 'No save found',
                    type: 'warning'
                });
                return;
            }
            
            const saveData = JSON.parse(saveJson);
            
            // Load level if different
            if (saveData.levelName && saveData.levelName !== this.currentLevelName) {
                await this.changeLevel(saveData.levelName);
            }
            
            // Load player state
            if (this.player?.deserialize && saveData.player) {
                this.player.deserialize(saveData.player);
            }
            
            // Load time and weather
            if (this.dayNightCycle && saveData.time) {
                this.dayNightCycle.currentTime = saveData.time;
            }
            
            if (this.weatherSystem && saveData.weather) {
                this.weatherSystem.setWeather(saveData.weather, 0);
            }
            
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Game loaded',
                type: 'success'
            });
            
            console.log(`Game loaded from slot: ${slot}`);
        } catch (e) {
            console.error('Failed to load game:', e);
            globalEventBus.emit(GameEvents.NOTIFICATION, {
                message: 'Failed to load game',
                type: 'danger'
            });
        }
    }

    /**
     * Get list of save slots
     * @returns {Object[]} Array of save slot info
     */
    getSaveSlots() {
        const slots = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('stalker_save_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    slots.push({
                        slot: key.replace('stalker_save_', ''),
                        timestamp: data.timestamp,
                        levelName: data.levelName,
                        version: data.version
                    });
                } catch (e) {
                    // Invalid save data
                }
            }
        }
        
        return slots.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Delete a save slot
     * @param {string} slot - Save slot name
     */
    deleteSave(slot) {
        localStorage.removeItem(`stalker_save_${slot}`);
        console.log(`Save deleted: ${slot}`);
    }

    /**
     * Cleanup and dispose
     */
    dispose() {
        this.stop();
        
        // Dispose systems
        this.worldManager?.dispose();
        this.weatherSystem?.dispose();
        this.dayNightCycle?.dispose();
        this.audioManager?.dispose();
        this.anomalySystem?.dispose();
        this.artifactSystem?.dispose();
        this.emissionSystem?.dispose();
        this.alifeSystem?.dispose();
        this.psySystem?.dispose();
        this.boltSystem?.dispose();
        this.assetManager?.dispose();
        this.uiManager?.dispose();
        this.flashlightSystem?.dispose();
        
        // Dispose player
        this.player?.destroy();
        
        // Dispose renderer
        this.renderer?.dispose();
        
        // Dispose composer
        if (this.composer) {
            this.composer.passes.forEach(pass => {
                if (pass.dispose) pass.dispose();
            });
        }
        
        // Clear scene
        if (this.scene) {
            this.scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => m.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            this.scene.clear();
        }
        
        // Clear event bus
        globalEventBus.clear();
        
        console.log('Game disposed');
    }
}

// Export level configs for external use
export { LEVEL_CONFIGS };
