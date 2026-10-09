import { streetDecay } from './CityDecay.js';
import * as THREE from 'three';
import { buildSedanModel } from './VehicleModel.js';

function material(world, name, color, roughness = 0.9, metalness = 0) {
    world._detailMaterials ||= new Map();
    const key = `detail:street-${name}`;
    if (!world._detailMaterials.has(key)) {
        const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        mat.userData.staticBucket = key;
        world._detailMaterials.set(key, mat);
    }
    return world._detailMaterials.get(key);
}

function box(group, size, position, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

/** Fixed facade details are baked into the district's existing material batches. */
export function addFacadeDetails(world, group, width, depth, height) {
    if (height < 3) return;
    const iron = material(world, 'iron', 0x55594f, 0.72, 0.45);
    const canvas = material(world, 'canvas', 0x536b60);
    const faded = material(world, 'faded', 0xa2977c);
    const front = depth / 2;
    const span = Math.min(5.6, width * 0.55);
    const canopyType=!group.userData.architecture||['stucco-shop','stone-trimmed'].includes(group.userData.architecture);
    // Retail shade only belongs on selected low-rise frontages.
    if(canopyType&&height<24){
    for (let i = 0; i < 8; i++) {
        if(group.userData.isDamaged&&i===5)continue;
        const canopy = box(group, [span / 8, 0.04, 1.45],
            [-span / 2 + span * (i + 0.5) / 8, 2.62, front + 0.74], i % 2 ? faded : canvas);
        canopy.rotation.x = 0.14;
    }
    box(group, [span, 0.18, 0.04], [0, 2.43, front + 1.45], canvas);
    for (const side of [-1, 1]) {
        const brace = box(group, [0.035, 0.035, 1.6], [side * span / 2, 2.25, front + 0.72], iron);
        brace.rotation.x = -0.4;
    }
    }
    // Rainwater pipe, wall-mounted utility meter and vented air conditioner.
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, height - 0.2, 8), iron);
    pipe.position.set(-width / 2 + 0.22, height / 2, front + 0.09); group.add(pipe);
    for (let y = 0.6; y < height; y += 2.2) box(group, [0.15, 0.06, 0.12], [-width / 2 + 0.22, y, front + 0.06], iron);
    box(group, [0.34, 0.5, 0.14], [-width / 2 + 0.75, 1.5, front + 0.09], iron);
    const acX = width * 0.32;
    box(group, [0.9, 0.46, 0.48], [acX, 2.15, front + 0.26], faded);
    for (let y = 0; y < 6; y++) box(group, [0.75, 0.018, 0.025], [acX, 1.98 + y * 0.06, front + 0.51], iron);
}

export function addStreetDetails(world, x, z, cfg) {
    streetDecay(world,x,z,cfg);
    const group = new THREE.Group();
    const concrete = material(world, 'concrete', 0x77776b);
    const soil = material(world, 'soil', 0x393a2c);
    const leaves = material(world, 'leaves', 0x526144);
    const paint = material(world, 'paint', 0x8a8677);
    // Parked wrecks explain an abandoned street; preserve a clear central driving lane.
    if(Math.abs(Math.round(x*7+z*11))%3===0){
        const car=buildSedanModel(),cx=x+cfg.blockSize*.18,cz=z-cfg.blockSize/2-3.8;
        car.position.set(cx,world.getTerrainHeight(cx,cz)+.035,cz);car.rotation.y=((Math.round(x+z)%5)/5)*.07;car.updateMatrixWorld(true);
        car.traverse(o=>{if(o.userData.isCollidable)world.colliders?.push(o);});world.scene.add(car);world._cityObjects.push(car);
    }
    // Two grounded alley planters; narrow leaf blades add silhouette detail.
    for (const side of [-1, 1]) {
        const px = x + side * (cfg.blockSize / 2 - 3), pz = z + 3;
        const ground = world.getTerrainHeight(px, pz);
        const planter = box(group, [1.5, 0.35, 0.7], [px, ground + 0.175, pz], concrete);
        planter.userData.isCollidable = true;
        world.colliders?.push(planter);
        box(group, [1.32, 0.025, 0.52], [px, ground + 0.35, pz], soil);
        for (let i = 0; i < 34; i++) {
            const h = 0.15 + Math.random() * 0.38;
            const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 3), leaves);
            blade.position.set(px + (Math.random() - 0.5) * 1.2, ground + 0.36 + h / 2, pz + (Math.random() - 0.5) * 0.4);
            blade.rotation.z = (Math.random() - 0.5) * 0.35;
            group.add(blade);
        }
    }
    // Faded crossing at the east street edge, inset from the intersection.
    const roadX = x + cfg.blockSize / 2 + cfg.roadWidth / 2;
    for (let i = 0; i < 8; i++) {
        const shape=new THREE.Shape(),w=.42+(i%3)*.025;shape.moveTo(-w/2,-1.3);shape.lineTo(w/2,-1.3);shape.lineTo(w/2,1.12);shape.lineTo(w*.1,1.22);shape.lineTo(-w/2,1.3);shape.lineTo(-w/2,.25);shape.lineTo(-w*.2,.17);shape.lineTo(-w/2,.08);shape.closePath();
        const stripe = new THREE.Mesh(new THREE.ShapeGeometry(shape), paint);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(roadX - 3.5 + i, world.getTerrainHeight(roadX, z) + 0.062, z + cfg.blockSize / 2 - 3.5);
        group.add(stripe);
    }
    world.scene.add(group); world._cityObjects.push(group);
    return group;
}
