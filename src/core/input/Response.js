export function radialStick(x,y,deadzone,out){x=Number.isFinite(x)?x:0;y=Number.isFinite(y)?y:0;const length=Math.hypot(x,y);if(length<=deadzone){out.x=out.y=0;return out;}const magnitude=Math.min(1,(length-deadzone)/(1-deadzone));out.x=x/length*magnitude;out.y=y/length*magnitude;return out;}
export function stickCurve(value,curve){return curve==='linear'?value:Math.sign(value)*Math.pow(Math.abs(value),1.6);}
export function frictionGain(strength,{aiming,visible,distance,angle,magnitude}){return aiming&&visible&&distance<=35&&angle<=1.5*Math.PI/180&&magnitude>.001&&magnitude<=.65?1-Math.min(.25,Math.max(0,strength)):1;}
export class MouseResponse {
 constructor(){this.velocityX=this.velocityY=0;this.out={x:0,y:0};}
 reset(){this.velocityX=this.velocityY=0;this.out.x=this.out.y=0;}
 process(x,y,dt,curve='linear',smoothing=false,timeMs=8){dt=Math.min(.1,Math.max(1/240,dt));const rate=Math.hypot(x,y)/dt,gain=curve==='precision'?.7+.3*Math.min(1,rate/1500):1;
  if(!smoothing){this.reset();this.out.x=x*gain;this.out.y=y*gain;return this.out;}const alpha=1-Math.exp(-dt/(timeMs/1000));this.velocityX+=(x*gain/dt-this.velocityX)*alpha;this.velocityY+=(y*gain/dt-this.velocityY)*alpha;this.out.x=this.velocityX*dt;this.out.y=this.velocityY*dt;return this.out;
 }
}
