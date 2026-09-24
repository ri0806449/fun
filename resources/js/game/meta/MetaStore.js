/**
 * MetaStore — 局外零件／升級／成就存檔（localStorage）。
 * 格式：{ v, scrap, scrapLifetime, upgrades, achievements }
 */
export class MetaStore {
    /** @param {object} config 完整遊戲設定 */
    constructor(config) {
        this.metaCfg = config.meta ?? {};
        this.achCfg = config.achievements ?? {};
        this.key = this.metaCfg.storage_key ?? 'skyfighter.meta.v1';
        this.version = this.metaCfg.storage_version ?? 1;
        this.data = this._load();
    }

    _default() {
        const upgrades = {};
        for (const id of Object.keys(this.metaCfg.upgrades ?? {})) {
            upgrades[id] = 0;
        }
        const achievements = {};
        for (const id of Object.keys(this.achCfg)) {
            achievements[id] = false;
        }
        return {
            v: this.version,
            scrap: 0,
            scrapLifetime: 0,
            upgrades,
            achievements,
        };
    }

    _load() {
        const fallback = this._default();
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return fallback;
            const data = this._default();
            data.scrap = Math.max(0, Number(parsed.scrap) || 0);
            data.scrapLifetime = Math.max(0, Number(parsed.scrapLifetime) || 0);
            data.v = this.version;
            for (const id of Object.keys(data.upgrades)) {
                data.upgrades[id] = Math.max(0, Math.min(
                    this.metaCfg.upgrades[id]?.max_level ?? 99,
                    Number(parsed.upgrades?.[id]) || 0
                ));
            }
            for (const id of Object.keys(data.achievements)) {
                data.achievements[id] = !!parsed.achievements?.[id];
            }
            return data;
        } catch {
            return fallback;
        }
    }

    save() {
        try {
            localStorage.setItem(this.key, JSON.stringify(this.data));
        } catch {
            /* quota / private mode */
        }
    }

    get scrap() {
        return this.data.scrap;
    }

    get scrapLifetime() {
        return this.data.scrapLifetime;
    }

    /** @param {number} amount */
    addScrap(amount) {
        const n = Math.max(0, Math.floor(amount));
        if (n <= 0) return;
        this.data.scrap += n;
        this.data.scrapLifetime += n;
        this.save();
    }

    /**
     * @param {string} id
     * @returns {number}
     */
    upgradeLevel(id) {
        return this.data.upgrades[id] ?? 0;
    }

    /**
     * @param {string} id
     * @returns {number}
     */
    upgradeCost(id) {
        const def = this.metaCfg.upgrades?.[id];
        if (!def) return Infinity;
        const level = this.upgradeLevel(id);
        if (level >= (def.max_level ?? 0)) return Infinity;
        return Math.ceil((def.cost_base ?? 40) * (def.cost_growth ?? 1.5) ** level);
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    canUpgrade(id) {
        const def = this.metaCfg.upgrades?.[id];
        if (!def) return false;
        const level = this.upgradeLevel(id);
        if (level >= (def.max_level ?? 0)) return false;
        return this.scrap >= this.upgradeCost(id);
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    tryUpgrade(id) {
        if (!this.canUpgrade(id)) return false;
        const cost = this.upgradeCost(id);
        this.data.scrap -= cost;
        this.data.upgrades[id] = (this.data.upgrades[id] ?? 0) + 1;
        this.save();
        return true;
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    hasAchievement(id) {
        return !!this.data.achievements[id];
    }

    /**
     * 解鎖成就並發放獎勵（已解鎖則 no-op）。
     * @param {string} id
     * @returns {{ unlocked: boolean, reward: number }|null}
     */
    unlockAchievement(id) {
        if (!this.achCfg[id] || this.hasAchievement(id)) return null;
        const reward = Math.max(0, Number(this.achCfg[id].reward_scrap) || 0);
        this.data.achievements[id] = true;
        if (reward > 0) {
            this.data.scrap += reward;
            // 成就獎勵不計入 scrapLifetime（拾取進度），避免雙重觸發 scavenger
        }
        this.save();
        return { unlocked: true, reward };
    }

    /**
     * 將永久加成套用到本局實例參數。
     * @param {{ player: object, weapons: object, baseFlightThrust: number, baseMaxHp: number, baseMissileCd: number }} ctx
     * @returns {{ shield: number }}
     */
    applyToRun(ctx) {
        const up = this.metaCfg.upgrades ?? {};
        const engineLv = this.upgradeLevel('engine');
        const armorLv = this.upgradeLevel('armor');
        const mslLv = this.upgradeLevel('missile_cd');
        const shieldLv = this.upgradeLevel('shield');

        const thrustMul = 1 + engineLv * (up.engine?.thrust_per_level ?? 0.08);
        const hpBonus = armorLv * (up.armor?.hp_per_level ?? 12);
        const cdMul = Math.max(0.4, 1 - mslLv * (up.missile_cd?.cooldown_mul_per_level ?? 0.08));
        const shield = shieldLv * (up.shield?.shield_per_level ?? 18);

        if (ctx.player?.model) {
            ctx.player.model.thrustForce = ctx.baseFlightThrust * thrustMul;
        }
        if (ctx.player) {
            ctx.player.maxHp = ctx.baseMaxHp + hpBonus;
            ctx.player.hp = ctx.player.maxHp;
        }
        if (ctx.weapons) {
            ctx.weapons.missileCdMax = ctx.baseMissileCd * cdMul;
        }

        return { shield };
    }
}
