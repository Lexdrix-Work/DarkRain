import { drawAtlantaFieldMap } from './AtlantaFieldMap.js';
import { SKILLS } from '../systems/ProgressionSystem.js';
import { PERKS } from '../systems/PerkSystem.js';
import { FACTIONS } from '../systems/FactionSystem.js';
import { FIELD_RECORDS } from '../systems/FieldOperations.js';
import '../styles/field-journal.css';

export class FieldJournal {
    constructor(game) {
        this.game=game;
        this.dialog=document.createElement('dialog');
        this.dialog.className='field-journal'; this.dialog.setAttribute('aria-label','Field journal');
        document.body.appendChild(this.dialog);
        this.onKey=e=>{
            if(e.code==='KeyJ' && !e.repeat && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
                if(this.dialog.open) this.close();
                else if(game.gameState==='playing'&&!game.dialogueSystem?.isActive&&!game.uiManager?.activeMenu) this.open();
                e.preventDefault();
            } else if(e.code==='Escape'&&this.dialog.open) {
                e.preventDefault();this.close();game.inputManager.keysJustPressed.delete('Escape');
            }
        };
        document.addEventListener('keydown',this.onKey);
        this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();game.inputManager.keysJustPressed.delete('Escape');});
    }
    node(tag,text,parent,className) {
        const el=document.createElement(tag);if(text!==undefined) el.textContent=text;
        if(className) el.className=className;parent?.appendChild(el);return el;
    }
    button(text,parent,action,disabled=false) {
        const b=this.node('button',text,parent);b.type='button';b.disabled=disabled;b.addEventListener('click',action);return b;
    }
    open() {
        this.wasPaused=this.game.isPaused;this.game.isPaused=true;
        this.game.uiManager.activeMenu='journal';this.game.inputManager.exitPointerLock();
        this.render();this.dialog.showModal();
    }
    close() {
        this.dialog.close();this.game.isPaused=this.wasPaused;
        if(this.game.uiManager.activeMenu==='journal') this.game.uiManager.activeMenu=null;
        if(!this.game.isPaused&&this.game.gameState==='playing') this.game.inputManager.requestPointerLock();
    }
    section(title) { const s=this.node('section',undefined,this.dialog);this.node('h2',title,s);return s; }
    render() {
        const g=this.game,p=g.progressionSystem;
        this.dialog.replaceChildren();
        const header=this.node('header',undefined,this.dialog);
        this.node('h1','Field Journal',header);this.button('Return to the city · J / Esc',header,()=>this.close());
        this.node('p',`Rank ${g.player.level||1} · ${g.player.experience||0} XP · ${g.player.money||0} credits · ${p.skillPoints} skill points`,this.dialog,'journal-summary');
        g.onboarding?.journal(this.dialog,this);
        const missions=this.section('Assignments and consequences');
        const quests=[...g.questSystem.quests.values()].filter(q=>['active','completed'].includes(q.state));
        if(!quests.length) this.node('p','Read the abandoned evacuation notice or speak to Nyra at the nearby checkpoint. Exploration can begin an assignment without a conversation.',missions);
        for(const q of quests) {
            this.node('h3',`${q.name} · ${q.state}`,missions);
            this.node('p',q.description,missions);
            for(const o of q.objectives) this.node('p',`${o.completed?'✓':'○'} ${o.description} (${o.current}/${o.target})`,missions);
        }
        if(g.flags.signalOutcome) this.node('p',g.fieldOperations.aftermath(),missions,'journal-consequence');
        const records=this.section('Recovered field records');
        const found=FIELD_RECORDS.filter(r=>(g.flags.fieldRecords || []).includes(r.id));
        if(!found.length) this.node('p','The district’s story is in what its residents left behind.',records);
        for(const record of found){this.node('h3',record.title,records);this.node('p',record.text,records);}
        const skills=this.section('Skills — each point adds 5');
        for(const [id,skill] of Object.entries(SKILLS)) {
            const row=this.node('div',undefined,skills,'journal-card');
            this.node('h3',`${skill.name} ${p.getSkill(id)}`,row);this.node('p',skill.description,row);
            this.button(`Train ${skill.name}`,row,()=>{p.train(id);this.render();},p.skillPoints<1||p.getSkill(id)>=100);
        }
        const factions=this.section('Faction standing');
        for(const [id,f] of Object.entries(FACTIONS)) this.node('p',`${f.name}: ${Math.round(g.factionSystem.getRep(id))} · ${g.factionSystem.getTier(id).name}`,factions);
        const perks=this.section(`Perks — ${g.perkSystem.points} available points`);
        const supported=['gunslinger','rifleman','lead_belly','traveler','negotiator','quick_draw'];
        for(const id of supported) {
            const perk=PERKS[id];
            const row=this.node('div',undefined,perks,'journal-card');const check=g.perkSystem.canTake(id);
            this.node('h3',perk.name,row);this.node('p',perk.description,row);
            this.button(g.perkSystem.hasPerk(id)?'Learned':check.ok?'Learn perk':check.reason,row,()=>{g.perkSystem.takePerk(id);this.render();},!check.ok);
        }
        const comfort=this.section('Camera comfort');
        this.node('p','Body-mounted roll, landing motion and recoil. Set to zero for a steady camera. Hold Left Alt while aiming to steady your weapon; this uses stamina.',comfort);
        const label=this.node('label','Body camera motion ',comfort);
        const slider=this.node('input',undefined,label);slider.type='range';slider.min='0';slider.max='100';slider.value=String(p.motionAmount*100);
        slider.setAttribute('aria-label','Body camera motion');slider.addEventListener('input',()=>{p.motionAmount=Number(slider.value)/100;});
        this.node('p','WASD move · C crouch · Shift sprint · E interact · N detector · G probe bolt · F flashlight · F5 save · F9 load',this.dialog,'journal-summary');
        this.renderAtlantaMap();
    }
    renderAtlantaMap() {
        const geography=this.game.worldManager?.atlantaGeography;if(!geography)return;
        const section=this.node('section',undefined,this.dialog);
        this.node('h2','Atlanta field survey',section);
        const p=this.game.player?.position;
        this.node('p',p?`Current district: ${geography.districtAt(p.x,p.z)}`:'Regional reference',section);
        const canvas=this.node('canvas',undefined,section);canvas.width=700;canvas.height=520;
        canvas.style.cssText='width:100%;height:auto;border:1px solid #776f58';
        canvas.setAttribute('aria-label','North-up Atlanta neighborhood field survey.');
        drawAtlantaFieldMap(canvas,geography,p);
        this.node('small','Roads and passages may be obstructed. Use landmarks to confirm your route.',section);
    }
    dispose() {document.removeEventListener('keydown',this.onKey);this.dialog.remove();}
}
