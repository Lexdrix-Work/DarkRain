import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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

/**
 * Level Configurations
 */
const LEVEL_CONFIGS = {
    'zone_outskirts': {
        name: 'Zone Outskirts',
        // City generation configuration
        city: {
            blocksX: 6,
            blocksZ: 6,
            blockSize: 30,
            roadWidth: 6,
            buildingSpacing: 8,
            maxFloors: 8,
            streetLightEvery: 1,
            district: 'outskirts',
            ruinLevel: 0.55,
            terrainAmplitude: 9
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
            blocksX: 8,
            blocksZ: 8,
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
            blocksX: 5,
            blocksZ: 5,
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
            blocksX: 10,
            blocksZ: 10,
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
        
        // Settings
        this.settings = {
            quality: 'medium',
            shadows: true,
            postProcessing: true,
            fov: 75,
            renderDistance: 500
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
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
     * Setup post-processing effects
     */
    setupPostProcessing() {
        if (!this.settings.postProcessing) return;
        
        this.composer = new EffectComposer(this.renderer);
        
        // Render pass
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        
        // Bloom pass (for lights, fire effects)
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.3,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.composer.addPass(bloomPass);
        
        // Custom vignette/color grading shader
        const colorGradingShader = {
            uniforms: {
                tDiffuse: { value: null },
                time: { value: 0 },
                vignetteAmount: { value: 0.3 },
                saturation: { value: 0.9 },
                contrast: { value: 1.1 },
                brightness: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform float vignetteAmount;
                uniform float saturation;
                uniform float contrast;
                uniform float brightness;
                varying vec2 vUv;
                
                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    
                    // Vignette
                    vec2 center = vUv - 0.5;
                    float vignette = 1.0 - dot(center, center) * vignetteAmount;
                    color.rgb *= vignette;
                    
                    // Saturation
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    color.rgb = mix(vec3(gray), color.rgb, saturation);
                    
                    // Contrast
                    color.rgb = (color.rgb - 0.5) * contrast + 0.5;
                    
                    // Brightness
                    color.rgb += brightness;

                    // Animated film grain - breaks up flat digital gradients
                    float grain = fract(sin(dot(vUv * (mod(time, 10.0) + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
                    color.rgb += (grain - 0.5) * 0.02;
                    
                    gl_FragColor = color;
                }
            `
        };
        
        const colorGradingPass = new ShaderPass(colorGradingShader);
        this.composer.addPass(colorGradingPass);
        this.colorGradingPass = colorGradingPass;

        // Output pass: applies tone mapping + sRGB conversion.
        // Without this, the composer writes raw linear HDR values to the
        // canvas and the whole image renders nearly black.
        this.composer.addPass(new OutputPass());
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
            this.anomalySystem.clearAll();
        }
        
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
     * Pause the game
     */
    pause() {
        this.isPaused = true;
        
        // Release pointer lock when pausing
        if (this.inputManager) {
            this.inputManager.exitPointerLock();
        }
        
        this.uiManager?.showPauseMenu();
    }

    /**
     * Resume the game
     */
    resume() {
        this.isPaused = false;
        
        // Request pointer lock when resuming
        if (this.inputManager && this.canvas) {
            this.inputManager.requestPointerLock();
        }
        
        this.uiManager?.hidePauseMenu();
    }

    /**
     * Main game loop
     */
    gameLoop() {
        if (!this.isRunning) return;
        
        requestAnimationFrame(() => this.gameLoop());
        
        // Calculate delta time
        this.deltaTime = Math.min(this.clock.getDelta(), 0.1); // Cap at 100ms
        
        // FPS counter
        this.frameCount++;
        if (performance.now() - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = performance.now();
            
            // Debug FPS display
            if (this.debug) {
                console.log(`FPS: ${this.fps}`);
            }
        }
        
        // Check for pause input (not while sitting at the main menu)
        if (this.inputManager && this.gameState !== 'menu' && this.inputManager.isActionJustPressed('pause')) {
            if (this.isPaused) {
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
        
        // Clear input state for next frame
        if (this.inputManager) {
            this.inputManager.update();
        }
    }

    /**
     * Update game logic
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime) {
        // Update player
        this.player?.update(deltaTime);
        
        // Update world
        this.worldManager?.update(deltaTime);
        
        // Update systems
        this.weatherSystem?.update(deltaTime);
        this.dayNightCycle?.update(deltaTime);
        this.anomalySystem?.update(deltaTime);
        this.audioManager?.update(deltaTime);
        this.flashlightSystem?.update(deltaTime);
        
        // Update UI
        this.uiManager?.update(deltaTime);

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
        if (this.composer && this.settings.postProcessing) {
            if (this.colorGradingPass?.uniforms?.time) {
                this.colorGradingPass.uniforms.time.value = performance.now() * 0.001;
            }
            this.composer.render();
        } else {
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
        
        // Update composer
        if (this.composer) {
            this.composer.setSize(width, height);
        }
    }

    /**
     * Apply graphics settings
     * @param {Object} settings - Graphics settings
     */
    applyGraphicsSettings(settings) {
        if (settings.shadows !== undefined) {
            this.renderer.shadowMap.enabled = settings.shadows;
            this.settings.shadows = settings.shadows;
        }
        
        if (settings.quality) {
            this.settings.quality = settings.quality;
            
            switch (settings.quality) {
                case 'low':
                    this.renderer.setPixelRatio(1);
                    this.renderer.shadowMap.type = THREE.BasicShadowMap;
                    break;
                case 'medium':
                    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                    this.renderer.shadowMap.type = THREE.PCFShadowMap;
                    break;
                case 'high':
                    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    break;
                case 'ultra':
                    this.renderer.setPixelRatio(window.devicePixelRatio);
                    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    break;
            }
        }
        
        if (settings.postProcessing !== undefined) {
            this.settings.postProcessing = settings.postProcessing;
        }
        
        if (settings.renderDistance) {
            this.settings.renderDistance = settings.renderDistance;
            if (this.camera) {
                this.camera.far = settings.renderDistance;
                this.camera.updateProjectionMatrix();
            }
            if (this.scene?.fog) {
                this.scene.fog.far = settings.renderDistance;
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
