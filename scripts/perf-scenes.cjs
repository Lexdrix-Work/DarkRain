const THREE=require('three'),RAPIER=require('@dimforge/rapier3d-compat');
module.exports=async function runScenes(){
    await RAPIER.init();const renderer=new THREE.WebGLRenderer({canvas:document.getElementById('fixture'),antialias:false,preserveDrawingBuffer:true});renderer.setSize(768,432,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    const gl=renderer.getContext(),results=[],matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),pixel=new Uint8Array(4);
    try{for(const name of ['courtyard','debris','chunk-churn']){
        const scene=new THREE.Scene();scene.background=new THREE.Color(0x384550);const camera=new THREE.PerspectiveCamera(65,768/432,.1,100);camera.position.set(14,12,20);camera.lookAt(0,2,0);
        scene.add(new THREE.HemisphereLight(0xffffff,0x344433,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(8,16,10);light.castShadow=true;light.shadow.mapSize.set(512,512);scene.add(light);
        const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({color:0x827567,roughness:.8}),ground=new THREE.Mesh(geometry,material);ground.scale.set(36,.2,36);ground.position.y=-.1;ground.receiveShadow=true;scene.add(ground);
        const count=name==='debris'?128:256,mesh=new THREE.InstancedMesh(geometry,material,count);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
        const world=name==='debris'?new RAPIER.World({x:0,y:-9.81,z:0}):null,bodies=[];
        if(world){world.createCollider(RAPIER.ColliderDesc.cuboid(18,.1,18).setTranslation(0,-.1,0));for(let i=0;i<count;i++){const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setTranslation((i%8)-4,2+Math.floor(i/64)*1.3,Math.floor(i/8)%8-4));world.createCollider(RAPIER.ColliderDesc.cuboid(.45,.45,.45).setDensity(1000),body);bodies.push(body);}}
        for(let i=0;i<count;i++){matrix.makeTranslation((i%16)-8,.5+(Math.floor(i/16)%3),Math.floor(i/16)-8);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;
        const chunks=[];if(name==='chunk-churn')for(let i=0;i<8;i++){const g=new THREE.BoxGeometry(2,2,2),chunk=new THREE.Mesh(g,material);chunk.position.set((i-4)*3,1,-11);scene.add(chunk);chunks.push(chunk);}
        const times=[];let maxDrawCalls=0,maxGeometries=0,maxTextures=0,minDrawCalls=Infinity,minTriangles=Infinity;
        try{for(let frame=0;frame<210;frame++){
            const start=performance.now();
            if(world){if(frame%60===0)for(const body of bodies)body.applyImpulse({x:.5,y:30,z:0},true);world.step();for(let i=0;i<count;i++){const p=bodies[i].translation(),q=bodies[i].rotation();position.set(p.x,p.y,p.z);rotation.set(q.x,q.y,q.z,q.w);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;}
            if(chunks.length&&frame%6===0){const index=Math.floor(frame/6)%chunks.length,chunk=chunks[index];chunk.geometry.dispose();chunk.geometry=new THREE.BoxGeometry(2,2,2);chunk.position.z=-11+(frame%12)*.05;}
            renderer.render(scene,camera);gl.finish();const elapsed=performance.now()-start;
            if(frame>=60){times.push(elapsed);const info=renderer.info;maxDrawCalls=Math.max(maxDrawCalls,info.render.calls);minDrawCalls=Math.min(minDrawCalls,info.render.calls);minTriangles=Math.min(minTriangles,info.render.triangles);maxGeometries=Math.max(maxGeometries,info.memory.geometries);maxTextures=Math.max(maxTextures,info.memory.textures);}
            await new Promise(resolve=>setTimeout(resolve,0));
        }
        gl.readPixels(384,216,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);times.sort((a,b)=>a-b);
        results.push({name,samples:times.length,avg:times.reduce((a,b)=>a+b,0)/times.length,p95:times[Math.ceil(times.length*.95)-1],p99:times[Math.ceil(times.length*.99)-1],maxDrawCalls,minDrawCalls,minTriangles,maxGeometries,maxTextures,activeBodies:bodies.filter(body=>!body.isSleeping()).length,nonBlank:pixel[0]+pixel[1]+pixel[2]>0});
        }finally{world?.free();mesh.dispose();geometry.dispose();material.dispose();for(const chunk of chunks)chunk.geometry.dispose();light.shadow.map?.dispose();}
        results[results.length-1].remainingGeometries=renderer.info.memory.geometries;
    }}finally{renderer.dispose();}
    const debug=gl.getExtension('WEBGL_debug_renderer_info');return {scenes:results,adapter:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
};
