// Okabe-Ito hues plus redundant symbols; color is never the sole hazard identifier.
export const ANOMALY_PALETTE=Object.freeze({
 electrical:{color:'#56B4E9',symbol:'ϟ',label:'Electrical',sides:3},
 gravitational:{color:'#CC79A7',symbol:'◎',label:'Gravity',sides:32},
 chemical:{color:'#009E73',symbol:'◇',label:'Chemical',sides:4},
 thermal:{color:'#E69F00',symbol:'△',label:'Thermal',sides:3},
 psi:{color:'#F0E442',symbol:'✳',label:'Psy',sides:6},
 radiation:{color:'#D55E00',symbol:'☢',label:'Radiation',sides:8},
 vortex:{color:'#0072B2',symbol:'↻',label:'Vortex',sides:5},
 artifact:{color:'#FFFFFF',symbol:'◉',label:'Artifact',sides:16},
 unknown:{color:'#FFFFFF',symbol:'?',label:'Unknown anomaly',sides:16}
});
const aliases={electricField:'electrical',gravityWell:'gravitational',chemicalSpill:'chemical',radiationZone:'radiation'};
export function anomalyStyle(type,mode='universal'){const s=ANOMALY_PALETTE[aliases[type]||type]||ANOMALY_PALETTE.unknown;return mode==='monochrome'?{...s,color:'#FFFFFF'}:s;}
export function motionScale(settings,key='cameraMotion'){return Math.max(0,Math.min(1,(settings?.[key]??100)/100));}
export function survivalPressure(difficulty){return {relaxed:.65,standard:1,harsh:1.25}[difficulty]||1;}
export function comfortSettings(settings){return {...settings,cameraMotion:0,weaponMotion:0,lensEffects:false,grain:false,vignette:false,chroma:false,mouseSmoothing:false,accessibilityReviewed:true};}
export function soundCue(name,options={}){
 const map={emission_siren:{text:'WARNING SIREN — seek shelter',priority:3},emission_blast:{text:'EMISSION — stay under cover',priority:3},mutant_growl:{text:'Creature growl',priority:2},anomaly_zap:{text:'Electrical discharge',priority:2},detector_beep:{text:'Anomaly detector signal',priority:1},detector_beep_artifact:{text:'Artifact detector signal',priority:1}};
 const cue=map[name];return cue?{...cue,sound:name,position:options.position||null}:null;
}
export function cueDirection(position,player){
 if(!position||!player?.position)return 'Nearby';const x=position.x-player.position.x,z=position.z-player.position.z;
 const forward=-x*Math.sin(player.cameraYaw||0)-z*Math.cos(player.cameraYaw||0),right=x*Math.cos(player.cameraYaw||0)-z*Math.sin(player.cameraYaw||0);
 return Math.abs(right)>Math.abs(forward)?right>0?'Right':'Left':forward>=0?'Ahead':'Behind';
}
