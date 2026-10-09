import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Compact opaque, fixed parts inside a movable group, retaining materials. */
export function compactStaticGroup(group) {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const buckets = new Map();
    // Only direct, opaque mesh children: transparent decals retain their
    // independent sorting, and nested/animated hierarchies stay intact.
    for (const mesh of group.children) {
        if (!mesh.isMesh || mesh.isInstancedMesh || mesh.children.length ||
            Array.isArray(mesh.material) || mesh.material.transparent || !mesh.visible) continue;
        const key = `${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(mesh);
    }
    for (const meshes of buckets.values()) {
        if (meshes.length < 2) continue;
        const geometries = meshes.map(mesh => {
            const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
            return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
        });
        const geometry = mergeGeometries(geometries, true);
        geometries.forEach(g => g.dispose());
        if (!geometry) continue;
        geometry.computeBoundingSphere();
        const merged = new THREE.Mesh(geometry, meshes.map(m => m.material));
        merged.castShadow = meshes[0].castShadow;
        merged.receiveShadow = meshes[0].receiveShadow;
        merged.renderOrder = meshes[0].renderOrder;
        for (const mesh of meshes) { group.remove(mesh); mesh.geometry.dispose(); }
        group.add(merged);
    }
    return group;
}
