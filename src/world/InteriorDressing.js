import * as THREE from 'three';

function finish(world,name,color,roughness=.9) {
    world._detailMaterials ||= new Map();const key='detail:interior-'+name;
    if(!world._detailMaterials.has(key)){const mat=new THREE.MeshStandardMaterial({color,roughness});mat.userData.staticBucket=key;world._detailMaterials.set(key,mat);}
    return world._detailMaterials.get(key);
}
export function interiorFloor(world,width,depth) {
    const key='detail:interior-floor';world._detailMaterials ||= new Map();
    if(!world._detailMaterials.has(key)) {
        const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
        for(let y=0;y<4;y++)for(let x=0;x<4;x++){ctx.fillStyle=(x+y)%2?'#817d6d':'#a09a83';ctx.fillRect(x*64,y*64,64,64);ctx.strokeStyle='#514f44';ctx.lineWidth=2;ctx.strokeRect(x*64,y*64,64,64);}
        for(let i=0;i<1200;i++){ctx.fillStyle='rgba(25,27,23,.06)';ctx.fillRect((i*31)%256,(i*83)%256,2+(i%4),1);}
        for(let i=0;i<14;i++){const x=(i*71)%256,y=(i*113)%256,r=20+(i%5)*11,gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(36,33,24,.28)');gradient.addColorStop(1,'rgba(36,33,24,0)');ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);}
        const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;
        const mat=new THREE.MeshStandardMaterial({map,roughness:.85,color:0xc7c1ac});mat.userData.staticBucket=key;world._detailMaterials.set(key,mat);
    }
    const material=world._detailMaterials.get(key),geometry=new THREE.BoxGeometry(width,.08,depth),uv=geometry.attributes.uv,n=geometry.attributes.normal;
    for(let i=0;i<uv.count;i++)if(Math.abs(n.getY(i))>.5)uv.setXY(i,uv.getX(i)*width/1.8,uv.getY(i)*depth/1.8);
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.isCollidable=true;mesh.receiveShadow=true;return mesh;
}

/** Small original shop layouts, merged into the existing static material batches. */
export function dressInterior(world,group,width,depth,type) {
    const metal=finish(world,'painted-steel',0x46504c),wood=finish(world,'wood',0x594837),paper=finish(world,'paper',0xb5af99),red=finish(world,'medical',0x773d38),ceramic=finish(world,'ceramic',0xb7b2a1,.62),fabric=finish(world,'seating',0x514b3c);
    const add=(size,p,material,collidable=false)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...p);m.castShadow=m.receiveShadow=true;m.userData.isCollidable=collidable;group.add(m);return m;};
    const cylinder=(r,h,p,material)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),material);m.position.set(...p);m.castShadow=m.receiveShadow=true;group.add(m);return m;};
    if(type===2) {
        add([1.2,1.25,.32],[0,1.25,-depth/2+.34],paper,true);add([.15,.65,.03],[0,1.25,-depth/2+.51],red);add([.55,.15,.03],[0,1.25,-depth/2+.52],red);
        for(let i=0;i<12;i++)if(i%3!==0)cylinder(.035,.13,[width/2-.6,.995,-1.8+i*.18],i%2?paper:ceramic);
    } else if(type===5) {
        for(const side of [-1,1]) {
            const x=side*width*.24,z=-depth*.20;
            add([1.1,.08,.72],[x,.78,z],wood,true);
            for(const sx of [-.42,.42])add([.07,.73,.07],[x+sx,.365,z],metal);
            for(const back of [-1,1]){add([1.1,.13,.35],[x,.45,z+back*.75],fabric,true);add([1.1,.65,.10],[x,.74,z+back*.95],fabric,true);}
            cylinder(.09,.018,[x+.22,.833,z],ceramic);cylinder(.045,.08,[x-.2,.87,z+.1],ceramic);
        }
    } else if(type===1||type===3) {
        add([1.7,.1,.7],[0,.85,-depth/2+1],wood,true);
        for(const x of [-.7,.7])add([.1,.82,.55],[x,.41,-depth/2+1],metal);
        for(let i=0;i<6;i++)add([.12,.07,.21],[-.62+i*.22,.94,-depth/2+1],i%2?red:metal);
        add([1.2,.65,.45],[-width*.32,.325,-depth*.29],metal,true);
    } else {
        for(let shelf=0;shelf<3;shelf++)for(let i=0;i<10;i++) {
            if((i+shelf)%3!==0)continue;
            const x=width/2-.65,y=.28+shelf*.7,z=-2+i*.35;
            if(i%2===0)cylinder(.055,.16,[x,y+.05,z],i%2?red:ceramic);
            else add([.13,.21,.16],[x,y+.08,z],i%2?paper:wood);
        }
    }
    // Doorway mat, ceiling fitting and store counter register give readable scale.
    add([1.65,.015,.65],[0,.052,depth/2-.7],fabric);
    add([.23,.18,.22],[-width*.20,.99,.6],metal);add([.25,.025,.16],[-width*.20,1.08,.66],paper);
    const fixture=add([1.1,.07,.16],[0,3.12,-.7],metal);
    add([.98,.025,.12],[0,3.07,-.7],ceramic);
    // A few fallen papers are grounded, not glowing pickups.
    for(let i=0;i<4;i++){const p=add([.21,.002,.29],[-.9+i*.47,.044,-.65+(i%2)*.5],paper);p.rotation.y=i*.6;}
    return fixture;
}
