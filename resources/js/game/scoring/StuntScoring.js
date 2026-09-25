import * as THREE from 'three';

/**
 * StuntScoring — 超低空持續倍率、近距離掠過敵機加分。
 */
export class StuntScoring {
    /** @param {object} cfg config.stunts */
    constructor(cfg = {}) {
        this.cfg = cfg;
        this.enabled = cfg.enabled !== false;
        this.lowAltTimer = 0;
        this.lowAltActive = false;
        this.closeCallCd = 0;
        this._scoreAcc = 0;
        this.windBoost = 0;
    }

    reset() {
        this.lowAltTimer = 0;
        this.lowAltActive = false;
        this.closeCallCd = 0;
        this._scoreAcc = 0;
        this.windBoost = 0;
    }

    /**
     * @param {number} dt
     * @param {{ agl: number, playerPos: THREE.Vector3, enemies: Array }} ctx
     */
    update(dt, ctx) {
        if (!this.enabled) {
            return {
                lowAltActive: false,
                scoreDelta: 0,
                closeCall: false,
                foamBoost: 1,
                windBoost: 0,
                multiplier: 1,
            };
        }

        const maxAgl = this.cfg.low_alt_agl ?? 20;
        const hold = this.cfg.low_alt_hold ?? 3;
        const floor = this.cfg.low_alt_floor ?? 4;
        const agl = ctx.agl ?? 999;

        const inBand = agl <= maxAgl && agl >= floor;
        if (inBand) this.lowAltTimer += dt;
        else this.lowAltTimer = Math.max(0, this.lowAltTimer - dt * 1.5);
        this.lowAltActive = this.lowAltTimer >= hold;

        let scoreDelta = 0;
        if (this.lowAltActive) {
            this._scoreAcc += dt;
            const interval = this.cfg.low_alt_score_interval ?? 0.35;
            const pts = this.cfg.low_alt_score ?? 8;
            while (this._scoreAcc >= interval) {
                this._scoreAcc -= interval;
                scoreDelta += pts;
            }
            this.windBoost = this.cfg.low_alt_wind_boost ?? 0.45;
        } else {
            this._scoreAcc = 0;
            this.windBoost = THREE.MathUtils.lerp(this.windBoost, 0, Math.min(1, dt * 3));
        }

        if (this.closeCallCd > 0) this.closeCallCd = Math.max(0, this.closeCallCd - dt);

        let closeCall = false;
        const near = this.cfg.close_call_distance ?? 14;
        const collide = this.cfg.close_call_min_distance ?? 5.5;
        const pp = ctx.playerPos;
        if (pp && this.closeCallCd <= 0) {
            for (const e of ctx.enemies ?? []) {
                if (!e || e.alive === false) continue;
                const d = pp.distanceTo(e.position);
                if (d < near && d > collide) {
                    closeCall = true;
                    this.closeCallCd = this.cfg.close_call_cooldown ?? 4.5;
                    scoreDelta += this.cfg.close_call_score ?? 75;
                    break;
                }
            }
        }

        return {
            lowAltActive: this.lowAltActive,
            scoreDelta,
            closeCall,
            foamBoost: this.lowAltActive ? (this.cfg.low_alt_foam_mul ?? 2.2) : 1,
            windBoost: this.windBoost,
            multiplier: this.lowAltActive ? (this.cfg.low_alt_multiplier_label ?? 2) : 1,
        };
    }
}
