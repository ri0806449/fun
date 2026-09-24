import * as THREE from 'three';
import { MathUtils } from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Boss 可鎖定／可破壞部位。提供 alive + position 供 LockOn／飛彈導引。
 */
export class BossPart {
    /**
     * @param {object} opts
     */
    constructor({
        id, kind, label, mesh, localOffset, hitRadius, maxHp, lockPriority = 1,
        parent,
    }) {
        this.id = id;
        this.kind = kind; // 'engine' | 'turret' | 'bridge' | 'hull'
        this.label = label;
        this.mesh = mesh;
        this.localOffset = localOffset.clone();
        this.hitRadius = hitRadius;
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.lockPriority = lockPriority;
        this.parent = parent;
        this._alive = true;
        this._worldPos = new THREE.Vector3();
        this.gunAcc = Math.random() * 0.5;
        this.missileAcc = 2 + Math.random() * 3;
        this.hudTag = kind === 'engine' ? 'ENG'
            : kind === 'turret' ? 'TUR'
                : kind === 'bridge' ? 'BRG' : 'HULL';
        this.isBossPart = true;
    }

    get alive() {
        if (!this._alive) return false;
        if (this.kind === 'bridge' && this.parent.shieldActive) return false;
        return true;
    }

    get lockable() {
        if (!this._alive) return false;
        if (this.kind === 'bridge') return !this.parent.shieldActive;
        if (this.kind === 'hull') return false;
        return true;
    }

    get position() {
        this._worldPos.copy(this.localOffset).applyMatrix4(this.parent.root.matrixWorld);
        return this._worldPos;
    }

    takeDamage(amount) {
        if (!this._alive) return this.hp;
        if (this.kind === 'bridge' && this.parent.shieldActive) return this.hp;
        if (this.kind === 'hull') {
            return this.parent.hitHull(amount);
        }
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.destroy();
        }
        return this.hp;
    }

    destroy() {
        if (!this._alive) return;
        this._alive = false;
        this.mesh.visible = false;
        this.parent.onPartDestroyed(this);
    }
}

/**
 * FlyingFortress — 空中要塞 Boss。
 * 4 引擎 + 6 砲塔必須先摧毀 → 護盾解除 → 艦橋可擊殺。
 * 網格於建構時一次建立，不每幀 new Mesh。
 */
export class FlyingFortress {
    /**
     * @param {THREE.Scene} scene
     * @param {object} bossCfg config.boss
     * @param {THREE.Vector3} spawnPos
     */
    constructor(scene, bossCfg, spawnPos) {
        this.scene = scene;
        this.cfg = bossCfg;
        this._alive = true;
        this.defeated = false;
        this.shieldActive = true;
        this.shieldFlash = 0;
        this.entered = false;
        this.cruiseSpeed = bossCfg.cruise_speed ?? 26;

        this.root = new THREE.Group();
        this.root.position.copy(spawnPos);
        this.root.rotation.y = Math.PI;
        scene.add(this.root);

        this.velocity = new THREE.Vector3(0, 0, -this.cruiseSpeed);
        this._fwd = new THREE.Vector3();
        this._tmp = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();
        this._desired = new THREE.Vector3();
        this._look = new THREE.Vector3();
        this._quat = new THREE.Quaternion();
        this._mat = new THREE.Matrix4();
        this._fix = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI);
        this._origin = new THREE.Vector3();
        this._dir = new THREE.Vector3();

        /** @type {BossPart[]} */
        this.parts = [];
        /** @type {((part:BossPart)=>void)|null} */
        this.onPartDestroyedHook = null;
        /** @type {(()=>void)|null} */
        this.onDefeatedHook = null;
        /** @type {((pos:THREE.Vector3,scale:number)=>void)|null} */
        this.onExplosion = null;

        this._buildMesh();
        this._buildParts();
    }

    get alive() { return this._alive; }

    get position() { return this.root.position; }

    get quaternion() { return this.root.quaternion; }

    _buildMesh() {
        const s = 1; // 部位以本地單位建模，再整體 scale
        const hullMat = new THREE.MeshStandardMaterial({
            color: 0x4a5560, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.1,
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x1e242c, metalness: 0.8, roughness: 0.4, envMapIntensity: 0.9,
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0x6a3030, metalness: 0.7, roughness: 0.4, envMapIntensity: 1.0,
        });
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x88aacc, metalness: 0.1, roughness: 0.05,
            transmission: 0.5, transparent: true, opacity: 0.75, envMapIntensity: 1.3,
        });

        // 巨型機身（約玩家 20× 由 root.scale 達成）
        const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.2 * s, 1.1 * s, 8.5 * s), hullMat);
        fuselage.position.z = 0.2;
        this.root.add(fuselage);
        this.hullMesh = fuselage;

        const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 2.8 * s, 10), hullMat);
        nose.rotation.x = -Math.PI / 2;
        nose.position.z = -5.2;
        this.root.add(nose);

        // 寬翼
        const wing = new THREE.Mesh(new THREE.BoxGeometry(14 * s, 0.18 * s, 3.2 * s), darkMat);
        wing.position.set(0, -0.1, 0.5);
        this.root.add(wing);

        const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.5), accentMat);
        wingTipL.position.set(-7, 0.4, 0.8);
        this.root.add(wingTipL);
        const wingTipR = wingTipL.clone();
        wingTipR.position.x = 7;
        this.root.add(wingTipR);

        // 雙垂尾
        [-1, 1].forEach((side) => {
            const vt = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 2.0), darkMat);
            vt.position.set(side * 1.2, 1.4, 3.5);
            this.root.add(vt);
        });

        // 艦橋（玻璃艙）
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.6), glassMat);
        bridge.position.set(0, 0.95, -2.2);
        this.root.add(bridge);
        this.bridgeMesh = bridge;

        // 護盾視覺（半透明殼）
        this.shieldMesh = new THREE.Mesh(
            new THREE.SphereGeometry(5.5, 24, 16),
            new THREE.MeshBasicMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.12,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
            })
        );
        this.shieldMesh.scale.set(1.6, 0.7, 1.1);
        this.root.add(this.shieldMesh);

        // 引擎 nacelles（4）
        this.engineMeshes = [];
        const engOffsets = [
            new THREE.Vector3(-4.5, -0.4, 2.2),
            new THREE.Vector3(-2.2, -0.55, 2.8),
            new THREE.Vector3(2.2, -0.55, 2.8),
            new THREE.Vector3(4.5, -0.4, 2.2),
        ];
        for (const off of engOffsets) {
            const eng = new THREE.Group();
            const nacelle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.45, 0.5, 2.2, 10),
                darkMat
            );
            nacelle.rotation.x = Math.PI / 2;
            eng.add(nacelle);
            const flame = new THREE.Mesh(
                new THREE.ConeGeometry(0.35, 1.6, 8),
                new THREE.MeshBasicMaterial({
                    color: 0xff6622, transparent: true, opacity: 0.8,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                })
            );
            flame.rotation.x = Math.PI / 2;
            flame.position.z = 1.6;
            eng.add(flame);
            eng.position.copy(off);
            this.root.add(eng);
            this.engineMeshes.push(eng);
        }

        // 防禦砲塔（6）
        this.turretMeshes = [];
        const turOffsets = [
            new THREE.Vector3(-3.5, 0.55, -1.5),
            new THREE.Vector3(3.5, 0.55, -1.5),
            new THREE.Vector3(-5.5, 0.2, 0.5),
            new THREE.Vector3(5.5, 0.2, 0.5),
            new THREE.Vector3(-2.0, -0.7, 0.0),
            new THREE.Vector3(2.0, -0.7, 0.0),
        ];
        for (const off of turOffsets) {
            const tur = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.35, 8), accentMat);
            tur.add(base);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6), darkMat);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.z = -0.4;
            tur.add(barrel);
            tur.position.copy(off);
            this.root.add(tur);
            this.turretMeshes.push(tur);
        }

        const scale = this.cfg.scale ?? 20;
        // 本地機身約與玩家同尺度，整體放大至約 20×
        this.root.scale.setScalar(scale);
    }

    _buildParts() {
        const cfg = this.cfg;
        const engHp = cfg.engine_hp ?? 2;
        const turHp = cfg.turret_hp ?? 2;
        const brgHp = cfg.bridge_hp ?? 4;

        this.engineMeshes.forEach((mesh, i) => {
            this.parts.push(new BossPart({
                id: `engine_${i}`,
                kind: 'engine',
                label: `ENG-${i + 1}`,
                mesh,
                localOffset: mesh.position.clone(),
                hitRadius: cfg.engine_hit_radius ?? 14,
                maxHp: engHp,
                lockPriority: 1.2,
                parent: this,
            }));
        });

        this.turretMeshes.forEach((mesh, i) => {
            this.parts.push(new BossPart({
                id: `turret_${i}`,
                kind: 'turret',
                label: `TUR-${i + 1}`,
                mesh,
                localOffset: mesh.position.clone(),
                hitRadius: cfg.turret_hit_radius ?? 10,
                maxHp: turHp,
                lockPriority: 1.5,
                parent: this,
            }));
        });

        this.parts.push(new BossPart({
            id: 'bridge',
            kind: 'bridge',
            label: 'BRIDGE',
            mesh: this.bridgeMesh,
            localOffset: this.bridgeMesh.position.clone(),
            hitRadius: cfg.bridge_hit_radius ?? 16,
            maxHp: brgHp,
            lockPriority: 3.0,
            parent: this,
        }));

        // 護盾期間的主體碰撞代理（不可鎖定）
        this.hullPart = new BossPart({
            id: 'hull',
            kind: 'hull',
            label: 'HULL',
            mesh: this.hullMesh,
            localOffset: new THREE.Vector3(0, 0, 0),
            hitRadius: cfg.hull_hit_radius ?? 48,
            maxHp: 9999,
            lockPriority: 0,
            parent: this,
        });
        this.parts.push(this.hullPart);
    }

    /** 可供鎖定的弱點（護盾時不含艦橋）。 */
    getLockTargets() {
        return this.parts.filter((p) => p.lockable);
    }

    /** WorldHud／雷達用：所有可見部位。 */
    getHudTargets() {
        return this.parts.filter((p) => {
            if (!p._alive) return false;
            if (p.kind === 'hull') return this.shieldActive;
            if (p.kind === 'bridge') return !this.shieldActive;
            return true;
        });
    }

    enginesAlive() {
        return this.parts.filter((p) => p.kind === 'engine' && p._alive).length;
    }

    turretsAlive() {
        return this.parts.filter((p) => p.kind === 'turret' && p._alive).length;
    }

    _reevaluateShield() {
        const needDown = this.enginesAlive() === 0 && this.turretsAlive() === 0;
        if (needDown && this.shieldActive) {
            this.shieldActive = false;
            if (this.shieldMesh) this.shieldMesh.visible = false;
        }
    }

    hitHull(amount) {
        if (!this.shieldActive) {
            // 護盾已解除：命中主體轉嫁給艦橋
            const bridge = this.parts.find((p) => p.kind === 'bridge' && p._alive);
            if (bridge) return bridge.takeDamage(amount);
            return 0;
        }
        const mul = this.cfg.shield_damage_mul ?? 0;
        this.shieldFlash = 0.35;
        if (mul <= 0) return 0;
        return 0;
    }

    onPartDestroyed(part) {
        this.onExplosion?.(part.position.clone(), part.kind === 'bridge' ? 2.5 : 1.4);
        this._reevaluateShield();
        this.onPartDestroyedHook?.(part);

        if (part.kind === 'bridge') {
            this._defeat();
        }
    }

    _defeat() {
        if (this.defeated) return;
        this.defeated = true;
        this._alive = false;
        // 其餘部位一併標記
        for (const p of this.parts) {
            if (p._alive && p.kind !== 'hull') {
                p._alive = false;
                p.mesh.visible = false;
            }
        }
        this.onExplosion?.(this.position.clone(), 4.5);
        this.onDefeatedHook?.();
    }

    /**
     * 對世界座標點套用傷害（機砲／飛彈爆炸）。
     * @returns {{ hit: boolean, part: BossPart|null, destroyed: boolean, shieldBlocked: boolean }}
     */
    applyDamageAt(worldPos, amount, blastRadius = 0) {
        if (!this._alive) {
            return { hit: false, part: null, destroyed: false, shieldBlocked: false };
        }

        let best = null;
        let bestDist = Infinity;

        for (const part of this.parts) {
            if (!part._alive) continue;
            if (part.kind === 'bridge' && this.shieldActive) continue;
            if (part.kind === 'hull') continue;
            const d = worldPos.distanceTo(part.position);
            const r = part.hitRadius + blastRadius;
            if (d < r && d < bestDist) {
                bestDist = d;
                best = part;
            }
        }

        // 未命中部位時打主體（護盾閃光）
        if (!best) {
            const hullDist = worldPos.distanceTo(this.position);
            if (hullDist < (this.cfg.hull_hit_radius ?? 48) + blastRadius) {
                this.hitHull(amount);
                return { hit: true, part: this.hullPart, destroyed: false, shieldBlocked: this.shieldActive };
            }
            return { hit: false, part: null, destroyed: false, shieldBlocked: false };
        }

        const before = best._alive;
        best.takeDamage(amount);
        return {
            hit: true,
            part: best,
            destroyed: before && !best._alive,
            shieldBlocked: false,
        };
    }

    /**
     * @param {{dt:number, player:object, bulletPool:object, missilePool:object, missileCfg:object}} ctx
     */
    update(ctx) {
        if (!this._alive) return;
        const { dt, player, bulletPool, missilePool, missileCfg } = ctx;

        // 緩慢朝玩家方向巡航，保持距離帶
        const toPlayer = this._tmp.copy(player.position).sub(this.root.position);
        const dist = toPlayer.length();
        const ideal = 280;
        this._desired.copy(toPlayer);
        if (dist > 1) this._desired.multiplyScalar(1 / dist);

        if (dist < ideal * 0.75) {
            this._desired.multiplyScalar(-1);
        } else if (dist <= ideal * 1.4) {
            const side = this._tmp2.crossVectors(this._desired, WORLD_UP);
            if (side.lengthSq() > 1e-6) {
                side.normalize();
                this._desired.addScaledVector(side, Math.sin(performance.now() * 0.0004) * 0.55).normalize();
            }
        }

        this._look.copy(this.root.position).add(this._desired);
        this._mat.lookAt(this.root.position, this._look, WORLD_UP);
        this._quat.setFromRotationMatrix(this._mat).multiply(this._fix);
        this.root.quaternion.slerp(this._quat, Math.min(1, 0.6 * dt));

        const speed = this.cruiseSpeed * (0.7 + 0.3 * (this.enginesAlive() / 4));
        this.velocity.lerp(this._tmp2.copy(this._desired).multiplyScalar(speed), Math.min(1, 1.2 * dt));
        this.root.position.addScaledVector(this.velocity, dt);
        this.root.position.y = MathUtils.clamp(
            this.root.position.y,
            this.cfg.min_altitude ?? 70,
            this.cfg.max_altitude ?? 150
        );

        // 護盾閃光
        if (this.shieldFlash > 0) {
            this.shieldFlash -= dt;
            if (this.shieldMesh?.material) {
                this.shieldMesh.material.opacity = 0.12 + Math.max(0, this.shieldFlash) * 0.55;
            }
        } else if (this.shieldMesh?.material && this.shieldActive) {
            this.shieldMesh.material.opacity = 0.1 + Math.sin(performance.now() * 0.003) * 0.04;
        }

        // 存活砲塔開火
        const gunInterval = this.cfg.turret_gun_interval ?? 0.42;
        const gunRange = this.cfg.turret_gun_range ?? 360;
        const gunDmg = this.cfg.turret_gun_damage ?? 4;
        const gunSpd = this.cfg.turret_projectile_speed ?? 170;
        const mslInterval = this.cfg.turret_missile_interval ?? 7.5;

        for (const part of this.parts) {
            if (part.kind !== 'turret' || !part._alive) continue;
            part.gunAcc += dt;
            part.missileAcc += dt;

            const origin = part.position;
            this._dir.copy(player.position).sub(origin);
            const d = this._dir.length();
            if (d > gunRange || d < 8) continue;
            this._dir.multiplyScalar(1 / d);

            if (part.gunAcc >= gunInterval) {
                part.gunAcc = 0;
                const vel = this._dir.clone().multiplyScalar(gunSpd);
                vel.addScaledVector(player.velocity, 0.015);
                bulletPool.spawn(origin.clone(), this.root.quaternion, vel, {
                    team: 'enemy',
                    life: 2.2,
                    damage: gunDmg,
                    color: 0xff5544,
                });
            }

            // 慢速導彈（輪流，避免過密）
            if (part.missileAcc >= mslInterval && d < gunRange * 1.1 && missilePool) {
                part.missileAcc = 0;
                const launch = this._dir.clone().multiplyScalar(45);
                missilePool.spawn(origin.clone(), this.root.quaternion, launch, {
                    target: player,
                    guided: true,
                    life: missileCfg?.guided_life ?? 4.5,
                    accel: (missileCfg?.acceleration ?? 95) * 0.55,
                    maxSpeed: (missileCfg?.max_speed ?? 210) * 0.7,
                    maxTurn: (missileCfg?.max_turn_rate ?? 1.55) * 0.7,
                    owner: 'enemy',
                    damage: this.cfg.turret_missile_damage ?? 18,
                });
            }
        }

        this.root.updateMatrixWorld(true);
    }

    dispose() {
        this._alive = false;
        this.scene.remove(this.root);
        this.root.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
    }
}
