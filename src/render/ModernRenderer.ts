import {FidelityGovernor,fidelityState} from './FidelityPolicy.ts';
import {ao} from 'three/addons/tsl/display/GTAONode.js';
import * as THREE from 'three';
import { WebGPURenderer, RenderPipeline, MeshBasicNodeMaterial } from 'three/webgpu';
import * as N from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

/** One node renderer family: WebGPU primary, WebGL2 fallback. */
export async function createModernRenderer(canvas:HTMLCanvasElement) {
    const forced=new URLSearchParams(location.search).get('backend')==='webgl';
    const renderer=new WebGPURenderer({canvas,antialias:true,powerPreference:'high-performance',forceWebGL:forced});
    await renderer.init();
    const deviceLost=renderer.onDeviceLost.bind(renderer);
    renderer.onDeviceLost=info=>{deviceLost(info);if(info.reason!=='destroyed')window.dispatchEvent(new CustomEvent('darkrain:renderer-lost',{detail:info}));};
    const device=(renderer.backend as unknown as {device?:EventTarget}).device;
    device?.addEventListener('uncapturederror',event=>{const error=(event as unknown as {error?:{name:string}}).error;if(error?.name==='GPUOutOfMemoryError'||error?.constructor.name==='GPUOutOfMemoryError')window.dispatchEvent(new Event('darkrain:memory-pressure'));});
    renderer.setClearColor(0x000000,0);
    const modern=Object.assign(renderer,{backendName:('isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend)?'WebGPU':'WebGL2'});
    console.info(`[Dark Rain] Renderer: ${modern.backendName}`);
    return modern;
}
interface RenderGame {
 _autoQuality?:{effRenderScale:number;emaMs:number};inputManager?:{getMouseDelta():{x:number;y:number}};
 renderer:WebGPURenderer;scene:THREE.Scene;camera:THREE.Camera;
 photoMode?:{active:boolean;options:{aperture:number;focus:number;grain:number;filter:string}};
 viewmodelSystem?:{vmScene:THREE.Scene;vmCamera:THREE.Camera};
 settings:{ambientOcclusion?:boolean;lensDirt?:boolean;rollingShutter?:boolean;cameraMotion?:number;autoQuality?:boolean;renderScale?:number;postProcessing?:boolean;quality:string;bloom?:boolean;chroma?:boolean;vignette?:boolean;filmGrain?:boolean;antiAliasing?:boolean};
}
export function createBodycamPipeline(game:RenderGame) {
    const r=game.renderer,s=game.settings;
    const worldTarget=new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType}),vmTarget=new THREE.RenderTarget(1,1,{type:THREE.HalfFloatType});
    const governor=new FidelityGovernor();let aoPasses=0;const photo=game.photoMode?.active;
    if(photo||(s.ambientOcclusion&&s.postProcessing!==false))worldTarget.depthTexture=new THREE.DepthTexture(1,1);
    const controls={aperture:N.uniform(16),focus:N.uniform(10),grain:N.uniform(0),mono:N.uniform(0),warm:N.uniform(0),ao:N.uniform(1),dirt:N.uniform(0),motion:N.uniform(0)};
    const scenePass={scene:game.scene,camera:game.camera},beauty=N.texture(worldTarget.texture);
    const lensUV=N.screenUV.add(N.vec2(N.screenUV.y.sub(.5).mul(N.time.mul(28).add(N.screenUV.y.mul(24)).sin()).mul(controls.motion),0));
    let output:Node<'vec4'>=N.vec4(s.rollingShutter?beauty.sample(lensUV):beauty);
    const occlusion=s.ambientOcclusion&&s.postProcessing!==false?ao(N.texture(worldTarget.depthTexture!),null as unknown as Node,game.camera):null;
    if(occlusion){occlusion.resolutionScale=.5;occlusion.samples.value=8;occlusion.radius.value=.4;occlusion.thickness.value=.12;
        const update=occlusion.updateBefore.bind(occlusion);occlusion.updateBefore=frame=>{if(controls.ao.value>0){aoPasses++;update(frame);}};
        const amount=N.float(occlusion).clamp(.45,1);const light=output.rgb.dot(N.vec3(.2126,.7152,.0722)).smoothstep(4,12).oneMinus();
        output=N.vec4(output.rgb.mul(N.mix(N.float(1),amount,controls.ao.mul(light).mul(.7))),output.a);
    }
    if(photo){
        const depth=N.texture(worldTarget.depthTexture!);const cam=game.camera as THREE.PerspectiveCamera;
        const viewZ=N.perspectiveDepthToViewZ(depth.r,N.float(cam.near),N.float(cam.far)).negate();
        const radius=viewZ.sub(controls.focus).abs().div(viewZ.max(.1)).clamp(0,1).mul(N.float(1).div(controls.aperture).sub(1/16).max(0)).mul(.018);
        let blurred:Node<'vec3'>=N.vec3(0);let weight=0;
        for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const w=Math.exp(-(x*x+y*y)/2);weight+=w;blurred=blurred.add(beauty.sample(N.screenUV.add(N.vec2(x*.5,y*.5).mul(radius))).rgb.mul(w));}
        output=N.vec4(blurred.div(weight),beauty.a);
    }
    const vm=photo?null:game.viewmodelSystem;
    const vmPass=vm?{scene:vm.vmScene,camera:vm.vmCamera}:null;
    const usePost=photo||s.postProcessing!==false;
    // HDR threshold keeps ordinary bright paint out of bloom; emissives remain visible.
    if(usePost&&s.bloom)output=output.add(bloom(beauty,.18,.4,1.25));
    const uv=N.screenUV,edge=uv.sub(.5).length().smoothstep(.2,.72);
    if(usePost&&s.chroma&&!photo){
        const offset=uv.sub(.5).mul(edge).mul(.0012);
        // Shift channel detail without replacing AO/bloom-composited red and blue
        // with raw scene channels (which produced coloured contact halos).
        output=N.vec4(output.r.add(beauty.sample(uv.add(offset)).r.sub(beauty.r)),output.g,output.b.add(beauty.sample(uv.sub(offset)).b.sub(beauty.b)),output.a);
    }
    if(vmPass){const hands=N.texture(vmTarget.texture);output=N.vec4(N.mix(output.rgb,hands.rgb,hands.a),1);}
    // Contrast and FXAA require display colors, after HDR lighting/bloom.
    // Applying a 0.5-centered contrast curve to linear light crushes shadows.
    if(usePost)output=N.vec4(N.renderOutput(output,r.toneMapping,r.outputColorSpace));
    const luminance=output.rgb.dot(N.vec3(.2126,.7152,.0722));
    let graded=N.mix(N.vec3(luminance),output.rgb,.92).sub(.5).mul(1.08).add(.515);
    if(usePost&&s.vignette)graded=graded.mul(edge.mul(.32).oneMinus());
    if(usePost&&(photo||s.filmGrain)){
        const noise=N.fract(N.sin(uv.dot(N.vec2(12.9898,78.233)).add(N.time.mul(17.1))).mul(43758.5453)).sub(.5);
        graded=graded.add(noise.mul(photo?controls.grain:N.float(.002)).mul(luminance.smoothstep(.015,.18).oneMinus().mul(3).add(1)));
    }
    if(usePost&&s.lensDirt){const smudge=N.mx_noise_float(N.vec3(uv.mul(9),3)).smoothstep(.28,.65);graded=graded.add(N.vec3(.055,.049,.036).mul(smudge).mul(luminance.smoothstep(.55,1)).mul(controls.dirt));}
    if(photo){graded=N.mix(graded,N.vec3(graded.dot(N.vec3(.2126,.7152,.0722))),controls.mono);graded=graded.mul(N.mix(N.vec3(1),N.vec3(1.06,1.015,.92),controls.warm));}
    // Stable sub-code-value dither also works when accessibility disables film grain.
    const dither=N.hash(N.screenCoordinate.x.add(N.screenCoordinate.y.mul(4099))).sub(.5).mul(1/255);
    if(usePost)output=N.vec4(graded.add(dither),output.a);
    if(usePost&&s.antiAliasing)output=N.vec4(fxaa(output) as unknown as Node<'vec4'>);
    const pipeline=new RenderPipeline(r);pipeline.outputColorTransform=!usePost;pipeline.outputNode=output;
    const size=new THREE.Vector2();
    const memoryTextures=[worldTarget.texture,vmTarget.texture,...(occlusion?[occlusion.getTextureNode().value]:[]),...(worldTarget.depthTexture?[worldTarget.depthTexture]:[])];
    return {aoNode:()=>occlusion?N.float(occlusion):null,diagnostics:()=>({aoPasses,aoWeight:controls.ao.value}),memoryTextures:()=>memoryTextures,hasViewmodel:!!vmPass,passes:vmPass?[scenePass,vmPass]:[scenePass],render(){
        const level=governor.update(s.quality,game._autoQuality?.effRenderScale??1,game._autoQuality?.emaMs??16.67,s.autoQuality!==false,performance.now());fidelityState.contactLimit=s.autoQuality!==false&&(game._autoQuality?.emaMs??0)>24?12:24;fidelityState.relief=level>=1?1:0;controls.ao.value=level>=1?1:0;controls.dirt.value=level>=2?1:0;const look=game.inputManager?.getMouseDelta();controls.motion.value=!photo&&level>=3&&(s.cameraMotion??100)>0?Math.min(.0008,Math.hypot(look?.x||0,look?.y||0)*.00001)*(s.cameraMotion??100)/100:0;
        fidelityState.fxDensity=level>=3?1:level>=2?.75:level>=1?.5:.25;
        if(photo){const o=game.photoMode!.options;controls.aperture.value=o.aperture;controls.focus.value=o.focus;controls.grain.value=o.grain*.0001;controls.mono.value=o.filter==='mono'?1:0;controls.warm.value=o.filter==='warm'?1:0;}
        scenePass.camera=game.camera;r.getDrawingBufferSize(size);worldTarget.setSize(size.x,size.y);vmTarget.setSize(size.x,size.y);
        const target=r.getRenderTarget(),alpha=r.getClearAlpha(),autoClear=r.autoClear,tone=r.toneMapping,color=r.outputColorSpace;
        try{
            r.autoClear=true;r.toneMapping=THREE.NoToneMapping;r.outputColorSpace=THREE.ColorManagement.workingColorSpace;
            r.setRenderTarget(worldTarget);r.clear(true,true,true);r.render(scenePass.scene,scenePass.camera);
            if(vmPass){r.setClearAlpha(0);r.setRenderTarget(vmTarget);r.clear(true,true,true);r.render(vmPass.scene,vmPass.camera);}
        }finally{r.setRenderTarget(target);r.setClearAlpha(alpha);r.autoClear=autoClear;r.toneMapping=tone;r.outputColorSpace=color;}
        pipeline.render();
    },dispose(){pipeline.dispose();occlusion?.dispose();worldTarget.dispose();vmTarget.dispose();},setSize(){},setPixelRatio(){}};
}

export function createNodeSkyMaterial() {
    const u={topColor:N.uniform(new THREE.Color()),bottomColor:N.uniform(new THREE.Color()),sunDirection:N.uniform(new THREE.Vector3()),
        moonDirection:N.uniform(new THREE.Vector3()),sunColor:N.uniform(new THREE.Color()),nightFactor:N.uniform(0),cloudDensity:N.uniform(0),skyTime:N.uniform(0),cloudOffset:N.uniform(new THREE.Vector2())};
    const dir=N.positionLocal.normalize(),h=dir.y.max(0);
    let sky=N.mix(u.bottomColor,u.topColor,h.pow(.55));
    const p=dir.xz.div(dir.y.add(.22).max(.22)).mul(2.2).add(u.cloudOffset);
    const noise=N.mx_noise_float(N.vec3(p,0)).mul(.5).add(.5).mul(.57)
        .add(N.mx_noise_float(N.vec3(p.mul(2.03),0)).mul(.5).add(.5).mul(.28))
        .add(N.mx_noise_float(N.vec3(p.mul(4.11),0)).mul(.5).add(.5).mul(.15));
    const coverage=noise.smoothstep(N.float(.70).sub(u.cloudDensity.mul(.48)),N.float(.88).sub(u.cloudDensity.mul(.48)))
        .mul(dir.y.smoothstep(-.02,.12)).mul(u.cloudDensity.smoothstep(0,.12));
    const sd=dir.dot(u.sunDirection.normalize()),md=dir.dot(u.moonDirection.normalize());
    const sun=sd.smoothstep(.99996,.999995).mul(3).add(sd.max(0).pow(160).mul(.13))
        .mul(u.sunDirection.y.smoothstep(-.04,.03)).mul(coverage.oneMinus());
    sky=sky.add(u.sunColor.mul(sun));
    const moon=md.smoothstep(.99996,.999995).mul(u.nightFactor).mul(u.moonDirection.y.smoothstep(-.02,.03)).mul(coverage.oneMinus());
    sky=sky.add(N.vec3(.72,.77,.83).mul(moon));
    const starCell=dir.mul(180),seed=N.fract(N.sin(starCell.floor().dot(N.vec3(12.9898,78.233,37.719))).mul(43758.5453));
    const stars=N.step(.994,seed).mul(starCell.fract().sub(.5).length().smoothstep(.03,.2).oneMinus())
        .mul(u.nightFactor).mul(dir.y.smoothstep(.02,.3)).mul(coverage.oneMinus());
    sky=sky.add(N.vec3(.65,.72,.85).mul(stars));
    const clouds=N.mix(N.vec3(.012,.017,.027),N.vec3(.43,.47,.50),u.nightFactor.oneMinus())
        .add(u.sunColor.mul(sd.max(0).pow(12)).mul(.12)).mul(u.cloudDensity.mul(.35).oneMinus());
    const material=new MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false});
    material.colorNode=N.mix(sky,clouds,coverage);
    return Object.assign(material,{uniforms:u});
}
export function createNodeAnomalyMaterial(thermal=false) {
    const t=N.uniform(0),color=N.uniform(new THREE.Color(0x4444ff));
    const material=new MeshBasicNodeMaterial({transparent:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});

    const pulse=t.mul(thermal?10:2).sin().mul(thermal?.1:.3).add(thermal?.9:.7);
    if(thermal){
        const strength=N.uv().y.oneMinus();material.colorNode=N.mix(color,color.mul(1.35),N.uv().y).mul(strength).mul(pulse);
        material.opacityNode=strength.mul(.5);
        material.positionNode=N.positionLocal.add(N.vec3(t.mul(5).add(N.positionLocal.y.mul(3)).sin().mul(.1),0,t.mul(5).add(N.positionLocal.y.mul(3)).cos().mul(.1)));
    }else{
        const strength=N.normalView.dot(N.positionView.normalize().negate()).abs().oneMinus().pow(2);
        material.colorNode=color.mul(strength).mul(pulse);material.opacityNode=strength.mul(.5);
        material.positionNode=N.positionLocal.add(N.normalLocal.mul(t.mul(3).add(N.positionLocal.y.mul(5)).sin().mul(.1)));
    }
    return Object.assign(material,{uniforms:{time:t,color}});
}
