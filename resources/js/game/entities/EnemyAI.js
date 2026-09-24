import * as THREE from 'three';
import { MathUtils } from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * EnemyAI — Patrol / Attack / Evade 狀態機，依 classType 調整行為。
 * Interceptor：死角掠襲＋機砲
 * Bomber：慢速＋機背／機腹自動砲塔
 * Drone：無武器、群體衝撞
 */
export class EnemyAI {
    /**
     * @param {import('./EnemyJet.js').EnemyJet} jet
     * @param {THREE.Vector3} homePos
     * @param {object} cfg config.enemy
     * @param {object} [classCfg] config.enemies.classes.*
     */
    constructor(jet, homePos, cfg, classCfg = {}) {
        this.jet = jet;
        this.cfg = cfg;
        this.classCfg = classCfg;
        this.classType = jet.classType || 'interceptor';

        const speedMul = classCfg.speed_mul ?? 1;
        this.patrolSpeed = cfg.speed * 0.42 * speedMul;
        this.attackSpeed = cfg.speed * 0.58 * speedMul;
        this.evadeSpeed = cfg.speed * 0.84 * speedMul;

        this.gunInterval = classCfg.gun_interval ?? cfg.gun_interval;
        this.gunDamage = classCfg.gun_damage ?? cfg.gun_damage;
        this.gunRange = classCfg.gun_range ?? cfg.gun_range;
        this.attackRange = classCfg.attack_range ?? cfg.attack_range;
        this.noWeapons = !!classCfg.no_weapons;

        this.state = 'patrol';
        this.patrolPoints = [];
        this.patrolIdx = 0;
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 4,
            -18 - Math.random() * 14
        );
        this.gunAcc = 0;
        this.turretAcc = [0, 0];
        this.flareCd = 1 + Math.random() * 2;
        this.evadeT = 0;
        this.rollRate = 0;
        this.flankSide = Math.random() > 0.5 ? 1 : -1;
        this.flankPhase = Math.random() * Math.PI * 2;

        this._fwd = new THREE.Vector3();
        this._tmp = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();
        this._desired = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3();
        this._quat = new THREE.Quaternion();
        this._mat = new THREE.Matrix4();
        this._turretOrigin = new THREE.Vector3();
        this._turretDir = new THREE.Vector3();
        this._fix = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);

        // 轟炸機砲塔本地偏移（機背／機腹）
        this.turretOffsets = [
            new THREE.Vector3(0, 0.85, 0.2),
            new THREE.Vector3(0, -0.75, 0.4),
        ];

        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
            const r = 80 + Math.random() * 140;
            this.patrolPoints.push(new THREE.Vector3(
                homePos.x + Math.cos(a) * r,
                MathUtils.clamp(homePos.y + (Math.random() - 0.5) * 40, 25, 140),
                homePos.z + Math.sin(a) * r
            ));
        }
    }

    get mesh() { return this.jet.mesh; }

    getForward() {
        return this._fwd.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    }

    _setState(next) {
        if (this.state === next) return;
        this.state = next;
        if (next === 'evade') {
            this.evadeT = this.cfg.evade_seconds;
            this.rollRate = (Math.random() > 0.5 ? 1 : -1) * (3.2 + Math.random() * 2.4);
        }
    }

    _threatLocked(lockSnap) {
        if (!lockSnap) return false;
        return lockSnap.locked === this.jet
            || (lockSnap.candidate === this.jet && lockSnap.state === 'tracking' && lockSnap.progress > 0.45);
    }

    _missileThreat(missiles) {
        for (const m of missiles) {
            const ud = m.userData;
            if (!ud.alive || !ud.guided || ud.target !== this.jet) continue;
            if (m.position.distanceTo(this.mesh.position) < 160) return m;
        }
        return null;
    }

    deployFlares(explosionPool, missiles) {
        if (this.flareCd > 0 || this.classType === 'drone') return;
        this.flareCd = this.cfg.flare_cooldown;
        const pos = this.mesh.position;
        const back = this.getForward().clone().multiplyScalar(-1);

        for (let i = 0; i < 7; i++) {
            const vel = back.clone().multiplyScalar(8 + Math.random() * 14).add(
                new THREE.Vector3((Math.random() - 0.5) * 22, Math.random() * 12 - 2, (Math.random() - 0.5) * 22)
            );
            explosionPool.spawnFlare(pos.clone().addScaledVector(back, 2 + i * 0.4), vel);
        }

        for (const m of missiles) {
            const ud = m.userData;
            if (!ud.alive || !ud.guided || ud.target !== this.jet) continue;
            if (Math.random() < this.cfg.flare_break_chance) {
                ud.guided = false;
                ud.target = null;
                ud.confused = 1.2;
            } else {
                ud.confused = Math.max(ud.confused || 0, 0.6);
            }
        }
    }

    _fireGun(bulletPool, player, origin, dir, damage, color = 0xff3344) {
        const vel = dir.clone().multiplyScalar(this.cfg.gun_projectile_speed * (0.95 + Math.random() * 0.15));
        vel.addScaledVector(player.velocity, 0.012);
        bulletPool.spawn(origin, this.mesh.quaternion, vel, {
            team: 'enemy',
            life: this.cfg.gun_projectile_life,
            damage,
            color,
        });
    }

    /** 轟炸機機背／機腹自動瞄準砲塔。 */
    _updateBomberTurrets(dt, player, bulletPool) {
        const range = this.classCfg.turret_range ?? 240;
        const interval = this.classCfg.turret_interval ?? 0.38;
        const dmg = this.classCfg.turret_damage ?? 3.5;
        const spd = this.classCfg.turret_projectile_speed ?? 150;
        this.mesh.updateMatrixWorld(true);

        for (let i = 0; i < this.turretOffsets.length; i++) {
            this.turretAcc[i] += dt;
            this._turretOrigin.copy(this.turretOffsets[i]).applyMatrix4(this.mesh.matrixWorld);
            this._turretDir.copy(player.position).sub(this._turretOrigin);
            const dist = this._turretDir.length();
            if (dist > range || dist < 1) continue;
            this._turretDir.multiplyScalar(1 / dist);
            if (this.turretAcc[i] < interval) continue;
            this.turretAcc[i] = 0;

            const vel = this._turretDir.clone().multiplyScalar(spd);
            vel.addScaledVector(player.velocity, 0.02);
            bulletPool.spawn(this._turretOrigin.clone(), this.mesh.quaternion, vel, {
                team: 'enemy',
                life: 1.8,
                damage: dmg,
                color: 0xffaa44,
            });
        }
    }

    /**
     * @param {{dt:number, player:object, lockSnap:object, missiles:Array, bulletPool:object, explosionPool:object}} ctx
     */
    update(ctx) {
        const { dt, player, lockSnap, missiles, bulletPool, explosionPool } = ctx;
        const mesh = this.mesh;
        const toPlayer = this._tmp.copy(player.position).sub(mesh.position);
        const dist = toPlayer.length();
        this.flareCd = Math.max(0, this.flareCd - dt);

        if (this.classType === 'drone') {
            this._updateDrone(dt, player, dist, toPlayer);
            return;
        }

        const locked = this._threatLocked(lockSnap);
        const inbound = this._missileThreat(missiles);

        if (locked || inbound) {
            this._setState('evade');
            this.deployFlares(explosionPool, missiles);
        } else if (this.state === 'evade') {
            this.evadeT -= dt;
            if (this.evadeT <= 0) {
                this._setState(dist < this.attackRange ? 'attack' : 'patrol');
            }
        } else if (dist < this.attackRange) {
            this._setState('attack');
        } else if (dist > this.cfg.disengage_range) {
            this._setState('patrol');
        }

        if (this.state === 'patrol') {
            const wp = this.patrolPoints[this.patrolIdx];
            this._desired.copy(wp).sub(mesh.position);
            if (this._desired.length() < 28) {
                this.patrolIdx = (this.patrolIdx + 1) % this.patrolPoints.length;
            }
            this._steerToward(this._desired, this.patrolSpeed, dt, 1.1);
            mesh.position.y += Math.sin(performance.now() * 0.001 + mesh.id) * 0.02;
        } else if (this.state === 'attack') {
            if (this.classType === 'interceptor') {
                this._updateInterceptorAttack(dt, player, dist, toPlayer, bulletPool);
            } else if (this.classType === 'bomber') {
                this._updateBomberAttack(dt, player, dist, toPlayer, bulletPool);
            } else {
                this._updateDefaultAttack(dt, player, dist, toPlayer, bulletPool);
            }
        } else if (this.state === 'evade') {
            mesh.rotateZ(this.rollRate * dt);
            const fwd = this.getForward();
            const up = this._tmp2.set(0, 1, 0).applyQuaternion(mesh.quaternion);
            this._desired.copy(fwd).multiplyScalar(40)
                .addScaledVector(up, this.rollRate > 0 ? 35 : -35)
                .add(new THREE.Vector3((Math.random() - 0.5) * 10, 8, (Math.random() - 0.5) * 10));
            this._steerToward(this._desired, this.evadeSpeed, dt, 3.5);
            if (this.flareCd <= 0.05 && (locked || inbound)) {
                this.deployFlares(explosionPool, missiles);
            }
        }

        if (this.classType === 'bomber') {
            this._updateBomberTurrets(dt, player, bulletPool);
        }

        mesh.position.y = MathUtils.clamp(mesh.position.y, this.cfg.min_altitude, this.cfg.max_altitude);
    }

    /** 攔截機：繞到玩家後方／側方死角後高速切入掃射。 */
    _updateInterceptorAttack(dt, player, dist, toPlayer, bulletPool) {
        const mesh = this.mesh;
        const playerFwd = this._tmp2.set(0, 0, -1).applyQuaternion(player.quaternion);
        const behind = this._desired.copy(player.position)
            .addScaledVector(playerFwd, -55)
            .addScaledVector(WORLD_UP, Math.sin(performance.now() * 0.0015 + this.flankPhase) * 12);
        const side = this._tmp2.crossVectors(playerFwd, WORLD_UP).normalize();
        behind.addScaledVector(side, this.flankSide * 35);

        const toBlind = behind.sub(mesh.position);
        if (toBlind.length() > 40) {
            this._steerToward(toBlind, this.attackSpeed * 1.15, dt, 2.6);
        } else {
            this._desired.copy(player.position).sub(mesh.position);
            this._steerToward(this._desired, this.attackSpeed * 1.25, dt, 2.8);
            this._tryNoseGun(dt, player, dist, toPlayer, bulletPool);
        }
    }

    _updateBomberAttack(dt, player, dist, toPlayer, bulletPool) {
        const ideal = 140;
        toPlayer.normalize();
        const side = this._tmp2.crossVectors(toPlayer, WORLD_UP).normalize();
        this._desired.copy(player.position)
            .addScaledVector(side, Math.sin(performance.now() * 0.0008 + this.mesh.id) * 60)
            .sub(this.mesh.position);
        if (dist < ideal * 0.7) this._desired.addScaledVector(toPlayer, -50);
        this._steerToward(this._desired, this.attackSpeed, dt, 1.2);
        this._tryNoseGun(dt, player, dist, toPlayer, bulletPool);
    }

    _updateDefaultAttack(dt, player, dist, toPlayer, bulletPool) {
        const ideal = 90;
        toPlayer.normalize();
        const side = this._tmp2.crossVectors(toPlayer, WORLD_UP).normalize();
        this._desired.copy(player.position)
            .addScaledVector(side, Math.sin(performance.now() * 0.0012 + this.mesh.id) * 40)
            .sub(this.mesh.position);
        if (dist < ideal * 0.65) this._desired.addScaledVector(toPlayer, -40);
        this._steerToward(this._desired, this.attackSpeed, dt, 2.0);
        this._tryNoseGun(dt, player, dist, toPlayer, bulletPool);
    }

    _tryNoseGun(dt, player, dist, toPlayer, bulletPool) {
        if (this.noWeapons) return;
        this.gunAcc += dt;
        const fwd = this.getForward();
        const aim = this._tmp2.copy(player.position).sub(this.mesh.position).normalize();
        const aimDot = fwd.dot(aim);
        if (dist < this.gunRange && aimDot > 0.72 && this.gunAcc >= this.gunInterval) {
            this.gunAcc = 0;
            const origin = this.mesh.position.clone().addScaledVector(fwd, 4.5);
            this._fireGun(bulletPool, player, origin, fwd, this.gunDamage);
        }
    }

    /** 自殺無人機：高速直線衝撞玩家。 */
    _updateDrone(dt, player, dist, toPlayer) {
        this._setState('attack');
        this._desired.copy(player.position).sub(this.mesh.position);
        // 輕微蛇行避免完全直線可預測
        const side = this._tmp2.crossVectors(toPlayer, WORLD_UP);
        if (side.lengthSq() > 1e-6) {
            side.normalize();
            this._desired.addScaledVector(side, Math.sin(performance.now() * 0.004 + this.mesh.id) * 18);
        }
        this._steerToward(this._desired, this.attackSpeed * 1.2, dt, 3.8);
        this.mesh.position.y = MathUtils.clamp(
            this.mesh.position.y,
            this.cfg.min_altitude,
            this.cfg.max_altitude
        );
    }

    _steerToward(dir, speed, dt, turnMul) {
        if (dir.lengthSq() < 1e-6) return;
        dir.normalize();
        const mesh = this.mesh;
        this._lookTarget.copy(mesh.position).add(dir);
        this._mat.lookAt(mesh.position, this._lookTarget, WORLD_UP);
        this._quat.setFromRotationMatrix(this._mat).multiply(this._fix);
        mesh.quaternion.slerp(this._quat, Math.min(1, turnMul * dt));
        this.velocity.lerp(dir.multiplyScalar(speed), Math.min(1, 2.2 * dt));
        mesh.position.addScaledVector(this.velocity, dt);
    }
}
