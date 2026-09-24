/**
 * PerkPool — 局內升級池：從設定抽出不重複選項。
 */
export class PerkPool {
    /** @param {object} perksCfg config.perks */
    constructor(perksCfg = {}) {
        this.cfg = perksCfg;
        this.pool = perksCfg.pool ?? {};
        this.choiceCount = perksCfg.choices ?? 3;
    }

    /** @returns {string[]} */
    ids() {
        return Object.keys(this.pool);
    }

    /**
     * @param {string} id
     * @returns {object|null}
     */
    get(id) {
        return this.pool[id] ?? null;
    }

    /**
     * 隨機抽 N 個（盡量不重複）；已擁有的 perk 降權但仍可出現（可疊加部分效果由 RunModifiers 決定）。
     * @param {number} [n]
     * @param {Set<string>|string[]} [exclude] 優先排除（例如已選過且不可再選）
     * @returns {{ id: string, def: object }[]}
     */
    roll(n = this.choiceCount, exclude = []) {
        const ban = exclude instanceof Set ? exclude : new Set(exclude);
        const all = this.ids();
        const preferred = all.filter((id) => !ban.has(id));
        const fallback = all.filter((id) => ban.has(id));
        const source = preferred.length >= n ? preferred : [...preferred, ...fallback];
        const shuffled = [...source].sort(() => Math.random() - 0.5);
        const picks = shuffled.slice(0, Math.min(n, shuffled.length));
        return picks.map((id) => ({ id, def: this.pool[id] }));
    }
}
