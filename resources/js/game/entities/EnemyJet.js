import { createJet, paletteForClass } from './JetFactory.js';
import { EnemyAI } from './EnemyAI.js';

/**
 * EnemyJet — 敵機實體（模型 + 血量 + AI）。
 * LockOn／Radar／WorldHud 皆以 EnemyJet 為目標單位，用 alive/position 判斷存活與位置。
 */
export class EnemyJet {
    /**
     * @param {import('three').Scene} scene
     * @param {import('three').Vector3} pos
     * @param {{ elite?: boolean, classType?: string }} opts
     * @param {object} enemyConfig config.enemy（共用 AI 參數）
     * @param {object} [classConfig] config.enemies.classes[classType]
     */
    constructor(scene, pos, { elite = false, classType = 'interceptor' } = {}, enemyConfig, classConfig = {}) {
        this.scene = scene;
        this.elite = elite;
        this.classType = classType;
        this.classCfg = classConfig;
        this.enemyCfg = enemyConfig;

        this.maxHp = elite
            ? (classConfig.elite_hp ?? enemyConfig.elite_hp)
            : (classConfig.hp ?? enemyConfig.hp);
        this.hp = this.maxHp;
        this.hitRadius = (enemyConfig.hit_radius ?? 5.5) * (classConfig.scale ?? 1);
        this._alive = true;
        this.lockPriority = classType === 'bomber' ? 0.4 : classType === 'interceptor' ? 0.2 : 0.1;
        this.hudTag = classType === 'interceptor' ? 'INT'
            : classType === 'bomber' ? 'BMB'
                : classType === 'drone' ? 'DRN' : 'ENM';
        this.scoreMul = classConfig.score_mul ?? 1;
        this.collisionDamage = classConfig.collision_damage ?? 0;
        this.ramDamage = classConfig.ram_damage ?? 0;
        this.ramCooldown = 0;
        this.ramCdMax = classConfig.ram_cooldown ?? 1.2;

        const palette = paletteForClass(classType, elite);
        this.mesh = createJet(palette, { classType });
        this.mesh.scale.setScalar(classConfig.scale ?? (elite ? 1.05 : 0.85));
        this.mesh.position.copy(pos);
        scene.add(this.mesh);

        this.ai = new EnemyAI(this, pos.clone(), enemyConfig, classConfig);
    }

    get position() { return this.mesh.position; }

    get quaternion() { return this.mesh.quaternion; }

    get alive() { return this._alive; }

    update(ctx) {
        if (!this._alive) return;
        if (this.ramCooldown > 0) this.ramCooldown -= ctx.dt;
        this.ai.update(ctx);
    }

    /**
     * 自殺無人機撞擊：回傳對玩家造成的傷害（0 表示冷卻中）。
     * @param {number} dt
     */
    tryRamDamage(dt) {
        if (this.classType !== 'drone' || this.ramDamage <= 0) {
            if (this.collisionDamage > 0) return this.collisionDamage * dt;
            return 0;
        }
        if (this.ramCooldown > 0) return 0;
        this.ramCooldown = this.ramCdMax;
        return this.ramDamage;
    }

    takeDamage(amount) {
        this.hp -= amount;
        return this.hp;
    }

    /** 從場景移除並釋放幾何／材質。 */
    dispose() {
        this._alive = false;
        this.scene.remove(this.mesh);
        this.mesh.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
    }
}
