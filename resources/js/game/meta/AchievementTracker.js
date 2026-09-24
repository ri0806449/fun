/**
 * AchievementTracker — 局內條件追蹤；解鎖委派 MetaStore。
 */
export class AchievementTracker {
    /**
     * @param {object} achievementsCfg
     * @param {import('./MetaStore.js').MetaStore} store
     * @param {{ onUnlock?: (id: string, def: object, reward: number) => void }} hooks
     */
    constructor(achievementsCfg, store, { onUnlock } = {}) {
        this.cfg = achievementsCfg ?? {};
        this.store = store;
        this.onUnlock = onUnlock ?? (() => {});
        this.resetRun();
    }

    resetRun() {
        this.fired = false;
        this.pacifistElapsed = 0;
        this.closeCallPending = false;
    }

    /** 玩家開火（機砲或飛彈）。 */
    noteFire() {
        this.fired = true;
    }

    /**
     * @param {number} dt
     * @param {boolean} playing
     */
    update(dt, playing) {
        if (!playing || this.fired) return;
        if (this.store.hasAchievement('pacifist')) return;
        this.pacifistElapsed += dt;
        const need = this.cfg.pacifist?.seconds ?? 180;
        if (this.pacifistElapsed >= need) {
            this._try('pacifist');
        }
    }

    /** @param {number} kills */
    noteKills(kills) {
        const need = this.cfg.ace?.kills ?? 50;
        if (kills >= need) this._try('ace');
    }

    /** 波次清空當下的 HP。 */
    noteWaveClear(hp, wave) {
        const thr = this.cfg.close_call?.hp_threshold ?? 5;
        if (hp < thr) this._try('close_call');

        const needWave = this.cfg.wave_rider?.wave ?? 8;
        if (wave >= needWave) this._try('wave_rider');
    }

    noteScrapLifetime() {
        const need = this.cfg.scrap_hoarder?.scrap_total ?? 200;
        if (this.store.scrapLifetime >= need) this._try('scrap_hoarder');
    }

    noteBossDefeated() {
        this._try('fortress_breaker');
    }

    /** @param {string} id */
    _try(id) {
        const result = this.store.unlockAchievement(id);
        if (!result?.unlocked) return;
        this.onUnlock(id, this.cfg[id], result.reward);
    }
}
