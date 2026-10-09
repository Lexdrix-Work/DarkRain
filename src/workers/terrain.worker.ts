import { generateTerrain, type TerrainJob } from './TerrainData';
const worker=self as unknown as {onmessage:((event:MessageEvent<TerrainJob>)=>void)|null;postMessage:(data:unknown,transfer:Transferable[])=>void};
worker.onmessage=event=>{
    const result=generateTerrain(event.data);
    worker.postMessage(result,[result.positions.buffer,result.colors.buffer,result.normals.buffer]);
};
