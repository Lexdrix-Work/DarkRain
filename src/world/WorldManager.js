import {buildTutorialTunnel} from './TutorialTunnel.js';
import { applyRelief } from './MaterialRelief.js';
import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';
import { Enemy, Mutant, HumanEnemy, PackHound, Lurker } from '../entities/Enemy.js';
import { getProceduralSet, preloadSurfaceTextures } from './ProceduralTextures.js';
import { seatOnGround } from './GroundPlacement.js';
import { buildAtlantaBlock, addStorefrontSign } from './AtlantaDistrict.js';
import { addFacadeDetails } from './StreetDetails.js';
import { buildEnterableBuilding } from './EnterableBuilding.js';
import { buildDistrictOutskirts } from './DistrictOutskirts.js';
import { createAtlantaGeography } from './AtlantaGeography.js';
import { preloadHumanAnimations } from '../systems/HumanAnimationSystem.js';
import { preloadAnatomicalActors } from '../entities/AnatomicalActor.js';
import { buildSedanModel } from './VehicleModel.js';
import { ItemMeshFactory } from '../systems/LootSystem.js';
import { StaticBatcher,makeBatchedDetailMaterial } from './StaticBatcher.js';
import { DebrisInstancer } from './DebrisInstancer.js';

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
        // Debris instancing (replaces thousands of meshes with 2 draw calls)
        this.debrisInstancer = null;
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
        
        // Building footprints for cheap shelter checks (EmissionSystem).
        // Recorded at generation time: { x, z, hw, hd }
        this.buildingFootprints = [];
        
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
        await Promise.all([preloadSurfaceTextures(this.game),preloadAnatomicalActors(),preloadHumanAnimations()]);
        this.setupMaterials();
        this.setupDefaultLights();
        this.setupAtmosphere();
        this.createObjectPools();
        this._initialized = true;
        console.log('WorldManager initialized');
    }

    setupEventListeners() {
        globalEventBus.on(GameEvents.ENEMY_DEATH, (data) => {
            // Delay removal so the death animation can play (~0.6s fall).
            // The enemy's updateDeathAnimation deactivates it when done;
            // this is a safety net in case the anim doesn't run.
            setTimeout(() => {
                if (data.enemy && this.entities.has(data.enemy.id)) {
                    this.removeEnemy(data.enemy);
                }
            }, 800);
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
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.01
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

        // Procedural detail: canvas-generated grain/stain/bump maps so surfaces
        // read as concrete, asphalt, dirt, metal and rubble instead of flat color
        for (const m of this.materials.buildingColors) this._applyProcedural(m, 'concrete', 2, 2);
        this._applyProcedural(this.materials.damaged, 'rubble', 2, 2);
        this._applyProcedural(this.materials.road, 'asphalt', 6, 6);
        this._applyProcedural(this.materials.crackedRoad, 'asphalt', 6, 6);
        this._applyProcedural(this.materials.sidewalk, 'concrete', 4, 4);
        this._applyProcedural(this.materials.ground, 'ground', 40, 40);
        this._applyProcedural(this.materials.rustyMetal, 'metal', 1, 1);
        this._applyProcedural(this.materials.debris, 'rubble', 2, 2);
        this._applyProcedural(this.materials.deadVegetation, 'ground', 10, 10);
        const windowSet=getProceduralSet('window');
        this.materials.window.map=windowSet.map;
        this.materials.window.color.set(0xffffff);
        this.materials.window.transparent=false;
        this.materials.window.opacity=1;
        this.materials.window.roughness=0.4;
        this.materials.window.metalness=0.15;
        this.materials.window.userData.surfaceKind='window';
    }

    /**
     * Apply a procedural texture set (map + bump) to a material.
     * Textures are cloned per material so repeat can differ per surface.
     */
    _applyProcedural(material, kind, repeatX = 1, repeatY = 1) {
        if (!material) return;
        try {
            const set = getProceduralSet(kind);
            material.userData.proceduralKind=kind;
            if (set.map) {
                const map = set.map.clone();
                map.repeat.set(repeatX, repeatY);
                map.needsUpdate = true;
                material.map = map;
            }
            if (set.bumpMap) {
                const bump = set.bumpMap.clone();
                bump.repeat.set(repeatX, repeatY);
                bump.needsUpdate = true;
                material.bumpMap = bump;
                material.bumpScale = set.bumpScale || 0.5;
            }
            if(set.roughnessMap){material.roughnessMap=set.roughnessMap.clone();material.roughnessMap.repeat.set(repeatX,repeatY);material.aoMap=material.roughnessMap;material.aoMapIntensity=.4;}
            if(set.normalMap){material.normalMap=set.normalMap.clone();material.normalMap.repeat.set(repeatX,repeatY);material.normalMap.needsUpdate=true;material.normalScale=new THREE.Vector2(.8,.8);applyRelief(material,set.heightMap,this.game,kind);}
            material.needsUpdate = true;
        } catch (e) {
            console.warn('Procedural texture failed for', kind, e);
        }
    }

    /**
     * Setup atmospheric lighting - OVERCAST DAYLIGHT
     */
    setupDefaultLights() {
        // Lighting is owned solely by DayNightCycle (single rig). This method
        // only clears stale lights so zones never double-light the scene.
        if (this._defaultLights) {
            Object.values(this._defaultLights).forEach(light => {
                if (light) this.scene.remove(light);
            });
        }
        this._defaultLights = {};
    }

    /**
     * Setup atmospheric effects - OVERCAST DAY
     */
    setupAtmosphere() {
        this.scene.background = new THREE.Color(0xa0a8b0);
        // Fog is owned by WeatherSystem (FogExp2, density-driven).
        // Re-apply it so level loads never clobber the weather fog.
        if (this.game?.weatherSystem) {
            this.game.weatherSystem.setupFog();
            this.game.weatherSystem.applyCurrentPreset?.();
        } else {
            // Increased fog distance for larger city
            this.scene.fog = null;
        }
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
        this.currentLevel = levelData;this.recipeSeed=((this.game.session?.worldSeed||777)^this._hashStr(levelData.name||''))>>>0;this._saveRng=this.recipeSeed||1;
        this.loadingAbort=new AbortController();
        const loadSignal=this.loadingAbort.signal;
        
        this.setupAtmosphere();
        
        if(levelData.tutorialTunnel)buildTutorialTunnel(this);
        else if (levelData.city) {
            console.log('Generating city with config:', levelData.city);
            await this.generateAbandonedCity(levelData.city,loadSignal);
        } else if (levelData.terrain) {
            await this.loadTerrain(levelData.terrain);
        }
        
        if(loadSignal.aborted)throw new DOMException('World preparation cancelled','AbortError');
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
    async generateAbandonedCity(cityData = {},signal=this.loadingAbort?.signal) {
        console.log('Generating abandoned city (20x size)...');
        
        const cfg = {
            // 20x area increase: 27x27 blocks
            blocksX: cityData.blocksX || 27,
            blocksZ: cityData.blocksZ || 27,
            blockSize: cityData.blockSize || 40,
            roadWidth: cityData.roadWidth || 8,
            buildingSpacing: cityData.buildingSpacing || 10,
            maxFloors: cityData.maxFloors || 12,
            minFloors: cityData.minFloors || 2,
            damageLevel: cityData.damageLevel || 0.5,
            // District identity drives architecture, palettes and ruin density
            district: cityData.district || 'outskirts',
            architecture: cityData.architecture || 'atlanta',
            ruinLevel: cityData.ruinLevel !== undefined ? cityData.ruinLevel : 0.65,
            // Rolling-hill terrain: amplitude in world units, flat urban-core radius
            terrainAmplitude: cityData.terrainAmplitude !== undefined ? cityData.terrainAmplitude : 11,
            terrainFlatRadius: cityData.terrainFlatRadius !== undefined ? cityData.terrainFlatRadius : 45,
            terrainSeed: cityData.terrainSeed || 1337,
        };

        this.city = cfg;
        this._initTerrain(cfg.terrainSeed + this._hashStr(cfg.district));

        const totalWidth = cfg.blocksX * cfg.blockSize + (cfg.blocksX + 1) * cfg.roadWidth;
        const totalDepth = cfg.blocksZ * cfg.blockSize + (cfg.blocksZ + 1) * cfg.roadWidth;
        this.atlantaGeography = cfg.architecture === 'atlanta' ? createAtlantaGeography(totalWidth, totalDepth) : null;
        this.atlantaParks = [];
        const startX = -totalWidth / 2 + cfg.roadWidth;
        const startZ = -totalDepth / 2 + cfg.roadWidth;

        console.log(`City dimensions: ${totalWidth}x${totalDepth} units`);

        // Create ground
        await this.createGround(totalWidth, totalDepth);

        // Create roads
        this.createRoads(cfg, startX, startZ, totalWidth, totalDepth);

        // Create city blocks with buildings
        await this.createCityBlocks(cfg, startX, startZ,signal);

        if (cfg.architecture === 'atlanta') await buildDistrictOutskirts(this, cfg, totalWidth, totalDepth, startZ,signal);
        if(signal?.aborted)throw new DOMException('World preparation cancelled','AbortError');
        // Add environmental details
        this.addEnvironmentalDetails(cfg, totalWidth, totalDepth);

        // Build debris InstancedMesh (3,000+ pieces -> 2 draw calls)
        if (this.debrisInstancer) {
            this.debrisInstancer.build();
        }

        // Merge the ~19k static meshes into a handful of draw calls.
        // Colliders are rebuilt from the same pass (kept functional).
        this._mergeStaticGeometry();

        console.log(`City generated: ${this._cityObjects.length} objects, ${this.colliders.length} colliders`);
    }

    /**
     * Merge all static city geometry into a handful of draw calls.
     *
     * Buckets meshes by material signature, bakes each building's color into
     * vertex colors (one shared vertex-colored material per texture kind) and
     * bakes each source material's texture repeat into the UVs so the merged
     * result looks identical. Collidable geometry is additionally merged per
     * spatial super-cell into invisible, raycastable chunks registered in the
     * fine collision grid - bullets and AI keep working, just faster.
     *
     * Kept as-is: the vertex-colored terrain mesh and InstancedMesh scatter.
     */
    _mergeStaticGeometry() {
        const batcher = new StaticBatcher();
        this.scene.updateMatrixWorld(true);

        // Map procedural texture canvases -> kind so every bucket can share
        // ONE texture instance (the old code cloned textures per building).
        if (!this._procKindByImage) {
            this._procKindByImage = new Map();
            this._masterTextures = new Set();
            for (const kind of ['window', 'brick', 'concrete', 'asphalt', 'ground', 'metal', 'rubble']) {
                try {
                    const set = getProceduralSet(kind);
            material.userData.proceduralKind=kind;
                    if (set && set.map && set.map.image) {
                        this._procKindByImage.set(set.map.image, kind);
                    }
                    if (set && set.map) this._masterTextures.add(set.map);
                    if (set && set.bumpMap) this._masterTextures.add(set.bumpMap);
                    if(set?.normalMap)this._masterTextures.add(set.normalMap);if(set?.roughnessMap)this._masterTextures.add(set.roughnessMap);
                    if(set?.heightMap)this._masterTextures.add(set.heightMap);
                } catch (e) { /* procedural set unavailable - bucket falls back to plain */ }
            }
        }

        // Shared resources that must survive the pass (reused across levels)
        const protectedGeoms = new Set(
            [this._winGeom, this._winFrameGeom, this._winSillGeom].filter(Boolean)
        );
        const protectedMats = new Set();
        for (const k in this.materials) {
            const m = this.materials[k];
            if (Array.isArray(m)) m.forEach(x => { if (x) protectedMats.add(x); });
            else if (m) protectedMats.add(m);
        }
        if (this._winFrameMat) protectedMats.add(this._winFrameMat);
        if (this._winSillMat) protectedMats.add(this._winSillMat);
        if (this._corniceMat) protectedMats.add(this._corniceMat);
        for(const mat of this._detailMaterials?.values() || []) protectedMats.add(mat);

        let sourceMeshes = 0;
        const keptObjects = new Set();

        for (const obj of [...this._cityObjects]) {
            // Keep the vertex-colored terrain and instanced scatter untouched
            let keep = !!obj.userData?.detachedCollider;
            if (obj.traverse) {
                obj.traverse(o => {
                    if (o.isInstancedMesh) keep = true;
                    if (o.isMesh && o.geometry && o.geometry.attributes.color) keep = true;
                });
            } else if (obj.isInstancedMesh) {
                keep = true;
            }
            if (keep) {
                keptObjects.add(obj);
                continue;
            }

            const meshes = [];
            if (obj.traverse) {
                obj.traverse(o => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); });
            } else if (obj.isMesh && !obj.isInstancedMesh) {
                meshes.push(obj);
            }

            for (const mesh of meshes) {
                const mat = mesh.material;
                if (!mat || Array.isArray(mat) || !mesh.geometry) continue;
                sourceMeshes++;

                // Invisible helpers go to the collision batch only, never visible
                if (mat.visible === false || mesh.userData.isCollisionOnly) {
                    batcher.addCollider(mesh.geometry, mesh.matrixWorld);
                } else {
                    const bucket = this._classifyStaticMaterial(mat);
                    const bakeColor = (bucket === 'glass' || bucket === 'glassLit') ? null : mat.color;
                    const uvRepeat = (bucket.indexOf('tex:') === 0 && mat.map)
                        ? [mat.map.repeat.x, mat.map.repeat.y]
                        : null;
                    batcher.add(mesh.geometry, mesh.matrixWorld, bucket, {
                        color: bakeColor,
                        uvRepeat: uvRepeat,
                        decorationOwner:mesh.userData.collapseDecoration
                    });
                    if (mesh.userData.isCollidable) {
                        batcher.addCollider(mesh.geometry, mesh.matrixWorld);
                    }
                }

                // Retire the original resources (frees thousands of cloned textures)
                if (!protectedGeoms.has(mesh.geometry)) mesh.geometry.dispose();
                if (!protectedMats.has(mat)) {
                    if (mat.map && !this._masterTextures.has(mat.map)) mat.map.dispose();
                    if (mat.bumpMap && !this._masterTextures.has(mat.bumpMap)) mat.bumpMap.dispose();
                    mat.dispose();
                }
            }

            if (obj.parent) obj.parent.remove(obj);
        }

        // Rebuild the object/collider lists around the merged output
        this._cityObjects = [...keptObjects];
        this.colliders = this.colliders.filter(c => keptObjects.has(c));

        const bucketDefs = [
            // [bucket, material, castShadow, receiveShadow, collidable]
            ['tex:concrete', this._mergedBucketMaterial('concrete', 0.9, 0.08), true, true, true],
            ['tex:brick', this._mergedBucketMaterial('brick', 0.95, 0.0), true, true, true],
            ['tex:window', this._mergedBucketMaterial('window', 0.4, 0.15), false, false, false],
            ['tex:rubble', this._mergedBucketMaterial('rubble', 0.95, 0.05), true, true, true],
            ['tex:asphalt', this._mergedBucketMaterial('asphalt', 0.9, 0.08), false, true, true],
            ['tex:metal', this._mergedBucketMaterial('metal', 0.7, 0.4), true, true, true],
            ['tex:ground', this._mergedBucketMaterial('ground', 0.95, 0.0), true, true, true],
            ['plain', new THREE.MeshStandardMaterial({
                vertexColors: true, roughness: 0.9, metalness: 0.08
            }), true, true, true],
            ['glass', new THREE.MeshStandardMaterial({
                color: 0x2a3a4a, roughness: 0.2, metalness: 0.6,
                transparent: true, opacity: 0.9
            }), false, false, false],
            ['glassLit', new THREE.MeshStandardMaterial({
                color: 0x5a4520, emissive: 0x4a3510, emissiveIntensity: 0.8,
                roughness: 0.3, metalness: 0.2
            }), false, false, false],
            ['basic', new THREE.MeshBasicMaterial({ vertexColors: true }), false, false, false]
        ];
        for(const [bucket,material] of this._detailMaterials || []) {
            const batchedMaterial=makeBatchedDetailMaterial(material);
            bucketDefs.push([bucket,batchedMaterial,false,true,false]);
        }
        for(const [bucket,material] of this._surfaceMaterials || []) bucketDefs.push([bucket,material,true,true,true]);

        let mergedMeshes = 0;
        for (const [bucket, material, castShadow, receiveShadow, collidable] of bucketDefs) {
            const mesh = batcher.buildBucket(bucket, material);
            if (!mesh) continue;
            mesh.castShadow = castShadow;
            mesh.receiveShadow = receiveShadow;
            mesh.userData = { ...mesh.userData,isCollidable: collidable, type: 'merged:' + bucket };
            this.scene.add(mesh);
            this._cityObjects.push(mesh);
            mergedMeshes++;
        }

        // Invisible collision chunks for the bullet/AI raycast grid.
        // NOT added to the scene: player collision raycasts scene children
        // (covered by the merged visuals); these serve world.colliders only.
        const colliderMaterial = new THREE.MeshBasicMaterial({
            visible: false, transparent: true, opacity: 0
        });
        const colliderMeshes = batcher.buildColliders(80, this.collisionGridSize, colliderMaterial);
        for (const cm of colliderMeshes) {
            this.colliders.push(cm);
            this._cityObjects.push(cm);
        }

        batcher.dispose();

        console.log(
            `StaticBatch: ${sourceMeshes} source meshes -> ` +
            `${mergedMeshes} merged visual meshes + ${colliderMeshes.length} collider chunks`
        );
    }

    /**
     * Classify a material into a merge bucket. Buckets share one material;
     * per-part color variation is baked into vertex colors by the caller.
     */
    _classifyStaticMaterial(mat) {
        if(mat.userData.staticBucket) return mat.userData.staticBucket;
        if(mat.userData.surfaceKind==='window') return 'tex:window';
        if (mat.isMeshBasicMaterial) return 'basic';
        if (mat.transparent) return 'glass';
        if (mat.emissive && mat.emissiveIntensity >= 0.5 && mat.emissive.getHex() !== 0) {
            return 'glassLit';
        }
        const img = mat.map && mat.map.image;
        if (img && this._procKindByImage && this._procKindByImage.has(img)) {
            return 'tex:' + this._procKindByImage.get(img);
        }
        // Preserve reflective finishes instead of turning chrome/paint into
        // the generic matte bucket. Color variation still lives in vertices.
        if(mat.isMeshStandardMaterial&&(mat.metalness>=0.18||mat.roughness<0.65)) {
            if(!this._surfaceMaterials)this._surfaceMaterials=new Map();
            const key=`surface:${mat.roughness.toFixed(2)}:${mat.metalness.toFixed(2)}`;
            if(!this._surfaceMaterials.has(key)) {
                const shared=mat.clone();shared.color.set(0xffffff);shared.vertexColors=true;
                this._surfaceMaterials.set(key,shared);
            }
            return key;
        }
        return 'plain';
    }

    /**
     * Shared vertex-colored standard material for a procedural texture kind.
     * The master texture is referenced directly (repeat 1: tiling is baked
     * into geometry UVs by the batcher).
     */
    _mergedBucketMaterial(kind, roughness, metalness) {
        const set = getProceduralSet(kind);
        const m = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: roughness,
            metalness: metalness
        });
        if (set.map) m.map = set.map;
        if (set.bumpMap) {
            m.bumpMap = set.bumpMap;
            m.bumpScale = set.bumpScale || 0.5;
        }
        if(set.roughnessMap){m.roughnessMap=set.roughnessMap;m.aoMap=set.aoMap;m.aoMapIntensity=.4;}
        if(set.normalMap){m.normalMap=set.normalMap;m.normalScale=new THREE.Vector2(.8,.8);applyRelief(m,set.heightMap,this.game,kind);}
        return m;
    }


    /**
     * Simple string hash for terrain seeding
     */
    _hashStr(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /**
     * Initialize seeded terrain noise (deterministic hills per district/zone)
     */
    _initTerrain(seed) {
        let s = (seed >>> 0) || 1;
        this._terrainRand = function() {
            s |= 0; s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this._terrainRand() * (i + 1));
            const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
        }
        this._noisePerm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) this._noisePerm[i] = p[i & 255];
        this._terrainReady = true;
    }

    _valueNoise2D(x, z) {
        const xi = Math.floor(x), zi = Math.floor(z);
        const xf = x - xi, zf = z - zi;
        const u = xf * xf * (3 - 2 * xf);
        const v = zf * zf * (3 - 2 * zf);
        const perm = this._noisePerm;
        const X = xi & 255, Z = zi & 255;
        const aa = perm[(perm[X] + Z) & 255] / 255;
        const ba = perm[(perm[(X + 1) & 255] + Z) & 255] / 255;
        const ab = perm[(perm[X] + Z + 1) & 255] / 255;
        const bb = perm[(perm[(X + 1) & 255] + Z + 1) & 255] / 255;
        return aa + (ba - aa) * u + (ab - aa) * v + (aa - ba - ab + bb) * u * v;
    }

    _fbm2(x, z, octaves) {
        let sum = 0, amp = 0.5, freq = 1, norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += amp * this._valueNoise2D(x * freq, z * freq);
            norm += amp; amp *= 0.5; freq *= 2.03;
        }
        return sum / norm;
    }

    /**
     * Terrain height at (x, z). Hills rise toward the outskirts while the
     * urban core stays gently rolling so streets remain walkable.
     * O(1) analytic query - safe to call before generation (returns 0).
     */
    getTerrainHeight(x, z) {
        if (!this._terrainReady) return 0;
        const cfg = this.city || {};
        const amplitude = cfg.terrainAmplitude !== undefined ? cfg.terrainAmplitude : 7;
        const hills = (this._fbm2(x * 0.012 + 31.7, z * 0.012 - 11.3, 4) - 0.5) * 2 * amplitude;
        const undulation = (this._fbm2(x * 0.06 - 5.1, z * 0.06 + 17.9, 2) - 0.5) * 2 * 1.2;
        const d = Math.sqrt(x * x + z * z);
        const flatRadius = cfg.terrainFlatRadius !== undefined ? cfg.terrainFlatRadius : 90;
        const m = Math.min(1, Math.max(0, (d - flatRadius) / 130));
        const eased = m * m * (3 - 2 * m);
        return hills * eased + undulation * (cfg.architecture==='atlanta' ? 0.2*eased : (0.2 + 0.8 * eased));
    }

    /**
     * Create rolling-hill terrain with vertex-color variation
     */
    async createGround(width, depth) {
        const size = Math.max(width, depth) + 500;
        const segs = 220;
        const groundGeom = new THREE.PlaneGeometry(size, size, segs, segs);
        groundGeom.rotateX(-Math.PI / 2);

        let workerResult=null;
        if(typeof Worker!=='undefined') {
            try {
                const {generateTerrainOffThread}=await import('../workers/TerrainClient.ts');
                workerResult=await generateTerrainOffThread({positions:groundGeom.attributes.position.array.slice(),permutation:this._noisePerm,config:this.city,spacing:size/segs});
            }catch(error){console.warn('Terrain worker unavailable; using local generation.',error);}
        }
        if(workerResult) {
            groundGeom.setAttribute('position',new THREE.BufferAttribute(workerResult.positions,3));
            groundGeom.setAttribute('normal',new THREE.BufferAttribute(workerResult.normals,3));
            groundGeom.setAttribute('color',new THREE.BufferAttribute(workerResult.colors,3));
        }
        const pos = groundGeom.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const cDirt = new THREE.Color(0x4a4238);
        const cDryGrass = new THREE.Color(0x5c5a38);
        const cConcrete = new THREE.Color(0x5a574e);
        const cScorch = new THREE.Color(0x2b2723);
        const tmp = new THREE.Color();

        if(!workerResult) {
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const h = this.getTerrainHeight(x, z);
            pos.setY(i, h); // exact analytic height - props and terrain now agree

            const n = this._fbm2(x * 0.03 + 91.2, z * 0.03 - 47.8, 3);
            const grassiness = Math.min(1, Math.max(0, (h + 1.5) / 9));
            tmp.copy(cDirt).lerp(cDryGrass, grassiness * 0.75);
            if (n > 0.60) tmp.lerp(cConcrete, 0.55);
            else if (n < 0.32) tmp.lerp(cScorch, 0.6);

            colors[i * 3] = tmp.r;
            colors[i * 3 + 1] = tmp.g;
            colors[i * 3 + 2] = tmp.b;
        }
        groundGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        groundGeom.computeVertexNormals();
        }

        const groundMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.96,
            metalness: 0.0
        });

        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.receiveShadow = true;
        ground.userData = { type: 'ground', isCollidable: true, isGround: true };
        this.scene.add(ground);
        this._cityObjects.push(ground);
        this.colliders.push(ground);
        // Kept as a direct reference: bullets raycast it via the collision
        // grid helpers, while the per-frame player ground check skips it
        // (45k triangles) and uses the analytic getTerrainHeight instead.
        this.terrainMesh = ground;
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
        // Subdivided plane draped over the terrain - no floating/clipping on slopes
        const roadGeom = new THREE.PlaneGeometry(width, depth, 12, 12);
        roadGeom.rotateX(-Math.PI / 2);
        const rp = roadGeom.attributes.position;
        for (let i = 0; i < rp.count; i++) {
            const wx = x + rp.getX(i);
            const wz = z + rp.getZ(i);
            rp.setY(i, this.getTerrainHeight(wx, wz) + 0.04);
        }
        roadGeom.computeVertexNormals();
        const roadMat = new THREE.MeshStandardMaterial({color:0xa0a8ad,roughness:0.94,metalness:0.01});
        this._applyProcedural(roadMat,'asphalt',width/.75,depth/.75);
        
        const road = new THREE.Mesh(roadGeom, roadMat);
        road.position.set(x, 0, z);
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
        const crackCount = Math.floor(this.worldRandom() * 5) + 2;
        
        for (let i = 0; i < crackCount; i++) {
            const crackX = x + (this.worldRandom() - 0.5) * width * 0.8;
            const crackZ = z + (this.worldRandom() - 0.5) * depth * 0.8;
            
            const crackLength = 1 + this.worldRandom() * 3;
            const crackWidth = 0.012 + this.worldRandom() * 0.018;
            
            const path=new THREE.Shape();path.moveTo(-crackWidth/2,0);
            for(let step=1;step<=5;step++)path.lineTo(Math.sin(step*1.7)*.055-crackWidth/2,step*crackLength/5);
            for(let step=5;step>=0;step--)path.lineTo(Math.sin(step*1.7)*.055+crackWidth/2,step*crackLength/5);
            path.closePath();const crackGeom=new THREE.ShapeGeometry(path);
            const crackMat = new THREE.MeshStandardMaterial({color:0x202523,roughness:1});
            const crack = new THREE.Mesh(crackGeom, crackMat);
            crack.rotation.x = -Math.PI / 2;
            crack.rotation.z = this.worldRandom() * Math.PI;
            crack.position.set(crackX, this.getTerrainHeight(crackX, crackZ) + 0.06, crackZ);
            this.scene.add(crack);
            this._cityObjects.push(crack);
        }

        if (this.worldRandom() < 0.3) {
            const holeX = x + (this.worldRandom() - 0.5) * width * 0.6;
            const holeZ = z + (this.worldRandom() - 0.5) * depth * 0.6;
            const holeSize = 0.5 + this.worldRandom() * 1;
            
            const holeGeom = new THREE.CircleGeometry(holeSize, 8);
            const holeMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
            const hole = new THREE.Mesh(holeGeom, holeMat);
            hole.rotation.x = -Math.PI / 2;
            hole.position.set(holeX, this.getTerrainHeight(holeX, holeZ) + 0.055, holeZ);
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
                if (this.worldRandom() > 0.7) continue;
                
                const dashGeom = new THREE.PlaneGeometry(2, 0.15);
                const dashMat = new THREE.MeshBasicMaterial({ color: markingColor });
                const dash = new THREE.Mesh(dashGeom, dashMat);
                dash.rotation.x = -Math.PI / 2;
                const dx = x - width / 2 + 3 + i * 6;
                dash.position.set(dx, this.getTerrainHeight(dx, z) + 0.06, z);
                this.scene.add(dash);
                this._cityObjects.push(dash);
            }
        } else {
            const dashCount = Math.floor(depth / 6);
            for (let i = 0; i < dashCount; i++) {
                if (this.worldRandom() > 0.7) continue;
                
                const dashGeom = new THREE.PlaneGeometry(0.15, 2);
                const dashMat = new THREE.MeshBasicMaterial({ color: markingColor });
                const dash = new THREE.Mesh(dashGeom, dashMat);
                dash.rotation.x = -Math.PI / 2;
                const dz = z - depth / 2 + 3 + i * 6;
                dash.position.set(x, this.getTerrainHeight(x, dz) + 0.06, dz);
                this.scene.add(dash);
                this._cityObjects.push(dash);
            }
        }
    }

    /**
     * Create city blocks with buildings
     */
    async createCityBlocks(cfg, startX, startZ,signal=this.loadingAbort?.signal) {
        for (let bx = 0; bx < cfg.blocksX; bx++) {
            for (let bz = 0; bz < cfg.blocksZ; bz++) {
                const blockX = startX + bx * (cfg.blockSize + cfg.roadWidth) + cfg.blockSize / 2;
                const blockZ = startZ + bz * (cfg.blockSize + cfg.roadWidth) + cfg.blockSize / 2;

                if(signal?.aborted)throw new DOMException('World preparation cancelled','AbortError');
                this.createCityBlock(blockX, blockZ, cfg);
                const completed=bx*cfg.blocksZ+bz+1,total=cfg.blocksX*cfg.blocksZ;
                this.game.uiManager?.updateLoadingProgress(55+10*completed/total,`Preparing Atlanta blocks ${completed}/${total}`);
                await new Promise(resolve=>setTimeout(resolve,0));
            }
        }
    }

    /**
     * Create a single city block with buildings
     */
    createCityBlock(blockX, blockZ, cfg) {
        if (cfg.architecture==='atlanta') return buildAtlantaBlock(this,blockX,blockZ,cfg);
        const blockSize = cfg.blockSize;
        const spacing = cfg.buildingSpacing;
        
        const gridSize = Math.floor(blockSize / spacing);
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gz = 0; gz < gridSize; gz++) {
                if (this.worldRandom() < 0.15) {
                    if (this.worldRandom() < 0.5) {
                        const debrisX = blockX - blockSize / 2 + spacing * (gx + 0.5);
                        const debrisZ = blockZ - blockSize / 2 + spacing * (gz + 0.5);
                        this.createDebrisPile(debrisX, debrisZ);
                    }
                    continue;
                }

                const buildingX = blockX - blockSize / 2 + spacing * (gx + 0.5);
                const buildingZ = blockZ - blockSize / 2 + spacing * (gz + 0.5);

                // Organic variation: larger jitter breaks the grid rigidity
                const offsetX = (this.worldRandom() - 0.5) * 6;
                const offsetZ = (this.worldRandom() - 0.5) * 6;

                const district = cfg.district || 'outskirts';
                const bx = buildingX + offsetX;
                const bz = buildingZ + offsetZ;
                const ruin = cfg.ruinLevel || 0;

                // Industrial districts get warehouses instead of tenements
                if (district === 'industrial' && this.worldRandom() < 0.45) {
                    const wW = 10 + this.worldRandom() * 10;
                    const wD = 8 + this.worldRandom() * 8;
                    this.createWarehouse(bx, bz, wW, wD);
                    continue;
                }

                // Suburban districts get houses with pitched roofs
                if (district === 'suburban' && this.worldRandom() < 0.7) {
                    const hW = 5 + this.worldRandom() * 3;
                    const hD = 5 + this.worldRandom() * 3;
                    const hFloors = 1 + Math.floor(this.worldRandom() * 2);
                    const hDamaged = this.worldRandom() < cfg.damageLevel + ruin * 0.3;
                    this.createBuilding(bx, bz, hW, hD, hFloors, hDamaged, hDamaged ? 0 : -1, district, 'pitched');
                    continue;
                }

                const floors = cfg.minFloors + Math.floor(this.worldRandom() * (cfg.maxFloors - cfg.minFloors));
                const buildingWidth = 4 + this.worldRandom() * (spacing - 5);
                const buildingDepth = 4 + this.worldRandom() * (spacing - 5);

                const isDamaged = this.worldRandom() < cfg.damageLevel + ruin * 0.35;
                const damageType = isDamaged ? Math.floor(this.worldRandom() * 3) : -1;

                this.createBuilding(
                    bx,
                    bz,
                    buildingWidth,
                    buildingDepth,
                    floors,
                    isDamaged,
                    damageType,
                    district,
                    'flat'
                );
            }
        }

        if ((cfg.district || 'outskirts') === 'industrial' && this.worldRandom() < 0.55) {
            const chX = blockX + (this.worldRandom() - 0.5) * blockSize * 0.7;
            const chZ = blockZ + (this.worldRandom() - 0.5) * blockSize * 0.7;
            this.createChimney(chX, chZ, 14 + this.worldRandom() * 14);
        }

        this.createBlockSidewalks(blockX, blockZ, blockSize, cfg.roadWidth);
    }

    /**
     * Create building material with guaranteed visibility.
     * Palettes vary per district for a less monotonous skyline.
     */
    createBuildingMaterial(district = 'outskirts', width = 12, height = 12) {
        if (district==='atlanta') {
            const mat=new THREE.MeshStandardMaterial({color:0xe5ded1,roughness:0.94,metalness:0});
            this._applyProcedural(mat,'brick',width/1.8,height/1.5);
            return mat;
        }
        const palettes = {
            downtown:   [0x8a94a0, 0x9aa2ae, 0x7a8494, 0xa0a8b4, 0x8b95a5, 0x6a7688],
            outskirts:  [0x8a7a6a, 0x9a6a5a, 0x7a6a5a, 0x8a5a4a, 0x9a8a7a, 0x8a8a8a],
            industrial: [0x7a6a5a, 0x6a5a4a, 0x8a7a6a, 0x5a5a5a, 0x74624e, 0x656058],
            suburban:   [0xa09a8a, 0xb0a890, 0x98a098, 0xa8b0b8, 0xc0b090, 0x9a8a7a],
        };
        const colors = palettes[district] || palettes.outskirts;

        const color = colors[Math.floor(this.worldRandom() * colors.length)];

        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.85 + this.worldRandom() * 0.1,
            metalness: 0.05 + this.worldRandom() * 0.1,
        });
        // Density-correct repeat: ~1 texture tile per 6m so grain scale is
        // consistent whether the building is a shack or a tower
        this._applyProcedural(mat, 'concrete',
            Math.max(1, Math.round(width / 6)),
            Math.max(1, Math.round(height / 6)));
        return mat;
    }

    /**
     * Create a building with optional damage
     * ALL BUILDING PARTS NOW HAVE COLLISION
     */
    createBuilding(x, z, width, depth, floors, isDamaged, damageType, district = 'outskirts', roofStyle = 'flat', facing = 0) {
        if (district === 'atlanta') return buildEnterableBuilding(this, x, z, width, depth, floors, isDamaged, facing);
        const floorHeight = 3;
        const baseHeight = floors * floorHeight;

        let actualHeight = baseHeight;
        if (isDamaged && damageType === 0) {
            actualHeight = baseHeight * (0.3 + this.worldRandom() * 0.5);
        }

        const group = new THREE.Group();
        group.rotation.y=facing;
        // Foundation fix: sample terrain at the corners + center and seat the
        // building on the LOWEST point, sunk 0.5m. On sloped terrain a single
        // center sample left corners floating in mid-air or buried.
        const hx = width / 2, hz = depth / 2;
        const baseY = Math.min(
            this.getTerrainHeight(x - hx, z - hz),
            this.getTerrainHeight(x + hx, z - hz),
            this.getTerrainHeight(x - hx, z + hz),
            this.getTerrainHeight(x + hx, z + hz),
            this.getTerrainHeight(x, z)
        ) - (district==='atlanta'?0.04:0.5);
        group.position.set(x, baseY, z);

        // Remember the footprint so loot containers can spawn at doorways
        if (!this.buildingSpots) this.buildingSpots = [];
        this.buildingSpots.push({ x, z, width, depth, baseY, isDamaged });

        const material = isDamaged && district!=='atlanta'
            ? this.materials.damaged
            : this.createBuildingMaterial(district, width, actualHeight);

        // Tall ruined buildings can collapse into jagged concrete towers
        const ruin = (this.city && this.city.ruinLevel) || 0;
        let builtRuinedTower = false;

        // Main building body with collision
        if (isDamaged && damageType === 1) {
            this.createDamagedLBuilding(group, width, depth, actualHeight, material);
        } else if (isDamaged && damageType === 2) {
            this.createBuildingWithHole(group, width, depth, actualHeight, material);
        } else if (isDamaged && floors >= 7 && this.worldRandom() < 0.35 + ruin * 0.35) {
            this.createDestroyedHighrise(group, width, depth, baseHeight, material);
            actualHeight = baseHeight;
            builtRuinedTower = true;
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
        this.addFacadeDetails(group, width, depth, actualHeight, floors, isDamaged);

        if (roofStyle === 'pitched' && floors <= 3) {
            this.addPitchedRoof(group, width, depth, actualHeight, district);
        } else if (!isDamaged || this.worldRandom() > 0.5) {
            this.addRoofDetails(group, width, depth, actualHeight);
        }

        this.addGroundFloorDetails(group, width, depth);
        if(district==='atlanta') { addStorefrontSign(this,group,width,depth); addFacadeDetails(this,group,width,depth,actualHeight); }

        if (isDamaged && !builtRuinedTower) {
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
        this.createBuildingCollider(x, z, width, depth, actualHeight, group.position.y);
    }

    /**
     * Create an invisible collision box for a building
     */
    createBuildingCollider(x, z, width, depth, height, groundY = 0) {
        const colliderGeom = new THREE.BoxGeometry(width, height, depth);
        const colliderMat = new THREE.MeshBasicMaterial({ 
            visible: false,
            transparent: true,
            opacity: 0
        });
        const collider = new THREE.Mesh(colliderGeom, colliderMat);
        collider.position.set(x, groundY + height / 2, z);
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

        const partialHeight = height * (0.3 + this.worldRandom() * 0.4);
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

        const holeHeight = 3 + this.worldRandom() * 6;
        const holeWidth = 2 + this.worldRandom() * 3;
        const holeY = 3 + this.worldRandom() * (height - holeHeight - 3);
        
        const holeGeom = new THREE.BoxGeometry(holeWidth, holeHeight, 1);
        const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 });
        const hole = new THREE.Mesh(holeGeom, holeMat);
        hole.position.set(
            (this.worldRandom() - 0.5) * (width - holeWidth),
            holeY,
            depth / 2 + 0.1
        );
        group.add(hole);
    }

    /**
     * Add windows to a building
     */
    addBuildingWindows(group, width, depth, height, floors, isDamaged) {
        // Shared geometries - one allocation reused by every window in the zone
        if (!this._winGeom) {
            this._winGeom = new THREE.PlaneGeometry(1, 1.5);
            this._winFrameGeom = new THREE.PlaneGeometry(1.35, 1.85);
            this._winSillGeom = new THREE.BoxGeometry(1.4, 0.12, 0.18);
            this._winFrameMat = new THREE.MeshStandardMaterial({ color: 0x232120, roughness: 0.9 });
            this._winSillMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.85 });
        }
        const windowWidth = 1;
        const windowHeight = 1.5;
        const floorHeight = 3;
        
        const windowsX = Math.max(1, Math.floor(width / 3));
        const windowsZ = Math.max(1, Math.floor(depth / 3));
        
        const actualFloors = Math.floor(height / floorHeight);
        const placeWindow = (px, py, pz, rotY) => {
            if (this.worldRandom() < 0.22) return;
            let winMat = this.materials.window;
            if (!isDamaged && this.worldRandom() < 0.06) winMat = this.materials.windowLit;
            else if (isDamaged && this.worldRandom() < 0.35) return; // blown-out windows
            const frame = new THREE.Mesh(this._winFrameGeom, this._winFrameMat);
            frame.position.set(px, py, pz);
            frame.rotation.y = rotY;
            // nudge outward along the face normal
            frame.position.x += Math.sin(rotY) * 0.03;
            frame.position.z += Math.cos(rotY) * 0.03;
            group.add(frame);
            const win = new THREE.Mesh(this._winGeom, winMat);
            win.position.set(px, py, pz);
            win.rotation.y = rotY;
            win.position.x += Math.sin(rotY) * 0.055;
            win.position.z += Math.cos(rotY) * 0.055;
            group.add(win);
            const sill = new THREE.Mesh(this._winSillGeom, this._winSillMat);
            sill.position.set(px, py - 0.95, pz);
            sill.rotation.y = rotY;
            sill.position.x += Math.sin(rotY) * 0.06;
            sill.position.z += Math.cos(rotY) * 0.06;
            group.add(sill);
        };
        
        for (let floor = 0; floor < actualFloors; floor++) {
            const floorY = floor * floorHeight + floorHeight * 0.6;
            for (let w = 0; w < windowsX; w++) {
                const windowX = -width / 2 + width / (windowsX + 1) * (w + 1);
                placeWindow(windowX, floorY, depth / 2, 0);
                placeWindow(windowX, floorY, -depth / 2, Math.PI);
            }
            for (let w = 0; w < windowsZ; w++) {
                const windowZ = -depth / 2 + depth / (windowsZ + 1) * (w + 1);
                placeWindow(width / 2, floorY, windowZ, Math.PI / 2);
                placeWindow(-width / 2, floorY, windowZ, -Math.PI / 2);
            }
        }
    }

    /**
     * Cornice strips and pilasters - breaks up flat box silhouettes
     */
    addFacadeDetails(group, width, depth, height, floors, isDamaged) {
        if (!this._corniceMat) {
            this._corniceMat = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.9 });
            this._applyProcedural(this._corniceMat, 'concrete', 2, 1);
        }
        // Cornice band at the roofline
        const cornice = new THREE.Mesh(
            new THREE.BoxGeometry(width + 0.6, 0.5, depth + 0.6),
            this._corniceMat
        );
        cornice.position.y = height - 0.25;
        cornice.castShadow = true;
        group.add(cornice);

        // Base plinth - grounds the building visually
        const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(width + 0.4, 1.0, depth + 0.4),
            this._corniceMat
        );
        plinth.position.y = 0.5;
        plinth.receiveShadow = true;
        group.add(plinth);

        // Pilasters on taller buildings
        if (floors >= 4 && !isDamaged) {
            const pilGeom = new THREE.BoxGeometry(0.5, height - 1.5, 0.3);
            const count = Math.max(2, Math.floor(width / 6));
            for (let i = 0; i <= count; i++) {
                const px = -width / 2 + (width * i) / count;
                const pilF = new THREE.Mesh(pilGeom, this._corniceMat);
                pilF.position.set(px, (height - 1.5) / 2 + 1, depth / 2 + 0.12);
                group.add(pilF);
                const pilB = new THREE.Mesh(pilGeom, this._corniceMat);
                pilB.position.set(px, (height - 1.5) / 2 + 1, -depth / 2 - 0.12);
                group.add(pilB);
            }
        }
    }

    /**
     * Add roof details
     */
    addRoofDetails(group, width, depth, height) {
        const detailCount = Math.floor(this.worldRandom() * 3) + 1;
        
        for (let i = 0; i < detailCount; i++) {
            const detailType = Math.floor(this.worldRandom() * 3);
            
            if (detailType === 0) {
                const acGeom = new THREE.BoxGeometry(1.5, 0.8, 1);
                const ac = new THREE.Mesh(acGeom, this.materials.rustyMetal);
                ac.position.set(
                    (this.worldRandom() - 0.5) * (width - 2),
                    height + 0.4,
                    (this.worldRandom() - 0.5) * (depth - 2)
                );
                ac.castShadow = true;
                ac.userData = { isCollidable: true };
                group.add(ac);
            } else if (detailType === 1) {
                const ventGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
                const vent = new THREE.Mesh(ventGeom, this.materials.rustyMetal);
                vent.position.set(
                    (this.worldRandom() - 0.5) * (width - 1),
                    height + 0.75,
                    (this.worldRandom() - 0.5) * (depth - 1)
                );
                vent.castShadow = true;
                vent.userData = { isCollidable: true };
                group.add(vent);
            } else {
                const tankGeom = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
                const tank = new THREE.Mesh(tankGeom, this.materials.rustyMetal);
                tank.position.set(
                    (this.worldRandom() - 0.5) * (width - 2),
                    height + 1,
                    (this.worldRandom() - 0.5) * (depth - 2)
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
        // Storefront glass band along the front
        const frameMat = this._winFrameMat || this.materials.debris;
        const shopW = Math.min(width * 0.7, 10);
        const shopFrame = new THREE.Mesh(new THREE.PlaneGeometry(shopW + 0.3, 2.3), frameMat);
        shopFrame.position.set(-width * 0.1, 1.6, depth / 2 + 0.03);
        group.add(shopFrame);
        const shopMat = this.worldRandom() < 0.3 ? this.materials.windowLit : this.materials.window;
        const shop = new THREE.Mesh(new THREE.PlaneGeometry(shopW, 2.0), shopMat);
        shop.position.set(-width * 0.1, 1.6, depth / 2 + 0.06);
        group.add(shop);
        const doorGeom = new THREE.BoxGeometry(0.95, 2.15, 0.12);
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.8 });
        const door = new THREE.Mesh(doorGeom, doorMat);
        door.position.set(width * 0.28, 1.075, depth / 2 + 0.05);
        group.add(door);

        if (this.worldRandom() > 0.6) {
            const awningGeom = new THREE.BoxGeometry(3, 0.1, 1.5);
            const awningMat = new THREE.MeshStandardMaterial({ 
                color: this.worldRandom() > 0.5 ? 0x3a2020 : 0x203a20,
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
        const rubbleCount = 5 + Math.floor(this.worldRandom() * 10);
        
        for (let i = 0; i < rubbleCount; i++) {
            const size = 0.2 + this.worldRandom() * 0.8;
            const rubbleGeom = new THREE.BoxGeometry(size, size * 0.5, size);
            const rubble = new THREE.Mesh(rubbleGeom, this.materials.debris);
            
            const angle = this.worldRandom() * Math.PI * 2;
            const distance = Math.max(width, depth) / 2 + 0.5 + this.worldRandom() * 2;
            
            rubble.position.set(
                Math.cos(angle) * distance,
                size * 0.25,
                Math.sin(angle) * distance
            );
            rubble.rotation.set(
                this.worldRandom() * 0.5,
                this.worldRandom() * Math.PI,
                this.worldRandom() * 0.5
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
    /**
     * Jagged collapsed high-rise: stacked concrete slabs of shrinking
     * footprint with exposed rebar and a rubble apron at the base.
     */
    createDestroyedHighrise(group, width, depth, height, material) {
        const segments = 3 + Math.floor(this.worldRandom() * 3);
        let y = 0;
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const w = width * (1 - t * (0.35 + this.worldRandom() * 0.3));
            const d = depth * (1 - t * (0.35 + this.worldRandom() * 0.3));
            const h = (height / segments) * (0.7 + this.worldRandom() * 0.6);
            const segGeom = new THREE.BoxGeometry(w, h, d);
            const seg = new THREE.Mesh(segGeom, material);
            seg.position.set(
                (this.worldRandom() - 0.5) * width * 0.25,
                y + h / 2,
                (this.worldRandom() - 0.5) * depth * 0.25
            );
            seg.rotation.y = (this.worldRandom() - 0.5) * 0.15;
            seg.castShadow = true;
            seg.receiveShadow = true;
            seg.userData = { isCollidable: true, type: 'building' };
            group.add(seg);

            // Exposed rebar jutting from the broken top of each segment
            const rebarCount = 2 + Math.floor(this.worldRandom() * 4);
            for (let r = 0; r < rebarCount; r++) {
                const rh = 0.8 + this.worldRandom() * 1.6;
                const rebarGeom = new THREE.CylinderGeometry(0.03, 0.03, rh, 5);
                const rebar = new THREE.Mesh(rebarGeom, this.materials.rustyMetal);
                rebar.position.set(
                    (this.worldRandom() - 0.5) * w * 0.7,
                    y + h + rh / 2 - 0.2,
                    (this.worldRandom() - 0.5) * d * 0.7
                );
                rebar.rotation.set((this.worldRandom() - 0.5) * 0.5, 0, (this.worldRandom() - 0.5) * 0.5);
                group.add(rebar);
            }
            y += h;
        }
        this.addBuildingRubble(group, width * 1.25, depth * 1.25);
    }

    /**
     * Pitched (gable) roof for houses and warehouses - extruded triangle prism
     */
    addPitchedRoof(group, width, depth, height, district = 'outskirts') {
        const roofH = 1.2 + this.worldRandom() * 1.4;
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2 - 0.3, 0);
        shape.lineTo(width / 2 + 0.3, 0);
        shape.lineTo(0, roofH);
        shape.closePath();
        const roofGeom = new THREE.ExtrudeGeometry(shape, { depth: depth + 0.6, bevelEnabled: false });
        roofGeom.translate(0, 0, -(depth + 0.6) / 2);
        const roofColors = {
            suburban: 0x6a4a3a, outskirts: 0x5a4a3a,
            industrial: 0x4a4a4a, downtown: 0x5a5a5a
        };
        const roofMat = new THREE.MeshStandardMaterial({
            color: roofColors[district] || 0x5a4a3a,
            roughness: 0.9,
            metalness: 0.05
        });
        const roof = new THREE.Mesh(roofGeom, roofMat);
        roof.position.y = height;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);
    }

    /**
     * Industrial warehouse: wide low shed with cargo door, roof vents, pitched roof
     */
    createWarehouse(x, z, w, d) {
        const gy = this.getTerrainHeight(x, z);
        const group = new THREE.Group();
        group.position.set(x, gy, z);

        const wallH = 5 + this.worldRandom() * 3;
        const material = this.createBuildingMaterial('industrial');
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), material);
        body.position.y = wallH / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData = { isCollidable: true, type: 'warehouse' };
        group.add(body);

        // Cargo door
        const doorGeom = new THREE.PlaneGeometry(Math.min(4, w * 0.4), 3.5);
        const door = new THREE.Mesh(doorGeom, this.materials.rustyMetal);
        door.position.set(0, 1.75, d / 2 + 0.03);
        group.add(door);

        // Roof vents
        const ventCount = 1 + Math.floor(this.worldRandom() * 3);
        for (let i = 0; i < ventCount; i++) {
            const vent = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8),
                this.materials.rustyMetal
            );
            vent.position.set(
                (this.worldRandom() - 0.5) * w * 0.6,
                wallH + 0.6,
                (this.worldRandom() - 0.5) * d * 0.6
            );
            vent.castShadow = true;
            group.add(vent);
        }

        this.addPitchedRoof(group, w, d, wallH, 'industrial');

        if (this.worldRandom() < 0.4) {
            this.addBuildingRubble(group, w * 0.8, d * 0.8);
        }

        group.userData = { type: 'warehouse', isCollidable: true };
        group.userData.bounds = { width: w, depth: d, height: wallH + 2 };
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        this.createBuildingCollider(x, z, w, d, wallH + 2, gy);
    }

    /**
     * Factory chimney with a rust-red warning band near the top
     */
    createChimney(x, z, h = 18) {
        const gy = this.getTerrainHeight(x, z);
        const group = new THREE.Group();
        group.position.set(x, gy, z);

        const chim = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.6, h, 10),
            this.materials.debris
        );
        chim.position.y = h / 2;
        chim.castShadow = true;
        chim.userData = { isCollidable: true, type: 'chimney' };
        group.add(chim);

        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(1.16, 1.22, 1.2, 10),
            new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.8 })
        );
        band.position.y = h - 2;
        group.add(band);

        group.userData = { type: 'chimney', isCollidable: true };
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        this.createBuildingCollider(x, z, 3.4, 3.4, h, gy);
    }

    /**
     * Blast crater: scorched bowl with a raised rim of rubble
     */
    createCrater(x, z, radius) {
        const gy = this.getTerrainHeight(x, z);
        const group = new THREE.Group();
        group.position.set(x, gy, z);

        const bowl = new THREE.Mesh(
            new THREE.CircleGeometry(radius, 20),
            new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 1 })
        );
        bowl.rotation.x = -Math.PI / 2;
        bowl.position.y = 0.06;
        bowl.receiveShadow = true;
        group.add(bowl);

        const rimCount = Math.floor(radius * 4);
        for (let i = 0; i < rimCount; i++) {
            const a = (i / rimCount) * Math.PI * 2 + this.worldRandom() * 0.3;
            const rr = radius * (0.85 + this.worldRandom() * 0.35);
            const s = 0.3 + this.worldRandom() * radius * 0.25;
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(s, 0),
                this.materials.debris
            );
            rock.position.set(Math.cos(a) * rr, s * 0.3, Math.sin(a) * rr);
            rock.rotation.set(this.worldRandom() * 3, this.worldRandom() * 3, this.worldRandom() * 3);
            rock.castShadow = true;
            group.add(rock);
        }

        group.userData = { type: 'crater' };
        this.scene.add(group);
        this._cityObjects.push(group);
    }

    /**
     * Scatter blast craters across the zone, scaled by ruin level
     */
    addCraters(cfg, totalWidth, totalDepth) {
        const ruin = cfg.ruinLevel || 0;
        const count = Math.floor(ruin * 16);
        for (let i = 0; i < count; i++) {
            const x = (this.worldRandom() - 0.5) * totalWidth * 0.95;
            const z = (this.worldRandom() - 0.5) * totalDepth * 0.95;
            this.createCrater(x, z, 2.5 + this.worldRandom() * 4);
        }
    }

    /**
     * Leaning collapsed concrete slab - call with a parent group and local coords
     */
    createCollapsedSlab(parent, x, y, z, scale = 1) {
        const w = (2 + this.worldRandom() * 3) * scale;
        const h = (0.4 + this.worldRandom() * 0.5) * scale;
        const d = (1.5 + this.worldRandom() * 2.5) * scale;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.materials.debris);
        slab.position.set(x, y + h / 2, z);
        slab.rotation.set((this.worldRandom() - 0.5) * 0.9, this.worldRandom() * Math.PI, (this.worldRandom() - 0.5) * 0.9);
        slab.castShadow = true;
        slab.receiveShadow = true;
        parent.add(slab);
        return slab;
    }

    /**
     * Rocks and dead grass tufts on the hills (instanced - 2 draw calls)
     */
    addTerrainScatter(totalWidth, totalDepth) {
        const dummy = new THREE.Object3D();

        const rockGeom = new THREE.DodecahedronGeometry(1, 0);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b564c, roughness: 0.95 });
        const rockCount = 220;
        const rocks = new THREE.InstancedMesh(rockGeom, rockMat, rockCount);
        let placed = 0, guard = 0;
        while (placed < rockCount && guard++ < rockCount * 30) {
            const x = (this.worldRandom() - 0.5) * (totalWidth + 320);
            const z = (this.worldRandom() - 0.5) * (totalDepth + 320);
            if (Math.hypot(x, z) < 95) continue;
            const s = 0.35 + this.worldRandom() * 1.5;
            dummy.position.set(x, this.getTerrainHeight(x, z) + s * 0.25, z);
            dummy.rotation.set(this.worldRandom() * 0.5, this.worldRandom() * Math.PI * 2, this.worldRandom() * 0.5);
            dummy.scale.set(s * (0.7 + this.worldRandom() * 0.7), s * 0.75, s * (0.7 + this.worldRandom() * 0.7));
            dummy.updateMatrix();
            rocks.setMatrixAt(placed++, dummy.matrix);
        }
        rocks.count = placed;
        rocks.castShadow = true;
        rocks.receiveShadow = true;
        this.scene.add(rocks);
        this._cityObjects.push(rocks);

        const tuftGeom = new THREE.PlaneGeometry(1.1, 0.7);
        tuftGeom.translate(0, 0.35, 0);
        const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6e6440, roughness: 1, side: THREE.DoubleSide });
        const tuftCount = 420;
        const tufts = new THREE.InstancedMesh(tuftGeom, tuftMat, tuftCount);
        placed = 0; guard = 0;
        while (placed < tuftCount && guard++ < tuftCount * 30) {
            const x = (this.worldRandom() - 0.5) * (totalWidth + 320);
            const z = (this.worldRandom() - 0.5) * (totalDepth + 320);
            if (Math.hypot(x, z) < 70) continue;
            const s = 0.6 + this.worldRandom() * 1.1;
            dummy.position.set(x, this.getTerrainHeight(x, z), z);
            dummy.rotation.set(0, this.worldRandom() * Math.PI, 0);
            dummy.scale.set(s, s * (0.7 + this.worldRandom() * 0.6), s);
            dummy.updateMatrix();
            tufts.setMatrixAt(placed++, dummy.matrix);
        }
        tufts.count = placed;
        tufts.receiveShadow = true;
        this.scene.add(tufts);
        this._cityObjects.push(tufts);
    }

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
            sidewalk.position.set(x, this.getTerrainHeight(x, z) + sidewalkHeight / 2 - 0.04, z);
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
        // Use instancer if available (performance), else fall back to meshes
        if (!this.debrisInstancer) {
            this.debrisInstancer = new DebrisInstancer(this.scene, this.materials.debris);
        }

        const baseY = this.getTerrainHeight(x, z) - 0.15;
        const ruin = (this.city && this.city.ruinLevel) || 0;
        const pieceCount = 10 + Math.floor(this.worldRandom() * 15) + Math.floor(ruin * 12);

        for (let i = 0; i < pieceCount; i++) {
            const size = 0.3 + this.worldRandom() * 1;
            const isBox = this.worldRandom() > 0.5;
            const px = x + (this.worldRandom() - 0.5) * 3;
            const pz = z + (this.worldRandom() - 0.5) * 3;
            const py = baseY + size * 0.2;

            this.debrisInstancer.addPiece(
                px, py, pz,
                this.worldRandom() * Math.PI * 0.3,
                this.worldRandom() * Math.PI,
                this.worldRandom() * Math.PI * 0.3,
                size,
                isBox
            );
        }

        // Colliders: single box per pile (not per piece)
        const collider = new THREE.Mesh(
            new THREE.BoxGeometry(4, 1, 4),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        collider.position.set(x, baseY + 0.5, z);
        collider.userData = { isCollidable: true, type: 'debris' };
        this.scene.add(collider);
        this._cityObjects.push(collider);
        this.colliders.push(collider);
    }

    /**
     * Add environmental details (lampposts, vehicles, trash, etc)
     */
    addEnvironmentalDetails(cfg, totalWidth, totalDepth) {
        this.addLampposts(cfg, totalWidth, totalDepth);
        this.addAbandonedVehicles(cfg, totalWidth, totalDepth);
        this.addRoadDebris(totalWidth, totalDepth);
        this.addDeadTrees(cfg, totalWidth, totalDepth);
        this.addCraters(cfg, totalWidth, totalDepth);
        this.addTerrainScatter(totalWidth, totalDepth);
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
                    if (this.worldRandom() > 0.7) continue;
                    
                    this.createLamppost(cx, cz, this.worldRandom() < 0.3);
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
        group.position.set(x, this.getTerrainHeight(x, z) - 0.15, z); // sink slightly: never floats on slopes
        
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
            const bendAngle = this.worldRandom() * 0.15;
            const bendDirection = this.worldRandom() * Math.PI * 2;
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
        this.createPoleCollider(x, z, poleRadius, poleHeight, group.position.y);
    }

    /**
     * Create an invisible collision cylinder for a pole
     */
    createPoleCollider(x, z, radius, height, groundY = 0) {
        const colliderGeom = new THREE.CylinderGeometry(radius + 0.1, radius + 0.15, height, 8);
        const colliderMat = new THREE.MeshBasicMaterial({ 
            visible: false,
            transparent: true,
            opacity: 0
        });
        const collider = new THREE.Mesh(colliderGeom, colliderMat);
        collider.position.set(x, groundY + height / 2, z);
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
            const x = (this.worldRandom() - 0.5) * totalWidth * 0.9;
            const z = (this.worldRandom() - 0.5) * totalDepth * 0.9;
            
            this.createAbandonedVehicle(x, z);
        }
    }

    /**
     * Create an abandoned vehicle
     * FULL COLLISION SUPPORT
     */
    createAbandonedVehicle(x, z) {
        if(this.city?.architecture==='atlanta') {
            const car=buildSedanModel();car.position.set(x,0,z);car.rotation.y=this.worldRandom()*Math.PI*2;
            seatOnGround(car,(px,pz)=>this.getTerrainHeight(px,pz));
            this.scene.add(car);this._cityObjects.push(car);this.colliders.push(car);
            this.createVehicleCollider(x,z,4.5,1.82,1.6,car.rotation.y,car.position.y);
            return;
        }
        const group = new THREE.Group();
        group.position.set(x, this.getTerrainHeight(x, z) - 0.15, z); // sink slightly: never floats on slopes
        group.rotation.y = this.worldRandom() * Math.PI * 2;
        
        const isVan = this.worldRandom() > 0.7;
        
        const length = isVan ? 5 : 4;
        const width = isVan ? 2 : 1.8;
        const height = isVan ? 2 : 1.3;
        
        // Body with collision
        const bodyGeom = new THREE.BoxGeometry(length, height, width);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: this.worldRandom() > 0.5 ? 0x3a3a3a : 0x4a3a30,
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
            if (this.worldRandom() > 0.8) continue;
            if (this.worldRandom() > 0.7) wheel.scale.y = 0.5;
            group.add(wheel);
        }
        
        group.userData = { type: 'vehicle', isCollidable: true };
        this.scene.add(group);
        this._cityObjects.push(group);
        this.colliders.push(group);
        
        // Create dedicated collision box for the vehicle
        this.createVehicleCollider(x, z, length, width, height, group.rotation.y, group.position.y);
    }

    /**
     * Create an invisible collision box for a vehicle
     */
    createVehicleCollider(x, z, length, width, height, rotationY, groundY = 0) {
        const colliderGeom = new THREE.BoxGeometry(length, height + 0.5, width);
        const colliderMat = new THREE.MeshBasicMaterial({ 
            visible: false,
            transparent: true,
            opacity: 0
        });
        const collider = new THREE.Mesh(colliderGeom, colliderMat);
        collider.position.set(x, groundY + (height + 0.5) / 2 + 0.3, z);
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
        const debrisCount = Math.floor(Math.sqrt(totalWidth * totalDepth) / 3.5);
        
        for (let i = 0; i < debrisCount; i++) {
            const x = (this.worldRandom() - 0.5) * totalWidth;
            const z = (this.worldRandom() - 0.5) * totalDepth;
            const gy = this.getTerrainHeight(x, z);
            
            const debrisType = Math.floor(this.worldRandom() * 4);
            
            if (debrisType === 0) {
                // Barrel with collision
                const barrelGeom = new THREE.CylinderGeometry(0.4, 0.4, 1, 12);
                const barrel = new THREE.Mesh(barrelGeom, this.materials.rustyMetal);
                barrel.position.set(x, gy + 0.5, z);
                if (this.worldRandom() > 0.5) {
                    barrel.rotation.x = Math.PI / 2;
                    barrel.position.y = gy + 0.4;
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
                crate.position.set(x, gy + 0.4, z);
                crate.rotation.y = this.worldRandom() * Math.PI;
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
                trash.position.set(x, gy + 0.2, z);
                trash.castShadow = true;
                this.scene.add(trash);
                this._cityObjects.push(trash);
            } else {
                // Concrete block with collision
                const blockGeom = new THREE.BoxGeometry(
                    0.5 + this.worldRandom() * 0.5,
                    0.3 + this.worldRandom() * 0.3,
                    0.5 + this.worldRandom() * 0.5
                );
                const block = new THREE.Mesh(blockGeom, this.materials.debris);
                block.position.set(x, gy + 0.2, z);
                block.rotation.y = this.worldRandom() * Math.PI;
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
        const treeCount = Math.floor((cfg.blocksX * cfg.blocksZ) / 1.2);
        
        for (let i = 0; i < treeCount; i++) {
            const x = (this.worldRandom() - 0.5) * totalWidth * 0.95;
            const z = (this.worldRandom() - 0.5) * totalDepth * 0.95;
            
            this.createDeadTree(x, z);
        }
    }

    /**
     * Create a dead/bare tree
     * WITH COLLISION ON TRUNK
     */
    createDeadTree(x, z) {
        const group = new THREE.Group();
        group.position.set(x, this.getTerrainHeight(x, z) - 0.15, z); // sink slightly: never floats on slopes
        
        const height = 3 + this.worldRandom() * 4;
        const trunkRadius = 0.15;
        
        // Trunk with collision
        const trunkGeom = new THREE.CylinderGeometry(0.1, 0.2, height, 6);
        const trunk = new THREE.Mesh(trunkGeom, this.materials.deadVegetation);
        trunk.position.y = height / 2;
        trunk.castShadow = true;
        trunk.userData = { isCollidable: true, type: 'tree' };
        group.add(trunk);
        
        // Branches (no collision - too thin)
        const branchCount = 3 + Math.floor(this.worldRandom() * 4);
        for (let i = 0; i < branchCount; i++) {
            const branchLength = 0.5 + this.worldRandom() * 1.5;
            const branchGeom = new THREE.CylinderGeometry(0.02, 0.05, branchLength, 4);
            const branch = new THREE.Mesh(branchGeom, this.materials.deadVegetation);
            
            const branchY = height * (0.5 + this.worldRandom() * 0.4);
            const angle = (i / branchCount) * Math.PI * 2 + this.worldRandom() * 0.5;
            
            branch.position.set(
                Math.cos(angle) * 0.2,
                branchY,
                Math.sin(angle) * 0.2
            );
            branch.rotation.z = Math.PI / 2 - 0.3 - this.worldRandom() * 0.4;
            branch.rotation.y = angle;
            branch.castShadow = true;
            group.add(branch);
        }
        
        if (this.worldRandom() > 0.5) {
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
        this.createPoleCollider(x, z, trunkRadius, height, group.position.y);
    }

    /**
     * Load terrain mesh (fallback if no city)
     */
    async loadTerrain(terrainData) {
        // Seeded rolling hills for the wilderness zone
        this._initTerrain((terrainData.seed || 777) + this._hashStr('wilderness'));
        this.city = {
            terrainAmplitude: terrainData.hillAmplitude || 14,
            terrainFlatRadius: 40,
            district: 'wilderness',
            ruinLevel: 0.15
        };

        const geometry = new THREE.PlaneGeometry(
            terrainData.width || 500,
            terrainData.depth || 500,
            terrainData.segments || 50,
            terrainData.segments || 50
        );
        geometry.rotateX(-Math.PI / 2);

        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setY(i, this.getTerrainHeight(pos.getX(i), pos.getZ(i)));
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: terrainData.color || 0x3d3d35,
            roughness: 0.95,
            metalness: 0.0
        });

        const terrain = new THREE.Mesh(geometry, material);
        terrain.receiveShadow = true;
        terrain.userData.type = 'terrain';
        terrain.userData.isCollidable = true;
        terrain.userData.isGround = true;

        this.scene.add(terrain);
        this.colliders.push(terrain);
        this._cityObjects.push(terrain);
        this.terrainMesh = terrain;
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

            // Merged geometry is baked in world space; its mesh position is
            // zero even when the geometry is hundreds of metres away.
            let keys = collider.userData?.gridCells;
            if (!keys) {
                if (collider === this.terrainMesh) {
                    // Terrain is always appended by getNearbyColliders().
                    continue;
                }
                const bounds = new THREE.Box3().setFromObject(collider);
                keys = [];
                if (bounds.isEmpty()) continue;
                for (let x = Math.floor(bounds.min.x / this.collisionGridSize);
                    x <= Math.floor(bounds.max.x / this.collisionGridSize); x++) {
                    for (let z = Math.floor(bounds.min.z / this.collisionGridSize);
                        z <= Math.floor(bounds.max.z / this.collisionGridSize); z++) {
                        keys.push(`${x},${z}`);
                    }
                }
            }
            for (const key of new Set(keys)) {
                if (!this.collisionGrid.has(key)) this.collisionGrid.set(key, []);
                this.collisionGrid.get(key).push(collider);
            }
        }
        
        console.log(`Built collision grid with ${this.collisionGrid.size} cells`);
    }

    /**
     * Get nearby colliders using spatial hash
     */
    getNearbyColliders(position, radius = 20) {
        const result = new Set();
        const cellRadius = Math.ceil(radius / this.collisionGridSize);
        const centerX = Math.floor(position.x / this.collisionGridSize);
        const centerZ = Math.floor(position.z / this.collisionGridSize);
        
        for (let x = centerX - cellRadius; x <= centerX + cellRadius; x++) {
            for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z++) {
                const key = `${x},${z}`;
                const cell = this.collisionGrid.get(key);
                if (cell) {
                    for (const collider of cell) result.add(collider);
                }
            }
        }

        // The terrain mesh sits in a single grid cell - always include it
        // so bullets and LOS checks collide with hills anywhere.
        if (this.terrainMesh) result.add(this.terrainMesh);

        return [...result];
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
                case 'packhound':
                    enemy = new PackHound(data);
                    break;
                case 'lurker':
                    enemy = new Lurker(data);
                    break;
                default:
                    enemy = new Enemy(data);
            }
            
            if (data.position) {
                enemy.position.fromArray(data.position);
            } else if (this.spawnPoints.enemy.length > 0) {
                const spawnPoint = this.spawnPoints.enemy[
                    Math.floor(this.worldRandom() * this.spawnPoints.enemy.length)
                ];
                enemy.position.fromArray(spawnPoint);
            }
            
            if (data.patrolPoints) {
                enemy.setPatrolRoute(data.patrolPoints.map(p => new THREE.Vector3().fromArray(p)));
            }

            if(this.city?.architecture==='atlanta') {
                const grounded=this.findOpenGroundPosition(enemy.position.x,enemy.position.z);
                enemy.position.copy(grounded);
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
            id: `interact_${Date.now()}_${this.worldRandom().toString(36).substr(2, 9)}`,
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
            if (this.worldRandom() < loot.chance) {
                const amount = Array.isArray(loot.amount)
                    ? Math.floor(loot.amount[0] + this.worldRandom() * (loot.amount[1] - loot.amount[0]))
                    : loot.amount;
                
                this.createPickup({
                    item: loot.item,
                    amount,
                    position: [
                        position.x + (this.worldRandom() - 0.5) * 2,
                        position.y + 0.5,
                        position.z + (this.worldRandom() - 0.5) * 2
                    ]
                });
            }
        }
    }

    createPickup(data) {
        // The mesh looks like the actual item instead of a glowing cube
        const mesh = ItemMeshFactory.build(data.item);
        mesh.position.fromArray(data.position);
        seatOnGround(mesh,(x,z)=>this.getTerrainHeight(x,z));
        
        const pickup = {
            id: `pickup_${Date.now()}_${this.worldRandom().toString(36).substr(2, 9)}`,
            mesh,
            item: data.item,
            amount: data.amount || 1,
            isActive: true,
            bobOffset: this.worldRandom() * Math.PI * 2
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
        // Pickup meshes are often Groups (item-shaped models) - dispose recursively
        pickup.mesh.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(m => m && m.dispose && m.dispose());
                else if (o.material.dispose) o.material.dispose();
            }
        });
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
        const staticTargets = (nearbyColliders.length > 0 ? nearbyColliders : this.colliders).concat(this.game.physicsSystem?.targets()||[]);
        // Include live entity hitboxes (enemies, NPCs) so bullets can hit them
        const entityTargets = [];
        for (const entity of this.entities.values()) {
            if (entity.mesh && entity.isActive !== false && entity.isCollidable !== false) {
                entityTargets.push(entity.mesh);
            }
        }
        const targets = entityTargets.length > 0 ? staticTargets.concat(entityTargets) : staticTargets;
        const intersects = raycaster.intersectObjects(targets, true);
        
        return intersects.find(hit=>{for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;return true;})||null;
    }

    /**
     * Optimized raycast using spatial hash
     */
    raycastOptimized(origin, direction, maxDistance = 100) {
        const raycaster = new THREE.Raycaster(origin, direction, 0, maxDistance);
        
        // Get colliders along the ray path
        const nearbyColliders = this.getCollidersAlongRay(origin, direction, maxDistance).concat(this.game.physicsSystem?.targets?.()||[]);
        
        if (nearbyColliders.length === 0) {
            return null;
        }
        
        const intersects = raycaster.intersectObjects(nearbyColliders, true).filter(hit=>{for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;return true;});
        
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
        
        // The terrain mesh sits in a single grid cell - always include it
        // so bullets collide with hills anywhere along the ray.
        if (this.terrainMesh) {
            result.add(this.terrainMesh);
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
        if(this.game.player)this.forestStreaming?.update(deltaTime,this.game.player.position,this.game.player.velocity);
        // Update entities
        for (const entity of this.entities.values()) {
            if (!entity.isActive) continue;
            
            if (entity.update) {
                entity.update(deltaTime);
            }
            this.updateSpatialGrid(entity);
        }
        
        // Physical supplies remain seated where they were dropped.
        
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
        this.tutorialDefinition=null;this.tutorialContainers=[];this._cellMaterials?.clear();
        this.loadingAbort?.abort();this.forestStreaming?.dispose();this.forestStreaming=null;

        this.terrainMesh = null;
        this._terrainReady = false;
        
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
            // Pickup meshes are often Groups - dispose recursively
            pickup.mesh.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (Array.isArray(o.material)) o.material.forEach(m => m && m.dispose && m.dispose());
                    else if (o.material.dispose) o.material.dispose();
                }
            });
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

        // Clear building footprints (loot placement must not see the old city)
        this.buildingSpots = [];

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
    worldRandom(){this._saveRng=(Math.imul(this._saveRng||1,1664525)+1013904223)>>>0;return this._saveRng/4294967296;}

    serialize() {
        return {
            recipeSeed:this.recipeSeed,rngState:this._saveRng,
            level: this.currentLevel?.name,
            entities: Array.from(this.entities.values())
                .filter(e => e.serialize&&!e.alifePartyId)
                .map(e => e.serialize()),
            pickups: Array.from(this.pickups.values()).map(p => ({
                item: p.item,
                amount: p.amount,
                position: p.mesh.position.toArray()
            }))
        };
    }

    restoreSaved(data){
        if(!data)return;this._saveRng=data.rngState??this._saveRng;for(const enemy of [...this.enemies.values()]){this.scene.remove(enemy.mesh);enemy.dispose?.();this.removeEnemy(enemy);}
        for(const e of data.entities||[]){if(e.tags?.includes('npc')){const npc=[...this.entities.values()].find(n=>n.name===e.name&&n.tags.has('npc'));if(npc){this.entities.delete(npc.id);this.removeFromSpatialGrid(npc);npc.deserialize(e);this.entities.set(npc.id,npc);this.addToSpatialGrid(npc);}continue;}if(e.health===undefined||e.health<=0)continue;const enemy=this.spawnEnemy({type:e.enemyType||'human',faction:e.faction,position:e.position});if(enemy){this.enemies.delete(enemy.id);this.entities.delete(enemy.id);this.removeFromSpatialGrid(enemy);enemy.deserialize(e);enemy.position.fromArray(e.position);enemy.alive=e.health>0;enemy.target=e.targetPlayer?this.game.player:null;this.enemies.set(enemy.id,enemy);this.entities.set(enemy.id,enemy);this.addToSpatialGrid(enemy);}}
        for(const p of [...this.pickups.values()]){this.scene.remove(p.mesh);p.mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});this.pickups.delete(p.id);this.interactables.delete(p.id);}for(const p of data.pickups||[])this.createPickup(p);
        for(const e of this.enemies.values())this.updateSpatialGrid(e);
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
                Math.floor(this.worldRandom() * this.spawnPoints.enemy.length)
            ];
            return new THREE.Vector3(spawn[0], spawn[1], spawn[2]);
        }
        
        // Random position in city
        if (this.city) {
            const totalWidth = this.city.blocksX * this.city.blockSize;
            const totalDepth = this.city.blocksZ * this.city.blockSize;
            return new THREE.Vector3(
                (this.worldRandom() - 0.5) * totalWidth * 0.8,
                0,
                (this.worldRandom() - 0.5) * totalDepth * 0.8
            );
        }
        
        return new THREE.Vector3(
            (this.worldRandom() - 0.5) * 100,
            0,
            (this.worldRandom() - 0.5) * 100
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
     * Analytic ground height - O(1), no raycast. Used by the player
     * ground fallback and enemy movement on rolling terrain.
     */
    getGroundHeight(x, z) {
        return this.getTerrainHeight(x, z);
    }

    findOpenGroundPosition(x,z,clearance=0.8) {
        const spots=this.buildingSpots || [];
        const free=(px,pz)=>!spots.some(s=>Math.abs(px-s.x)<s.width/2+clearance&&Math.abs(pz-s.z)<s.depth/2+clearance);
        for(let radius=0;radius<=40;radius+=2) {
            for(const [dx,dz]of [[radius,0],[-radius,0],[0,radius],[0,-radius],[radius,radius],[-radius,-radius],[radius,-radius],[-radius,radius]]) {
                if(free(x+dx,z+dz))return new THREE.Vector3(x+dx,this.getTerrainHeight(x+dx,z+dz),z+dz);
            }
        }
        return new THREE.Vector3(0,this.getTerrainHeight(0,10),10);
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
