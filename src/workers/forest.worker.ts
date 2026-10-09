import {generateForestChunks,type ForestJob} from './ForestData';
const worker=self as unknown as {onmessage:((event:MessageEvent<ForestJob>)=>void)|null;postMessage:(data:unknown,transfer:Transferable[])=>void};
worker.onmessage=event=>{const result=generateForestChunks(event.data);worker.postMessage(result,result.map(c=>c.trees.buffer));};
