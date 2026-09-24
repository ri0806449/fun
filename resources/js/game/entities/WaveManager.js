import * as THREE from 'three';
import { MathUtils } from 'three';
import { EnemyJet } from './EnemyJet.js';

/**
 * WaveManager — 波次計數、混編敵機類型、雷達邊緣外編隊生成。
 * Boss 期間可暫停一般波次（paused）。
 */
export class WaveManager {
    /**
     * @param {THREE.Scene} scene
     * @param {object} config 完整設定
     * @param {{ onToast?: (msg: string) => void, onWaveCleared?: (wave: number) => void }} hooks
     */
    constructor(scene, config, { onToast, onWaveCleared } = {}) {
        this.scene = scene;
        this.cfg = config.waves;
        this.enemyCfg = config.enemy;
        this.classesCfg = config.enemies?.classes ?? {};
        this.mixCfg = config.enemies?.mix ?? {};
        this.spawnDistance = config.waves.spawn_distance;
        this.onToast = onToast ?? (() => {});
        this.onWaveCleared = onWaveCleared ?? (() => {});
        /** @type {import('../world/TerrainSystem.js').TerrainSystem|null} */
        this.terrain = null;
        /** level-up 期間暫緩下一波自動生成 */
        this.holdNextWave = false;

        /** @type {EnemyJet[]} */
        this.enemies = [];
        this.wave = 0;
        this.cooldown = 0;
        this.pending = false;
        /** Boss 期間暫緩一般波次 */
        this.paused = false;
        this._fwd = new THREE.Vector3();
        this._classKeys = Object.keys(this.classesCfg);
        if (this._classKeys.length === 0) this._classKeys = ['interceptor'];
    }

    /** @param {import('../world/TerrainSystem.js').TerrainSystem|null} terrain */
    setTerrain(terrain) {
        this.terrain = terrain;
    }

    reset() {
        for (const enemy of this.enemies) enemy.dispose();
        this.enemies.length = 0;
        this.wave = 0;
        this.cooldown = 0;
        this.pending = false;
        this.paused = false;
        this.holdNextWave = false;
    }

    setPaused(paused) {
        this.paused = !!paused;
    }

    /** 雷達邊緣外的生成點（玩家前半球隨機方位）。 */
    _spawnAnchor(player, extra = 40) {
        const pp = player.position;
        this._fwd.set(0, 0, -1).applyQuaternion(player.quaternion);
        const ang = Math.atan2(this._fwd.x, -this._fwd.z) + (Math.random() - 0.5) * Math.PI * 1.4;
        const r = this.spawnDistance + extra + Math.random() * 80;
        const x = pp.x + Math.sin(ang) * r;
        const z = pp.z - Math.cos(ang) * r;
        let y = MathUtils.clamp(pp.y + (Math.random() - 0.5) * 50, 35, 160);
        if (this.terrain) {
            const floor = this.terrain.sampleHeight(x, z);
            y = Math.max(floor + 28, Math.min(floor + 110, y));
        }
        return new THREE.Vector3(x, y, z);
    }

    _waveSize() {
        return Math.min(
            this.cfg.max_size,
            this.cfg.min_size + Math.ceil(this.wave * this.cfg.size_growth_per_wave)
        );
    }

    _eliteCount() {
        if (this.wave < this.cfg.elite_from_wave) return 0;
        let elites = Math.random() < 0.35 + this.wave * 0.04 ? 1 : 0;
        if (this.wave >= this.cfg.elite_from_wave + 3 && Math.random() < 0.4) elites = 2;
        return elites;
    }

    /** 依權重＋波次偏置抽選敵機類型。 */
    pickClassType() {
        const bias = this.mixCfg.wave_bias ?? {};
        let total = 0;
        const weights = [];
        for (const key of this._classKeys) {
            const base = this.classesCfg[key]?.weight ?? 0.3;
            const w = Math.max(0.01, base + (bias[key] ?? 0) * this.wave);
            weights.push({ key, w });
            total += w;
        }
        let r = Math.random() * total;
        for (const { key, w } of weights) {
            r -= w;
            if (r <= 0) return key;
        }
        return this._classKeys[0];
    }

    spawnEnemy(pos, opts = {}) {
        const classType = opts.classType || this.pickClassType();
        const classCfg = this.classesCfg[classType] || {};
        const enemy = new EnemyJet(
            this.scene,
            pos,
            { elite: !!opts.elite, classType },
            this.enemyCfg,
            classCfg
        );
        this.enemies.push(enemy);
        return enemy;
    }

    /** @param {'start'|'clear'|'waypoint'|'engage'} reason */
    spawnWave(player, reason = 'engage') {
        if (this.paused) return;

        this.wave++;
        const count = this._waveSize();
        let elites = this._eliteCount();
        const base = this._spawnAnchor(player, 50);
        let spawned = 0;

        for (let i = 0; i < count; i++) {
            const classType = this.pickClassType();
            const classCfg = this.classesCfg[classType] || {};
            const elite = elites > 0 && (i === count - 1 || (i === 0 && elites > 1));
            if (elite) elites--;

            const offset = new THREE.Vector3((i - count * 0.5) * 28, Math.sin(i) * 10, i * 16);
            this.spawnEnemy(base.clone().add(offset), { elite, classType });
            spawned++;

            // 自殺無人機：同波額外小群體
            if (classType === 'drone') {
                const extra = classCfg.swarm_extra ?? 2;
                for (let s = 0; s < extra; s++) {
                    const swarmOff = new THREE.Vector3(
                        (Math.random() - 0.5) * 24,
                        (Math.random() - 0.5) * 14,
                        8 + s * 12 + Math.random() * 10
                    );
                    this.spawnEnemy(base.clone().add(offset).add(swarmOff), {
                        elite: false,
                        classType: 'drone',
                    });
                    spawned++;
                }
            }
        }

        this.cooldown = this.cfg.cooldown_after_spawn;
        this.pending = false;
        this.onToast(`WAVE ${this.wave} · ${reason === 'clear' ? 'HOSTILES INBOUND' : 'NEW CONTACTS'} · ×${spawned}`);
    }

    /** 移除指定敵機並在清空時排入下一波（可被 holdNextWave／onWaveCleared 攔截）。 */
    remove(enemy) {
        const idx = this.enemies.indexOf(enemy);
        if (idx < 0) return;
        enemy.dispose();
        this.enemies.splice(idx, 1);
        if (this.enemies.length === 0 && !this.paused) {
            this.onWaveCleared(this.wave);
            if (this.holdNextWave) {
                this.pending = false;
                return;
            }
            this.pending = true;
            this.cooldown = Math.max(this.cooldown, this.cfg.cooldown_after_clear);
        }
    }

    /** 排入下一波（例如通過航點時）。 */
    queueWave(minDelay) {
        if (this.paused) return;
        this.pending = true;
        this.cooldown = Math.max(this.cooldown, minDelay);
    }

    update(dt, player) {
        if (this.paused) return;
        if (this.cooldown > 0) this.cooldown -= dt;
        if (this.pending && this.cooldown <= 0) this.spawnWave(player, 'clear');
    }
}
