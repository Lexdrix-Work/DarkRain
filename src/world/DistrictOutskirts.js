import * as THREE from 'three';
import {ForestStreaming} from './streaming/ForestStreaming.js';
import {generateForestChunks} from '../workers/ForestData.ts';
import { buildAtlantaCorridor } from './AtlantaCorridor.js';

/** Connected outskirts with small settlements and instanced woodland. */
export async function buildDistrictOutskirts(world, cfg, width, depth, startZ,signal=world.loadingAbort?.signal) {
    const roadZ = startZ - cfg.roadWidth / 2 + Math.floor(cfg.blocksZ / 2) * (cfg.blockSize + cfg.roadWidth);
    const half = width / 2, extension = 170;
    for (const side of [-1, 1]) {
        world.createRoad(side * (half + extension / 2 - 1), roadZ, extension + 2, 18, 'horizontal');
        // Small roadside hamlets use the same accessible shell and loot supports.
        for (let i = 0; i < 3; i++) {
            world.createBuilding(side * (half + 55 + i * 19), roadZ + 20, 12, 10, i === 1 ? 2 : 1, false, -1, 'atlanta', 'flat', Math.PI);
        }
    }
    buildAtlantaCorridor(world,cfg,width,depth,roadZ);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    // Leaf clusters with empty edges, rather than solid geometric tree crowns.
    for (let i = 0; i < 650; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 53;
        const x = 64 + Math.cos(a) * r, y = 65 + Math.sin(a) * r * 0.9;
        ctx.fillStyle = ['#566346','#72805b','#394e38','#87916a'][i % 4];
        ctx.beginPath(); ctx.ellipse(x, y, 2 + Math.random() * 4, 1.5 + Math.random() * 3, a, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const foliage = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const bark = new THREE.MeshStandardMaterial({ color: 0x66523c, roughness: 1 });
    const exclusions=[{minX:-width,maxX:width,minZ:roadZ-14,maxZ:roadZ+14},
        {minX:world.transportCorridor.x-24,maxX:world.transportCorridor.x+24,minZ:-depth-340,maxZ:depth+340},
        {minX:world.transportCorridor.railX-6,maxX:world.transportCorridor.railX+6,minZ:-depth-340,maxZ:depth+340},
        ...world.transportCorridor.approaches.map(a=>({minX:a.minX-3,maxX:a.maxX+3,minZ:a.z-a.width/2-3,maxZ:a.z+a.width/2+3})),
        ...world.buildingSpots.map(s=>({minX:s.x-s.width/2-5,maxX:s.x+s.width/2+5,minZ:s.z-s.depth/2-5,maxZ:s.z+s.depth/2+5}))];
    const job={width,depth,seed:cfg.terrainSeed+7919,permutation:world._noisePerm,config:cfg,exclusions};
    let recipes,preparationBackend='local';
    if(typeof Worker!=='undefined'){
        const {generateForestOffThread}=await import('../workers/ForestClient.ts');
        try{recipes=await generateForestOffThread(job,signal);preparationBackend='worker';}catch(error){if(signal?.aborted){foliage.map.dispose();foliage.dispose();bark.dispose();throw new DOMException('World preparation cancelled','AbortError');}console.warn('Woodland worker unavailable; using bounded local recipes',error);recipes=generateForestChunks(job);}
    }else recipes=generateForestChunks(job);
    if(signal?.aborted){foliage.map.dispose();foliage.dispose();bark.dispose();throw new DOMException('World preparation cancelled','AbortError');}
    world.forestStreaming=new ForestStreaming(world,recipes,bark,foliage);
    world.outskirts={treeCount:world.forestStreaming.treeCount,roadZ,settlementCount:2,chunkCount:recipes.length,preparationBackend};
}
