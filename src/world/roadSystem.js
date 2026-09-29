import * as THREE from 'three';

export default class RoadSystem {
    constructor(config = {}) {
        this.city = config.city;
        this.scene = config.scene;
        this._cityObjects = [];
        
        // Road materials
        this.roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.9,
            metalness: 0.1
        });
        
        this.sidewalkMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.8,
            metalness: 0.05
        });
        
        this.linesMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00
        });
        
        this.crosswalkMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff
        });
    }

    createRoads() {
        if (!this.city) {
            console.warn('RoadSystem: No city data provided');
            return;
        }

        // Create ground plane first
        this.createGroundPlane();

        // If city has road data from CityGenerator
        if (this.city.roads && Array.isArray(this.city.roads)) {
            for (const road of this.city.roads) {
                this.createRoad(road);
            }
        } else {
            // Fallback: create roads based on city config
            this.createRoadsFromConfig();
        }

        // Add streetlights
        this.createStreetLights();

        // Add traffic lights at intersections
        this.createTrafficLights();

        console.log(`RoadSystem: Created ${this._cityObjects.length} road objects`);
    }

    createGroundPlane() {
        const width = this.city.width || 500;
        const height = this.city.height || 500;
        
        const groundGeometry = new THREE.PlaneGeometry(width + 100, height + 100);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.95
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        ground.userData = { type: 'ground', isCollidable: true };
        
        this.scene.add(ground);
        this._cityObjects.push(ground);
    }

    createRoad(roadData) {
        const { x, z, width, depth, type } = roadData;

        // Road surface
        const roadGeometry = new THREE.PlaneGeometry(width, depth);
        const road = new THREE.Mesh(roadGeometry, this.roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0.01, z);
        road.receiveShadow = true;
        road.userData = { type: 'road', isCollidable: false };
        
        this.scene.add(road);
        this._cityObjects.push(road);

        // Center line
        const lineWidth = 0.15;
        if (type === 'horizontal') {
            const lineGeometry = new THREE.PlaneGeometry(width - 2, lineWidth);
            const line = new THREE.Mesh(lineGeometry, this.linesMaterial);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.02, z);
            this.scene.add(line);
            this._cityObjects.push(line);
        } else {
            const lineGeometry = new THREE.PlaneGeometry(lineWidth, depth - 2);
            const line = new THREE.Mesh(lineGeometry, this.linesMaterial);
            line.rotation.x = -Math.PI / 2;
            line.position.set(x, 0.02, z);
            this.scene.add(line);
            this._cityObjects.push(line);
        }

        // Sidewalks on both sides
        const sidewalkWidth = 1.5;
        const sidewalkHeight = 0.15;
        
        if (type === 'horizontal') {
            // Top sidewalk
            this.createSidewalk(x, z - depth / 2 - sidewalkWidth / 2, width, sidewalkWidth, sidewalkHeight);
            // Bottom sidewalk
            this.createSidewalk(x, z + depth / 2 + sidewalkWidth / 2, width, sidewalkWidth, sidewalkHeight);
        } else {
            // Left sidewalk
            this.createSidewalk(x - width / 2 - sidewalkWidth / 2, z, sidewalkWidth, depth, sidewalkHeight);
            // Right sidewalk
            this.createSidewalk(x + width / 2 + sidewalkWidth / 2, z, sidewalkWidth, depth, sidewalkHeight);
        }
    }

    createSidewalk(x, z, width, depth, height) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const sidewalk = new THREE.Mesh(geometry, this.sidewalkMaterial);
        sidewalk.position.set(x, height / 2, z);
        sidewalk.receiveShadow = true;
        sidewalk.castShadow = true;
        sidewalk.userData = { type: 'sidewalk', isCollidable: true };
        
        this.scene.add(sidewalk);
        this._cityObjects.push(sidewalk);
    }

    createRoadsFromConfig() {
        const cfg = this.city;
        const blocksX = cfg.blocksX || Math.floor(cfg.width / 36);
        const blocksZ = cfg.blocksZ || Math.floor(cfg.height / 36);
        const blockSize = cfg.blockSize || 30;
        const roadWidth = cfg.roadWidth || 6;

        const totalWidth = blocksX * blockSize + (blocksX + 1) * roadWidth;
        const totalDepth = blocksZ * blockSize + (blocksZ + 1) * roadWidth;
        const startX = -totalWidth / 2;
        const startZ = -totalDepth / 2;

        // Horizontal roads
        for (let bz = 0; bz <= blocksZ; bz++) {
            const roadZ = startZ + roadWidth / 2 + bz * (blockSize + roadWidth);
            this.createRoad({
                x: 0,
                z: roadZ,
                width: totalWidth,
                depth: roadWidth,
                type: 'horizontal'
            });
        }

        // Vertical roads
        for (let bx = 0; bx <= blocksX; bx++) {
            const roadX = startX + roadWidth / 2 + bx * (blockSize + roadWidth);
            this.createRoad({
                x: roadX,
                z: 0,
                width: roadWidth,
                depth: totalDepth,
                type: 'vertical'
            });
        }
    }

    createStreetLights() {
        const cfg = this.city;
        const blockSize = cfg.blockSize || 30;
        const roadWidth = cfg.roadWidth || 6;
        const blocksX = cfg.blocksX || Math.floor((cfg.width || 500) / 36);
        const blocksZ = cfg.blocksZ || Math.floor((cfg.height || 500) / 36);

        const totalWidth = blocksX * blockSize + (blocksX + 1) * roadWidth;
        const totalDepth = blocksZ * blockSize + (blocksZ + 1) * roadWidth;
        const startX = -totalWidth / 2 + roadWidth;
        const startZ = -totalDepth / 2 + roadWidth;

        // Place lights at block corners
        for (let bx = 0; bx < blocksX; bx++) {
            for (let bz = 0; bz < blocksZ; bz++) {
                // Only place lights every other block to avoid too many lights
                if ((bx + bz) % 2 !== 0) continue;

                const blockX = startX + bx * (blockSize + roadWidth) + blockSize / 2;
                const blockZ = startZ + bz * (blockSize + roadWidth) + blockSize / 2;

                const corners = [
                    [blockX - blockSize / 2 - 2, blockZ - blockSize / 2 - 2],
                    [blockX + blockSize / 2 + 2, blockZ - blockSize / 2 - 2],
                    [blockX - blockSize / 2 - 2, blockZ + blockSize / 2 + 2],
                    [blockX + blockSize / 2 + 2, blockZ + blockSize / 2 + 2],
                ];

                for (const [cx, cz] of corners) {
                    this.createStreetLight(cx, cz);
                }
            }
        }
    }

    createStreetLight(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Pole
        const poleGeometry = new THREE.CylinderGeometry(0.1, 0.12, 5, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.6,
            metalness: 0.3
        });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 2.5;
        pole.castShadow = true;
        group.add(pole);

        // Arm
        const armGeometry = new THREE.BoxGeometry(1.5, 0.1, 0.1);
        const arm = new THREE.Mesh(armGeometry, poleMaterial);
        arm.position.set(0.75, 4.9, 0);
        group.add(arm);

        // Lamp housing
        const lampHousingGeometry = new THREE.BoxGeometry(0.6, 0.2, 0.3);
        const lampHousing = new THREE.Mesh(lampHousingGeometry, poleMaterial);
        lampHousing.position.set(1.4, 4.8, 0);
        group.add(lampHousing);

        // Light bulb (emissive)
        const bulbGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffcc });
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
        bulb.position.set(1.4, 4.65, 0);
        group.add(bulb);

        // Point light
        const light = new THREE.PointLight(0xffffcc, 0.8, 20, 2);
        light.position.set(1.4, 4.65, 0);
        light.castShadow = false; // Too many shadow casting lights is expensive
        group.add(light);

        group.userData = { type: 'streetlight', isCollidable: true };
        
        this.scene.add(group);
        this._cityObjects.push(group);
    }

    createTrafficLights() {
        // Add traffic lights at major intersections
        // Simplified - just add a few at key locations
        const cfg = this.city;
        const blockSize = cfg.blockSize || 30;
        const roadWidth = cfg.roadWidth || 6;
        const blocksX = cfg.blocksX || Math.floor((cfg.width || 500) / 36);
        const blocksZ = cfg.blocksZ || Math.floor((cfg.height || 500) / 36);

        // Place at every 3rd intersection
        const totalWidth = blocksX * blockSize + (blocksX + 1) * roadWidth;
        const totalDepth = blocksZ * blockSize + (blocksZ + 1) * roadWidth;
        const startX = -totalWidth / 2;
        const startZ = -totalDepth / 2;

        for (let bx = 0; bx <= blocksX; bx += 3) {
            for (let bz = 0; bz <= blocksZ; bz += 3) {
                const ix = startX + roadWidth / 2 + bx * (blockSize + roadWidth);
                const iz = startZ + roadWidth / 2 + bz * (blockSize + roadWidth);
                this.createTrafficLight(ix + roadWidth / 2 + 1, iz + roadWidth / 2 + 1);
            }
        }
    }

    createTrafficLight(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Pole
        const poleGeometry = new THREE.CylinderGeometry(0.08, 0.1, 4, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.5
        });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 2;
        pole.castShadow = true;
        group.add(pole);

        // Light housing
        const housingGeometry = new THREE.BoxGeometry(0.4, 1.2, 0.3);
        const housingMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.3
        });
        const housing = new THREE.Mesh(housingGeometry, housingMaterial);
        housing.position.y = 4.5;
        housing.castShadow = true;
        group.add(housing);

        // Lights (red, yellow, green)
        const lightColors = [0xff0000, 0xffff00, 0x00ff00];
        const lightPositions = [0.35, 0, -0.35];

        lightColors.forEach((color, i) => {
            const lightGeometry = new THREE.CircleGeometry(0.12, 16);
            const lightMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: i === 2 ? 1 : 0.3 // Green is on
            });
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            light.position.set(0, 4.5 + lightPositions[i], 0.16);
            group.add(light);
        });

        group.userData = { type: 'trafficlight', isCollidable: true };
        
        this.scene.add(group);
        this._cityObjects.push(group);
    }

    dispose() {
        for (const obj of this._cityObjects) {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            
            const disposeObject = (object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => m.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            };

            if (obj.traverse) {
                obj.traverse(disposeObject);
            } else {
                disposeObject(obj);
            }
        }
        this._cityObjects = [];
        
        this.roadMaterial?.dispose();
        this.sidewalkMaterial?.dispose();
        this.linesMaterial?.dispose();
        this.crosswalkMaterial?.dispose();
    }
}