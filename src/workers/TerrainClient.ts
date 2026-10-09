import TerrainWorker from './terrain.worker?worker';
import type { TerrainJob } from './TerrainData';
interface TerrainResult {positions:Float32Array;colors:Float32Array;normals:Float32Array}
export function generateTerrainOffThread(job:TerrainJob):Promise<TerrainResult>{
    const worker=new TerrainWorker();
    return new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Terrain generation timed out'));},60000);
        worker.onmessage=(event:MessageEvent<TerrainResult>)=>{clearTimeout(timeout);worker.terminate();resolve(event.data);};
        worker.onerror=error=>{clearTimeout(timeout);worker.terminate();reject(new Error(error.message));};
        worker.postMessage(job,[job.positions.buffer]);
    });
}
