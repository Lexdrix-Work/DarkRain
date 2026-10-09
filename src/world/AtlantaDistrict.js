import * as THREE from 'three';
import { addStreetDetails } from './StreetDetails.js';
import { atlantaSeed, atlantaParkAt } from './AtlantaGeography.js';
import { buildAtlantaPark } from './AtlantaPark.js';

/** Original Southern neighborhood block: human-scale storefronts and yards. */
export function buildAtlantaBlock(world, x, z, cfg) {
    const geography=world.atlantaGeography;
    const profile=geography?.profileAt(x,z);
    const park=geography && atlantaParkAt(geography,x,z);
    if(park) return buildAtlantaPark(world,x,z,cfg,park);
    const edge=cfg.blockSize/2;
    const frontage=(cfg.blockSize-8)/2;
    for(const side of [-1,1]) for(const lot of [-1,1]) {
        const bx=x+lot*(frontage/2+1.2);
        const bz=z+side*(edge-6.5);
        const downtown=cfg.district==='downtown';
        const core=cfg.blocksX&&Math.hypot(x-cfg.blockSize*.7,z+cfg.blockSize*.7)<cfg.blockSize*1.65;
        const skyline = x > cfg.blockSize * 1.5 && z < -cfg.blockSize * 1.5 && lot > 0 && side < 0;
        const landmark=core&&lot>0&&side<0;
        const legacyFloors=landmark?22+Math.floor(Math.random()*10):core?7+Math.floor(Math.random()*7):skyline?14+Math.floor(Math.random()*9):downtown?3+Math.floor(Math.random()*5):1+Math.floor(Math.random()*3);
        const identity=atlantaSeed(bx,bz);
        const tower=profile?.tower && lot>0 && side<0 && identity>.42;
        const floors=profile ? tower ? profile.tower+Math.floor(identity*4) : profile.min+Math.floor(identity*(profile.max-profile.min+1)) : legacyFloors;
        const damaged=atlantaSeed(bx,bz,137)<0.18;
        // Varied lot coverage leaves service gaps without moving road-facing entrances.
        const buildingWidth=Math.max(15,frontage-1.4-identity*2.2),buildingDepth=(profile?.kind==='warehouse'||tower)?16+identity*2:10.5+identity*2.5;
        const inset=side*(13-buildingDepth)/2;
        world.createBuilding(bx,bz+inset,buildingWidth,buildingDepth,floors,damaged,damaged?0:-1,'atlanta','flat',side<0?Math.PI:0);
    }
    world.createBlockSidewalks(x,z,cfg.blockSize,cfg.roadWidth);
    addStreetDetails(world,x,z,cfg);
    // A small rear service court preserves room for alleys and exploration.
    const court=new THREE.Mesh(new THREE.PlaneGeometry(cfg.blockSize-4,7),world.materials.sidewalk);
    court.rotation.x=-Math.PI/2;court.position.set(x,world.getTerrainHeight(x,z)+0.035,z);
    court.receiveShadow=true;world.scene.add(court);world._cityObjects.push(court);
    // Lean, local props: only four lamps/hydrants/signs per block, then merged.
    for(const side of [-1,1]) {
        const sx=x-edge+3,sz=z+side*(edge+1);
        const hydrant=new THREE.Group();
        const iron=new THREE.MeshStandardMaterial({color:0x936143,roughness:0.82,metalness:0.25});
        const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,0.48,10),iron);stem.position.y=0.24;hydrant.add(stem);
        const cap=new THREE.Mesh(new THREE.SphereGeometry(0.13,10,8),iron);cap.scale.y=0.5;cap.position.y=0.5;hydrant.add(cap);
        const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.28,8),iron);nozzle.rotation.z=Math.PI/2;nozzle.position.y=0.32;hydrant.add(nozzle);
        hydrant.position.set(sx,world.getTerrainHeight(sx,sz)+0.14,sz);
        hydrant.traverse(o=>{if(o.isMesh)o.castShadow=true;});world.scene.add(hydrant);world._cityObjects.push(hydrant);
    }
}

export function addStorefrontSign(world,group,width,depth) {
    if(!world._detailMaterials) world._detailMaterials=new Map();
    const names=['HOLLOWAY GROCERY','PEACHTREE REPAIR','SOUTH LINE PHARMACY','MERCER HARDWARE','OAK STREET LAUNDRY','EAST WARD DINER'];
    const index=Math.floor(Math.random()*names.length),key=`detail:sign${index}`;
    group.userData.shopType = index;
    let material=world._detailMaterials.get(key);
    if(!material) {
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
        const ctx=canvas.getContext('2d');ctx.fillStyle=index%2?'#414d45':'#694e3e';ctx.fillRect(0,0,512,128);
        ctx.strokeStyle='#b4a889';ctx.lineWidth=3;ctx.strokeRect(9,9,494,110);
        ctx.fillStyle='#d4c5a6';ctx.textAlign='center';ctx.font='bold 31px Georgia';ctx.fillText(names[index],256,65);
        ctx.font='14px sans-serif';ctx.fillStyle='#a99c80';ctx.fillText('NEIGHBORHOOD SERVICE • EST. 1958',256,99);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
        material=new THREE.MeshStandardMaterial({map:texture,roughness:0.93,metalness:0});
        material.userData.staticBucket=key;world._detailMaterials.set(key,material);
    }
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width*0.72,8),0.8),material);
    sign.position.set(0,2.95,depth/2+0.11);group.add(sign);
}
