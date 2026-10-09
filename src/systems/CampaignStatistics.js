import {globalEventBus} from '../core/EventBus.js';
export const ACHIEVEMENTS=Object.freeze([
 {id:'emission',name:'Still recording',condition:'Survive an emission through its aftermath.'},
 {id:'surgical',name:'The load-bearing truth',condition:'Remove a ground-floor support and detach an upper structural bay.'},
 {id:'collapse',name:'Changed the skyline',condition:'Collapse an entire building.'},
 {id:'faction',name:'Someone to trust',condition:'Reach +100 reputation with any faction.'}
]);
/** Small campaign ledger. Restoring state is deliberately silent. */
export class CampaignStatistics{
 constructor(game){this.game=game;this.reset();this.off=[
  globalEventBus.on('zone:emission_phase',e=>{if(this.live()&&!e.restored&&e.prev==='emission'&&e.phase==='aftermath'){this.data.emissions++;this.unlock('emission');}}),
  globalEventBus.on('destruction:surgical',()=>{if(this.live())this.unlock('surgical');}),
  globalEventBus.on('destruction:building-collapsed',e=>this.collapse(e.id)),
  globalEventBus.on('faction:rep-changed',e=>{if(!this.live())return;this.data.factions.push({faction:e.faction,rep:e.rep,time:this.game.playTime||0});if(this.data.factions.length>64)this.data.factions.shift();if(e.rep>=100)this.unlock('faction');})
 ];}
 live(){return this.game.gameState==='playing'&&!this.game.isLoading&&this.game.player?.stats.health>0;}
 reset(){this.data={version:1,distance:0,emissions:0,buildings:[],factions:[],unlocked:{}};this.previous=null;}
 update(dt){const p=this.game.player?.position;if(!p)return;const old=this.previous;if(old){const d=Math.hypot(p.x-old.x,p.z-old.z);if(d<=Math.max(2,dt*15)&&!this.game.player.noclip&&!this.game.noclip)this.data.distance+=d;old.x=p.x;old.z=p.z;}else this.previous={x:p.x,z:p.z}; }
 collapse(id){if(!this.live()||typeof id!=='string'||this.data.buildings.includes(id))return;this.data.buildings.push(id);this.unlock('collapse');}
 unlock(id){if(this.data.unlocked[id]!==undefined)return;this.data.unlocked[id]=this.game.playTime||0;this.game.uiManager?.showNotification('Achievement: '+ACHIEVEMENTS.find(a=>a.id===id)?.name,'success');}
 serialize(){return structuredClone(this.data);}
 restore(data){this.reset();if(data?.version===1){this.data.distance=Math.max(0,Number(data.distance)||0);this.data.emissions=Math.max(0,Number(data.emissions)||0);this.data.buildings=[...new Set((data.buildings||[]).filter(id=>typeof id==='string'))];this.data.factions=(data.factions||[]).filter(e=>typeof e.faction==='string'&&Number.isFinite(e.rep)).slice(-64);for(const a of ACHIEVEMENTS)if(Number.isFinite(data.unlocked?.[a.id]))this.data.unlocked[a.id]=data.unlocked[a.id];}}
 dispose(){this.off.forEach(off=>off());}
}
