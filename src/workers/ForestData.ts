export interface ForestJob {
    width:number;depth:number;seed:number;permutation:Uint8Array;
    config:import('./TerrainData').TerrainConfig;
    exclusions:Array<{minX:number;maxX:number;minZ:number;maxZ:number}>;
}
export interface ForestChunk {id:string;x:number;z:number;trees:Float32Array}
import {terrainSampler} from './TerrainData.ts';
/** Stable chunk recipes independent of arrival order; no Three.js objects cross threads. */
export function generateForestChunks(job:ForestJob):ForestChunk[]{
    let state=job.seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const sample=terrainSampler(job.permutation,job.config),chunks=new Map<string,{x:number;z:number;values:number[]}>();
    let count=0;
    for(let i=0;i<2000&&count<420;i++){
        const x=(random()-.5)*(job.width+340),z=(random()-.5)*(job.depth+340);
        if(Math.abs(x)<job.width/2+8&&Math.abs(z)<job.depth/2+8)continue;
        if(job.exclusions.some(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ))continue;
        const cx=Math.floor(x/128),cz=Math.floor(z/128),id=`forest:${cx},${cz}`;
        let chunk=chunks.get(id);if(!chunk){chunk={x:(cx+.5)*128,z:(cz+.5)*128,values:[]};chunks.set(id,chunk);}
        if(chunk.values.length>=32*4)continue;
        chunk.values.push(x,sample.height(x,z),z,5+random()*4);count++;
    }
    return [...chunks].map(([id,c])=>({id,x:c.x,z:c.z,trees:new Float32Array(c.values)}));
}
