export function survivalWarnings(stats) {
    const warnings = [];
    if(stats.bleeding>0)warnings.push('BLEEDING · use a bandage');
    if (stats.health <= stats.maxHealth * 0.25) warnings.push('Wounded · use medical supplies');
    if (stats.radiation >= stats.maxRadiation * 0.5) warnings.push('Radiation · leave the contaminated area');
    if (stats.thirst >= stats.maxThirst * 0.7) warnings.push('Thirsty · drink water');
    if (stats.hunger >= stats.maxHunger * 0.7) warnings.push('Hungry · eat food');
    return warnings;
}

/** Compact feedback; updates text only when its content changes. */
export class ExperienceHUD {
    constructor(game, parent) {
        this.game = game;
        this.root = document.createElement('div');
        this.root.className = 'experience-hud';
        this.assignment = document.createElement('div');
        this.assignment.className = 'assignment-readout';
        document.getElementById('quest-tracker')?.remove();
        this.status = document.createElement('div');
        this.status.className = 'survival-readout';
        this.weapon = document.createElement('div');
        this.weapon.className = 'weapon-readout';
        this.reload = document.createElement('progress');
        this.reload.max = 1;
        this.reload.setAttribute('aria-label', 'Reload progress');
        this.root.append(this.assignment, this.status, this.weapon, this.reload);
        parent?.appendChild(this.root);
        this.timer = 0;
    }
    text(element, value) {
        if (element.textContent !== value) element.textContent = value;
        element.hidden = !value;
    }
    update(dt) {
        const g = this.game, w = g.weaponManager?.equippedWeapon;
        this.root.hidden = g.gameState !== 'playing' || !!g.uiManager.activeMenu;
        this.reload.hidden = !w?.isReloading;
        if (w?.isReloading) this.reload.value = Math.min(1, w.reloadProgress);
        this.text(this.weapon, w ? `${w.data.name} · ${w.isReloading ? 'Reloading' : w.currentAmmo === 0 ? w.reserveAmmo > 0 ? 'R · Reload' : 'No ammunition' : w.isAiming ? 'Alt · Steady aim' : ''}` : '');
        g.uiManager.elements.crosshair?.classList.toggle('aiming', !!w?.isAiming);
        this.timer -= dt;
        if (this.timer > 0) return;
        this.timer = 0.25;
        this.text(this.status, survivalWarnings(g.player.stats).join('  /  '));
        const quest = g.questSystem?.getActiveQuests()[0];
        const objective = quest?.objectives.find(o => !o.completed);
        this.text(this.assignment, objective ? `${quest.name}\n${objective.description}\nJ · Field journal` : '');
    }
    dispose() { this.root.remove(); }
}
