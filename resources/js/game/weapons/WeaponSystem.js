/**
 * WeaponSystem — 機砲過熱曲線與飛彈彈藥／冷卻的純狀態機。
 * 不碰 DOM：HUD 由 GameCore 讀取這裡的公開狀態後交給 Hud 繪製。
 */
export class WeaponSystem {
    /** @param {object} config 完整設定 */
    constructor(config) {
        const gun = config.weapons.gun;
        const missile = config.weapons.missile;

        this.gunCfg = gun;
        this.missileCfg = missile;
        this.startMissiles = config.player.start_missiles;
        this.maxMissiles = config.player.max_missiles;

        this.gunFireInterval = gun.fire_interval;
        this.heatPerSecond = 1 / gun.overheat_seconds;
        this.coolWhileOverheat = 1 / gun.cooldown_seconds;
        this.coolWhileIdle = gun.idle_cool_rate;

        this.missileCdMax = missile.cooldown;
        this._baseMissileCdMax = missile.cooldown;
        this._baseMaxMissiles = config.player.max_missiles;
        this.missiles = this.startMissiles;
        this.maxMissiles = this._baseMaxMissiles;
        this.missileCd = 0;
        this.gunHeat = 0;
        this.gunOverheated = false;
        this.gunFireAcc = 0;

        /** @type {() => void} 過熱時觸發（音效） */
        this.onOverheat = () => {};
    }

    reset() {
        this.maxMissiles = this._baseMaxMissiles;
        this.missiles = this.startMissiles;
        this.missileCd = 0;
        this.missileCdMax = this._baseMissileCdMax;
        this.gunFireInterval = this.gunCfg.fire_interval;
        this.gunHeat = 0;
        this.gunOverheated = false;
        this.gunFireAcc = 0;
    }

    update(dt) {
        if (this.missileCd > 0) this.missileCd = Math.max(0, this.missileCd - dt);
    }

    /**
     * @param {boolean} firing 本幀是否按住機砲鍵
     * @returns {boolean} 是否允許本幀開火
     */
    updateGun(dt, firing) {
        if (this.gunOverheated) {
            this.gunHeat = Math.max(0, this.gunHeat - this.coolWhileOverheat * dt);
            if (this.gunHeat <= 0.02) {
                this.gunHeat = 0;
                this.gunOverheated = false;
            }
            this.gunFireAcc = 0;
            return false;
        }

        if (firing) {
            this.gunHeat = Math.min(1, this.gunHeat + this.heatPerSecond * dt);
            if (this.gunHeat >= 1) {
                this.gunHeat = 1;
                this.gunOverheated = true;
                this.gunFireAcc = 0;
                this.onOverheat();
                return false;
            }
            this.gunFireAcc += dt;
            const canFire = this.gunFireAcc >= this.gunFireInterval;
            if (canFire) this.gunFireAcc = 0;
            return canFire;
        }

        this.gunHeat = Math.max(0, this.gunHeat - this.coolWhileIdle * dt);
        this.gunFireAcc = 0;
        return false;
    }

    canFireMissile() {
        return this.missiles > 0 && this.missileCd <= 0;
    }

    consumeMissile() {
        this.missiles--;
        this.missileCd = this.missileCdMax;
    }

    addMissiles(n) {
        this.missiles = Math.min(this.maxMissiles, this.missiles + n);
    }
}
