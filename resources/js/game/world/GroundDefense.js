import * as THREE from 'three';

/**
 * SamSite — 地對空飛彈陣地：追蹤 → 硬鎖 → 發射導引彈。
 * 鎖定需通過地形 LOS；失去 LOS 會中斷進度／硬鎖。
 */
export class SamSite {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position
     * @param {object} cfg config.ground_defense.sam
     */
    constructor(scene, position, cfg) {
        this.cfg = cfg;
        this.alive = true;
        this.position = position.clone();
        this.lockState = 'none';
        this.progress = 0;
        this.fireCd = 0.5 + Math.random() * 1.5;
        this._tickAcc = 0;

        this.group = new THREE.Group();
        this.group.position.copy(this.position);

        const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(3.2, 3.8, 0.6, 8),
            new THREE.MeshStandardMaterial({ color: 0x3a3a32, roughness: 0.85, metalness: 0.2 })
        );
        pad.position.y = 0.3;
        this.group.add(pad);

        this.turret = new THREE.Group();
        this.turret.position.y = 1.2;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 1.1, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x4a5538, metalness: 0.35, roughness: 0.55 })
        );
        this.turret.add(body);
        const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.28, 3.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x2a2a28, metalness: 0.6, roughness: 0.4 })
        );
        tube.rotation.x = Math.PI / 2;
        tube.position.z = -1.4;
        this.turret.add(tube);
        this.group.add(this.turret);

        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff4422 })
        );
        lamp.position.set(0, 2.2, 0);
        this.group.add(lamp);
        this.lamp = lamp;

        scene.add(this.group);
        this._look = new THREE.Vector3();
    }

    /**
     * @param {object} ctx
     * @returns {object|null} 發射請求 { origin, velocity, quat, guided, target }
     */
    update(ctx) {
        const { dt, player, terrain, losFn } = ctx;
        if (!this.alive) return null;

        if (this.fireCd > 0) this.fireCd -= dt;

        const toPlayer = this._look.copy(player.position).sub(this.position);
        const dist = toPlayer.length();
        const range = this.cfg.lock_range;

        // 炮塔朝向
        if (dist > 0.1) {
            this._look.y = 0;
            if (this._look.lengthSq() > 0.01) {
                this.turret.lookAt(player.position.x, this.group.position.y + 1.2, player.position.z);
            }
        }

        const hasLos = dist <= range
            && player.position.y > this.position.y - 20
            && losFn(this.position, player.position);

        if (!hasLos || dist > range) {
            this.progress = Math.max(0, this.progress - dt * 0.85);
            if (this.progress <= 0.01) {
                this.lockState = 'none';
                this.progress = 0;
            } else {
                this.lockState = 'tracking';
            }
            this.lamp.material.color.setHex(0xff4422);
            return null;
        }

        this.lockState = this.progress >= 1 ? 'locked' : 'tracking';
        this.progress = Math.min(1, this.progress + dt / this.cfg.lock_seconds);
        this.lamp.material.color.setHex(this.progress >= 1 ? 0xff2200 : 0xffaa22);

        if (this.progress < 1 || this.fireCd > 0) return null;

        this.fireCd = this.cfg.fire_interval;
        const dir = player.position.clone().sub(this.position).normalize();
        // 略抬高發射點，避免立即撞地
        const origin = this.position.clone().add(new THREE.Vector3(0, 2.5, 0)).addScaledVector(dir, 2.5);
        const speed = this.cfg.missile_speed;
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        return {
            origin,
            velocity: dir.multiplyScalar(speed),
            quat,
            guided: true,
            target: player,
            owner: 'sam',
            life: this.cfg.missile_life,
            accel: this.cfg.missile_accel,
            maxSpeed: this.cfg.missile_max_speed,
            maxTurn: this.cfg.missile_turn,
        };
    }

    dispose(scene) {
        scene.remove(this.group);
        this.group.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
    }
}

/**
 * AaaBattery — 防空砲：低空掠過時以 lead 預判發射黃色曳光彈（無鎖定）。
 */
export class AaaBattery {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position
     * @param {object} cfg config.ground_defense.aaa
     */
    constructor(scene, position, cfg) {
        this.cfg = cfg;
        this.alive = true;
        this.position = position.clone();
        this.fireCd = Math.random() * cfg.burst_interval;

        this.group = new THREE.Group();
        this.group.position.copy(this.position);

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(2.4, 2.8, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x3a3830, roughness: 0.9 })
        );
        base.position.y = 0.25;
        this.group.add(base);

        this.barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 2.8, 6),
            new THREE.MeshStandardMaterial({ color: 0x555548, metalness: 0.5, roughness: 0.45 })
        );
        this.barrel.rotation.x = Math.PI / 2;
        this.barrel.position.set(0, 1.4, -0.8);
        this.group.add(this.barrel);

        scene.add(this.group);
        this._tmp = new THREE.Vector3();
        this._lead = new THREE.Vector3();
        this._dir = new THREE.Vector3();
    }

    /**
     * @returns {Array<object>} 本幀要發射的曳光彈請求
     */
    update(ctx) {
        const { dt, player } = ctx;
        const out = [];
        if (!this.alive) return out;

        if (this.fireCd > 0) this.fireCd -= dt;

        const dist = this.position.distanceTo(player.position);
        const agl = player.position.y - this.position.y;
        if (dist > this.cfg.range || agl > this.cfg.trigger_altitude) {
            return out;
        }

        // 炮管大致指向預判點
        this._predictLead(player);
        this.barrel.parent?.updateMatrixWorld?.();
        this.group.lookAt(this._lead.x, this.group.position.y, this._lead.z);

        if (this.fireCd > 0) return out;

        this.fireCd = this.cfg.burst_interval;
        const rounds = this.cfg.burst_count | 0;
        const muzzleSpeed = this.cfg.projectile_speed;
        for (let i = 0; i < rounds; i++) {
            this._predictLead(player, i * 0.04);
            this._dir.copy(this._lead).sub(this.position);
            // 高度差
            this._dir.y = this._lead.y - (this.position.y + 1.4);
            if (this._dir.lengthSq() < 0.01) continue;
            this._dir.normalize();
            // 輕微散布
            this._dir.x += (Math.random() - 0.5) * 0.04;
            this._dir.y += (Math.random() - 0.5) * 0.03;
            this._dir.z += (Math.random() - 0.5) * 0.04;
            this._dir.normalize();

            const origin = this.position.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(this._dir, 2);
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), this._dir);
            out.push({
                origin,
                quat,
                velocity: this._dir.clone().multiplyScalar(muzzleSpeed),
                team: 'aaa',
                life: this.cfg.projectile_life,
                damage: this.cfg.damage,
                color: 0xffee44,
            });
        }
        return out;
    }

    _predictLead(player, extraT = 0) {
        const spd = this.cfg.projectile_speed;
        const to = this._tmp.copy(player.position).sub(this.position);
        const dist = to.length();
        const t = dist / Math.max(1, spd) + extraT;
        const vel = player.velocity || this._tmp.set(0, 0, 0);
        this._lead.copy(player.position).addScaledVector(vel, t);
        // 重力略補償
        this._lead.y += 0.5 * 9.8 * t * t * 0.15;
    }

    dispose(scene) {
        scene.remove(this.group);
        this.group.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
    }
}

/**
 * GroundDefense — 在地形上隨機佈署 SAM／AAA，並每幀更新。
 */
export class GroundDefense {
    /**
     * @param {THREE.Scene} scene
     * @param {import('./TerrainSystem.js').TerrainSystem} terrain
     * @param {object} cfg config.ground_defense
     */
    constructor(scene, terrain, cfg) {
        this.scene = scene;
        this.terrain = terrain;
        this.cfg = cfg;
        /** @type {SamSite[]} */
        this.sams = [];
        /** @type {AaaBattery[]} */
        this.aaas = [];
    }

    reset() {
        for (const s of this.sams) s.dispose(this.scene);
        for (const a of this.aaas) a.dispose(this.scene);
        this.sams.length = 0;
        this.aaas.length = 0;
        this._spawnSites();
    }

    _spawnSites() {
        const samN = this.cfg.sam_count ?? 8;
        const aaaN = this.cfg.aaa_count ?? 12;
        const half = this.terrain.half * 0.78;
        const used = [];

        const farEnough = (x, z, minD) => {
            for (const p of used) {
                if (Math.hypot(p.x - x, p.z - z) < minD) return false;
            }
            return true;
        };

        for (let i = 0; i < samN; i++) {
            let x = 0;
            let z = 0;
            let spot = null;
            for (let tries = 0; tries < 24; tries++) {
                x = (Math.random() - 0.5) * 2 * half;
                z = -80 - Math.random() * (half * 1.2);
                if (!farEnough(x, z, 140)) continue;
                spot = this.terrain.findLocalRidge(x, z, 90 + Math.random() * 40);
                break;
            }
            if (!spot) continue;
            used.push({ x: spot.x, z: spot.z });
            const pos = new THREE.Vector3(spot.x, spot.y + 0.5, spot.z);
            this.sams.push(new SamSite(this.scene, pos, this.cfg.sam));
        }

        for (let i = 0; i < aaaN; i++) {
            let spot = null;
            for (let tries = 0; tries < 24; tries++) {
                const x = (Math.random() - 0.5) * 2 * half;
                const z = -40 - Math.random() * (half * 1.15);
                if (!farEnough(x, z, 90)) continue;
                // 谷底或中坡
                spot = Math.random() > 0.45
                    ? this.terrain.findLocalValley(x, z, 70)
                    : this.terrain.findLocalRidge(x, z, 60);
                break;
            }
            if (!spot) continue;
            used.push({ x: spot.x, z: spot.z });
            const pos = new THREE.Vector3(spot.x, spot.y + 0.4, spot.z);
            this.aaas.push(new AaaBattery(this.scene, pos, this.cfg.aaa));
        }
    }

    /**
     * @param {object} ctx { dt, player, losFn }
     * @returns {{ missiles: object[], bullets: object[] }}
     */
    update(ctx) {
        const missiles = [];
        const bullets = [];
        const full = { ...ctx, terrain: this.terrain };

        for (const sam of this.sams) {
            const req = sam.update(full);
            if (req) missiles.push(req);
        }
        for (const aaa of this.aaas) {
            const batch = aaa.update(full);
            for (const b of batch) bullets.push(b);
        }
        return { missiles, bullets };
    }

    /** 雷達／地圖用：回傳固定威脅位置。 */
    getMarkers() {
        return [
            ...this.sams.map((s) => ({ position: s.position, kind: 'sam' })),
            ...this.aaas.map((a) => ({ position: a.position, kind: 'aaa' })),
        ];
    }

    /**
     * 玩家被 SAM 鎖定的最高進度（座艙雷達警報用）。
     * @returns {{ progress: number, locked: boolean, state: string }}
     */
    getThreatLock() {
        let progress = 0;
        let locked = false;
        let state = 'none';
        for (const sam of this.sams) {
            if (!sam.alive) continue;
            if (sam.lockState === 'locked') {
                return { progress: 1, locked: true, state: 'locked' };
            }
            if (sam.progress > progress) {
                progress = sam.progress;
                state = sam.lockState || 'none';
            }
        }
        return { progress, locked, state };
    }
}
