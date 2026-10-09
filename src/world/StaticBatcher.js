import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function makeBatchedDetailMaterial(material) {
    const result=material.clone();result.color.setHex(0xffffff);result.vertexColors=true;return result;
}

/**
 * StaticBatcher - merges static city geometry into a handful of draw calls.
 *
 * Usage: queue baked (world-space) geometry clones per material bucket via
 * add(), then buildBucket() each bucket into a single Mesh. Collidable
 * geometry is ALSO queued via addCollider() and merged per spatial super-cell
 * so bullet raycasts stay cheap (buildColliders()).
 *
 * Everything queued is cloned and baked - the source meshes are untouched and
 * can be disposed/removed by the caller after the pass.
 */
export class StaticBatcher {
    constructor() {
        // bucketKey -> { geoms: [] }
        this.buckets = new Map();
        // Baked world-space collider geometries (position/normal only)
        this.colliderGeoms = [];
    }

    /**
     * Queue a geometry into a visual bucket.
     * @param {THREE.BufferGeometry} geometry source geometry (not modified)
     * @param {THREE.Matrix4} matrixWorld baked into the clone
     * @param {string} bucket bucket key
     * @param {object} opts { color: THREE.Color|null, uvRepeat: [x,y]|null }
     */
    add(geometry, matrixWorld, bucket, opts = {}) {
        const { color = null, uvRepeat = null } = opts;

        // mergeGeometries needs uniform indexing - normalize to non-indexed
        const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();

        if (uvRepeat && g.attributes.uv) {
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) {
                uv.setXY(i, uv.getX(i) * uvRepeat[0], uv.getY(i) * uvRepeat[1]);
            }
            uv.needsUpdate = true;
        }

        g.applyMatrix4(matrixWorld);

        if (color) {
            const n = g.attributes.position.count;
            const arr = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                arr[i * 3] = color.r;
                arr[i * 3 + 1] = color.g;
                arr[i * 3 + 2] = color.b;
            }
            g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        }

        let b = this.buckets.get(bucket);
        if (!b) {
            b = { geoms: [],decorations:[],vertexCount:0 };
            this.buckets.set(bucket, b);
        }
        if(opts.decorationOwner)b.decorations.push({owner:opts.decorationOwner,start:b.vertexCount,count:g.attributes.position.count});
        b.vertexCount+=g.attributes.position.count;
        b.geoms.push(g);
    }

    /**
     * Queue a geometry into the invisible collision batch (world-space baked).
     */
    addCollider(geometry, matrixWorld) {
        const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        g.applyMatrix4(matrixWorld);
        // Collision needs position/normal only - drop the rest to stay lean
        g.deleteAttribute('uv');
        g.deleteAttribute('color');
        g.deleteAttribute('tangent');
        this.colliderGeoms.push(g);
    }

    bucketCount(bucket) {
        const b = this.buckets.get(bucket);
        return b ? b.geoms.length : 0;
    }

    /**
     * Merge one visual bucket into a single Mesh (or null if empty).
     */
    buildBucket(bucket, material) {
        const b = this.buckets.get(bucket);
        if (!b || b.geoms.length === 0) return null;

        const merged = mergeGeometries(b.geoms, false);
        for (const g of b.geoms) g.dispose();
        b.geoms.length = 0;

        if (!merged) {
            console.warn(`StaticBatcher: merge failed for bucket '${bucket}'`);
            return null;
        }
        merged.computeBoundingSphere();
        const mesh=new THREE.Mesh(merged,material);mesh.userData.decorationRanges=b.decorations;return mesh;
    }

    /**
     * Merge collider geometries per spatial super-cell.
     * @param {number} superCell world size of one collider chunk
     * @param {number} gridCell size of the fine collision grid (for registration)
     * @param {THREE.Material} material shared invisible material
     * @returns {Array<THREE.Mesh>} one mesh per occupied super-cell; each mesh
     *          carries userData.gridCells (fine-grid keys it overlaps) and is
     *          NOT added to the scene - the caller keeps them in world.colliders.
     */
    buildColliders(superCell, gridCell, material) {
        const cells = new Map(); // "cx,cz" -> { geoms: [] }

        for (const g of this.colliderGeoms) {
            g.computeBoundingBox();
            const bb = g.boundingBox;
            const x0 = Math.floor(bb.min.x / superCell);
            const x1 = Math.floor(bb.max.x / superCell);
            const z0 = Math.floor(bb.min.z / superCell);
            const z1 = Math.floor(bb.max.z / superCell);
            for (let cx = x0; cx <= x1; cx++) {
                for (let cz = z0; cz <= z1; cz++) {
                    const key = cx + ',' + cz;
                    let e = cells.get(key);
                    if (!e) {
                        e = { geoms: [] };
                        cells.set(key, e);
                    }
                    e.geoms.push(g);
                }
            }
        }

        const out = [];
        for (const e of cells.values()) {
            const merged = mergeGeometries(e.geoms, false);
            if (!merged) continue;
            merged.computeBoundingSphere();

            // Union of fine-grid cells overlapped by this chunk's geometry
            const gridCells = new Set();
            for (const g of e.geoms) {
                const bb = g.boundingBox;
                const fx0 = Math.floor(bb.min.x / gridCell);
                const fx1 = Math.floor(bb.max.x / gridCell);
                const fz0 = Math.floor(bb.min.z / gridCell);
                const fz1 = Math.floor(bb.max.z / gridCell);
                for (let fx = fx0; fx <= fx1; fx++) {
                    for (let fz = fz0; fz <= fz1; fz++) {
                        gridCells.add(fx + ',' + fz);
                    }
                }
            }

            const mesh = new THREE.Mesh(merged, material);
            mesh.userData = {
                isCollidable: true,
                isCollisionOnly: true,
                type: 'mergedCollider',
                gridCells: [...gridCells]
            };
            // Static and scene-less: freeze the world matrix once
            mesh.updateMatrixWorld(true);
            out.push(mesh);
        }

        for (const g of this.colliderGeoms) g.dispose();
        this.colliderGeoms.length = 0;

        return out;
    }

    dispose() {
        for (const b of this.buckets.values()) {
            for (const g of b.geoms) g.dispose();
            b.geoms.length = 0;
        }
        this.buckets.clear();
        for (const g of this.colliderGeoms) g.dispose();
        this.colliderGeoms.length = 0;
    }
}
