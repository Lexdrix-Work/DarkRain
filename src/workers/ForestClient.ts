import ForestWorker from './forest.worker?worker';
import type {ForestJob,ForestChunk} from './ForestData';
export function generateForestOffThread(job:ForestJob,signal?:AbortSignal):Promise<ForestChunk[]>{
    const worker=new ForestWorker();
    return new Promise((resolve,reject)=>{
        const finish=(error?:Error,value?:ForestChunk[])=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value!);};
        const abort=()=>finish(new Error('Forest preparation cancelled'));
        const timeout=setTimeout(()=>finish(new Error('Forest preparation timed out')),10000);
        if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
        worker.onmessage=(event:MessageEvent<ForestChunk[]>)=>finish(undefined,event.data);
        worker.onerror=event=>finish(new Error(event.message));worker.postMessage(job);
    });
}
