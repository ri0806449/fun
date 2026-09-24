import * as THREE from 'three';

/**
 * 翼尖凝結跡：高 G／大姿態變化或加力時於兩側翼尖生成白色尾跡粒子。
 * 使用固定容量物件池，避免飛行中配置。
 */
export class ContrailSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {{ capacity?: number, g_threshold?: number, spawn_interval?: number }} opts
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.capacity = opts.capacity ?? 64;
        this.gThreshold = opts.g_threshold ?? 2.2;
        this.spawnInterval = opts.spawn_interval ?? 0.045;
        this.acc = 0;
        this._tmp = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();

        const geo = new THREE.SphereGeometry(0.35, 5, 4);
        this.free = [];
        this.active = [];

        for (let i = 0; i < this.capacity; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0xeef6ff,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.NormalBlending,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.userData = { alive: false, life: 0, maxLife: 1, grow: 1.8 };
            scene.add(mesh);
            this.free.push(mesh);
        }
    }

    /**
     * @param {number} dt
     * @param {import('../entities/PlayerJet.js').PlayerJet} player
     * @param {THREE.Vector3} cameraPos
     */
    update(dt, player, cameraPos) {
        this.acc += dt;
        const g = Math.abs(player.telemetry?.gApprox ?? 1);
        const pitchMag = Math.abs(player.pitchRate);
        const rollMag = Math.abs(player.rollRate);
        const highLoad = g >= this.gThreshold || pitchMag > 0.55 || rollMag > 0.9;
        const emit = player.boosting || highLoad;

        if (emit && this.acc >= this.spawnInterval) {
            this.acc = 0;
            this._spawnWingtip(player, 1, cameraPos);
            this._spawnWingtip(player, -1, cameraPos);
        }

        for (let i = this.active.length - 1; i >= 0; i--) {
            const m = this.active[i];
            const ud = m.userData;
            ud.life -= dt;
            const t = 1 - ud.life / ud.maxLife;
            m.scale.setScalar(0.4 + t * ud.grow);
            m.material.opacity = (1 - t) * 0.55;
            m.position.y += 0.4 * dt;
            if (ud.life <= 0) {
                m.visible = false;
                ud.alive = false;
                this.active.splice(i, 1);
                this.free.push(m);
            }
        }
    }

    _spawnWingtip(player, side, cameraPos) {
        if (!this.free.length) return;
        // 翼尖局部座標（JetFactory tip）；mesh 已含 rotation.y = PI
        this._tmp.set(side * 3.5, 0.12, 1.55).applyMatrix4(player.mesh.matrixWorld);
        if (this._tmp.distanceTo(cameraPos) < 10) return;

        const mesh = this.free.pop();
        const ud = mesh.userData;
        ud.alive = true;
        ud.life = 1.1 + Math.random() * 0.35;
        ud.maxLife = ud.life;
        ud.grow = 2.2 + Math.random() * 1.2;
        mesh.position.copy(this._tmp);
        mesh.scale.setScalar(0.35);
        mesh.material.opacity = 0.5;
        mesh.visible = true;
        this.active.push(mesh);
    }

    reset() {
        for (const m of this.active) {
            m.visible = false;
            m.userData.alive = false;
            this.free.push(m);
        }
        this.active.length = 0;
        this.acc = 0;
    }
}
