import {radialStick,stickCurve} from './Response.js';
export const PAD_ACTIONS=Object.freeze({0:'jump',1:'crouch',2:'reload',3:'nextWeapon',4:'leanLeft',5:'leanRight',6:'aim',7:'fire',8:'map',9:'pause',11:'interact',12:'flashlight',13:'inventory',14:'throw_bolt',15:'toggle_detector'});
export const PAD_LABELS=Object.freeze({xbox:['A','B','X','Y','LB','RB','LT','RT','View','Menu','LS','RS','D-pad Up','D-pad Down','D-pad Left','D-pad Right'],playstation:['Cross','Circle','Square','Triangle','L1','R1','L2','R2','Create','Options','L3','R3','D-pad Up','D-pad Down','D-pad Left','D-pad Right']});
export class Controller {
 constructor(){this.connected=false;this.active=false;this.layout='xbox';this.held=new Uint8Array(17);this.previous=new Uint8Array(17);this.suppressed=new Uint8Array(17);this.down=new Set();this.pressed=new Set();this.released=new Set();this.move={x:0,y:0};this.look={x:0,y:0};this.previousAxes=new Float32Array(4);this.sprint=false;this.blockSticks=false;this.context='menu';}
 neutralize(){for(let i=0;i<17;i++)if(this.held[i])this.suppressed[i]=1;this.down.clear();this.pressed.clear();this.released.clear();this.sprint=false;this.blockSticks ||=Math.hypot(this.move.x,this.move.y,this.look.x,this.look.y)>.05;this.move.x=this.move.y=this.look.x=this.look.y=0;}
 reset(){this.held.fill(0);this.previous.fill(0);this.suppressed.fill(0);this.down.clear();this.pressed.clear();this.released.clear();this.move.x=this.move.y=this.look.x=this.look.y=0;this.sprint=false;this.active=false;this.blockSticks=false;}
 poll(pads,settings,gameplay){
  this.pressed.clear();this.released.clear();this.down.clear();let pad=null;if(settings.controllerEnabled!==false||!gameplay)for(const candidate of pads||[])if(candidate?.connected&&candidate.mapping==='standard'){pad=candidate;break;}
  const newlyConnected=!this.connected&&!!pad,disconnected=this.connected&&!pad;this.connected=!!pad;if(!pad){this.reset();return {disconnected,activity:false};}
  this.layout=settings.controllerLayout==='auto'||!settings.controllerLayout?/dualshock|dualsense|sony|wireless controller/i.test(pad.id)&&!/xbox|xinput/i.test(pad.id)?'playstation':'xbox':settings.controllerLayout;
  let activity=false;for(let i=0;i<17;i++){const value=pad.buttons[i]?.value??(pad.buttons[i]?.pressed?1:0),held=value>=(this.previous[i] ? .15 : .25)||(i!==6&&i!==7&&pad.buttons[i]?.pressed===true);this.held[i]=held?1:0;if(held&&!this.previous[i])activity=true;}
  for(let i=0;i<4;i++){const value=Number.isFinite(pad.axes[i])?pad.axes[i]:0;if(Math.abs(value-this.previousAxes[i])>.03&&Math.abs(value)>(settings.controllerDeadzone||12)/100)activity=true;this.previousAxes[i]=value;}
  radialStick(pad.axes[0]||0,pad.axes[1]||0,(settings.controllerDeadzone||12)/100,this.move);radialStick(pad.axes[2]||0,pad.axes[3]||0,(settings.controllerDeadzone||12)/100,this.look);
  if(newlyConnected&&gameplay){for(let i=0;i<17;i++)if(this.held[i])this.suppressed[i]=1;this.blockSticks=Math.hypot(this.move.x,this.move.y,this.look.x,this.look.y)>.05;}
  if(!gameplay){for(let i=0;i<17;i++)if(this.held[i])this.suppressed[i]=1;this.blockSticks ||=Math.hypot(this.move.x,this.move.y,this.look.x,this.look.y)>.05;this.sprint=false;}
  if(this.blockSticks){if(Math.hypot(this.move.x,this.move.y,this.look.x,this.look.y)<.01)this.blockSticks=false;else if(gameplay)this.move.x=this.move.y=this.look.x=this.look.y=0;}
  if(gameplay){for(let i=0;i<17;i++){
   if(!this.held[i])this.suppressed[i]=0;if(this.suppressed[i])continue;const action=PAD_ACTIONS[i];if(action&&this.held[i])this.down.add(action);if(action&&this.held[i]&&!this.previous[i])this.pressed.add(action);if(action&&!this.held[i]&&this.previous[i])this.released.add(action);
  }
   if(this.held[10]&&!this.previous[10]&&!this.held[6]&&!this.suppressed[10])this.sprint=!this.sprint;
   if(this.held[6]){this.sprint=false;if(this.held[10]&&!this.suppressed[10])this.down.add('steadyAim');}
   if(Math.hypot(this.move.x,this.move.y)<.05)this.sprint=false;if(this.sprint)this.down.add('sprint');
  }
  // Menu edges remain physical, while gameplay actions observe the release fence.
  this.menuAccept=!newlyConnected&&!!(this.held[0]&&!this.previous[0]);this.menuBack=!newlyConnected&&!!(this.held[1]&&!this.previous[1]||this.held[9]&&!this.previous[9]);
  this.previous.set(this.held);this.context=gameplay?'gameplay':'menu';this.active ||=activity;return {disconnected,activity};
 }
 lookDelta(dt,settings,aiming,out){const rate=(settings.controllerSensitivity||180)*Math.PI/180*(aiming?(settings.controllerAdsScale||55)/100:1);const magnitude=Math.hypot(this.look.x,this.look.y),curve=magnitude?stickCurve(magnitude,settings.controllerCurve||'precision')/magnitude:0;out.x=this.look.x*curve*rate*dt;out.y=this.look.y*curve*rate*dt;return out;}
 finish(){this.pressed.clear();this.released.clear();}
}
