import {AdditionalWeapons} from '../data/NewWeapons.js';
export const SAVE_SCHEMA=2;
const meleeIds=new Set(['knife',...Object.values(AdditionalWeapons).filter(w=>w.type==='melee').map(w=>w.id)]);
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<1e7);
export function validSaveData(d){
 if(!d||typeof d!=='object'||!d.meta||typeof d.meta.version!=='string')return false;
 if(d.meta.schema!==undefined&&d.meta.schema!==SAVE_SCHEMA)return false;
 if(d.player){if(!vector(d.player.position)||!vector(d.player.rotation)||!Number.isFinite(d.player.cameraYaw)||!Number.isFinite(d.player.cameraPitch)||!d.player.stats||!Number.isFinite(d.player.stats.health))return false;}
 if(d.meta.schema===SAVE_SCHEMA){if(!d.player||!d.session||typeof d.session.campaignId!=='string'||!['drop','permadeath'].includes(d.session.deathMode)||!['active','ended'].includes(d.session.status)||!Number.isInteger(d.session.worldSeed))return false;if(d.meta.campaignId!==d.session.campaignId)return false;}
 if(d.inventory&&(!Array.isArray(d.inventory.slots)||d.inventory.slots.length>512||d.inventory.slots.some(s=>s&&(typeof s.id!=='string'||!Number.isFinite(s.count)||s.count<=0))))return false;
 if(d.world?.entities&&(!Array.isArray(d.world.entities)||d.world.entities.length>10000||d.world.entities.some(e=>!vector(e.position)||!vector(e.rotation)||!vector(e.scale)||e.health!==undefined&&!Number.isFinite(e.health))))return false;
 if(d.currentLevel!==null&&d.currentLevel!==undefined&&(typeof d.currentLevel!=='string'||d.currentLevel.length>96))return false;
 if(d.weapons&&(!Array.isArray(d.weapons.weapons)||!Array.isArray(d.weapons.slots)||d.weapons.weapons.some(w=>typeof w.id!=='string'||!(meleeIds.has(w.id)&&w.currentAmmo===null&&w.reserveAmmo===null)&&(!Number.isFinite(w.currentAmmo)||!Number.isFinite(w.reserveAmmo)||w.currentAmmo<0||w.reserveAmmo<0))))return false;
 if(d.loot&&(!Array.isArray(d.loot)||d.loot.some(c=>!vector(c.position)||!Array.isArray(c.items)||c.items.some(i=>typeof i.id!=='string'||!Number.isFinite(i.count)||i.count<=0))))return false;
 if(d.alife?.parties&&(!Array.isArray(d.alife.parties)||d.alife.parties.length>128||d.alife.parties.some(p=>!vector(p.pos)||!vector(p.waypoint)||!Number.isFinite(p.hp))))return false;
 if(d.emission&&(!['dormant','warning','emission','aftermath'].includes(d.emission.phase)||!Number.isFinite(d.emission.elapsed)||!Number.isFinite(d.emission.phaseTime)))return false;
 return true;
}
export function inCombat(game){
 if((game.audioManager?.musicSystem?.combatTimer||0)>0)return true;
 for(const e of game.worldManager?.enemies?.values()||[])if(e.isActive!==false&&e.health>0&&['alert','chase','attack','combat','flee'].includes(e.aiState)&&e.target===game.player)return true;
 return false;
}
export function newSession(mode='drop'){return {campaignId:crypto.randomUUID(),worldSeed:crypto.getRandomValues(new Uint32Array(1))[0],deathMode:mode==='permadeath'?'permadeath':'drop',status:'active',deaths:0,respawn:null};}
export function chunkKey(position){return Math.floor(position[0]/128)+':'+Math.floor(position[2]/128);}
export function indexChunks(world,loot,alife,seed,physics,panes){
 const chunks={};const add=(p,kind,id)=>{const key=chunkKey(p),c=chunks[key]||(chunks[key]={terrain:{seed,kind:'generated-immutable'},entities:[],loot:[],pickups:[],parties:[],props:[],brokenPanes:[]});c[kind].push(id);};
 (world?.entities||[]).forEach(e=>add(e.position,'entities',e.id));(world?.pickups||[]).forEach((p,i)=>add(p.position,'pickups',i));(loot||[]).forEach((c,i)=>add(c.position,'loot',i));(alife?.parties||[]).forEach(p=>add(p.pos,'parties',p.id));for(const p of physics?.props||[])add(p.position,'props',p.id);if(panes){const known=new Map([...panes.keys()].map(m=>[m.userData.glassId,m]));for(const id of physics?.broken||[]){const split=id.lastIndexOf(':'),mesh=known.get(id.slice(0,split)),pane=mesh?.userData.panes[Number(id.slice(split+1))],m=pane?.matrix?.elements;if(m)add([m[12]+mesh.position.x,m[13]+mesh.position.y,m[14]+mesh.position.z],'brokenPanes',id);}}return chunks;
}
