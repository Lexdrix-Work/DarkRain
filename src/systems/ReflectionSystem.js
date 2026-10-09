import { CubeRenderTarget, PMREMGenerator, MeshBasicNodeMaterial } from 'three/webgpu';
import { reflector, mix, vec3, normalView, positionView } from 'three/tsl';
import * as THREE from 'three';
import { globalEventBus } from '../core/EventBus.js';

export function reflectionBudget(quality) {
    return quality==='ultra'?{cube:256,planar:768,interval:1500,captureRange:150}:
        quality==='high'?{cube:128,planar:512,interval:2500,captureRange:100}:
        quality==='low'?{cube:64,planar:192,interval:6000,captureRange:30}:{cube:128,planar:384,interval:4000,captureRange:70};
}

/** Scene-captured metal/glass reflections and one live, irregular road puddle. */
export class ReflectionSystem {
    constructor(game) {
        this.game=game;this.materials=new Set();this.lastCapture=-Infinity;
        this.offLevel=globalEventBus.on('level:loaded',()=>this.rebuild());
        this.rebuild();
    }
    rebuild() {
        this.release();
        this.budget=reflectionBudget(this.game.settings.reflectionQuality||this.game.settings.quality);
        this.target=new CubeRenderTarget(this.budget.cube,{type:THREE.HalfFloatType});
        this.pmrem=new PMREMGenerator(this.game.renderer);
        this.filtered=null;
        // Local surfaces need a nearby probe, not six renders of the whole city.
        const range=this.budget.captureRange*(this.game.renderer.backendName==='WebGL2'?.5:1);
        this.cube=new THREE.CubeCamera(0.25,range,this.target);
        this.lastCapture=-Infinity;
        this.bindMaterials();
        if(this.game.currentLevelName!=='zone_outskirts') return;
        const shape=new THREE.Shape();
        for(let i=0;i<=32;i++) {
            const a=i/32*Math.PI*2,r=1+0.07*Math.sin(a*5)+0.04*Math.cos(a*7);
            const x=Math.cos(a)*2.2*r,y=Math.sin(a)*3.3*r;
            if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
        }
            const material=new MeshBasicNodeMaterial({transparent:true,depthWrite:false});
            this.puddle=new THREE.Mesh(new THREE.ShapeGeometry(shape),material);
            this.puddle.rotation.x=-Math.PI/2;
            this.puddle.position.set(0,this.game.worldManager.getTerrainHeight(0,-4)+.052,-4);
            const reflection=reflector({target:this.puddle,resolutionScale:this.budget.planar/Math.max(innerWidth,innerHeight),bounces:false,samples:0});
            const fresnel=normalView.dot(positionView.normalize().negate()).abs().oneMinus().pow(4).mul(.88).add(.08);
            material.colorNode=mix(vec3(.018,.023,.02),reflection.rgb,fresnel);material.opacity=.8;
            this.puddle.dispose=()=>{material.dispose();reflection.dispose();};
            this.puddle.userData.type='standing-water';this.game.scene.add(this.puddle);
    }
    bindMaterials() {
        const bind=object=>{
            if(!object.isMesh||object.isReflector) return;
            for(const mat of (Array.isArray(object.material)?object.material:[object.material])) {
                if(!mat?.isMeshStandardMaterial || this.materials.has(mat)) continue;
                const glass=object.userData.type==='merged:tex:window'||object.userData.type==='merged:glass';
                const road=object.userData.type==='merged:tex:asphalt';
                if(!glass&&!road&&!(mat.metalness>=0.18&&mat.roughness<0.85)) continue;
                mat.envMap=this.filtered?.texture || this.target.texture;mat.envMapIntensity=glass?0.65:0.5;mat.needsUpdate=true;
                if(road)mat.envMapIntensity=.18;
                this.materials.add(mat);
            }
        };
        this.game.scene.traverse(bind);this.game.viewmodelSystem?.vmScene?.traverse(bind);
    }
    update(now=performance.now()) {
        if(!this.target) return;
        const budget=reflectionBudget(this.game.settings.reflectionQuality||this.game.settings.quality);
        if(budget.cube!==this.budget.cube||budget.planar!==this.budget.planar){this.rebuild();}
        const time=this.game.dayNightCycle?.currentTime || 0;
        const timeChanged=this.captureTime===undefined || Math.abs(time-this.captureTime)>900;
        if(!timeChanged&&Number.isFinite(this.lastCapture)&&(this.game.isPaused||this.game.gameState==='menu'))return;
        if(!timeChanged&&now-this.lastCapture<this.budget.interval) return;
        this.bindMaterials();
        const renderer=this.game.renderer;
        const oldShadowUpdate=renderer.shadowMap.needsUpdate;
        const oldEnvironment=this.game.scene.environment;
        const oldVisible=this.puddle?.visible;
        const priorMaps=[...this.materials].map(mat=>[mat,mat.envMap]);
        try {
            if(this.puddle)this.puddle.visible=false;
            this.game.scene.environment=null;
            // Prevent the probe from reflecting its previous capture back into itself.
            for(const [mat]of priorMaps)mat.envMap=null;
            renderer.shadowMap.needsUpdate=false;
            this.cube.position.copy(this.game.player.position);this.cube.position.y+=1.6;
            this.cube.update(renderer,this.game.scene);
            this.filtered=this.pmrem.fromCubemap(this.target.texture,this.filtered);
            this.lastCapture=now;this.captureTime=time;
        } finally {
            for(const [mat,map]of priorMaps){mat.envMap=this.filtered?.texture || map;mat.needsUpdate=true;}
            this.game.scene.environment=oldEnvironment;
            renderer.shadowMap.needsUpdate=oldShadowUpdate;
            if(this.puddle)this.puddle.visible=oldVisible;
        }
    }
    release() {
        for(const mat of this.materials){mat.envMap=null;mat.needsUpdate=true;}
        this.materials.clear();
        if(this.puddle){this.puddle.removeFromParent();this.puddle.geometry.dispose();this.puddle.dispose();this.puddle=null;}
        this.target?.dispose();this.target=null;
        this.filtered?.dispose();this.filtered=null;this.pmrem?.dispose();this.pmrem=null;
    }
    dispose(){if(typeof this.offLevel==='function')this.offLevel();this.release();}
}
