import { Items } from '../data/items.js';
import { ItemIcons } from './ItemIcons.js';

export class GearPanel {
    constructor(ui){this.ui=ui;this.game=ui.game;}
    describe(item,index) {
        const box=document.getElementById('gear-description');box.replaceChildren();
        const title=document.createElement('h3');title.textContent=item.name;box.append(title);
        const text=document.createElement('p');text.textContent=item.description||'Field equipment';box.append(text);
        const weight=document.createElement('p');weight.textContent=`${item.weight||0} kg · ${item.type}`;box.append(weight);
        const action=document.createElement('button');action.textContent=item.type==='equipment'?'Equip':item.type==='weapon'?'Ready weapon':'Use';
        action.onclick=()=>{if(item.type==='equipment')this.game.equipmentSystem.equip(item.id);else this.game.inventorySystem.useItem(index);this.ui.updateInventoryDisplay();};box.append(action);
        for(let slot=0;slot<4;slot++){const assign=document.createElement('button');assign.textContent='Assign quick item '+(slot+1);assign.onclick=()=>{this.game.inventorySystem.setQuickSlot(slot,index);this.ui.updateInventoryDisplay();};box.append(assign);}
        const drop=document.createElement('button');drop.textContent='Drop';drop.onclick=()=>{this.game.inventorySystem.dropItem(index);this.ui.updateInventoryDisplay();};box.append(drop);
    }
    refresh() {
        const g=this.game;if(!g.player||!g.inventorySystem||!g.equipmentSystem||!g.weaponManager)return;const root=document.getElementById('gear-slots');if(!root)return;root.replaceChildren();
        for(const [slot,label] of [['head','HEADWEAR'],['body','BODY ARMOR'],['back','BACKPACK']]) {
            const item=Items[g.equipmentSystem.equipped[slot]],card=document.createElement('button');card.className='gear-card';card.dataset.slot=slot;
            const title=document.createElement('span');title.className='gear-slot-label';title.textContent=label;card.append(title);
            if(item){const img=document.createElement('img');img.src=ItemIcons.get(item.icon||item.id);card.append(img);}
            const name=document.createElement('span');name.textContent=item?.name||'Empty slot';card.append(name);
            card.onclick=()=>{if(item){g.equipmentSystem.unequip(slot);this.ui.updateInventoryDisplay();}};
            card.ondragover=e=>e.preventDefault();card.ondrop=e=>{e.preventDefault();const i=Number(e.dataTransfer.getData('text/plain')),candidate=g.inventorySystem.slots[i];if(candidate?.type==='equipment'&&candidate.slot===slot){g.equipmentSystem.equip(candidate.id);this.ui.updateInventoryDisplay();}};
            root.append(card);
        }
        const weapons=document.getElementById('gear-weapons');weapons.replaceChildren();
        for(const weapon of g.weaponManager.weapons.values()) {
            const card=document.createElement('button');card.className='gear-weapon'+(weapon===g.weaponManager.equippedWeapon?' active':'');card.textContent=`${weapon.data.name} · ${Number.isFinite(weapon.currentAmmo)?weapon.currentAmmo:'—'}`;
            card.onclick=()=>{g.weaponManager.equipWeapon(weapon.id);this.ui.updateInventoryDisplay();};weapons.append(card);
        }
        const belt=document.getElementById('gear-belt');belt.replaceChildren();
        g.inventorySystem.quickSlots.forEach((slot,i)=>{
            const item=slot===null?null:g.inventorySystem.slots[slot],button=document.createElement('button');button.className='gear-quick';button.textContent=`${i+5} · ${item?.name||'Drop item here'}`;
            button.ondragover=e=>e.preventDefault();button.ondrop=e=>{e.preventDefault();g.inventorySystem.setQuickSlot(i,Number(e.dataTransfer.getData('text/plain')));this.refresh();};
            button.onclick=()=>{g.inventorySystem.useQuickSlot(i);this.ui.updateInventoryDisplay();};belt.append(button);
        });
        const stats=g.player.stats;document.getElementById('gear-vitals').textContent=`HEALTH ${Math.ceil(stats.health)}   STAMINA ${Math.ceil(stats.stamina)}   ${stats.bleeding>0?'BLEEDING — BANDAGE REQUIRED':'NO ACTIVE BLEEDING'}`;
        document.getElementById('gear-back').onclick=()=>this.ui.closeMenu('inventory');
    }
}
