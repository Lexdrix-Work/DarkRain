/**
 * DebrisInstancer - Convert thousands of debris meshes into 2 InstancedMesh objects
 *
 * Instead of creating individual Mesh objects for each debris piece
 * (which causes expensive per-frame scene graph traversal), we collect
 * all transforms during city generation and bake them into InstancedMesh.
 *
 * This reduces 3,000+ scene objects to just 2 draw calls.
 */

import * as THREE from 'three';

export class DebrisInstancer {
    constructor(scene, material) {
        this.scene = scene;
        this.material = material;

        // Collected transforms: { position, rotation, scale, type }
        this.boxTransforms = [];
        this.cylinderTransforms = [];

        this.boxMesh = null;
        this.cylinderMesh = null;
    }

    /**
     * Add a debris piece (called during city generation)
     */
    addPiece(x, y, z, rotationX, rotationY, rotationZ, size, isBox) {
        const transform = {
            position: [x, y, z],
            rotation: [rotationX, rotationY, rotationZ],
            scale: isBox
                ? [size, size * 0.4, size * 0.8]
                : [size * 0.3, size, size * 0.4],
        };

        if (isBox) {
            this.boxTransforms.push(transform);
        } else {
            this.cylinderTransforms.push(transform);
        }
    }

    /**
     * Build the InstancedMesh objects (call after city generation)
     */
    build() {
        const dummy = new THREE.Object3D();

        // Box debris
        if (this.boxTransforms.length > 0) {
            const geom = new THREE.BoxGeometry(1, 1, 1);
            this.boxMesh = new THREE.InstancedMesh(geom, this.material, this.boxTransforms.length);
            this.boxTransforms.forEach((t, i) => {
                dummy.position.set(...t.position);
                dummy.rotation.set(...t.rotation);
                dummy.scale.set(...t.scale);
                dummy.updateMatrix();
                this.boxMesh.setMatrixAt(i, dummy.matrix);
            });
            this.boxMesh.castShadow = true;
            this.boxMesh.receiveShadow = true;
            this.boxMesh.instanceMatrix.needsUpdate = true;
            // Enable frustum culling on the whole instanced mesh
            this.boxMesh.frustumCulled = true;
            this.scene.add(this.boxMesh);
        }

        // Cylinder debris
        if (this.cylinderTransforms.length > 0) {
            const geom = new THREE.CylinderGeometry(1, 1, 1, 6);
            this.cylinderMesh = new THREE.InstancedMesh(geom, this.material, this.cylinderTransforms.length);
            this.cylinderTransforms.forEach((t, i) => {
                dummy.position.set(...t.position);
                dummy.rotation.set(...t.rotation);
                dummy.scale.set(...t.scale);
                dummy.updateMatrix();
                this.cylinderMesh.setMatrixAt(i, dummy.matrix);
            });
            this.cylinderMesh.castShadow = true;
            this.cylinderMesh.receiveShadow = true;
            this.cylinderMesh.instanceMatrix.needsUpdate = true;
            this.cylinderMesh.frustumCulled = true;
            this.scene.add(this.cylinderMesh);
        }

        console.log(`DebrisInstancer: ${this.boxTransforms.length} boxes + ${this.cylinderTransforms.length} cylinders → 2 draw calls`);

        // Clear transforms to free memory
        this.boxTransforms = [];
        this.cylinderTransforms = [];
    }

    dispose() {
        if (this.boxMesh) {
            this.scene.remove(this.boxMesh);
            this.boxMesh.geometry.dispose();
            this.boxMesh.dispose();
        }
        if (this.cylinderMesh) {
            this.scene.remove(this.cylinderMesh);
            this.cylinderMesh.geometry.dispose();
            this.cylinderMesh.dispose();
        }
    }
}
