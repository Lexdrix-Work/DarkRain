import * as THREE from 'three';
import {globalEventBus} from '../core/EventBus.js';
const LABEL='Checkpoint recovery supplies';
export const ROUTE_BEATS=Object.freeze([
 'Meet Nyra under the checkpoint canopy. This route is optional; the city is already open.',
 'Walk to the recovery crate near the checkpoint. Search it for water and a bandage.',
 'Review your water and bandage in the pack. Use water if you need it; do not waste a bandage on an uninjured wound.',
 'Observe the electrical distortion from at least 8 metres. A bolt or detector can confirm the danger. There is no reason to walk into it.',
 'Return beneath the checkpoint canopy. Covered shelter is the answer to the warning siren.',
 'You have supplies and shelter. Explore at your own pace; return under cover when the first warning sounds.',
 'First field run recorded. The city’s stories and choices are yours to discover.'
]);
/** Optional, saved, event-led introduction; no forced movement, combat or item use. */
export class ScavengingOnboarding{
 constructor(game){this.game=game;this.origin=new THREE.Vector3();this.timer=0;this.off=[globalEventBus.on('level:loaded',()=>this.clear()),globalEventBus.on('item:applied',e=>{if(this.state?.active&&e.item?.id==='water_bottle')this.state.reviewed=true;}),globalEventBus.on('ui:menuOpened',e=>{if(this.state?.active&&e.menu==='inventory')this.state.reviewed=true;}),globalEventBus.on('zone:emission_phase',e=>{if(!e.restored&&e.phase==='aftermath'&&this.state?.active&&this.state.stage>=5){this.state.stage=6;this.state.active=false;this.state.complete=true;this.notify();}})];}
 get state(){return this.game.flags?.scavengingRun;}
 start(){const g=this.game;if(g.currentLevelName!=='zone_outskirts'||this.state?.complete)return false;if(this.state?.active)return true;const s=g.flags.scavengingRun={version:1,active:true,stage:0,reviewed:false,complete:false};this.origin.copy(g.player.position);s.origin=this.origin.toArray();this.syncWorld();const e=g.emissionSystem;if((g.playTime||0)<300&&e.phase==='dormant'&&!g.statisticsSystem?.data.emissions)e.nextEmissionAt=Math.max(e.nextEmissionAt,e.elapsed+Math.max(60,780-(g.playTime||0)));this.notify();return true;}
 skip(){if(this.state)this.state.active=false;this.clear();this.game.uiManager?.showNotification('Field route closed. Continue exploring freely.','info');}
 syncWorld(){const g=this.game;if(!this.state?.active||g.currentLevelName!=='zone_outskirts'||!g.fieldOperations?.npc)return;this.origin.fromArray(this.state.origin||g.player.position.toArray());const npc=g.fieldOperations.npc.position;
  this.crate=[...g.lootSystem.containers.values()].find(c=>c.label===LABEL);if(!this.crate){const point=g.fieldOperations.openPoint(npc.x+12,npc.z+12);this.crate=g.lootSystem.spawnContainer('supply_crate',point.x,point.z,{items:[{id:'water_bottle',count:1},{id:'bandage',count:1}]});this.crate.label=LABEL;g.lootSystem._updatePrompt(this.crate);}
  if(!this.anomaly||!g.anomalySystem.anomalies.has(this.anomaly.id)){const point=g.fieldOperations.openPoint(this.crate.mesh.position.x+14,this.crate.mesh.position.z+10);this.anomaly=g.anomalySystem.createAnomaly('electrical',{position:[point.x,g.worldManager.getTerrainHeight(point.x,point.z),point.z],radius:2,damage:12});this.anomaly.reveal();}
 }
 notify(){const stage=this.state?.stage||0;this.game.uiManager?.showNotification('Field route updated — read your journal.','info',3500);globalEventBus.emit('zone:pda_feed',{text:ROUTE_BEATS[stage],kind:'info'});this.game.saveSystem?.requestAutosave('onboarding-beat');}
 update(dt){const s=this.state,g=this.game;if(!s?.active||g.currentLevelName!=='zone_outskirts')return;this.timer+=dt;if(this.timer<.5)return;this.timer=0;if(!this.crate||!this.anomaly)this.syncWorld();const p=g.player.position;let next=s.stage;
  if(s.stage===0&&g.fieldOperations?.npc&&p.distanceTo(g.fieldOperations.npc.position)<7)next=1;
  else if(s.stage===1&&this.crate?.searched)next=2;
  else if(s.stage===2&&s.reviewed)next=3;
  else if(s.stage===3&&this.anomaly){const d=p.distanceTo(this.anomaly.position);if(d>=8&&d<=25)next=4;}
  else if(s.stage===4&&g.fieldOperations?.isCheckpointSheltered(p))next=5;
  if(next!==s.stage){s.stage=next;this.notify();}
 }
 journal(parent,journal){const s=this.state;const section=journal.node('section',undefined,parent);journal.node('h2','Optional first field run',section);if(s?.active){journal.node('p',ROUTE_BEATS[s.stage],section);if(this.crate&&this.game.fieldOperations?.npc){const n=this.game.fieldOperations.npc.position,dx=this.crate.mesh.position.x-n.x,dz=this.crate.mesh.position.z-n.z,bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;journal.node('p','From Nyra: '+Math.round(Math.hypot(dx,dz))+' m, compass bearing '+Math.round(bearing)+'°. Search: '+this.game.inputManager.actionLabel('interact')+' · Pack: '+this.game.inputManager.actionLabel('inventory')+'.',section);}journal.button('Leave the guided route',section,()=>{this.skip();journal.render();});}else if(s?.complete)journal.node('p',ROUTE_BEATS[6],section);else{journal.node('p','A short scavenging route near Nyra’s checkpoint introduces supplies, distortion and shelter. No markers or forced exercises.',section);journal.button('Take the local scavenging route',section,()=>{if(this.start())journal.render();else this.game.uiManager?.showNotification('The field route begins at the outskirts checkpoint. Leave tunnel training first.','info');});}}
 clear(){if(this.anomaly)this.game.anomalySystem?.removeAnomaly(this.anomaly.id);this.anomaly=null;this.crate=null;}
 dispose(){this.clear();this.off.forEach(off=>off());}
}
