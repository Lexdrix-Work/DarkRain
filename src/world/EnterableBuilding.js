import { interiorFloor,dressInterior } from './InteriorDressing.js';
import { facadeDecay } from './CityDecay.js';
import { addDestructibleWalls } from './DestructibleWalls.js';
import { addGlassWindows } from './GlassWindows.js';
import * as THREE from 'three';
import { addStorefrontSign } from './AtlantaDistrict.js';
import { addFacadeDetails } from './StreetDetails.js';
import { buildingStyle } from './BuildingStyle.js';

/** Original historic commercial shell. All ground floors have an open doorway. */
export function buildEnterableBuilding(world, x, z, width, depth, floors, damaged, facing) {
    const g = new THREE.Group(); g.rotation.y = facing;
    const base = world.getTerrainHeight(x, z);
    g.position.set(x, base, z);
    const h = floors * 3.3, front = depth / 2;
    const panes=[],wallSections=[];
    const reinforcement=floors>=10?Math.max(4,floors/3):1;
    const structuralGroups=new Map();let structural=true;
    const neighborhood=world.atlantaGeography?.districtAt(x,z);
    g.userData.neighborhood=neighborhood;
    const style=buildingStyle(x,z,floors,neighborhood);g.userData.architecture=style.name;g.userData.isDamaged=damaged;g.userData.structureId='structure:'+x.toFixed(2)+','+z.toFixed(2);
    const brick = world.createBuildingMaterial('atlanta', width, h);
    brick.color.setHex(style.tint);
    if(style.variant===1||floors>=10){world._applyProcedural?.(brick,'concrete',width/1.8,h/1.5);if(floors>=10)brick.color.setHex([0xa9aaa0,0xc0beb1,0x7a8585,0x9e9c91][style.variant]);}
    const stone = new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.95 });
    const plaster = new THREE.MeshStandardMaterial({ color: 0x878779, roughness: 1, side: THREE.DoubleSide });
    const wood = new THREE.MeshStandardMaterial({ color: 0x655341, roughness: 0.94 });
    world._applyProcedural?.(plaster, 'concrete', width / 3, depth / 3);
    const iron = new THREE.MeshStandardMaterial({ color: 0x363e3c, roughness: 0.72, metalness: 0.35 });
    const roofMaterial=new THREE.MeshStandardMaterial({color:0x4a4e44,roughness:.98});
    world._applyProcedural?.(roofMaterial,'concrete',1,1);roofMaterial.bumpScale=.03;
    const box = (size, pos, mat, collidable = false) => {
        if(structural&&(collidable||pos[1]>=h-.2)) {
            let cells=structuralGroups.get(mat);if(!cells){cells=[];structuralGroups.set(mat,cells);}
            const splits=size.map(v=>Math.max(1,Math.ceil(v/1.4)));
            for(let ix=0;ix<splits[0];ix++)for(let iy=0;iy<splits[1];iy++)for(let iz=0;iz<splits[2];iz++) {
                const dims=size.map((v,i)=>v/splits[i]),p=pos.map((v,i)=>v-size[i]/2+([ix,iy,iz][i]+.5)*dims[i]);
                cells.push({size:dims,position:p,health:mat===iron?150:mat===wood?45:mat===brick?68:85,density:mat===iron?3000:mat===wood?900:2100,capacity:(mat===iron?3000000:mat===wood?60000:mat===brick?600000:1800000)*reinforcement});
            }
            // Return a harmless transform proxy for callers that rotate sloped roofs.
            // Sloped roof panels remain ordinary fixed geometry below.
            return new THREE.Object3D();
        }
        const geom = new THREE.BoxGeometry(...size);
        // Each masonry panel keeps the same physical brick scale.
        if (mat === brick || mat===roofMaterial) {
            const uv = geom.attributes.uv;
            const normals = geom.attributes.normal;
            for (let i = 0; i < uv.count; i++) {
                const uSpan = Math.abs(normals.getX(i)) > 0.5 ? size[2] : size[0];
                const vSpan = Math.abs(normals.getY(i)) > 0.5 ? size[2] : size[1];
                uv.setXY(i,uv.getX(i)*uSpan/(mat===brick?width:1.8),uv.getY(i)*vSpan/(mat===brick?h:1.8));
            }
        }
        const m = new THREE.Mesh(geom, mat); m.position.set(...pos);
        m.castShadow = m.receiveShadow = true; m.userData.isCollidable = collidable;
        g.add(m); return m;
    };
    // Ground-floor shell: no invisible full-building collision box.
    g.add(interiorFloor(world,width,depth));
    // Ground-floor infill and the upper shell share a cell support network.
    for(let row=0;row<5;row++) {
        const backCount=Math.ceil(width/.85),sideCount=Math.ceil(depth/.85);
        for(let i=0;i<backCount;i++)wallSections.push({size:[width/backCount,.66,.3],position:[-width/2+(i+.5)*width/backCount,(row+.5)*.66,-front]});
        for(const side of [-1,1])for(let i=0;i<sideCount;i++)wallSections.push({size:[.3,.66,depth/sideCount],position:[side*width/2,(row+.5)*.66,-front+(i+.5)*depth/sideCount]});
    }
    for(const section of wallSections)section.capacity=600000*reinforcement;
    // Door opening is 1.8m wide and 2.45m high. Display glazing sits between piers.
    const bay = (width - 1.8) / 2;
    for (const side of [-1, 1]) {
        const bx = side * (0.9 + bay / 2);
        box([bay, 0.38, 0.3], [bx, 0.19, front], stone, true);
        box([bay, 0.16, 0.12], [bx, 2.5, front + 0.03], stone);
        const columns=Math.max(2,Math.ceil((bay-.55)/1.3)),paneWidth=(bay-.55)/columns;
        for(let col=0;col<columns;col++)for(let row=0;row<2;row++)panes.push({size:[paneWidth-.035,.995,.018],position:[bx-(bay-.55)/2+(col+.5)*paneWidth,.925+row*1.03,front-.12]});
        for(let col=1;col<columns;col++)box([.035,2.03,.055],[bx-(bay-.55)/2+col*paneWidth,1.435,front-.10],iron);
        box([bay-.55,.035,.055],[bx,1.435,front-.10],iron);
        for (const px of [side * 0.98, side * (width / 2 - 0.12)])
            box([0.22, 2.55, 0.42], [px, 1.275, front], stone, true);
        box([0.055, 2, 0.09], [bx, 1.43, front - 0.06], iron);
    }
    box([width, 0.8, 0.3], [0, 2.9, front], brick, true);
    // Upper rooms have real slab/wall openings behind glazing, never a solid mass.
    const count = Math.max(2, Math.floor(width / style.pitch)),pitch=width/count,windowWidth=Math.min(style.windowWidth,pitch-.35);
    structural=true;
    if(floors>=8)for(let tier=0;tier<(floors>=22?2+style.variant%3:1);tier++)box([width*(.66-tier*.12),tier===0?2.7:1.6,depth*(.58-tier*.1)],[0,h+1.35+tier*1.6,-1],iron,true);
    for(let floor=1;floor<floors;floor++) {
        const baseY=floor*3.3;
        box([width,.12,depth],[0,baseY+.04,0],plaster,true);
        for(const side of [-1,1]) {
            const sideCount=Math.max(2,Math.floor(depth/style.pitch)),sidePitch=depth/sideCount,sideWindow=Math.min(windowWidth,sidePitch-.35);
            box([.3,.8,depth],[side*width/2,baseY+.4,0],brick,true);
            box([.3,.82,depth],[side*width/2,baseY+2.89,0],brick,true);
            for(let i=0;i<=sideCount;i++){
                const pierDepth=(sidePitch-sideWindow)*(i===0||i===sideCount?.5:1),pz=-front+i*sidePitch+(i===0?pierDepth/2:i===sideCount?-pierDepth/2:0);
                box([.3,1.68,pierDepth],[side*width/2,baseY+1.64,pz],brick,true);
            }
            for(let i=0;i<sideCount;i++){
                const wz=-front+(i+.5)*sidePitch,wy=baseY+1.64;
                panes.push({size:[.018,1.68,sideWindow],position:[side*(width/2+.01),wy,wz]});
                for(const edge of [-1,1])box([.09,1.82,.065],[side*(width/2+.03),wy,wz+edge*(sideWindow/2+.02)],iron);
                box([.22,.12,sideWindow+.18],[side*(width/2+.03),wy-.9,wz],stone);
                if(style.variant===2)box([.06,1.68,.04],[side*(width/2+.04),wy,wz],iron);
            }
            box([width,.8,.3],[0,baseY+.4,side*front],brick,true);
            box([width,.82,.3],[0,baseY+2.89,side*front],brick,true);
            for(let i=0;i<=count;i++) {
                const pierWidth=(pitch-windowWidth)*(i===0||i===count?.5:1);
                const px=-width/2+i*pitch+(i===0?pierWidth/2:i===count?-pierWidth/2:0);
                box([pierWidth,1.68,.3],[px,baseY+1.64,side*front],brick,true);
            }
            for(let i=0;i<count;i++) {
                const wx=-width/2+pitch*(i+.5),wy=baseY+1.64;
                panes.push({size:[windowWidth,1.68,.018],position:[wx,wy,side*(front+.01)]});
                for(const edge of [-1,1])box([.065,1.82,.09],[wx+edge*(windowWidth/2+.02),wy,side*(front+.03)],iron);
                box([windowWidth+.18,.12,.22],[wx,wy-.90,side*(front+.03)],stone);
                box([windowWidth+.18,.12,.12],[wx,wy+.9,side*(front+.03)],iron);
                if(style.variant===2){box([.04,1.68,.06],[wx,wy,side*(front+.04)],iron);box([windowWidth,.04,.06],[wx,wy,side*(front+.04)],iron);}
            }
        }
        // A sparse partition breaks up empty upper rooms without blocking window views.
        box([.1,2.7,depth*.45],[0,baseY+1.4,-depth*.18],plaster,true);
    }
    // Narrow base, roof parapet, inset brick panels and cornice dentils.
    if(damaged) {
        const hw=Math.min(3,width*.24),hd=Math.min(3,depth*.25);
        for(const side of [-1,1]) {
            box([(width-hw)/2,.18,depth],[side*(width+hw)/4,h+.09,0],roofMaterial,true);
            box([hw,.18,(depth-hd)/2],[0,h+.09,side*(depth+hd)/4],roofMaterial,true);
            for(let i=0;i<4;i++){const edge=box([.22,.09,.32],[side*(hw/2-.04),h+.14,-hd/2+(i+.5)*hd/4],roofMaterial);edge.rotation.y=i*.3;}
        }
        box([.12,.16,hd],[hw/2+.025,h-.08,0],iron,true);
    } else box([width+.22,.18,depth+.22],[0,h+.09,0],roofMaterial,true);
    for(let i=0;i<8;i++)if(!damaged||i!==2)box([width/8,.25+(i%3)*.13,.24],[-width/2+(i+.5)*width/8,h+.23,front],brick);
    for (let i = 0; i < count * 2; i++) box([0.15, 0.18, 0.19], [-width / 2 + (i + 0.5) * width / (count * 2), h - 0.08, front + 0.13], stone);
    structural=false;
    if(style.variant===3)for(const px of [-width/2+.18,width/2-.18])box([.36,h,.16],[px,h/2,front+.18],stone);
    if(style.variant===2)for(let floor=1;floor<floors;floor++)box([width,.16,.18],[0,floor*3.3,front+.16],iron);
    if(style.gabled&&!damaged) {
        const rise=1.25,slope=Math.atan2(rise,width/2),length=Math.hypot(width/2,rise);
        const cells=structuralGroups.get(roofMaterial)||[];structuralGroups.set(roofMaterial,cells);
        const columns=Math.ceil(length/1.3),rows=Math.ceil((depth+.5)/1.3);
        for(const side of [-1,1])for(let col=0;col<columns;col++)for(let row=0;row<rows;row++){
            const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-side*slope);
            const p=new THREE.Vector3(-length/2+(col+.5)*length/columns,0,-(depth+.5)/2+(row+.5)*(depth+.5)/rows).applyQuaternion(rotation).add(new THREE.Vector3(side*width/4,h+rise/2+.18,0));
            cells.push({size:[length/columns,.12,(depth+.5)/rows],position:p.toArray(),quaternion:rotation,health:55,density:900,capacity:1800000});
        }
        structural=true;
        for(const side of [-1,1])for(let i=0;i<16;i++){const px=-width/2+(i+.5)*width/16,wallHeight=rise*(1-Math.abs(px)/(width/2));box([width/16,wallHeight,.12],[px,h+.18+wallHeight/2,side*front],plaster,true);}
        structural=false;
    }
    // Furniture also has finite structural strength: it cannot become immortal
    // scaffolding underneath a collapsed building.
    structural=true;
    box([width * 0.48, 0.9, 0.7], [-width * 0.2, 0.45, 0.6], wood, true);
    const shelfX = width / 2 - 0.65;
    for (const y of [0.2, 0.9, 1.6]) box([0.8, 0.07, depth * 0.48], [shelfX, y, -0.8], wood, true);
    for (const sz of [-depth * 0.24 - 0.8, depth * 0.24 - 0.8]) box([0.08, 1.8, 0.08], [shelfX, 0.9, sz], iron, true);
    if (damaged) box([1.35, 0.12, 0.15], [-width / 4, 1.4, front + 0.03], wood).rotation.z = 0.2;
    structural=false;
    addStorefrontSign(world, g, width, depth);
    addFacadeDetails(world, g, width, depth, h);
    dressInterior(world,g,width,depth,g.userData.shopType);
    facadeDecay(world,g,width,depth,h,damaged);
    g.updateMatrixWorld(true);
    g.traverse(o=>{if(o.isMesh&&!o.userData.isCollidable){o.geometry.computeBoundingBox();const center=o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);if(center.y-base>1.6)o.userData.collapseDecoration=g.userData.structureId;}});
    const lootLocal = new THREE.Vector3(-width * 0.2, 0.92, 0.6).applyMatrix4(g.matrixWorld);
    world.buildingSpots ||= [];
    world.buildingSpots.push({ structureId:g.userData.structureId, x, z, width, depth, floors, neighborhood, architecture:style.name,height:h,roofOpening:damaged?{width:Math.min(3,width*.24),depth:Math.min(3,depth*.25)}:null,baseY: base, isDamaged: damaged, enterable: true, facing,
        shopType: g.userData.shopType, lootSupport: lootLocal, doorway: new THREE.Vector3(0, 0, front + 1).applyMatrix4(g.matrixWorld) });
    world.scene.add(g); world._cityObjects.push(g);
    addGlassWindows(world,g,panes);
    const breachMaterial=brick.clone();world._applyProcedural?.(breachMaterial,style.variant===1?'concrete':'brick',.85/1.8,.66/1.5);
    addDestructibleWalls(world,g,wallSections,breachMaterial);
    // Ground-floor foundations, piers and lintels were compiled by box().
    // Do not retain an overlapping immortal mesh behind their breakable cells.
    let groupIndex=0;
    for(const [material,cells]of structuralGroups){const mesh=addDestructibleWalls(world,g,cells,material);mesh.userData.glassId+=':shell'+groupIndex++;}
    g.traverse(o => { if (o.isMesh && o.userData.isCollidable) world.colliders.push(o); });
    return g;
}
