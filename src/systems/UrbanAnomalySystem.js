import * as THREE from 'three';

export default class UrbanAnomalySystem {
    constructor(config = {}) {
        this.city = config.city;
        this.scene = config.scene;
        this._cityObjects = [];
        this._anomalies = [];
        
        this.anomalyTypes = [
            'electricField',
            'gravityWell',
            'chemicalSpill',
            'radiationZone',
            'vortex'
        ];
    }

    createAnomalies() {
        if (!this.city || !this.city.buildings) {
            console.warn('UrbanAnomalySystem: No city data with buildings');
            return;
        }

        // Find buildings marked with anomalies
        const anomalyBuildings = this.city.buildings.filter(b => b.hasAnomaly);
        
        // Also randomly place some in open areas
        const randomAnomalyCount = Math.floor(Math.random() * 5) + 3;

        for (const building of anomalyBuildings) {
            this.createAnomaly(building.x, building.z, 'building');
        }

        // Random anomalies in city area
        const cityWidth = this.city.width || 500;
        const cityHeight = this.city.height || 500;

        for (let i = 0; i < randomAnomalyCount; i++) {
            const x = (Math.random() - 0.5) * cityWidth * 0.8;
            const z = (Math.random() - 0.5) * cityHeight * 0.8;
            this.createAnomaly(x, z, 'street');
        }

        console.log(`UrbanAnomalySystem: Created ${this._anomalies.length} anomalies`);
    }

    createAnomaly(x, z, location) {
        const type = this.anomalyTypes[Math.floor(Math.random() * this.anomalyTypes.length)];
        
        let anomaly;
        switch (type) {
            case 'electricField':
                anomaly = this.createElectricField(x, z);
                break;
            case 'gravityWell':
                anomaly = this.createGravityWell(x, z);
                break;
            case 'chemicalSpill':
                anomaly = this.createChemicalSpill(x, z);
                break;
            case 'radiationZone':
                anomaly = this.createRadiationZone(x, z);
                break;
            case 'vortex':
                anomaly = this.createVortex(x, z);
                break;
            default:
                anomaly = this.createGenericAnomaly(x, z);
        }

        if (anomaly) {
            anomaly.userData = {
                ...anomaly.userData,
                type: 'anomaly',
                anomalyType: type,
                location: location,
                damage: this.getAnomalyDamage(type),
                radius: this.getAnomalyRadius(type)
            };
            
            this._anomalies.push(anomaly);
            this._cityObjects.push(anomaly);
        }

        return anomaly;
    }

    createElectricField(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Electric field effect - glowing sphere with particles
        const coreGeometry = new THREE.SphereGeometry(1.5, 16, 16);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.position.y = 1.5;
        group.add(core);

        // Outer glow
        const glowGeometry = new THREE.SphereGeometry(2.5, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = 1.5;
        group.add(glow);

        // Electric arcs (simple lines)
        for (let i = 0; i < 5; i++) {
            const points = [];
            const startAngle = Math.random() * Math.PI * 2;
            points.push(new THREE.Vector3(0, 1.5, 0));
            points.push(new THREE.Vector3(
                Math.cos(startAngle) * 2,
                1.5 + (Math.random() - 0.5) * 2,
                Math.sin(startAngle) * 2
            ));
            
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            group.add(line);
        }

        // Point light removed for perf

        this.scene.add(group);
        return group;
    }

    createGravityWell(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Dark sphere that seems to pull things in
        const coreGeometry = new THREE.SphereGeometry(1, 32, 32);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.position.y = 1;
        group.add(core);

        // Distortion rings
        for (let i = 0; i < 3; i++) {
            const ringGeometry = new THREE.TorusGeometry(1.5 + i * 0.5, 0.05, 8, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0x440066,
                transparent: true,
                opacity: 0.5 - i * 0.15
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.position.y = 1;
            ring.rotation.x = Math.PI / 2;
            ring.userData.rotationSpeed = 0.5 + i * 0.3;
            group.add(ring);
        }

        this.scene.add(group);
        return group;
    }

    createChemicalSpill(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Puddle of toxic liquid
        const puddleGeometry = new THREE.CircleGeometry(3, 32);
        const puddleMaterial = new THREE.MeshStandardMaterial({
            color: 0x44ff00,
            emissive: 0x22aa00,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.5
        });
        const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.y = 0.02;
        group.add(puddle);

        // Bubbles
        for (let i = 0; i < 8; i++) {
            const bubbleGeometry = new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 8, 8);
            const bubbleMaterial = new THREE.MeshBasicMaterial({
                color: 0x66ff22,
                transparent: true,
                opacity: 0.6
            });
            const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
            bubble.position.set(
                (Math.random() - 0.5) * 4,
                0.1,
                (Math.random() - 0.5) * 4
            );
            bubble.userData.bobSpeed = 1 + Math.random();
            bubble.userData.bobOffset = Math.random() * Math.PI * 2;
            group.add(bubble);
        }

        // Point light
        // const light = new THREE.PointLight(0x44ff00, 0.5, 8); // REMOVED
        // light.position.y = 0.5; // REMOVED
        // group.add(light); // REMOVED

        this.scene.add(group);
        return group;
    }

    createRadiationZone(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Warning sign
        const signGeometry = new THREE.PlaneGeometry(1, 1);
        const signMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide
        });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.set(0, 2, 0);
        group.add(sign);

        // Radiation glow area
        const glowGeometry = new THREE.CylinderGeometry(4, 4, 0.1, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.2
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.y = 0.05;
        group.add(glow);

        // Particles floating up
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 50;
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 4;
            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = Math.random() * 3;
            positions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particleMaterial = new THREE.PointsMaterial({
            color: 0xffaa00,
            size: 0.1,
            transparent: true,
            opacity: 0.6
        });
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(particles);

        // Point light
        // const light = new THREE.PointLight(0xffaa00, 0.5, 10); // REMOVED
        // light.position.y = 1; // REMOVED
        // group.add(light); // REMOVED

        this.scene.add(group);
        return group;
    }

    createVortex(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        // Swirling vortex
        for (let i = 0; i < 5; i++) {
            const ringGeometry = new THREE.TorusGeometry(0.5 + i * 0.4, 0.08, 8, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0x8800ff,
                transparent: true,
                opacity: 0.7 - i * 0.1
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.position.y = 0.5 + i * 0.3;
            ring.rotation.x = Math.PI / 2 + i * 0.1;
            ring.userData.rotationSpeed = 2 - i * 0.3;
            group.add(ring);
        }

        // Central glow
        const coreGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.position.y = 0.5;
        group.add(core);

        // Point light
        // const light = new THREE.PointLight(0x8800ff, 1, 8); // REMOVED
        // light.position.y = 1; // REMOVED
        // group.add(light); // REMOVED

        this.scene.add(group);
        return group;
    }

    createGenericAnomaly(x, z) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);

        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.5
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.y = 1;
        group.add(sphere);

        // const light = new THREE.PointLight(0xff00ff, 0.5, 6); // REMOVED
        // light.position.y = 1; // REMOVED
        // group.add(light); // REMOVED

        this.scene.add(group);
        return group;
    }

    getAnomalyDamage(type) {
        const damages = {
            electricField: 15,
            gravityWell: 5,
            chemicalSpill: 10,
            radiationZone: 8,
            vortex: 20
        };
        return damages[type] || 10;
    }

    getAnomalyRadius(type) {
        const radii = {
            electricField: 2.5,
            gravityWell: 3,
            chemicalSpill: 3,
            radiationZone: 4,
            vortex: 2
        };
        return radii[type] || 2;
    }

    update(deltaTime) {
        // Animate anomalies
        for (const anomaly of this._anomalies) {
            anomaly.traverse((child) => {
                // Rotate rings
                if (child.userData.rotationSpeed) {
                    child.rotation.z += child.userData.rotationSpeed * deltaTime;
                }
                
                // Bob bubbles
                if (child.userData.bobSpeed) {
                    child.userData.bobOffset += child.userData.bobSpeed * deltaTime;
                    child.position.y = 0.1 + Math.sin(child.userData.bobOffset) * 0.1;
                }
            });
        }
    }

    checkPlayerCollision(playerPosition, playerRadius = 1) {
        for (const anomaly of this._anomalies) {
            const dx = playerPosition.x - anomaly.position.x;
            const dz = playerPosition.z - anomaly.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            const anomalyRadius = anomaly.userData.radius || 2;
            
            if (distance < anomalyRadius + playerRadius) {
                return {
                    anomaly: anomaly,
                    damage: anomaly.userData.damage || 10,
                    type: anomaly.userData.anomalyType
                };
            }
        }
        return null;
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
        this._anomalies = [];
    }
}