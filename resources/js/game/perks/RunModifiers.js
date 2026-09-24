/**
 * RunModifiers — 當局 perk 累積狀態；Restart 時清空。
 * 數值效果由此集中讀取，GameCore／武器只查詢 getter。
 */
export class RunModifiers {
    /** @param {import('./PerkPool.js').PerkPool} pool */
    constructor(pool) {
        this.pool = pool;
        /** @type {string[]} */
        this.owned = [];
        this.reset();
    }

    reset() {
        this.owned = [];
        this.spreadGun = false;
        this.spreadCount = 1;
        this.spreadAngle = 0;
        this.lifestealHeal = 0;
        this.radarMul = 1;
        this.collisionImmune = false;
        this.fireIntervalMul = 1;
        this.boostDurationMul = 1;
        this.maxHpBonus = 0;
        this.lockSecondsMul = 1;
        this.missileTurnMul = 1;
        this.missileCapacityBonus = 0;
    }

    /**
     * @param {string} id
     * @param {{ player?: object, weapons?: object, lockOn?: object, radar?: object }} ctx
     */
    apply(id, ctx = {}) {
        const def = this.pool.get(id);
        if (!def) return;
        this.owned.push(id);

        if (def.spread_count) {
            this.spreadGun = true;
            this.spreadCount = def.spread_count;
            this.spreadAngle = def.spread_angle ?? 0.12;
        }
        if (def.missiles) {
            this.missileCapacityBonus += def.missiles;
            if (ctx.weapons) {
                ctx.weapons.maxMissiles += def.missiles;
                ctx.weapons.addMissiles(def.missiles);
            }
        }
        if (def.heal) this.lifestealHeal += def.heal;
        if (def.range_mul) {
            this.radarMul *= def.range_mul;
    if (ctx.radar) {
                ctx.radar.baseRange = ctx.radar.baseRange ?? ctx.radar.range;
                ctx.radar.range = ctx.radar.baseRange * this.radarMul;
            }
        }
        if (def.collision_immune) this.collisionImmune = true;
        if (def.fire_interval_mul) {
            this.fireIntervalMul *= def.fire_interval_mul;
            if (ctx.weapons) {
                ctx.weapons.gunFireInterval = ctx.weapons.gunCfg.fire_interval * this.fireIntervalMul;
            }
        }
        if (def.boost_duration_mul) {
            this.boostDurationMul *= def.boost_duration_mul;
            if (ctx.player) {
                ctx.player.boostDuration = ctx.player.config.flight.boost_duration * this.boostDurationMul;
            }
        }
        if (def.max_hp_bonus) {
            this.maxHpBonus += def.max_hp_bonus;
            if (ctx.player) {
                ctx.player.maxHp += def.max_hp_bonus;
                ctx.player.hp = Math.min(ctx.player.maxHp, ctx.player.hp + def.max_hp_bonus);
            }
        }
        if (def.lock_seconds_mul) {
            this.lockSecondsMul *= def.lock_seconds_mul;
            if (ctx.lockOn?.setLockSecondsMul) {
                ctx.lockOn.setLockSecondsMul(this.lockSecondsMul);
            }
        }
        if (def.missile_turn_mul) {
            this.missileTurnMul *= def.missile_turn_mul;
        }
    }

    /** 已擁有 id 集合（抽卡排除用）。 */
    ownedSet() {
        return new Set(this.owned);
    }
}
