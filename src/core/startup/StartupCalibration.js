import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {initPhysics} from '../../systems/PhysicsSystem.js';
const percentile=(values,p)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;};
/** Optional local calibration, isolated from campaign physics and saves. */
export async function runStartupCalibration(game,signal,onProgress=()=>{}){
    if(signal.aborted)throw new Error('Calibration skipped');const start=performance.now(),deadline=start+20000;await initPhysics();if(signal.aborted)throw new Error('Calibration skipped');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,960/540,.1,150);camera.position.set(20,15,30);camera.lookAt(0,0,0);scene.add(new THREE.HemisphereLight(0xbec8b8,0x333a2f,1.4));const light=new THREE.DirectionalLight(0xe7e2d5,3);light.position.set(12,20,6);scene.add(light);
    const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({color:0x777c70,roughness:.8}),mesh=new THREE.InstancedMesh(geometry,material,512),matrix=new THREE.Matrix4();
    for(let i=0;i<512;i++){matrix.makeTranslation((i%32-16)*1.5,Math.floor(i/32)%4,Math.floor(i/128)*3-6);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
    const target=new THREE.RenderTarget(960,540),world=new RAPIER.World({x:0,y:-9.81,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(25,.1,25));for(let i=0;i<64;i++){const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(i%8-4,1+Math.floor(i/8)*.8,0));world.createCollider(RAPIER.ColliderDesc.cuboid(.3,.3,.3),body);}
    const intervals=[],cpu=[];let previous=performance.now();
    try{
        // Warm a small known scene, rather than compiling the full city before the menu.
        for(let frame=0;frame<240&&performance.now()<deadline;frame++){
            if(signal.aborted||document.hidden)throw new Error('Calibration skipped');const tick=performance.now();world.step();const old=game.renderer.getRenderTarget();
            try{game.renderer.setRenderTarget(target);game.renderer.render(scene,camera);}finally{game.renderer.setRenderTarget(old);}
            if(frame>30){cpu.push(performance.now()-tick);intervals.push(tick-previous);}previous=tick;onProgress(Math.min(100,frame/240*100));
            await new Promise(resolve=>setTimeout(resolve,16));
        }
        if(intervals.length<30)throw new Error('Insufficient calibration samples');
        const p95=percentile(intervals,.95),cpuMean=cpu.reduce((a,b)=>a+b,0)/cpu.length,recommended=p95>26||cpuMean>8?'low':'medium';
        return {version:1,backend:game.renderer.backendName,p95IntervalMs:p95,cpuMeanMs:cpuMean,samples:intervals.length,recommended,confidence:'provisional',elapsedMs:performance.now()-start};
    }finally{world.free();geometry.dispose();material.dispose();mesh.dispose();target.dispose();}
}
