import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';
import { Enemy, Mutant, HumanEnemy } from '../entities/Enemy.js';

// Scratch vector reused for per-bullet raycast directions (avoids per-frame allocation)
const _bulletDir = new THREE.Vector3();

/**
 * WorldManager - Manages all world objects, entities, and level loading
 * Creates a post-apocalyptic abandoned city environment
 */
export class WorldManager {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        
        // Entity management
        this.entities = new Map();
        this.enemies = new Map();
        this.interactables = new Map();
        this.pickups = new Map();
        
        // Spatial partitioning for optimization
        this.spatialGrid = new Map();
        this.gridCellSize = 20;
        
        // Level data
        this.currentLevel = null;
        this.levelBounds = new THREE.Box3();
        
        // Object pools
        this.pools = {
            bullets: [],
            particles: [],
            decals: []
        };
        
        // Physics / Collision
        this.colliders = [];
        this.navMesh = null;
        
        // Collision acceleration structure
        this.collisionGrid = new Map();
        this.collisionGridSize = 10;
        
        // Spawn points
        this.spawnPoints = {
            player: [],
            enemy: [],
            loot: []
        };

        // Track city objects so they can be removed/cleaned
        this._cityObjects = [];
        
        // City reference for subsystems
        this.city = null;
        
        // Materials (reusable)
        this.materials = {};
        
        this._initialized = false;
    }

    async init() {
        this.setupEventListeners();
        this.setupMaterials();
        this.setupDefaultLights();
        this.setupAtmosphere();
        this.createObjectPools();
        this._initialized = true;
        console.log('WorldManager initialized');
    }

    setupEventListeners() {
        globalEventBus.on(GameEvents.ENEMY_DEATH, (data) => {
            this.removeEnemy(data.enemy);
        });
        
        globalEventBus.on('loot:drop', (data) => {
            this.spawnLoot(data.position, data.lootTable);
        });
    }

    /**
     * Setup reusable materials for the city
     * LIGHTER COLORS for visibility
     */
    setupMaterials() {
        // Building materials - LIGHTER concrete/plaster colors (weathered but visible)
        this.materials.buildingColors = [
            new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.85, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9, metalness: 0.05 }),
            new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0x9a9590, roughness: 0.85, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0xa09a94, roughness: 0.85, metalness: 0.05 }),
            new THREE.MeshStandardMaterial({ color: 0xb0a89c, roughness: 0.9, metalness: 0.05 }),
        ];
        
        // Damaged building material
        this.materials.damaged = new THREE.MeshStandardMaterial({
            color: 0x706a64,
            roughness: 0.95,
            metalness: 0.1
        });
        
        // Road/asphalt
        this.materials.road = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Cracked road
        this.materials.crackedRoad = new THREE.MeshStandardMaterial({
            color: 0x353535,
            roughness: 0.95,
            metalness: 0.05
        });
        
        // Sidewalk
        this.materials.sidewalk = new THREE.MeshStandardMaterial({
            color: 0x6a6a6a,
            roughness: 0.85,
            metalness: 0.05
        });
        
        // Ground/dirt
        this.materials.ground = new THREE.MeshStandardMaterial({
            color: 0x5a5850,
            roughness: 0.95,
            metalness: 0.0
        });
        
        // Metal (rusty)
        this.materials.rustyMetal = new THREE.MeshStandardMaterial({
            color: 0x7a6a5a,
            roughness: 0.7,
            metalness: 0.4
        });
        
        // Window
        this.materials.window = new THREE.MeshStandardMaterial({
            color: 0x2a3a4a,
            roughness: 0.2,
            metalness: 0.6,
            transparent: true,
            opacity: 0.9
        });
        
        // Window with light
        this.materials.windowLit = new THREE.MeshStandardMaterial({
            color: 0x5a4520,
            emissive: 0x4a3510,
            emissiveIntensity: 0.8,
            roughness: 0.3,
            metalness: 0.2
        });
        
        // Debris/rubble
        this.materials.debris = new THREE.MeshStandardMaterial({
            color: 0x6a6a6a,
            roughness: 0.95,
            metalness: 0.1
        });
        
        // Dead vegetation
        this.materials.deadVegetation = new THREE.MeshStandardMaterial({
            color: 0x5a4a35,
            roughness: 0.9,
            metalness: 0.0
        });
    }

    /**
     * Setup atmospheric lighting - OVERCAST DAYLIGHT
     */
    setupDefaultLights() {
        if (this._defaultLights) {
            Object.values(this._defaultLights).forEach(light => {
                if (light) this.scene.remove(light);
            });
        }

        // Hemisphere light
        const hemi = new THREE.HemisphereLight(0xc8d0d8, 0x6a6050, 1.4);
        hemi.position.set(0, 100, 0);
        this.scene.add(hemi);

        // Ambient light
        const amb = new THREE.AmbientLight(0x808088, 0.8);
        this.scene.add(amb);

        // Main directional light (sun)
        const dir = new THREE.DirectionalLight(0xfff8f0, 1.5);
        dir.position.set(50, 200, 100);
        dir.castShadow = true;
        
        dir.shadow.mapSize.width = 4096;
        dir.shadow.mapSize.height = 4096;
        dir.shadow.camera.near = 10;
        dir.shadow.camera.far = 1000;
        
        // Larger shadow area for bigger city
        const shadowSize = 500;
        dir.shadow.camera.left = -shadowSize;
        dir.shadow.camera.right = shadowSize;
        dir.shadow.camera.top = shadowSize;
        dir.shadow.camera.bottom = -shadowSize;
        dir.shadow.bias = -0.0003;
        dir.shadow.normalBias = 0.02;
        
        this.scene.add(dir);
        
        // Fill light
        const fill = new THREE.DirectionalLight(0x8090a0, 0.6);
        fill.position.set(-100, 80, -100);
        this.scene.add(fill);
        
        // Back light
        const back = new THREE.DirectionalLight(0xa0a0a0, 0.4);
        back.position.set(0, 50, -150);
        this.scene.add(back);

        this._defaultLights = { 
            hemisphere: hemi, 
            ambient: amb, 
            directional: dir,
            fill: fill,
            back: back
        };
        
        console.log('Overcast daylight setup complete');
    }

    /**
     * Setup atmospheric effects - OVERCAST DAY
     */
    setupAtmosphere() {
        this.scene.background = new THREE.Color(0xa0a8b0);
        // Increased fog distance for larger city
        this.scene.fog = new THREE.Fog(0x9098a0, 50, 800);
    }

    createObjectPools() {
        for (let i = 0; i < 50; i++) {
            const geometry = new THREE.SphereGeometry(0.02);
            const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            const bullet = new THREE.Mesh(geometry, material);
            bullet.visible = false;
            bullet.userData = { active: false, velocity: new THREE.Vector3() };
            this.pools.bullets.push(bullet);
            this.scene.add(bullet);
        }
    }

    /**
     * Load a level/area
     */
    async loadLevel(levelData) {
        console.log('WorldManager.loadLevel called with:', levelData);
        
        if (!this._initialized) {
            await this.init();
        }
        
        this.clearLevel();
        this.currentLevel = levelData;
        
        this.setupAtmosphere();
        
        if (levelData.city) {
            console.log('Generating city with config:', levelData.city);
            this.generateAbandonedCity(levelData.city);
        } else if (levelData.terrain) {
            await this.loadTerrain(levelData.terrain);
        }
        
        if (levelData.staticObjects) {
            for (const objData of levelData.staticObjects) {
                this.createStaticObject(objData);
            }
        }
        
        if (levelData.spawnPoints) {
            this.spawnPoints = levelData.spawnPoints;
        }
        
        if (levelData.enemies) {
            for (const enemyData of levelData.enemies) {
                this.spawnEnemy(enemyData);
            }
        }
        
        if (levelData.interactables) {
            for (const interactData of levelData.interactables) {
                this.createInteractable(interactData);
            }
        }
        
        this.calculateLevelBounds();
        this.buildCollisionGrid();
        
        globalEventBus.emit('level:loaded', { level: levelData.name });
        console.log('Level loaded successfully');
    }

    /**
     * Generate an abandoned post-apocalyptic city
     * DEFAULT SIZE INCREASED 10X (from 6x6 to ~19x19 blocks)
     */
    generateAbandonedCity(cityData = {}) {
        console.log('Generating abandoned city (10x size)...');
        
        const cfg = {
            // 10x area increase: sqrt(10) ≈ 3.16, so 6 * 3.16 ≈ 19
            blocksX: cityData.blocksX || 19,
            blocksZ: cityData.blocksZ || 19,
            blockSize: cityData.blockSize || 40,
            roadWidth: cityData.roadWidth || 8,
            buildingSpacing: cityData.buildingSpacing || 10,
            maxFloors: cityData.maxFloors || 12,
            minFloors: cityData.minFloors || 2,
            damageLevel: cityData.damageLevel || 0.3,
        };

        this.city = cfg;

        const totalWidth = cfg.blocksX * cfg.blockSize + (cfg.blocksX + 1) * cfg.roadWidth;
        const totalDepth = cfg.blocksZ * cfg.blockSize + (cfg.blocksZ + 1) * cfg.roadWidth;
        const startX = -totalWidth / 2 + cfg.roadWidth;
        const startZ = -totalDepth / 2 + cfg.roadWidth;

        console.log(`City dimensions: ${totalWidth}x${totalDepth} units`);

        // Create ground
        this.createGround(totalWidth, totalDepth);

        // Create roads
        this.createRoads(cfg, startX, startZ, totalWidth, totalDepth);

        // Create city blocks with buildings
        this.createCityBlocks(cfg, startX, startZ);

        // Add environmental details
        this.addEnvironmentalDetails(cfg, totalWidth, totalDepth);

        console.log(`City generated: ${this._cityObjects.length} objects, ${this.colliders.length} colliders`);
    }

    /**
     * Create the ground plane
     */
    createGround(width, depth) {
        const groundGeom = new THREE.PlaneGeometry(width + 200, depth + 200);
        
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x4a4840,
            roughness: 0.95,
            metalness: 0.0
        });
        
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        ground.userData = { type: 'ground', isCollidable: true, isGround: true };
        this.scene.add(ground);
        this._cityObjects.push(ground);
        this.colliders.push(ground);
    }

    /**
     * Create road network
     */
    createRoads(cfg, startX, startZ, totalWidth, totalDepth) {
        // Horizontal roads
        for (let bz = 0; bz <= cfg.blocksZ; bz++) {
            const roadZ = startZ - cfg.roadWidth / 2 + bz * (cfg.blockSize + cfg.roadWidth);
            this.createRoad(0, roadZ, totalWidth, cfg.roadWidth, 'horizontal');
        }

        // Vertical roads
        for (let bx = 0; bx <= cfg.blocksX; bx++) {
            const roadX = startX - cfg.roadWidth / 2 + bx * (cfg.blockSize + cfg.roadWidth);
            this.createRoad(roadX, 0, cfg.roadWidth, totalDepth, 'vertical');
        }
    }

    /**
     * Create a single road segment with details
     */
    createRoad(x, z, width, depth, direction) {
        const roadGeom = new THREE.PlaneGeometry(width, depth);
        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x404040,
            roughness: 0.85,
            metalness: 0.1
        });
        
        const road = new THREE.Mesh(roadGeom, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0.02, z);
        road.receiveShadow = true;
        road.userData = { type: 'road', isCollidable: true, isGround: true };
        this.scene.add(road);
        this._cityObjects.push(road);

        this.addRoadDamage(x, z, width, depth, direction);
        this.addRoadMarkings(x, z, width, depth, direction);
    }

    /**
     * Add cracks and potholes to roads
     */
    addRoadDamage(x, z, width, depth, direction) {
        const crackCount = Math.floor(Math.random() * 5) + 2;
        
        for (let i = 0; i < crackCount; i++) {
            const crackX = x + (Math.random() - 0.5) * width * 0.8;
            const crackZ = z + (Math.random() - 0.5) * depth * 0.8;
            
            const crackLength = 1 + Math.random() * 3;
            const crackWidth = 0.1 + Math.random() * 0.3;
            
            const crackGeom = new THREE.PlaneGeometry(crackWidth, crackLength);
            const crackMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
            const crack = new THREE.Mesh(crackGeom, crackMat);
            crack.rotation.x = -Math.PI / 2;
            crack.rotation.z = Math.random() * Math.PI;
            crack.position.set(crackX, 0.025, crackZ);
            this.scene.add(crack);
            this._cityObjects.push(crack);
        }

        if (Math.random() < 0.3) {
            const holeX = x + (Math.random() - 0.5) * width * 0.6;
            const holeZ = z + (Math.random() - 0.5) * depth * 0.6;
            const holeSize = 0.5 + Math.random() * 1;
            
            const holeGeom = new THREE.CircleGeometry(holeSize, 8);
            const holeMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
            const hole = new THREE.Mesh(holeGeom, holeMat);
            hole.rotation.x = -Math.PI / 2;
            hole.position.set(holeX, 0.015, holeZ);
            this.scene.add(hole);
            this._cityObjects.push(hole);
        }
    }

    /**
     * Add faded road markings
     */
    addRoadMarkings(x, z, width, depth, direction) {
        const markingColor = 0x4a4a4a;
        
        if (direction === 'horizontal') {
            const dashCount = Math.floor(width / 6);
            for (let i = 0; i < dashCount; i++) {
                if (Math.random() > 0.7) continue;
                
                const dashGeom = new THREE.PlaneGeometry(2, 0.15);
                const dashMat = new THREE.MeshBasicMaterial({ color: markingColor });
                const dash = new THREE.Mesh(dashGeom, dashMat);
                dash.rotation.x = -Math.PI / 2;
                dash.position.set(x - width / 2 + 3 + i * 6, 0.025, z);
                this.scene.add(dash);
                this._cityObjects.push(dash);
            }
        } else {
            const dashCount = Math.floor(depth / 6);
            for (let i = 0; i < dashCount; i++) {
                if (Math.random() > 0.7) continue;
                
                const dashGeom = new THREE.PlaneGeometry(0.15, 2);
                const dashMat = new THREE.MeshBasicMaterial({ color: markingColor });
                const dash = new THREE.Mesh(dashGeom, dashMat);
                dash.rotation.x = -Math.PI / 2;
                dash.position.set(x, 0.025, z - depth / 2 + 3 + i * 6);
                this.scene.add(dash);
                this._cityObjects.push(dash);
            }
        }
    }

    /**
     * Create city blocks with buildings
     */
    createCityBlocks(cfg, startX, startZ) {
        for (let bx = 0; bx < cfg.blocksX; bx++) {
            for (let bz = 0; bz < cfg.blocksZ; bz++) {
                const blockX = startX + bx * (cfg.blockSize + cfg.roadWidth) + cfg.blockSize / 2;
                const blockZ = startZ + bz * (cfg.blockSize + cfg.roadWidth) + cfg.blockSize / 2;

                this.createCityBlock(blockX, blockZ, cfg);
            }
        }
    }

    /**
     * Create a single city block with buildings
     */
    createCityBlock(blockX, blockZ, cfg) {
        const blockSize = cfg.blockSize;
        const spacing = cfg.buildingSpacing;
        
        const gridSize = Math.floor(blockSize / spacing);
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gz = 0; gz < gridSize; gz++) {
                if (Math.random() < 0.15) {
                    if (Math.random() < 0.5) {
                        const debrisX = blockX - blockSize / 2 + spacing * (gx + 0.5);
                        const debrisZ = blockZ - blockSize / 2 + spacing * (gz + 0.5);
                        this.createDebrisPile(debrisX, debrisZ);
                    }
                    continue;
                }

                const buildingX = blockX - blockSize / 2 + spacing * (gx + 0.5);
                const buildingZ = blockZ - blockSize / 2 + spacing * (gz + 0.5);

                const offsetX = (Math.random() - 0.5) * 2;
                const offsetZ = (Math.random() - 0.5) * 2;

                const floors = cfg.minFloors + Math.floor(Math.random() * (cfg.maxFloors - cfg.minFloors));
                const buildingWidth = 4 + Math.random() * (spacing - 5);
                const buildingDepth = 4 + Math.random() * (spacing - 5);
                
                const isDamaged = Math.random() < cfg.damageLevel;
                const damageType = isDamaged ? Math.floor(Math.random() * 3) : -1;

                this.createBuilding(
                    buildingX + offsetX,
                    buildingZ + offsetZ,
                    buildingWidth,
                    buildingDepth,
                    floors,
                    isDamaged,
                    damageType
                );
            }
        }

        this.createBlockSidewalks(blockX, blockZ, blockSize, cfg.roadWidth);
    }

    /**
     * Create building material with guaranteed visibility
     */
    createBuildingMaterial() {
        const colors = [
            0x8a8a8a, 0x9a9590, 0x8a8580, 0xa09a94,
            0x909090, 0x988a7a, 0xb0a898,
        ];
        
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.85 + Math.random() * 0.1,
            metalness: 0.05 + Math.random() * 0.1,
        });
    }

    /**
     * Create a building with optional damage
     * ALL BUILDING PARTS NOW HAVE COLLISION
     */
    createBuilding(x, z, width, depth, floors, isDamaged, damageType) {
        const floorHeight = 3;
        const baseHeight = floors * floorHeight;
        
        let actualHeight = baseHeight;
        if (isDamaged && damageType === 0) {
            actualHeight = baseHeight * (0.3 + Math.random() * 0.5);
        }

        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const material = isDamaged 
            ? this.materials.damaged 
            : this.createBuildingMaterial();

        // Main building body with collision
        if (isDamaged && damageType === 1) {
            this.createDamagedLBuilding(group, width, depth, actualHeight, material);
        } else if (isDamaged && damageType === 2) {
            this.createBuildingWithHole(group, width, depth, actualHeight, material);
        } else {
            const bodyGeom = new THREE.BoxGeometry(width, actualHeight, depth);
            const body = new THREE.Mesh(bodyGeom, material);
            body.position.y = actualHeight / 2;
            body.castShadow = true;
            body.receiveShadow = true;
            // Mark individual mesh as collidable
            body.userData = { isCollidable: true, type: 'building' };
            group.add(body);
        }

        this.addBuildingWindows(group, width, depth, actualHeight, floors, isDamaged);

        if (!isDamaged || Math.random() > 0.5) {
            this.addRoofDetails(group, width, depth, actualHeight);
        }

        this.addGroundFloorDetails(group, width, depth);

        if (isDamaged) {
            this.addBuildingRubble(group, width, depth);
        }

        // Mark the group as collidable
        group.userData = { type: 'building', isCollidable: true };
        
        // Store building bounds for efficient collision
        group.userData.bounds = {
            width: width,
            depth: depth,
            height: actualHeight
        };
        
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        
        // Also create a simple collision box for the building
        this.createBuildingCollider(x, z, width, depth, actualHeight);
    }

    /**
     * Create an invisible collision box for a building
     */
    createBuildingCollider(x, z, width, depth, height) {
        const colliderGeom = new THREE.BoxGeometry(width, height, depth);
        const colliderMat = new THREE.MeshBasicMaterial({ 
            visible: false,
            transparent: true,
            opacity: 0
        });
        const collider = new THREE.Mesh(colliderGeom, colliderMat);
        collider.position.set(x, height / 2, z);
        collider.userData = { 
            isCollidable: true, 
            type: 'buildingCollider',
            isCollisionOnly: true
        };
        this.scene.add(collider);
        this._cityObjects.push(collider);
        this.colliders.push(collider);
    }

    /**
     * Create an L-shaped damaged building
     */
    createDamagedLBuilding(group, width, depth, height, material) {
        const mainWidth = width * 0.7;
        const mainGeom = new THREE.BoxGeometry(mainWidth, height, depth);
        const main = new THREE.Mesh(mainGeom, material);
        main.position.set(-width / 2 + mainWidth / 2, height / 2, 0);
        main.castShadow = true;
        main.receiveShadow = true;
        main.userData = { isCollidable: true, type: 'building' };
        group.add(main);

        const partialHeight = height * (0.3 + Math.random() * 0.4);
        const partialWidth = width - mainWidth;
        const partialGeom = new THREE.BoxGeometry(partialWidth, partialHeight, depth);
        const partial = new THREE.Mesh(partialGeom, material);
        partial.position.set(width / 2 - partialWidth / 2, partialHeight / 2, 0);
        partial.castShadow = true;
        partial.receiveShadow = true;
        partial.userData = { isCollidable: true, type: 'building' };
        group.add(partial);

        const interiorGeom = new THREE.BoxGeometry(partialWidth - 0.3, height - partialHeight, depth - 0.3);
        const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });
        const interior = new THREE.Mesh(interiorGeom, interiorMat);
        interior.position.set(width / 2 - partialWidth / 2, partialHeight + (height - partialHeight) / 2, 0);
        group.add(interior);
    }

    /**
     * Create a building with a hole/damage
     */
    createBuildingWithHole(group, width, depth, height, material) {
        const bodyGeom = new THREE.BoxGeometry(width, height, depth);
        const body = new THREE.Mesh(bodyGeom, material);
        body.position.y = height / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData = { isCollidable: true, type: 'building' };
        group.add(body);

        const holeHeight = 3 + Math.random() * 6;
        const holeWidth = 2 + Math.random() * 3;
        const holeY = 3 + Math.random() * (height - holeHeight - 3);
        
        const holeGeom = new THREE.BoxGeometry(holeWidth, holeHeight, 1);
        const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 });
        const hole = new THREE.Mesh(holeGeom, holeMat);
        hole.position.set(
            (Math.random() - 0.5) * (width - holeWidth),
            holeY,
            depth / 2 + 0.1
        );
        group.add(hole);
    }

    /**
     * Add windows to a building
     */
    addBuildingWindows(group, width, depth, height, floors, isDamaged) {
        const windowWidth = 1;
        const windowHeight = 1.5;
        const floorHeight = 3;
        
        const windowsX = Math.max(1, Math.floor(width / 2.5));
        const windowsZ = Math.max(1, Math.floor(depth / 2.5));
        
        const actualFloors = Math.floor(height / floorHeight);

        for (let floor = 0; floor < actualFloors; floor++) {
            const floorY = floor * floorHeight + floorHeight * 0.6;
            
            for (let w = 0; w < windowsX; w++) {
                if (Math.random() < 0.2) continue;
                
                const windowX = -width / 2 + width / (windowsX + 1) * (w + 1);
                
                let winMat = this.materials.window;
                if (!isDamaged && Math.random() < 0.05) {
                    winMat = this.materials.windowLit;
                }
                
                const winGeom = new THREE.PlaneGeometry(windowWidth, windowHeight);
                
                const winFront = new THREE.Mesh(winGeom, winMat);
                winFront.position.set(windowX, floorY, depth / 2 + 0.05);
                group.add(winFront);
                
                const winBack = new THREE.Mesh(winGeom, winMat);
                winBack.position.set(windowX, floorY, -depth / 2 - 0.05);
                winBack.rotation.y = Math.PI;
                group.add(winBack);
            }
        }

        for (let floor = 0; floor < actualFloors; floor++) {
            const floorY = floor * floorHeight + floorHeight * 0.6;
            
            for (let w = 0; w < windowsZ; w++) {
                if (Math.random() < 0.2) continue;
                
                const windowZ = -depth / 2 + depth / (windowsZ + 1) * (w + 1);
                
                const winMat = this.materials.window;
                const winGeom = new THREE.PlaneGeometry(windowWidth, windowHeight);
                
                const winRight = new THREE.Mesh(winGeom, winMat);
                winRight.position.set(width / 2 + 0.05, floorY, windowZ);
                winRight.rotation.y = Math.PI / 2;
                group.add(winRight);
                
                const winLeft = new THREE.Mesh(winGeom, winMat);
                winLeft.position.set(-width / 2 - 0.05, floorY, windowZ);
                winLeft.rotation.y = -Math.PI / 2;
                group.add(winLeft);
            }
        }
    }

    /**
     * Add roof details
     */
    addRoofDetails(group, width, depth, height) {
        const detailCount = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < detailCount; i++) {
            const detailType = Math.floor(Math.random() * 3);
            
            if (detailType === 0) {
                const acGeom = new THREE.BoxGeometry(1.5, 0.8, 1);
                const ac = new THREE.Mesh(acGeom, this.materials.rustyMetal);
                ac.position.set(
                    (Math.random() - 0.5) * (width - 2),
                    height + 0.4,
                    (Math.random() - 0.5) * (depth - 2)
                );
                ac.castShadow = true;
                ac.userData = { isCollidable: true };
                group.add(ac);
            } else if (detailType === 1) {
                const ventGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
                const vent = new THREE.Mesh(ventGeom, this.materials.rustyMetal);
                vent.position.set(
                    (Math.random() - 0.5) * (width - 1),
                    height + 0.75,
                    (Math.random() - 0.5) * (depth - 1)
                );
                vent.castShadow = true;
                vent.userData = { isCollidable: true };
                group.add(vent);
            } else {
                const tankGeom = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
                const tank = new THREE.Mesh(tankGeom, this.materials.rustyMetal);
                tank.position.set(
                    (Math.random() - 0.5) * (width - 2),
                    height + 1,
                    (Math.random() - 0.5) * (depth - 2)
                );
                tank.castShadow = true;
                tank.userData = { isCollidable: true };
                group.add(tank);
            }
        }
    }

    /**
     * Add ground floor details (entrances, awnings)
     */
    addGroundFloorDetails(group, width, depth) {
        const doorGeom = new THREE.BoxGeometry(1.5, 2.5, 0.1);
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.8 });
        const door = new THREE.Mesh(doorGeom, doorMat);
        door.position.set(0, 1.25, depth / 2 + 0.05);
        group.add(door);

        if (Math.random() > 0.6) {
            const awningGeom = new THREE.BoxGeometry(3, 0.1, 1.5);
            const awningMat = new THREE.MeshStandardMaterial({ 
                color: Math.random() > 0.5 ? 0x3a2020 : 0x203a20, 
                roughness: 0.9 
            });
            const awning = new THREE.Mesh(awningGeom, awningMat);
            awning.position.set(0, 2.8, depth / 2 + 0.7);
            awning.rotation.x = -0.2;
            awning.castShadow = true;
            group.add(awning);
        }
    }

    /**
     * Add rubble around damaged building
     */
    addBuildingRubble(group, width, depth) {
        const rubbleCount = 5 + Math.floor(Math.random() * 10);
        
        for (let i = 0; i < rubbleCount; i++) {
            const size = 0.2 + Math.random() * 0.8;
            const rubbleGeom = new THREE.BoxGeometry(size, size * 0.5, size);
            const rubble = new THREE.Mesh(rubbleGeom, this.materials.debris);
            
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.max(width, depth) / 2 + 0.5 + Math.random() * 2;
            
            rubble.position.set(
                Math.cos(angle) * distance,
                size * 0.25,
                Math.sin(angle) * distance
            );
            rubble.rotation.set(
                Math.random() * 0.5,
                Math.random() * Math.PI,
                Math.random() * 0.5
            );
            rubble.castShadow = true;
            rubble.receiveShadow = true;
            rubble.userData = { isCollidable: true };
            group.add(rubble);
        }
    }

    /**
     * Create sidewalks around a block
     */
    createBlockSidewalks(blockX, blockZ, blockSize, roadWidth) {
        const sidewalkWidth = 2;
        const sidewalkHeight = 0.15;
        
        const positions = [
            [blockX, blockZ - blockSize / 2 - sidewalkWidth / 2, blockSize, sidewalkWidth],
            [blockX, blockZ + blockSize / 2 + sidewalkWidth / 2, blockSize, sidewalkWidth],
            [blockX - blockSize / 2 - sidewalkWidth / 2, blockZ, sidewalkWidth, blockSize],
            [blockX + blockSize / 2 + sidewalkWidth / 2, blockZ, sidewalkWidth, blockSize],
        ];
        
        for (const [x, z, w, d] of positions) {
            const sidewalkGeom = new THREE.BoxGeometry(w, sidewalkHeight, d);
            const sidewalk = new THREE.Mesh(sidewalkGeom, this.materials.sidewalk);
            sidewalk.position.set(x, sidewalkHeight / 2, z);
            sidewalk.receiveShadow = true;
            sidewalk.userData = { type: 'sidewalk', isCollidable: true, isGround: true };
            this.scene.add(sidewalk);
            this._cityObjects.push(sidewalk);
            this.colliders.push(sidewalk);
        }
    }

    /**
     * Create a debris pile
     */
    createDebrisPile(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        
        const pieceCount = 10 + Math.floor(Math.random() * 15);
        
        for (let i = 0; i < pieceCount; i++) {
            const size = 0.3 + Math.random() * 1;
            const geom = Math.random() > 0.5 
                ? new THREE.BoxGeometry(size, size * 0.4, size * 0.8)
                : new THREE.CylinderGeometry(size * 0.3, size * 0.4, size, 6);
            
            const piece = new THREE.Mesh(geom, this.materials.debris);
            piece.position.set(
                (Math.random() - 0.5) * 3,
                size * 0.2,
                (Math.random() - 0.5) * 3
            );
            piece.rotation.set(
                Math.random() * Math.PI * 0.3,
                Math.random() * Math.PI,
                Math.random() * Math.PI * 0.3
            );
            piece.castShadow = true;
            piece.receiveShadow = true;
            piece.userData = { isCollidable: true };
            group.add(piece);
        }
        
        group.userData = { type: 'debris', isCollidable: true };
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
    }

    /**
     * Add environmental details (lampposts, vehicles, trash, etc)
     */
    addEnvironmentalDetails(cfg, totalWidth, totalDepth) {
        this.addLampposts(cfg, totalWidth, totalDepth);
        this.addAbandonedVehicles(cfg, totalWidth, totalDepth);
        this.addRoadDebris(totalWidth, totalDepth);
        this.addDeadTrees(cfg, totalWidth, totalDepth);
    }

    /**
     * Add lampposts (some bent/broken)
     * ALL LAMPPOSTS NOW HAVE COLLISION
     */
    addLampposts(cfg, totalWidth, totalDepth) {
        const startX = -totalWidth / 2 + cfg.roadWidth;
        const startZ = -totalDepth / 2 + cfg.roadWidth;
        
        for (let bx = 0; bx < cfg.blocksX; bx++) {
            for (let bz = 0; bz < cfg.blocksZ; bz++) {
                if ((bx + bz) % 2 !== 0) continue;
                
                const blockX = startX + bx * (cfg.blockSize + cfg.roadWidth);
                const blockZ = startZ + bz * (cfg.blockSize + cfg.roadWidth);
                
                const corners = [
                    [blockX - 2, blockZ - 2],
                    [blockX + cfg.blockSize + 2, blockZ - 2],
                ];
                
                for (const [cx, cz] of corners) {
                    if (Math.random() > 0.7) continue;
                    
                    this.createLamppost(cx, cz, Math.random() < 0.3);
                }
            }
        }
    }

    /**
     * Create a lamppost (optionally bent)
     * FULL COLLISION SUPPORT
     */
    createLamppost(x, z, isBent) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        
        const poleHeight = 4;
        const poleRadius = 0.1;
        
        // Pole with collision
        const poleGeom = new THREE.CylinderGeometry(0.08, 0.12, poleHeight, 8);
        const pole = new THREE.Mesh(poleGeom, this.materials.rustyMetal);
        pole.position.y = poleHeight / 2;
        pole.castShadow = true;
        pole.userData = { isCollidable: true, type: 'lamppost' };
        group.add(pole);
        
        if (isBent) {
            const bendAngle = Math.random() * 0.15;
            const bendDirection = Math.random() * Math.PI * 2;
            pole.rotation.x = Math.cos(bendDirection) * bendAngle;
            pole.rotation.z = Math.sin(bendDirection) * bendAngle;
        }
        
        // Lamp arm
        const armLength = 1.0;
        const armGeom = new THREE.BoxGeometry(armLength, 0.08, 0.08);
        const arm = new THREE.Mesh(armGeom, this.materials.rustyMetal);
        arm.position.y = poleHeight;
        arm.position.x = armLength / 2;
        group.add(arm);
        
        // Lamp head
        const lampGeom = new THREE.BoxGeometry(0.3, 0.2, 0.25);
        const lamp = new THREE.Mesh(lampGeom, this.materials.rustyMetal);
        lamp.position.y = poleHeight - 0.1;
        lamp.position.x = armLength;
        group.add(lamp);
        
        group.userData = { type: 'lamppost', isCollidable: true };
        
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        
        // Create dedicated collision cylinder for the pole
        this.createPoleCollider(x, z, poleRadius, poleHeight);
    }

    /**
     * Create an invisible collision cylinder for a pole
     */
    createPoleCollider(x, z, radius, height) {
        const colliderGeom = new THREE.CylinderGeometry(radius + 0.1, radius + 0.15, height, 8);
        const colliderMat = new THREE.MeshBasicMaterial({ 
            visible: false,
            transparent: true,
            opacity: 0
        });
        const collider = new THREE.Mesh(colliderGeom, colliderMat);
        collider.position.set(x, height / 2, z);
        collider.userData = { 
            isCollidable: true, 
            type: 'poleCollider',
            isCollisionOnly: true
        };
        this.scene.add(collider);
        this._cityObjects.push(collider);
        this.colliders.push(collider);
    }

    /**
     * Add abandoned vehicles
     */
    addAbandonedVehicles(cfg, totalWidth, totalDepth) {
        // Scale vehicle count with city size
        const vehicleCount = Math.floor((cfg.blocksX * cfg.blocksZ) / 2);
        
        for (let i = 0; i < vehicleCount; i++) {
            const x = (Math.random() - 0.5) * totalWidth * 0.9;
            const z = (Math.random() - 0.5) * totalDepth * 0.9;
            
            this.createAbandonedVehicle(x, z);
        }
    }

    /**
     * Create an abandoned vehicle
     * FULL COLLISION SUPPORT
     */
    createAbandonedVehicle(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = Math.random() * Math.PI * 2;
        
        const isVan = Math.random() > 0.7;
        
        const length = isVan ? 5 : 4;
        const width = isVan ? 2 : 1.8;
        const height = isVan ? 2 : 1.3;
        
        // Body with collision
        const bodyGeom = new THREE.BoxGeometry(length, height, width);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0x3a3a3a : 0x4a3a30,
            roughness: 0.9,
            metalness: 0.3
        });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.y = height / 2 + 0.3;
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData = { isCollidable: true, type: 'vehicle' };
        group.add(body);
        
        if (!isVan) {
            const cabinGeom = new THREE.BoxGeometry(length * 0.5, height * 0.6, width - 0.1);
            const cabin = new THREE.Mesh(cabinGeom, bodyMat);
            cabin.position.set(-length * 0.1, height + height * 0.3, 0);
            cabin.castShadow = true;
            cabin.userData = { isCollidable: true };
            group.add(cabin);
            
            const windowGeom = new THREE.BoxGeometry(length * 0.48, height * 0.4, width - 0.2);
            const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2 });
            const windows = new THREE.Mesh(windowGeom, windowMat);
            windows.position.set(-length * 0.1, height + height * 0.35, 0);
            group.add(windows);
        }
        
        // Wheels
        const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        
        const wheelPositions = [
            [length / 2 - 0.5, 0.15, width / 2 + 0.1],
            [length / 2 - 0.5, 0.15, -width / 2 - 0.1],
            [-length / 2 + 0.5, 0.15, width / 2 + 0.1],
            [-length / 2 + 0.5, 0.15, -width / 2 - 0.1],
        ];
        
        for (const [wx, wy, wz] of wheelPositions) {
            const wheel = new THREE.Mesh(wheelGeom, wheelMat);
            wheel.position.set(wx, wy, wz);
            wheel.rotation.x = Math.PI / 2;
            if (Math.random() > 0.8) continue;
            if (Math.random() > 0.7) wheel.scale.y = 0.5;
            group.add(wheel);
        }
        
        group.userData = { type: 'vehicle', isCollidable: true };
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        
        // Create dedicated collision box for the vehicle
        this.createVehicleCollider(x, z, length, width, height, group.rotation.y);
    }

    /**
     * Create an invisible collision box for a vehicle
     */
    createVehicleCollider(x, z, length, width, height, rotationY) {
        const colliderGeom = new THREE.BoxGeometry(length, height + 0.5, width);
        const colliderMat = new THREE.MeshBasicMaterial({ 
            visible: false,
            transparent: true,
            opacity: 0
        });
        const collider = new THREE.Mesh(colliderGeom, colliderMat);
        collider.position.set(x, (height + 0.5) / 2 + 0.3, z);
        collider.rotation.y = rotationY;
        collider.userData = { 
            isCollidable: true, 
            type: 'vehicleCollider',
            isCollisionOnly: true
        };
        this.scene.add(collider);
        this._cityObjects.push(collider);
        this.colliders.push(collider);
    }

    /**
     * Add road debris (trash, barrels, etc)
     */
    addRoadDebris(totalWidth, totalDepth) {
        // Scale debris with city size
        const debrisCount = Math.floor(Math.sqrt(totalWidth * totalDepth) / 5);
        
        for (let i = 0; i < debrisCount; i++) {
            const x = (Math.random() - 0.5) * totalWidth;
            const z = (Math.random() - 0.5) * totalDepth;
            
            const debrisType = Math.floor(Math.random() * 4);
            
            if (debrisType === 0) {
                // Barrel with collision
                const barrelGeom = new THREE.CylinderGeometry(0.4, 0.4, 1, 12);
                const barrel = new THREE.Mesh(barrelGeom, this.materials.rustyMetal);
                barrel.position.set(x, 0.5, z);
                if (Math.random() > 0.5) {
                    barrel.rotation.x = Math.PI / 2;
                    barrel.position.y = 0.4;
                }
                barrel.castShadow = true;
                barrel.receiveShadow = true;
                barrel.userData = { isCollidable: true, type: 'barrel' };
                this.scene.add(barrel);
                this._cityObjects.push(barrel);
                this.colliders.push(barrel);
            } else if (debrisType === 1) {
                // Crate with collision
                const crateGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.9 });
                const crate = new THREE.Mesh(crateGeom, crateMat);
                crate.position.set(x, 0.4, z);
                crate.rotation.y = Math.random() * Math.PI;
                crate.castShadow = true;
                crate.receiveShadow = true;
                crate.userData = { isCollidable: true, type: 'crate' };
                this.scene.add(crate);
                this._cityObjects.push(crate);
                this.colliders.push(crate);
            } else if (debrisType === 2) {
                // Trash pile (no collision - small)
                const trashGeom = new THREE.ConeGeometry(0.5, 0.4, 6);
                const trashMat = new THREE.MeshStandardMaterial({ color: 0x2a2a25, roughness: 1 });
                const trash = new THREE.Mesh(trashGeom, trashMat);
                trash.position.set(x, 0.2, z);
                trash.castShadow = true;
                this.scene.add(trash);
                this._cityObjects.push(trash);
            } else {
                // Concrete block with collision
                const blockGeom = new THREE.BoxGeometry(
                    0.5 + Math.random() * 0.5,
                    0.3 + Math.random() * 0.3,
                    0.5 + Math.random() * 0.5
                );
                const block = new THREE.Mesh(blockGeom, this.materials.debris);
                block.position.set(x, 0.2, z);
                block.rotation.y = Math.random() * Math.PI;
                block.castShadow = true;
                block.receiveShadow = true;
                block.userData = { isCollidable: true, type: 'debris' };
                this.scene.add(block);
                this._cityObjects.push(block);
                this.colliders.push(block);
            }
        }
    }

    /**
     * Add dead/bare trees
     */
    addDeadTrees(cfg, totalWidth, totalDepth) {
        const treeCount = Math.floor((cfg.blocksX * cfg.blocksZ) / 1.5);
        
        for (let i = 0; i < treeCount; i++) {
            const x = (Math.random() - 0.5) * totalWidth * 0.95;
            const z = (Math.random() - 0.5) * totalDepth * 0.95;
            
            this.createDeadTree(x, z);
        }
    }

    /**
     * Create a dead/bare tree
     * WITH COLLISION ON TRUNK
     */
    createDeadTree(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        
        const height = 3 + Math.random() * 4;
        const trunkRadius = 0.15;
        
        // Trunk with collision
        const trunkGeom = new THREE.CylinderGeometry(0.1, 0.2, height, 6);
        const trunk = new THREE.Mesh(trunkGeom, this.materials.deadVegetation);
        trunk.position.y = height / 2;
        trunk.castShadow = true;
        trunk.userData = { isCollidable: true, type: 'tree' };
        group.add(trunk);
        
        // Branches (no collision - too thin)
        const branchCount = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < branchCount; i++) {
            const branchLength = 0.5 + Math.random() * 1.5;
            const branchGeom = new THREE.CylinderGeometry(0.02, 0.05, branchLength, 4);
            const branch = new THREE.Mesh(branchGeom, this.materials.deadVegetation);
            
            const branchY = height * (0.5 + Math.random() * 0.4);
            const angle = (i / branchCount) * Math.PI * 2 + Math.random() * 0.5;
            
            branch.position.set(
                Math.cos(angle) * 0.2,
                branchY,
                Math.sin(angle) * 0.2
            );
            branch.rotation.z = Math.PI / 2 - 0.3 - Math.random() * 0.4;
            branch.rotation.y = angle;
            branch.castShadow = true;
            group.add(branch);
        }
        
        if (Math.random() > 0.5) {
            const debrisGeom = new THREE.CircleGeometry(0.8, 6);
            const debris = new THREE.Mesh(debrisGeom, this.materials.deadVegetation);
            debris.rotation.x = -Math.PI / 2;
            debris.position.y = 0.01;
            group.add(debris);
        }
        
        group.userData = { type: 'tree', isCollidable: true };
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        
        // Create collision cylinder for tree trunk
        this.createPoleCollider(x, z, trunkRadius, height);
    }

    /**
     * Load terrain mesh (fallback if no city)
     */
    async loadTerrain(terrainData) {
        const geometry = new THREE.PlaneGeometry(
            terrainData.width || 500,
            terrainData.depth || 500,
            terrainData.segments || 50,
            terrainData.segments || 50
        );
        
        const material = new THREE.MeshStandardMaterial({
            color: terrainData.color || 0x3d3d35,
            roughness: 0.95,
            metalness: 0.0
        });
        
        const terrain = new THREE.Mesh(geometry, material);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        terrain.userData.type = 'terrain';
        terrain.userData.isCollidable = true;
        terrain.userData.isGround = true;
        
        this.scene.add(terrain);
        this.colliders.push(terrain);
        this._cityObjects.push(terrain);
    }

    /**
     * Create a static world object
     */
    createStaticObject(data) {
        const geometry = this.createGeometryFromType(data.geometry || 'box', data.size);
        const material = new THREE.MeshStandardMaterial({
            color: data.color || 0x505050,
            roughness: data.roughness || 0.8,
            metalness: data.metalness || 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        
        if (data.position) mesh.position.fromArray(data.position);
        if (data.rotation) mesh.rotation.fromArray(data.rotation);
        if (data.scale) mesh.scale.fromArray(data.scale);
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { ...data.userData, isCollidable: data.collidable !== false };
        
        this.scene.add(mesh);
        this._cityObjects.push(mesh);
        
        if (data.collidable !== false) {
            this.colliders.push(mesh);
        }
        
        return mesh;
    }

    createGeometryFromType(type, size = {}) {
        switch (type) {
            case 'box':
                return new THREE.BoxGeometry(size.x || 1, size.y || 1, size.z || 1);
            case 'sphere':
                return new THREE.SphereGeometry(size.radius || 0.5);
            case 'cylinder':
                return new THREE.CylinderGeometry(size.radius || 0.5, size.radius || 0.5, size.height || 1);
            case 'plane':
                return new THREE.PlaneGeometry(size.width || 1, size.height || 1);
            default:
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    /**
     * Build spatial hash grid for collision optimization
     */
    buildCollisionGrid() {
        this.collisionGrid.clear();
        
        for (const collider of this.colliders) {
            if (!collider.position) continue;
            
            const cellX = Math.floor(collider.position.x / this.collisionGridSize);
            const cellZ = Math.floor(collider.position.z / this.collisionGridSize);
            const key = `${cellX},${cellZ}`;
            
            if (!this.collisionGrid.has(key)) {
                this.collisionGrid.set(key, []);
            }
            this.collisionGrid.get(key).push(collider);
        }
        
        console.log(`Built collision grid with ${this.collisionGrid.size} cells`);
    }

    /**
     * Get nearby colliders using spatial hash
     */
    getNearbyColliders(position, radius = 20) {
        const result = [];
        const cellRadius = Math.ceil(radius / this.collisionGridSize);
        const centerX = Math.floor(position.x / this.collisionGridSize);
        const centerZ = Math.floor(position.z / this.collisionGridSize);
        
        for (let x = centerX - cellRadius; x <= centerX + cellRadius; x++) {
            for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z++) {
                const key = `${x},${z}`;
                const cell = this.collisionGrid.get(key);
                if (cell) {
                    result.push(...cell);
                }
            }
        }
        
        return result;
    }

    /**
     * Spawn an enemy
     */
    spawnEnemy(data) {
        let enemy;
        
        try {
            switch (data.type) {
                case 'mutant':
                    enemy = new Mutant(data);
                    break;
                case 'human':
                    enemy = new HumanEnemy(data);
                    break;
                default:
                    enemy = new Enemy(data);
            }
            
            if (data.position) {
                enemy.position.fromArray(data.position);
            } else if (this.spawnPoints.enemy.length > 0) {
                const spawnPoint = this.spawnPoints.enemy[
                    Math.floor(Math.random() * this.spawnPoints.enemy.length)
                ];
                enemy.position.fromArray(spawnPoint);
            }
            
            if (data.patrolPoints) {
                enemy.setPatrolRoute(data.patrolPoints.map(p => new THREE.Vector3().fromArray(p)));
            }
            
            enemy.init(this.game);
            
            if (enemy.mesh) {
                this.scene.add(enemy.mesh);
            }
            
            this.enemies.set(enemy.id, enemy);
            this.entities.set(enemy.id, enemy);
            this.addToSpatialGrid(enemy);
            
            globalEventBus.emit(GameEvents.ENEMY_SPAWN, { enemy });
            
            return enemy;
        } catch (e) {
            console.warn('Failed to spawn enemy:', e);
            return null;
        }
    }

    registerEnemy(enemy) {
        if (!this.enemies.has(enemy.id)) {
            this.enemies.set(enemy.id, enemy);
        }
    }

    removeEnemy(enemy) {
        this.enemies.delete(enemy.id);
        this.entities.delete(enemy.id);
        this.removeFromSpatialGrid(enemy);
    }

    createInteractable(data) {
        const geometry = this.createGeometryFromType(data.geometry || 'box', data.size);
        const material = new THREE.MeshStandardMaterial({
            color: data.color || 0x6a6a50,
            emissive: 0x1a1a10,
            emissiveIntensity: 0.1
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.fromArray(data.position || [0, 0, 0]);
        mesh.castShadow = true;
        
        const interactable = {
            id: `interact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            mesh,
            type: data.type || 'generic',
            data: data.data || {},
            onInteract: data.onInteract || null,
            isActive: true
        };
        
        mesh.userData.interactable = interactable;
        mesh.userData.isInteractive = true;
        
        this.scene.add(mesh);
        this.interactables.set(interactable.id, interactable);
        
        return interactable;
    }

    spawnLoot(position, lootTable) {
        for (const loot of lootTable) {
            if (Math.random() < loot.chance) {
                const amount = Array.isArray(loot.amount)
                    ? Math.floor(loot.amount[0] + Math.random() * (loot.amount[1] - loot.amount[0]))
                    : loot.amount;
                
                this.createPickup({
                    item: loot.item,
                    amount,
                    position: [
                        position.x + (Math.random() - 0.5) * 2,
                        position.y + 0.5,
                        position.z + (Math.random() - 0.5) * 2
                    ]
                });
            }
        }
    }

    createPickup(data) {
        const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const material = new THREE.MeshStandardMaterial({
            color: this.getItemColor(data.item),
            emissive: this.getItemColor(data.item),
            emissiveIntensity: 0.2
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.fromArray(data.position);
        mesh.castShadow = true;
        
        const pickup = {
            id: `pickup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            mesh,
            item: data.item,
            amount: data.amount || 1,
            isActive: true,
            bobOffset: Math.random() * Math.PI * 2
        };
        
        mesh.userData.pickup = pickup;
        mesh.userData.isInteractive = true;
        
        this.scene.add(mesh);
        this.pickups.set(pickup.id, pickup);
        
        return pickup;
    }

    getItemColor(itemType) {
        const colors = {
            'ammo': 0xaa8800,
            'medkit': 0x00aa00,
            'bandage': 0xcccccc,
            'food': 0x8b4513,
            'weapon': 0x666666,
            'artifact': 0xaa00aa
        };
        
        for (const [key, color] of Object.entries(colors)) {
            if (itemType.includes(key)) return color;
        }
        
        return 0x888888;
    }

    collectPickup(pickupId) {
        const pickup = this.pickups.get(pickupId);
        if (!pickup || !pickup.isActive) return null;
        
        pickup.isActive = false;
        this.scene.remove(pickup.mesh);
        pickup.mesh.geometry.dispose();
        pickup.mesh.material.dispose();
        this.pickups.delete(pickupId);
        
        return { item: pickup.item, amount: pickup.amount };
    }

    // Spatial Grid Methods
    addToSpatialGrid(entity) {
        const cellKey = this.getCellKey(entity.position);
        
        if (!this.spatialGrid.has(cellKey)) {
            this.spatialGrid.set(cellKey, new Set());
        }
        
        this.spatialGrid.get(cellKey).add(entity.id);
        entity._gridCell = cellKey;
    }

    removeFromSpatialGrid(entity) {
        if (entity._gridCell) {
            const cell = this.spatialGrid.get(entity._gridCell);
            if (cell) {
                cell.delete(entity.id);
            }
        }
    }

    updateSpatialGrid(entity) {
        const newCellKey = this.getCellKey(entity.position);
        
        if (entity._gridCell !== newCellKey) {
            this.removeFromSpatialGrid(entity);
            this.addToSpatialGrid(entity);
        }
    }

    getCellKey(position) {
        const x = Math.floor(position.x / this.gridCellSize);
        const z = Math.floor(position.z / this.gridCellSize);
        return `${x},${z}`;
    }

    getNearbyEntities(position, radius, tag = null) {
        const results = [];
        const cellRadius = Math.ceil(radius / this.gridCellSize);
        const centerX = Math.floor(position.x / this.gridCellSize);
        const centerZ = Math.floor(position.z / this.gridCellSize);
        
        for (let x = centerX - cellRadius; x <= centerX + cellRadius; x++) {
            for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z++) {
                const cellKey = `${x},${z}`;
                const cell = this.spatialGrid.get(cellKey);
                
                if (cell) {
                    for (const entityId of cell) {
                        const entity = this.entities.get(entityId);
                        if (entity && entity.isActive) {
                            if (tag === null || (entity.hasTag && entity.hasTag(tag))) {
                                const distance = entity.position.distanceTo(position);
                                if (distance <= radius) {
                                    results.push({ entity, distance });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        results.sort((a, b) => a.distance - b.distance);
        return results.map(r => r.entity);
    }

    // Bullet Pool Methods
    getBullet() {
        for (const bullet of this.pools.bullets) {
            if (!bullet.userData.active) {
                bullet.userData.active = true;
                bullet.visible = true;
                return bullet;
            }
        }
        return null;
    }

    returnBullet(bullet) {
        bullet.userData.active = false;
        bullet.visible = false;
    }

    // Raycasting and Collision
    raycast(origin, direction, maxDistance = 100) {
        const raycaster = new THREE.Raycaster(origin, direction, 0, maxDistance);
        
        // Use nearby colliders for optimization in large city
        const nearbyColliders = this.getNearbyColliders(origin, maxDistance);
        const intersects = raycaster.intersectObjects(nearbyColliders.length > 0 ? nearbyColliders : this.colliders, true);
        
        return intersects.length > 0 ? intersects[0] : null;
    }

    /**
     * Optimized raycast using spatial hash
     */
    raycastOptimized(origin, direction, maxDistance = 100) {
        const raycaster = new THREE.Raycaster(origin, direction, 0, maxDistance);
        
        // Get colliders along the ray path
        const nearbyColliders = this.getCollidersAlongRay(origin, direction, maxDistance);
        
        if (nearbyColliders.length === 0) {
            return null;
        }
        
        const intersects = raycaster.intersectObjects(nearbyColliders, true);
        
        // Filter to only collidable objects
        for (const hit of intersects) {
            if (hit.object.userData?.isCollidable) {
                return hit;
            }
            // Check parent
            let parent = hit.object.parent;
            while (parent) {
                if (parent.userData?.isCollidable) {
                    return hit;
                }
                parent = parent.parent;
            }
        }
        
        return intersects.length > 0 ? intersects[0] : null;
    }

    /**
     * Get colliders along a ray path
     */
    getCollidersAlongRay(origin, direction, maxDistance) {
        const result = new Set();
        const step = this.collisionGridSize;
        const steps = Math.ceil(maxDistance / step);
        
        for (let i = 0; i <= steps; i++) {
            const point = origin.clone().addScaledVector(direction, i * step);
            const cellX = Math.floor(point.x / this.collisionGridSize);
            const cellZ = Math.floor(point.z / this.collisionGridSize);
            
            // Check this cell and neighbors
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${cellX + dx},${cellZ + dz}`;
                    const cell = this.collisionGrid.get(key);
                    if (cell) {
                        cell.forEach(collider => result.add(collider));
                    }
                }
            }
        }
        
        return Array.from(result);
    }

    checkCollision(box) {
        for (const collider of this.colliders) {
            try {
                const colliderBox = new THREE.Box3().setFromObject(collider);
                if (box.intersectsBox(colliderBox)) {
                    return { collider, box: colliderBox };
                }
            } catch (e) {
                // Skip invalid colliders
            }
        }
        return null;
    }

    /**
     * Optimized collision check using spatial hash
     */
    checkCollisionOptimized(position, radius) {
        const nearbyColliders = this.getNearbyColliders(position, radius * 2);
        
        for (const collider of nearbyColliders) {
            if (!collider.userData?.isCollidable) continue;
            if (collider.userData?.isGround) continue; // Skip ground for horizontal collision
            
            try {
                const colliderBox = new THREE.Box3().setFromObject(collider);
                const playerBox = new THREE.Box3().setFromCenterAndSize(
                    position,
                    new THREE.Vector3(radius * 2, 1.8, radius * 2)
                );
                
                if (playerBox.intersectsBox(colliderBox)) {
                    return { collider, box: colliderBox };
                }
            } catch (e) {
                // Skip invalid colliders
            }
        }
        return null;
    }

    calculateLevelBounds() {
        this.levelBounds.makeEmpty();
        
        for (const collider of this.colliders) {
            try {
                const box = new THREE.Box3().setFromObject(collider);
                this.levelBounds.union(box);
            } catch (e) {
                // Skip invalid colliders
            }
        }
        
        console.log('Level bounds calculated:', this.levelBounds);
    }

    /**
     * Update all world entities
     */
    update(deltaTime) {
        // Update entities
        for (const entity of this.entities.values()) {
            if (!entity.isActive) continue;
            
            if (entity.update) {
                entity.update(deltaTime);
            }
            this.updateSpatialGrid(entity);
        }
        
        // Update pickups (bob animation)
        for (const pickup of this.pickups.values()) {
            if (pickup.isActive && pickup.mesh) {
                pickup.bobOffset += deltaTime * 2;
                pickup.mesh.position.y = pickup.mesh.position.y * 0.95 + 
                    (0.5 + Math.sin(pickup.bobOffset) * 0.1) * 0.05;
                pickup.mesh.rotation.y += deltaTime * 0.5;
            }
        }
        
        // Update bullets
        for (const bullet of this.pools.bullets) {
            if (bullet.userData.active) {
                bullet.position.addScaledVector(bullet.userData.velocity, deltaTime);
                
                // Check for collisions using optimized raycast
                const hit = this.raycastOptimized(
                    bullet.position,
                    _bulletDir.copy(bullet.userData.velocity).normalize(),
                    bullet.userData.velocity.length() * deltaTime * 2
                );
                
                if (hit) {
                    this.onBulletHit(bullet, hit);
                    this.returnBullet(bullet);
                }
                
                // Check if out of range
                if (bullet.position.length() > 1000) {
                    this.returnBullet(bullet);
                }
            }
        }
    }

    /**
     * Handle bullet hit
     */
    onBulletHit(bullet, hit) {
        const hitObject = hit.object;
        
        // Traverse up to find entity
        let current = hitObject;
        while (current) {
            if (current.userData?.entityId) {
                const entity = this.entities.get(current.userData.entityId);
                if (entity && entity.takeDamage) {
                    entity.takeDamage(bullet.userData.damage || 10, bullet.userData.source);
                }
                break;
            }
            current = current.parent;
        }
        
        // Spawn impact effect
        globalEventBus.emit('effect:impact', {
            position: hit.point,
            normal: hit.face?.normal || new THREE.Vector3(0, 1, 0),
            type: hitObject.userData?.material || 'concrete'
        });

        // Create bullet hole decal
        this.createBulletHole(hit.point, hit.face?.normal);
    }

    /**
     * Create a bullet hole decal
     */
    createBulletHole(position, normal) {
        const holeGeom = new THREE.CircleGeometry(0.05, 8);
        const holeMat = new THREE.MeshBasicMaterial({ 
            color: 0x1a1a1a,
            transparent: true,
            opacity: 0.8,
            depthWrite: false
        });
        const hole = new THREE.Mesh(holeGeom, holeMat);
        
        hole.position.copy(position);
        if (normal) {
            hole.lookAt(position.clone().add(normal));
        }
        hole.position.addScaledVector(normal || new THREE.Vector3(0, 0, 1), 0.01);
        
        this.scene.add(hole);
        this._cityObjects.push(hole);
        
        // Remove after some time
        setTimeout(() => {
            this.scene.remove(hole);
            hole.geometry.dispose();
            hole.material.dispose();
            const idx = this._cityObjects.indexOf(hole);
            if (idx > -1) this._cityObjects.splice(idx, 1);
        }, 30000);
    }

    /**
     * Clear current level
     */
    clearLevel() {
        console.log('Clearing level...');
        
        // Remove entities
        for (const entity of this.entities.values()) {
            if (entity.destroy) entity.destroy();
        }
        this.entities.clear();
        this.enemies.clear();
        
        // Remove interactables
        for (const interactable of this.interactables.values()) {
            this.scene.remove(interactable.mesh);
            if (interactable.mesh.geometry) interactable.mesh.geometry.dispose();
            if (interactable.mesh.material) interactable.mesh.material.dispose();
        }
        this.interactables.clear();
        
        // Remove pickups
        for (const pickup of this.pickups.values()) {
            this.scene.remove(pickup.mesh);
            if (pickup.mesh.geometry) pickup.mesh.geometry.dispose();
            if (pickup.mesh.material) pickup.mesh.material.dispose();
        }
        this.pickups.clear();
        
        // Remove city objects
        for (const obj of this._cityObjects) {
            try {
                if (obj.parent) {
                    obj.parent.remove(obj);
                } else {
                    this.scene.remove(obj);
                }
                
                // Dispose of geometries and materials
                if (obj.traverse) {
                    obj.traverse((child) => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m && m.dispose && m.dispose());
                            } else if (child.material.dispose) {
                                child.material.dispose();
                            }
                        }
                    });
                } else {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(m => m && m.dispose && m.dispose());
                        } else if (obj.material.dispose) {
                            obj.material.dispose();
                        }
                    }
                }
            } catch (e) {
                // Ignore disposal errors
            }
        }
        this._cityObjects = [];

        // Clear colliders
        this.colliders = [];

        // Clear spatial grid
        this.spatialGrid.clear();
        
        // Clear collision grid
        this.collisionGrid.clear();
        
        // Clear city reference
        this.city = null;
        this.currentLevel = null;
        
        console.log('Level cleared');
    }

    /**
     * Serialize world state for saving
     */
    serialize() {
        return {
            level: this.currentLevel?.name,
            entities: Array.from(this.entities.values())
                .filter(e => e.serialize)
                .map(e => e.serialize()),
            pickups: Array.from(this.pickups.values()).map(p => ({
                item: p.item,
                amount: p.amount,
                position: p.mesh.position.toArray()
            }))
        };
    }

    /**
     * Get player spawn position
     */
    getPlayerSpawnPosition() {
        if (this.spawnPoints.player && this.spawnPoints.player.length > 0) {
            const spawn = this.spawnPoints.player[0];
            return new THREE.Vector3(spawn[0], spawn[1], spawn[2]);
        }
        return new THREE.Vector3(0, 1, 0);
    }

    /**
     * Get random enemy spawn position
     */
    getRandomEnemySpawnPosition() {
        if (this.spawnPoints.enemy && this.spawnPoints.enemy.length > 0) {
            const spawn = this.spawnPoints.enemy[
                Math.floor(Math.random() * this.spawnPoints.enemy.length)
            ];
            return new THREE.Vector3(spawn[0], spawn[1], spawn[2]);
        }
        
        // Random position in city
        if (this.city) {
            const totalWidth = this.city.blocksX * this.city.blockSize;
            const totalDepth = this.city.blocksZ * this.city.blockSize;
            return new THREE.Vector3(
                (Math.random() - 0.5) * totalWidth * 0.8,
                0,
                (Math.random() - 0.5) * totalDepth * 0.8
            );
        }
        
        return new THREE.Vector3(
            (Math.random() - 0.5) * 100,
            0,
            (Math.random() - 0.5) * 100
        );
    }

    /**
     * Find cover positions near a location (for AI)
     */
    findCoverPositions(position, radius = 20, count = 5) {
        const coverPositions = [];
        
        // Use nearby colliders for efficiency
        const nearbyColliders = this.getNearbyColliders(position, radius);
        
        for (const obj of nearbyColliders) {
            if (!obj.userData?.isCollidable) continue;
            if (obj.userData?.isGround) continue;
            if (!obj.position) continue;
            
            const distance = obj.position.distanceTo(position);
            if (distance > radius || distance < 2) continue;
            
            // Position behind object relative to threat
            const directionFromThreat = obj.position.clone().sub(position).normalize();
            const coverPos = obj.position.clone().add(directionFromThreat.multiplyScalar(2));
            coverPos.y = 0;
            
            coverPositions.push({
                position: coverPos,
                distance: distance,
                object: obj
            });
        }
        
        // Sort by distance and return top results
        coverPositions.sort((a, b) => a.distance - b.distance);
        return coverPositions.slice(0, count).map(c => c.position);
    }

    /**
     * Check if position has line of sight to another position
     */
    hasLineOfSight(from, to) {
        const direction = to.clone().sub(from).normalize();
        const distance = from.distanceTo(to);
        
        const hit = this.raycastOptimized(from, direction, distance);
        
        // If no hit or hit is very close to target, we have LOS
        if (!hit) return true;
        if (hit.distance > distance - 0.5) return true;
        
        return false;
    }

    /**
     * Get ground height at position
     */
    getGroundHeight(x, z) {
        const raycaster = new THREE.Raycaster(
            new THREE.Vector3(x, 100, z),
            new THREE.Vector3(0, -1, 0)
        );
        
        // Get nearby ground colliders
        const nearbyColliders = this.getNearbyColliders(new THREE.Vector3(x, 0, z), 20);
        const groundColliders = nearbyColliders.filter(c => 
            c.userData?.isGround || 
            c.userData?.type === 'ground' || 
            c.userData?.type === 'terrain' ||
            c.userData?.type === 'road' ||
            c.userData?.type === 'sidewalk'
        );
        
        const intersects = raycaster.intersectObjects(
            groundColliders.length > 0 ? groundColliders : this.colliders, 
            true
        );
        
        for (const hit of intersects) {
            if (hit.object.userData?.type === 'ground' || 
                hit.object.userData?.type === 'terrain' ||
                hit.object.userData?.type === 'road' ||
                hit.object.userData?.type === 'sidewalk' ||
                hit.object.userData?.isGround) {
                return hit.point.y;
            }
        }
        
        return 0;
    }

    /**
     * Get ground level at position (alias for Player.js compatibility)
     */
    getGroundLevel(x, z) {
        return this.getGroundHeight(x, z);
    }

    /**
     * Dispose of world manager
     */
    dispose() {
        console.log('Disposing WorldManager...');
        
        this.clearLevel();
        
        // Dispose bullet pool
        for (const bullet of this.pools.bullets) {
            this.scene.remove(bullet);
            bullet.geometry.dispose();
            bullet.material.dispose();
        }
        this.pools.bullets = [];

        // Remove default lights
        if (this._defaultLights) {
            Object.values(this._defaultLights).forEach(light => {
                if (light) this.scene.remove(light);
            });
            this._defaultLights = null;
        }

        // Dispose materials
        if (this.materials) {
            for (const key in this.materials) {
                const mat = this.materials[key];
                if (Array.isArray(mat)) {
                    mat.forEach(m => m && m.dispose && m.dispose());
                } else if (mat && mat.dispose) {
                    mat.dispose();
                }
            }
            this.materials = {};
        }
        
        console.log('WorldManager disposed');
    }
}