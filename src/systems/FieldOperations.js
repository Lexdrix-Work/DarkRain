import * as THREE from 'three';
import { NPC } from '../entities/NPC.js';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

export const SIGNAL_QUEST = 'last_signal';
export const FIELD_RECORDS = [
    {id:'evacuation',title:'Cancelled evacuation',x:5.4,z:8,text:'EVACUATION ROUTE C — CANCELLED. The convoy never returned. A pencilled arrow points toward the flooded junction; someone has crossed out the words “all residents accounted for”.'},
    {id:'ration',title:'A ration ledger',x:2,z:48,text:'Fourteen names, six water bottles. The last entry reads: “Nyra stayed at the checkpoint. We sent the relay log east. If the Directorate says we left willingly, find the recording.”'},
    {id:'relay',title:'Unsent transmission',x:70,z:78,text:'A recorder loops three seconds of static, then a voice: “The distortion is following the power line. Cut it and the district goes dark. Leave it and the people outside the barricade…” The message ends there.'},
];
export const SIGNAL_OUTCOMES = {
    residents: { title: 'Keep the district alive', credits: 120, reputation: { loners: 25, duty: -10 } },
    containment: { title: 'Authorize containment', credits: 240, reputation: { duty: 25, freedom: -15 } },
    public: { title: 'Broadcast the evidence', credits: 180, reputation: { scientists: 20, freedom: 15, duty: -10 } },
    accord: { title: 'Negotiate a monitored relief corridor', credits: 160, reputation: { loners: 15, duty: 10, scientists: 10 }, skill: 'diplomacy', required: 35 },
};

/** An original mission joining exploration, salvage and irreversible choices. */
export class FieldOperations {
    constructor(game) {
        this.game = game; this.objects = [];
        game.questSystem.registerQuest({ id: SIGNAL_QUEST, name: 'The Last Signal',
            description: 'Recover the relay log from the flooded junction. Return to Nyra Hale and decide who gets control of the district.',
            objectives: [
                { id: 'recover', type: 'talk', description: 'Recover the junction relay log', target: 1 },
                { id: 'resolve', type: 'talk', description: 'Return to Nyra and decide the district’s future', target: 1 },
            ], rewards: { experience: 200, money: 0, items: [], reputation: {} } });
        game.questSystem.makeAvailable(SIGNAL_QUEST);
        game.dialogueSystem.registerDialogue(this.dispatcherDialogue());
        game.dialogueSystem.registerDialogue(this.relayDialogue());
        this.offLevel = globalEventBus.on('level:loaded', () => this.spawnWorld());
        this.spawnWorld();
    }
    isActive() { return this.game.questSystem.getQuest(SIGNAL_QUEST)?.state === 'active'; }
    start() {
        if (!this.game.questSystem.startQuest(SIGNAL_QUEST)) return false;
        this.syncWorldState();
        this.notify('Relay marked on your compass. Probe anomalies with G; your detector uses N.');
        return true;
    }
    recover(method = 'force') {
        if (!this.isActive() || this.game.flags.signalRecovered) return false;
        if (method === 'repair' && this.game.progressionSystem.getSkill('engineering') < 30) return false;
        if (method === 'careful' && this.game.progressionSystem.getSkill('fieldcraft') < 30) return false;
        if (method === 'force') {
            this.game.player.takeDamage(12, null);
            this.game.player.addRadiation(6);
        }
        this.game.flags.signalRecovered = true;
        this.game.questSystem.getQuest(SIGNAL_QUEST).updateObjective('recover');
        this.game.progressionSystem.addExperience(100);
        this.syncWorldState();
        this.notify('Relay log recovered. Nyra needs your decision back at the checkpoint.');
        return true;
    }
    resolve(id) {
        const outcome = SIGNAL_OUTCOMES[id];
        if (!outcome || !this.isActive() || !this.game.flags.signalRecovered || this.game.flags.signalOutcome) return false;
        if (outcome.skill && this.game.progressionSystem.getSkill(outcome.skill) < outcome.required) return false;
        this.game.flags.signalOutcome = id;
        this.game.progressionSystem.addMoney(outcome.credits);
        for (const [faction, amount] of Object.entries(outcome.reputation)) {
            this.game.factionSystem.adjustRep(faction, amount, outcome.title);
        }
        this.game.questSystem.getQuest(SIGNAL_QUEST).updateObjective('resolve');
        this.syncWorldState();
        this.notify(`${outcome.title}. +${outcome.credits} credits. The factions will remember.`);
        globalEventBus.emit('zone:pda_feed', {text: this.aftermath(), kind: 'info'});
        return true;
    }
    aftermath() {
        return {
            residents: 'Residents retain the relay. Relief supplies are discounted at Nyra’s checkpoint.',
            containment: 'The Directorate sealed the junction. The damaged relay no longer leaks radiation.',
            public: 'The relay log is public. The Survey Bureau supplied a permanent technical briefing (+5 Engineering).',
            accord: 'A monitored relief corridor is open. The checkpoint offers discounted supplies and the junction is stabilized.',
        }[this.game.flags.signalOutcome] || 'The checkpoint waits for news from the junction.';
    }
    price(base) {
        const friendly = this.game.factionSystem.getRep('loners') >= 10;
        const discount=this.game.perkSystem?.getEffects().prices || 0;
        return Math.round(base * (friendly ? 0.8 : 1) * (1-discount));
    }
    buy(itemId, basePrice) {
        const price = this.price(basePrice);
        if ((this.game.player.money || 0) < price) { this.notify('Not enough credits.'); return false; }
        if (!this.game.inventorySystem.addItem(itemId, 1)) return false;
        this.game.progressionSystem.spendMoney(price);
        this.notify(`Purchased supplies for ${price} credits.`);
        return true;
    }
    notify(message) { globalEventBus.emit(GameEvents.NOTIFICATION, {message, type: 'info', duration: 6000}); }
    dispatcherDialogue() {
        const available = g => g.questSystem.getQuest(SIGNAL_QUEST)?.state === 'available';
        const ready = g => g.flags.signalRecovered && !g.flags.signalOutcome;
        return { id: 'nyra_checkpoint', speaker: 'Nyra Hale', nodes: {
            start: { text: 'Still here? So am I. There’s a log inside the junction relay. Bring it back if you find it. The rest can wait.',
                options: [
                    {text: 'I’ll recover the relay log.', condition:{type:'custom',evaluate:available}, actions:[{type:'custom',execute:()=>this.start()}], end:true},
                    {text: 'I have the log. Let’s discuss who receives it.', condition:{type:'custom',evaluate:ready}, next:'decision'},
                    {text: 'What changed after my decision?', condition:{type:'custom',evaluate:g=>!!g.flags.signalOutcome}, next:'aftermath'},
                    {text:'I need supplies.',next:'supplies'},
                    {text:'Show me a short local scavenging route.',actions:[{type:'custom',execute:()=>this.game.onboarding?.start()}],end:true},
                    {text:'Any advice for the junction?',next:'advice'},
                    {text:'I’ll be back.',end:true},
                ]},
            advice:{text:'Read what people left behind. Throw bolts before walking into distortion. Keep water and bandages on your belt. Engineering or Fieldcraft can recover the log without a shock. Open your journal with J to invest your skills.',options:[{text:'Understood.',next:'start'}]},
            decision:{text:'The Directorate will pay for control. Residents will share what little they have. Publishing the log protects the truth, but leaves the relay contested. A relief corridor needs someone who can get both sides to listen.',options:[
                ...Object.entries(SIGNAL_OUTCOMES).map(([id,o])=>({text:`${o.skill ? '[Diplomacy 35] ' : ''}${o.title} (${o.credits} credits)`,
                    showLocked:!!o.skill, condition:o.skill?{type:'skill',skill:o.skill,value:o.required}:undefined,
                    actions:[{type:'custom',execute:()=>this.resolve(id)}], next:'aftermath'})),
                {text:'I need more time. Keep the log with me.',end:true},
            ]},
            aftermath:{text:'Your decision stands. Check your journal for the district’s new status and your faction standing.',options:[{text:'Let me see your supplies.',next:'supplies'},{text:'Take care, Nyra.',end:true}]},
            supplies:{text:'Supplies cost credits; friendly residents receive a discount. If your pack is full, the purchase is cancelled.',options:[
                {text:()=>`Buy one bandage (${this.price(20)} credits).`,actions:[{type:'custom',execute:()=>this.buy('bandage',20)}],end:true},
                {text:()=>`Buy one water bottle (${this.price(15)} credits).`,actions:[{type:'custom',execute:()=>this.buy('water_bottle',15)}],end:true},
                {text:()=>`Buy one small medkit (${this.price(50)} credits).`,actions:[{type:'custom',execute:()=>this.buy('medkit_small',50)}],end:true},
                {text:'Back.',next:'start'},
            ]},
        }};
    }
    relayDialogue() {
        return {id:'junction_relay',speaker:'Damaged junction relay',nodes:{start:{
            text:'Static crawls over the relay casing. The evacuation log is intact, but the broken power connection arcs whenever the latch moves.',options:[
                {text:'[Engineering 30] Bridge the damaged connection.',showLocked:true,condition:{type:'skill',skill:'engineering',value:30},actions:[{type:'custom',execute:()=>this.recover('repair')}],end:true},
                {text:'[Fieldcraft 30] Ground the casing and salvage carefully.',showLocked:true,condition:{type:'skill',skill:'fieldcraft',value:30},actions:[{type:'custom',execute:()=>this.recover('careful')}],end:true},
                {text:'Force the latch (12 damage and 6 radiation).',actions:[{type:'custom',execute:()=>this.recover('force')}],end:true},
                {text:'Leave it alone for now.',end:true},
            ]}}};
    }
    spawnWorld() {
        this.clearWorld();
        if (this.game.currentLevelName !== 'zone_outskirts') return;
        const wm = this.game.worldManager;
        const npc = new NPC({name:'Nyra Hale',faction:'loners',dialogueId:'nyra_checkpoint',quests:[SIGNAL_QUEST]});
        npc.init(this.game);
        const checkpoint=this.openPoint(2,12);
        npc.position.set(checkpoint.x, wm.getTerrainHeight(checkpoint.x,checkpoint.z),checkpoint.z);
        npc.mesh.position.copy(npc.position);
        npc.mesh.userData.isInteractive = true;
        npc.mesh.userData.promptText = 'Talk to Nyra Hale';
        npc.mesh.userData.interactable = {onInteract:()=>npc.interact(this.game.player)};
        wm.scene.add(npc.mesh); wm.entities.set(npc.id,npc); this.npc=npc; this.objects.push(npc.mesh);
        const canopy=new THREE.Group();
        const mat=new THREE.MeshStandardMaterial({color:0x454a43,roughness:0.9});
        const roof=new THREE.Mesh(new THREE.BoxGeometry(6,0.18,6),mat);roof.position.y=3;roof.castShadow=true;canopy.add(roof);
        for(const x of [-2.8,2.8]) for(const z of [-2.8,2.8]) {
            const post=new THREE.Mesh(new THREE.BoxGeometry(0.12,3,0.12),mat);post.position.set(x,1.5,z);canopy.add(post);
        }
        canopy.position.copy(npc.position);wm.scene.add(canopy);this.objects.push(canopy);
        const relay = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8,1,0.5),new THREE.MeshStandardMaterial({color:0x57605b,roughness:0.8}));
        body.position.y=0.5; body.castShadow=true; relay.add(body);
        const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.08,0.02),new THREE.MeshStandardMaterial({color:0xffb944,emissive:0xff9d20,emissiveIntensity:0.7}));
        lamp.position.set(0,0.75,0.26); relay.add(lamp);
        const junction=this.openPoint(74,78);
        relay.position.set(junction.x,wm.getTerrainHeight(junction.x,junction.z),junction.z);
        relay.userData.isInteractive=true; relay.userData.promptText='Inspect junction relay';
        relay.userData.interactable={onInteract:()=>{
            if (this.game.questSystem.getQuest(SIGNAL_QUEST)?.state==='available') this.start();
            if (!this.isActive()) this.notify('The junction relay has been secured.');
            else if(this.game.flags.signalRecovered) this.notify('The log is recovered. Return to Nyra.');
            else this.game.dialogueSystem.startDialogue('junction_relay',{name:'Damaged junction relay'});
        }};
        wm.scene.add(relay); this.relay=relay; this.objects.push(relay);
        for(const record of FIELD_RECORDS) this.spawnRecord(record);
        this.game.compassSystem.addMarker('nyra',{x:checkpoint.x,z:checkpoint.z,icon:'◇',label:'Nyra’s checkpoint',revealDist:500});
        this.syncWorldState();
    }
    syncWorldState() {
        if (this.game.flags.signalOutcome==='public' && !this.game.flags.signalBriefingApplied) {
            const p=this.game.progressionSystem;
            p.skills.engineering=Math.min(100,p.getSkill('engineering')+5);
            this.game.flags.signalBriefingApplied=true;
        }
        if (!this.npc || this.game.currentLevelName !== 'zone_outskirts') return;
        if (this.isActive()) this.game.compassSystem.setQuestTarget(this.game.flags.signalRecovered
            ? {x:this.npc.position.x,z:this.npc.position.z,label:'Return to Nyra'}
            : {x:this.relay.position.x,z:this.relay.position.z,label:'Junction relay'});
        else this.game.compassSystem.clearQuestTarget();
        if (this.relay) this.relay.userData.promptText=this.game.flags.signalRecovered?'Relay log recovered':'Inspect junction relay';
    }
    update(dt) {
        if (!this.relay || this.game.currentLevelName !== 'zone_outskirts') return;
        const outcome=this.game.flags.signalOutcome;
        if (outcome==='containment'||outcome==='accord') return;
        if (this.game.player.position.distanceTo(this.relay.position)<3 && !this.game.survivalSystem?.isInShelter()) {
            const resistance=this.game.progressionSystem.getSkill('fieldcraft')/200;
            this.game.player.addRadiation(dt*0.7*(1-resistance));
        }
    }
    reset() { this.game.flags={}; this.syncWorldState(); }
    openPoint(x,z) {
        const spots=this.game.worldManager.buildingSpots || [];
        for(let radius=0;radius<=12;radius+=2) {
            for(const [dx,dz] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
                const px=x+dx,pz=z+dz;
                if(!spots.some(s=>Math.abs(px-s.x)<s.width/2+1 && Math.abs(pz-s.z)<s.depth/2+1)) return {x:px,z:pz};
            }
        }
        return {x:0,z:10};
    }
    spawnRecord(record) {
        const wm=this.game.worldManager;
        const point=this.openPoint(record.x,record.z);
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#292e29';ctx.fillRect(0,0,256,256);
        ctx.fillStyle='#c3baa2';ctx.font='bold 24px sans-serif';ctx.textAlign='center';
        ctx.fillText('DISTRICT RECORD',128,60);ctx.font='18px sans-serif';
        ctx.fillText(record.id==='evacuation'?'ROUTE C — CANCELLED':'RECOVERABLE RECORD',128,125);
        ctx.fillText('READ BEFORE LEAVING',128,195);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.9,0.04),new THREE.MeshStandardMaterial({map:texture,roughness:1}));
        const stand=new THREE.Group();stand.position.set(point.x,wm.getTerrainHeight(point.x,point.z)+0.01,point.z);
        mesh.position.set(0,1.1,0);stand.add(mesh);
        const supportMat=new THREE.MeshStandardMaterial({color:0x55534a,roughness:0.9,metalness:0.15});
        for(const x of [-0.27,0.27]) {
            const support=new THREE.Mesh(new THREE.BoxGeometry(0.05,1.5,0.05),supportMat);
            support.position.set(x,0.75,-0.035);support.castShadow=true;stand.add(support);
        }
        mesh.userData.isInteractive=true;mesh.userData.promptText=`Read ${record.title.toLowerCase()}`;
        const dialogueId=`field_record_${record.id}`;
        this.game.dialogueSystem.registerDialogue({id:dialogueId,speaker:record.title,nodes:{start:{speaker:record.title,text:record.text,options:[{text:'Record it in my journal.',actions:[{type:'custom',execute:()=>{
            const seen=this.game.flags.fieldRecords || [];
            if(!seen.includes(record.id)) {seen.push(record.id);this.game.flags.fieldRecords=seen;this.game.progressionSystem.addExperience(15);}
            if(this.game.questSystem.getQuest(SIGNAL_QUEST)?.state==='available') this.start();
        }}],end:true},{text:'Leave it for now.',end:true}]}}});
        mesh.userData.interactable={onInteract:()=>this.game.dialogueSystem.startDialogue(dialogueId,{name:record.title})};
        stand.userData=mesh.userData;
        wm.scene.add(stand);this.objects.push(stand);
    }
    isCheckpointSheltered(position) {
        return !!this.npc && this.game.currentLevelName==='zone_outskirts' &&
            Math.abs(position.x-this.npc.position.x)<3 && Math.abs(position.z-this.npc.position.z)<3 &&
            position.y>=this.npc.position.y-0.5 && position.y<this.npc.position.y+1.3;
    }
    clearWorld() {
        if(this.npc) this.game.worldManager.entities.delete(this.npc.id);
        for(const obj of this.objects) {
            obj.removeFromParent(); obj.traverse(o=>{o.geometry?.dispose(); if(o.material){o.material.map?.dispose();o.material.dispose();}});
        }
        this.objects=[];this.npc=null;this.relay=null;
        this.game.compassSystem?.removeMarker('nyra');
    }
    dispose() { this.clearWorld(); if(typeof this.offLevel==='function') this.offLevel(); }
}
