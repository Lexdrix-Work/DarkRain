import {fidelityState} from './FidelityPolicy.ts';
import { reliefTexture } from '../world/MaterialRelief.js';
import * as N from 'three/tsl';

/** Adapt existing authored materials at the renderer boundary without extra scene walks. */
export function installNodeMaterialBridge(renderer) {
    const convert=renderer.library.fromMaterial.bind(renderer.library);
    renderer.library.fromMaterial=source=>{
        const material=convert(source);
        if(!material || source.isNodeMaterial)return material;
        // Legacy WebGL cache keys omit TSL nodes and their per-object bindings.
        // Preserve NodeMaterial's own cache key after adapting the source.
        delete material.customProgramCacheKey;
        const custom=source.userData || {};
        if(source.map && (custom.cellUV || custom.reliefHeightId)){
            let coords=N.uv().mul(N.uniform(source.map.repeat));
            if(custom.cellUV){
                const size=N.attribute('cellSize','vec3');
                const normal=N.attribute('normal','vec3');
                const face=N.select(normal.x.abs().greaterThan(.5),size.zy,N.select(normal.y.abs().greaterThan(.5),size.xz,size.xy));
                // Repeat cancels mathematically; fixed tile dimensions share shader variants.
                coords=N.uv().mul(face).div(N.vec2(1.8,1.5));
            }
            if(custom.reliefHeightId){
                const amount=custom.reliefScale?N.reference('value','float',custom.reliefScale).mul(N.reference('relief','float',fidelityState)):N.float(0);
                const height=N.texture(reliefTexture(custom.reliefHeightId),coords).r.sub(.5);
                coords=N.parallaxUV(coords,amount.mul(height));
            }
            material.colorNode=N.texture(source.map,coords).rgb.mul(N.uniform(source.color));
            if(source.roughnessMap)material.roughnessNode=N.texture(source.roughnessMap,coords).g.mul(source.roughness??1);
            if(source.aoMap)material.aoNode=N.mix(N.float(1),N.texture(source.aoMap,coords).r,source.aoMapIntensity??1);
            if(source.normalMap)material.normalNode=N.normalMap(N.texture(source.normalMap,coords),N.uniform(source.normalScale));
        }
        if(custom.fractureSurface&&source.map){
            const face=N.attribute('fractureFace','float'),p=N.attribute('surfacePosition','vec3');
            const weights=N.normalLocal.abs().pow(4);const w=weights.div(weights.x.add(weights.y).add(weights.z).max(.0001));
            const tiled=N.texture(source.map,p.yz.div(1.5)).rgb.mul(w.x).add(N.texture(source.map,p.xz.div(1.5)).rgb.mul(w.y)).add(N.texture(source.map,p.xy.div(1.5)).rgb.mul(w.z));
            const fine=N.mx_noise_float(p.mul(38)).mul(.5).add(.5),aggregate=N.mx_noise_float(p.mul(11)).mul(.5).add(.5);
            const tint=custom.fractureKind==='wood'?N.vec3(.48,.32,.17):custom.fractureKind==='brick'?N.vec3(.40,.23,.16):N.vec3(.42,.43,.40);
            const fresh=tint.mul(N.mix(N.float(.66),N.float(1.16),aggregate)).add(fine.mul(.055));
            const normal=N.normalLocal.abs();const coords=N.select(normal.x.greaterThan(normal.y.max(normal.z)),p.zy,N.select(normal.y.greaterThan(normal.z),p.xz,p.xy)).div(1.5);
            const exterior=tiled.mul(N.uniform(source.color));
            if(source.aoMap)material.aoNode=N.mix(N.float(1),N.texture(source.aoMap,coords).r,source.aoMapIntensity??.4);
            if(custom.reliefHeightId)material.normalNode=N.bumpMap(N.texture(reliefTexture(custom.reliefHeightId),coords).r,.045);
            if(source.roughnessMap)material.roughnessNode=N.texture(source.roughnessMap,coords).g.mul(source.roughness??1);
            material.colorNode=N.Fn(()=>{const color=exterior.toVar();N.If(face.greaterThan(.01),()=>{color.assign(N.mix(exterior,N.mix(tiled.mul(.8),fresh,.5),face));});return color;})();
            material.roughnessNode=N.mix(material.roughnessNode||N.float(source.roughness??1),N.mix(N.float(.86),N.float(1),fine),face);
            material.normalNode=N.mix(material.normalNode||N.normalViewGeometry,N.bumpMap(fine,.035),face).normalize();
        }
        if(custom.fresnelGlass)material.opacityNode=N.normalView.dot(N.positionView.normalize().negate()).abs().oneMinus().pow(4).mul(.32).add(.045);
        if(custom.contactShading)material.opacityNode=N.texture(source.map).a.mul(N.attribute('contactOpacity','float')).mul(source.opacity);
        return material;
    };
}
