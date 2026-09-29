import * as THREE from 'three';

export default class BuildingManager {
    constructor(config = {}) {
        this.city = config.city;
        this.scene = config.scene;
        this._cityObjects = [];
        
        // Building color palettes by type
        this.colorPalettes = {
            residential: [0xd4c4b0, 0xc9b99a, 0xbfae8f, 0xe8dcc8, 0xf5efe6],
            commercial: [0x8899aa, 0x7788a0, 0x99aabb, 0x667889, 0xaabbcc],
            industrial: [0x888888, 0x777777, 0x999999, 0x666666, 0xaaaaaa]
        };
        
        // Window materials
        this.windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x334455,
            emissive: 0x112233,
            emissiveIntensity: 0.3,
            roughness: 0.1,
            metalness: 0.8
        });
    }

    createBuilding(buildingData) {
        const { x, z, width, depth, height, floors, type } = buildingData;
        
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Get color for building type
        const palette = this.colorPalettes[type] || this.colorPalettes.residential;
        const baseColor = palette[Math.floor(Math.random() * palette.length)];

        // Main building body
        const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.8,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = height / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Add windows
        this.addWindows(group, width, depth, height, floors);

        // Add roof details based on building type
        this.addRoofDetails(group, width, depth, height, type);

        // Add entrance
        if (type !== 'industrial') {
            this.addEntrance(group, width, depth);
        }

        group.userData = {
            type: 'building',
            buildingType: type,
            isCollidable: true,
            floors: floors
        };

        this.scene.add(group);
        this._cityObjects.push(group);

        return group;
    }

    addWindows(group, width, depth, height, floors) {
        const windowWidth = 0.8;
        const windowHeight = 1.2;
        const windowDepth = 0.1;
        const floorHeight = 3;
        
        const windowGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth);

        // Windows on front and back
        const windowsPerFloorFront = Math.max(1, Math.floor(width / 2.5));
        const spacingFront = width / (windowsPerFloorFront + 1);

        for (let floor = 0; floor < floors; floor++) {
            const floorY = floor * floorHeight + floorHeight * 0.6;

            for (let w = 0; w < windowsPerFloorFront; w++) {
                const windowX = -width / 2 + spacingFront * (w + 1);

                // Front windows
                const windowFront = new THREE.Mesh(windowGeometry, this.windowMaterial);
                windowFront.position.set(windowX, floorY, depth / 2 + 0.05);
                group.add(windowFront);

                // Back windows
                const windowBack = new THREE.Mesh(windowGeometry, this.windowMaterial);
                windowBack.position.set(windowX, floorY, -depth / 2 - 0.05);
                group.add(windowBack);
            }
        }

        // Windows on sides
        const windowsPerFloorSide = Math.max(1, Math.floor(depth / 2.5));
        const spacingSide = depth / (windowsPerFloorSide + 1);

        for (let floor = 0; floor < floors; floor++) {
            const floorY = floor * floorHeight + floorHeight * 0.6;

            for (let w = 0; w < windowsPerFloorSide; w++) {
                const windowZ = -depth / 2 + spacingSide * (w + 1);

                // Right side windows
                const windowRight = new THREE.Mesh(windowGeometry, this.windowMaterial);
                windowRight.position.set(width / 2 + 0.05, floorY, windowZ);
                windowRight.rotation.y = Math.PI / 2;
                group.add(windowRight);

                // Left side windows
                const windowLeft = new THREE.Mesh(windowGeometry, this.windowMaterial);
                windowLeft.position.set(-width / 2 - 0.05, floorY, windowZ);
                windowLeft.rotation.y = Math.PI / 2;
                group.add(windowLeft);
            }
        }
    }

    addRoofDetails(group, width, depth, height, type) {
        if (type === 'residential' && Math.random() > 0.5) {
            // Pitched roof for some residential buildings
            const roofGeometry = new THREE.ConeGeometry(
                Math.max(width, depth) * 0.7,
                3,
                4
            );
            const roofMaterial = new THREE.MeshStandardMaterial({
                color: 0x553333,
                roughness: 0.9
            });
            const roof = new THREE.Mesh(roofGeometry, roofMaterial);
            roof.position.y = height + 1.5;
            roof.rotation.y = Math.PI / 4;
            roof.castShadow = true;
            group.add(roof);
        } else if (type === 'commercial') {
            // AC units on commercial buildings
            const acCount = Math.floor(Math.random() * 3) + 1;
            const acGeometry = new THREE.BoxGeometry(1.5, 0.8, 1);
            const acMaterial = new THREE.MeshStandardMaterial({
                color: 0x888888,
                roughness: 0.6
            });

            for (let i = 0; i < acCount; i++) {
                const ac = new THREE.Mesh(acGeometry, acMaterial);
                ac.position.set(
                    (Math.random() - 0.5) * (width - 2),
                    height + 0.4,
                    (Math.random() - 0.5) * (depth - 2)
                );
                ac.castShadow = true;
                group.add(ac);
            }
        } else if (type === 'industrial') {
            // Smokestacks for industrial
            if (Math.random() > 0.5) {
                const stackGeometry = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
                const stackMaterial = new THREE.MeshStandardMaterial({
                    color: 0x444444,
                    roughness: 0.7
                });
                const stack = new THREE.Mesh(stackGeometry, stackMaterial);
                stack.position.set(
                    (Math.random() - 0.5) * width * 0.5,
                    height + 2,
                    (Math.random() - 0.5) * depth * 0.5
                );
                stack.castShadow = true;
                group.add(stack);
            }
        }
    }

    addEntrance(group, width, depth) {
        // Door
        const doorGeometry = new THREE.BoxGeometry(1.2, 2.2, 0.2);
        const doorMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d2817,
            roughness: 0.7
        });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(0, 1.1, depth / 2 + 0.1);
        group.add(door);

        // Awning
        const awningGeometry = new THREE.BoxGeometry(2, 0.1, 1);
        const awningMaterial = new THREE.MeshStandardMaterial({
            color: 0x882222,
            roughness: 0.8
        });
        const awning = new THREE.Mesh(awningGeometry, awningMaterial);
        awning.position.set(0, 2.5, depth / 2 + 0.5);
        awning.castShadow = true;
        group.add(awning);
    }

    update(deltaTime) {
        // Could animate windows lighting up at night, etc.
    }

    dispose() {
        for (const obj of this._cityObjects) {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            obj.traverse((child) => {
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
        this._cityObjects = [];
        
        if (this.windowMaterial) {
            this.windowMaterial.dispose();
        }
    }
}