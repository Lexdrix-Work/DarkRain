import * as THREE from 'three';
import {anomalyStyle} from '../core/settings/Accessibility.js';
export function paintAnomaly(anomaly,mode='universal'){
 const style=anomalyStyle(anomaly.isVortex?'vortex':anomaly.type,mode),color=new THREE.Color(style.color);
 for(const root of [anomaly.mesh,anomaly.particles,...(anomaly.arcs||[])])root?.traverse(child=>{for(const m of Array.isArray(child.material)?child.material:child.material?[child.material]:[]){m.color?.copy(color);m.uniforms?.color?.value?.copy(color);if(m.vertexColors){const c=child.geometry?.attributes.color;if(c){for(let i=0;i<c.count;i++)c.setXYZ(i,1,1,1);c.needsUpdate=true;}}}});
 if(!anomaly.accessibilityMarker){const points=[],sides=style.sides,r=anomaly.radius;for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*r,.06,Math.sin(a)*r),new THREE.Vector3(Math.cos(b)*r,.06,Math.sin(b)*r));}
  // Type-specific glyph is also upright inside the already revealed field.
  const glyphs={electrical:[[-.3,.4],[0,.9],[-.08,.65],[.3,1.1]],gravitational:[[-.3,.5],[-.3,1],[.3,1],[.3,.5]],chemical:[[-.3,.75],[0,1.1],[.3,.75],[0,.4],[-.3,.75]],thermal:[[-.3,.4],[0,1.1],[.3,.4],[-.3,.4]]};
  const g=glyphs[anomaly.type]||[[-.3,.4],[.3,1.1],[-.3,1.1],[.3,.4]];for(let i=0;i<g.length-1;i++)points.push(new THREE.Vector3(g[i][0],g[i][1],0),new THREE.Vector3(g[i+1][0],g[i+1][1],0));
  const marker=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:style.color}));marker.position.copy(anomaly.position);marker.userData.anomalyType=anomaly.type;marker.raycast=()=>{};anomaly.scene?.add(marker);anomaly.accessibilityMarker=marker;
 }
 anomaly.accessibilityMarker.material.color.copy(color);anomaly.accessibilityMarker.visible=anomaly.isVisible;
 return style;
}
