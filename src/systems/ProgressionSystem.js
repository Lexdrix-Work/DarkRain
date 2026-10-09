import { globalEventBus, GameEvents } from '../core/EventBus.js';

export const SKILLS = {
    diplomacy: { name: 'Diplomacy', description: 'Negotiation and peaceful solutions.' },
    fieldcraft: { name: 'Fieldcraft', description: 'Safe salvage, exposure and survival.' },
    engineering: { name: 'Engineering', description: 'Relay repairs and technical solutions.' },
};

export class ProgressionSystem {
    constructor(game) { this.game = game; this.reset(); }
    reset() {
        this.skills = { diplomacy: 20, fieldcraft: 20, engineering: 20 };
        this.skillPoints = 3;
        this.motionAmount = 0.55;
        if (this.game.player) Object.assign(this.game.player, { level: 1, experience: 0, money: 100 });
    }
    getSkill(id) { return this.skills[id] || 0; }
    train(id) {
        if (!SKILLS[id] || this.skillPoints <= 0 || this.getSkill(id) >= 100) return false;
        this.skills[id] = Math.min(100, this.getSkill(id) + 5);
        this.skillPoints--;
        return true;
    }
    addExperience(amount) {
        const player = this.game.player;
        if (!player || !Number.isFinite(amount) || amount <= 0) return;
        player.experience = (player.experience || 0) + amount;
        let level = player.level || 1;
        while (level < 20 && player.experience >= level * (level + 1) * 75) {
            level++;
            this.skillPoints += 3;
            if (this.game.perkSystem) {
                this.game.perkSystem.level = level;
                this.game.perkSystem.addPoint();
            }
            globalEventBus.emit(GameEvents.NOTIFICATION, { message: `Rank ${level}: 3 skill points and 1 perk point. Open your journal with J.`, type: 'success' });
        }
        player.level = level;
    }
    addMoney(amount) {
        if (this.game.player && Number.isFinite(amount)) this.game.player.money = Math.max(0, (this.game.player.money || 0) + amount);
    }
    spendMoney(amount) {
        if (!Number.isFinite(amount) || amount < 0 || (this.game.player?.money || 0) < amount) return false;
        this.addMoney(-amount);
        return true;
    }
    serialize() { return { skills: { ...this.skills }, skillPoints: this.skillPoints, motionAmount: this.motionAmount }; }
    deserialize(data) {
        for (const id of Object.keys(SKILLS)) {
            const value = data?.skills?.[id];
            this.skills[id] = Number.isFinite(value) ? Math.max(20, Math.min(100, value)) : 20;
        }
        this.skillPoints = Math.max(0, Math.floor(data?.skillPoints ?? 3));
        this.motionAmount = Math.max(0, Math.min(1, data?.motionAmount ?? 0.55));
    }
}
