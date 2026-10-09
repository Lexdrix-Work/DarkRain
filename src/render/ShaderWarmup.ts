import { Mesh, Line, Points, Sprite, InstancedBufferAttribute, DynamicDrawUsage, type Scene, type Camera } from 'three';
import { StorageInstancedBufferAttribute, type WebGPURenderer } from 'three/webgpu';

export const paintLoadingFrame=():Promise<void>=>new Promise(resolve=>{let finished=false,frame=0;const done=()=>{if(finished)return;finished=true;clearTimeout(timer);globalThis.cancelAnimationFrame?.(frame);resolve();};const timer=setTimeout(done,100);frame=requestAnimationFrame(()=>setTimeout(done,0));});

/** Compile existing render objects in bounded groups while the loading UI can paint. */
export async function warmSceneShaders(renderer:WebGPURenderer,scenes:Array<{scene:Scene;camera:Camera}>,progress:(value:number)=>void){
    const webgpu='isWebGPUBackend' in renderer.backend&&renderer.backend.isWebGPUBackend;
    const gl=!webgpu?renderer.getContext?.() as WebGL2RenderingContext|undefined:undefined;
    const matrixCount=Math.floor((gl?.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE)||65536)/64)+1;
    // GPU storage is native on WebGPU. On GL, force the supported interleaved
    // instanced-attribute path instead of count-specific matrix uniform arrays.
    for(const {scene}of scenes)scene.traverse(object=>{
        const mesh=object as Mesh & {isInstancedMesh?:boolean;instanceMatrix?:InstancedBufferAttribute & {isStorageInstancedBufferAttribute?:boolean}};
        if(mesh.isInstancedMesh&&mesh.instanceMatrix&&!mesh.instanceMatrix.isStorageInstancedBufferAttribute){
            if(webgpu)mesh.instanceMatrix=new StorageInstancedBufferAttribute(mesh.instanceMatrix.array,16);
            else{
                if(mesh.instanceMatrix.count<matrixCount){const data=new Float32Array(matrixCount*16);data.set(mesh.instanceMatrix.array);mesh.instanceMatrix=new InstancedBufferAttribute(data,16);}
                mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            }
            // Existing reflection/render pipelines may have captured the old attribute.
            // Release their object bindings when changing the buffer representation.
            mesh.dispose?.();
            for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.needsUpdate=true;
        }
    });
    // The GL fallback's parallel compiler can stall on a city-wide warmup.
    // Let its normal visible-scene draw create only the pipelines it needs.
    if(!webgpu){
        progress(1);await paintLoadingFrame();return;
    }
    const jobs=scenes.map(({scene,camera})=>{
        const objects:Array<Mesh|Line|Points|Sprite>=[];
        scene.traverseVisible(object=>{if(object instanceof Mesh||object instanceof Line||object instanceof Points||object instanceof Sprite)objects.push(object);});
        scene.traverse(object=>{if(object.userData.prewarm&&!objects.includes(object as Sprite)&&(object instanceof Mesh||object instanceof Line||object instanceof Points||object instanceof Sprite))objects.push(object);});
        return{scene,camera,objects};
    });
    const total=jobs.reduce((sum,job)=>sum+job.objects.length,0)||1;
    let completed=0;
    for(const {scene,camera,objects} of jobs){
        const prior=objects.map(object=>({object,visible:object.visible,culled:object.frustumCulled}));
        try{
            for(const object of objects)object.visible=false;
            for(let start=0;start<objects.length;start+=24){
                const batch=objects.slice(start,start+24);
                for(const object of batch){object.visible=true;object.frustumCulled=false;}
                await renderer.compileAsync(scene,camera);
                for(const object of batch)object.visible=false;
                completed+=batch.length;progress(completed/total);
                await paintLoadingFrame();
            }
        }finally{
            for(const {object,visible,culled} of prior){object.visible=visible;object.frustumCulled=culled;}
        }
    }
}



