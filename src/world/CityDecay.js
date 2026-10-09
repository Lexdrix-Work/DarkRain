import * as THREE from 'three';

function material(world,name,color) {
    world._detailMaterials ||= new Map();const key='detail:decay-'+name;
    if(!world._detailMaterials.has(key)){const m=new THREE.MeshStandardMaterial({color,roughness:.97,side:THREE.DoubleSide});m.userData.staticBucket=key;world._detailMaterials.set(key,m);}
    return world._detailMaterials.get(key);
}
function box(g,size,p,m){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),m);mesh.position.set(...p);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
function leafGeometry() {
    const s=new THREE.Shape();s.moveTo(0,0);s.quadraticCurveTo(-.025,.022,-.052,.027);s.quadraticCurveTo(-.075,.056,-.028,.065);s.quadraticCurveTo(-.047,.088,-.027,.103);s.quadraticCurveTo(-.01,.102,0,.142);s.quadraticCurveTo(.015,.10,.03,.104);s.quadraticCurveTo(.05,.088,.03,.066);s.quadraticCurveTo(.076,.058,.053,.028);s.quadraticCurveTo(.025,.026,0,0);s.closePath();
    const g=new THREE.ShapeGeometry(s,4),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,.009*Math.max(0,1-Math.abs(p.getX(i))/.055)*Math.sin(p.getY(i)*22));g.computeVertexNormals();return g;
}
export function facadeDecay(world,group,width,depth,height,damaged) {
    const dark=material(world,'ivy-dark',0x47613d),light=material(world,'ivy-light',0x6f8050),stem=material(world,'vine',0x4c4735),soil=material(world,'soil',0x444036);
    if(!soil.map) {
        const c=document.createElement('canvas');c.width=64;c.height=256;const ctx=c.getContext('2d');
        for(let y=0;y<256;y++){ctx.fillStyle='rgba(255,255,255,'+(.45*(1-y/256)).toFixed(3)+')';ctx.fillRect(20+Math.sin(y*.13)*5,y,12+(y%7),1);}
        soil.map=new THREE.CanvasTexture(c);soil.transparent=true;soil.opacity=.3;soil.depthWrite=false;soil.needsUpdate=true;
    }
    const front=depth/2;
    if(damaged||Math.random()<.68)for(const side of [-1,1]) {
        const x=side*(width/2-.27),start=Math.min(height,6.4),length=start-.12;
        const points=[];for(let i=0;i<8;i++)points.push(new THREE.Vector3(x+Math.sin(i*1.4)*.13,start-i*length/7,front+.23));
        const vine=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,.009,4,false),stem);group.add(vine);
        for(let i=0;i<86;i++) {
            const leaf=new THREE.Mesh(leafGeometry(),i%3?dark:light),t=i/85;
            leaf.position.set(x+Math.sin(i*2.4)*(.15+t*.55),start-t*length,front+.235+(i%3)*.014);
            leaf.rotation.set((i%5-.2)*.07,Math.sin(i)*.3,Math.sin(i*1.3)*.9);const scale=.55+(i%5)*.10;leaf.scale.setScalar(scale);group.add(leaf);
        }
    }
    // Staining below gutters and at fixed frontage piers, not detached breach panels.
    for(const side of [-1,1]) {
        const stain=box(group,[.12,.95,.008],[side*(width/2-.21),1.75,front+.218],soil);stain.rotation.z=side*.018;
    }
    for(let i=0;i<4;i++) {
        const x=-width*.3+i*width*.2,z=-depth*.3+(i%2)*depth*.2;
        const patch=new THREE.CircleGeometry(.38,11),vertices=patch.attributes.position;
        for(let v=1;v<vertices.count;v++){const scale=.7+.3*Math.sin(v*2.8+i);vertices.setXY(v,vertices.getX(v)*scale,vertices.getY(v)*scale*.8);}
        patch.rotateX(-Math.PI/2);const moss=new THREE.Mesh(patch,dark);moss.position.set(x,height+.188,z);moss.rotation.y=i*.7;group.add(moss);
        for(let j=0;j<7;j++) {const blade=new THREE.Mesh(new THREE.PlaneGeometry(.03,.16+(j%3)*.07),light);blade.position.set(x+(j-3)*.055,height+.26,z+Math.sin(j)*.13);blade.rotation.y=j*1.2;group.add(blade);}
    }
}

export function streetDecay(world,x,z,cfg) {
    const g=new THREE.Group(),paper=material(world,'paper',0x938b72),cardboard=material(world,'cardboard',0x66543c),plastic=material(world,'plastic',0x444c43),green=material(world,'grass',0x596343),dark=material(world,'grass-dark',0x3b4930);
    for(const side of [-1,1])for(let cluster=0;cluster<5;cluster++) {
        const px=x+side*(cfg.blockSize/2-1.3),pz=z-cfg.blockSize*.35+cluster*cfg.blockSize*.17;
        for(let i=0;i<5;i++) {
            const tx=px+Math.sin(i*2.4+cluster)*.65,tz=pz+Math.cos(i*1.7)*.85,y=world.getTerrainHeight(tx,tz)+.055;
            if(i%3===0){const m=box(g,[.23,.018,.31],[tx,y,tz],paper);m.rotation.y=i*1.7;}
            else if(i%3===1){const m=box(g,[.18,.10,.26],[tx,y+.05,tz],cardboard);m.rotation.y=cluster+i;}
            else {const can=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.12,10),plastic);can.position.set(tx,y+.045,tz);can.rotation.z=Math.PI/2;g.add(can);}
        }
        for(let i=0;i<14;i++) {
            const blade=new THREE.Mesh(new THREE.PlaneGeometry(.025,.14+(i%4)*.045),i%3?green:dark);
            const tx=px+Math.sin(i*2.9)*.28,tz=pz+Math.cos(i*1.9)*.4;
            blade.position.set(tx,world.getTerrainHeight(tx,tz)+.12+(i%4)*.02,tz);blade.rotation.set(Math.sin(i)*.12,i*1.3,Math.sin(i*1.7)*.3);g.add(blade);
        }
    }
    for(const side of [-1,1]) {
        const px=x+side*(cfg.blockSize/2-2),pz=z+cfg.blockSize*.25;
        for(let i=0;i<3;i++) {
            const bag=new THREE.Mesh(new THREE.IcosahedronGeometry(.16,1),plastic);bag.scale.set(1,.85,1.25);bag.position.set(px+i*.23,world.getTerrainHeight(px,pz)+.15,pz+(i%2)*.13);bag.castShadow=bag.receiveShadow=true;g.add(bag);
        }
        for(let i=0;i<4;i++) {const slat=box(g,[.45,.018,.07],[px-.35,world.getTerrainHeight(px,pz)+.065+i*.013,pz+.2+i*.11],cardboard);slat.rotation.y=i*.8;}
    }
    world.scene.add(g);world._cityObjects.push(g);return g;
}
