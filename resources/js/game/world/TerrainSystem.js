import * as THREE from 'three';
import { createSimplex, fbm2D } from '../utils/noise.js';
import { evaluateTerrainCrash } from '../flight/terrainCollision.js';

/**
 * TerrainSystem — 程序化高度圖山脈／峽谷。
 * 碰撞與 LOS 以 heightmap 雙線性採樣為主（避免每幀 mesh raycast）。
 */
export class TerrainSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {object} cfg config.terrain
     */
    constructor(scene, cfg = {}) {
        this.scene = scene;
        this.cfg = cfg;

        this.size = cfg.size ?? 3200;
        this.segments = cfg.segments ?? 128;
        this.maxHeight = cfg.max_height ?? 190;
        this.minHeight = cfg.min_height ?? 2;
        this.collisionClearance = cfg.collision_clearance ?? 3.2;
        // 低於此高度圖視為近海／坡岸：不判地形撞毀（改由水面機腹）
        this.waterCollisionCeil = cfg.water_collision_ceil ?? 40;
        // 玩家機腹接觸容差（非 pivot clearance）
        this.playerContactPad = cfg.player_contact_pad ?? 0.35;
        this.keelOffset = cfg.keel_offset ?? -1.35;
        // 街機預設關閉玩家高度圖撞山（僅水面機腹）；避免看海撞隱形坡
        this.playerTerrainCollision = cfg.player_terrain_collision === true;
        this.waterLevel = cfg.water_level ?? 0;
        this.seaVisualClearance = cfg.sea_visual_clearance ?? 10;
        this.losSamples = cfg.los_samples ?? 24;
        this.losClearance = cfg.los_clearance ?? 6;
        this.seed = cfg.seed ?? 4242;

        /** @type {Float32Array} */
        this.heights = new Float32Array((this.segments + 1) * (this.segments + 1));
        this.half = this.size * 0.5;
        this.cell = this.size / this.segments;

        this.group = new THREE.Group();
        this.mesh = null;
        this._tmp = new THREE.Vector3();

        this._build();
        scene.add(this.group);
    }

    _idx(ix, iz) {
        return iz * (this.segments + 1) + ix;
    }

    /** 世界 xz → 高度圖格點（含邊界 clamp）。 */
    _worldToGrid(x, z) {
        const u = (x + this.half) / this.size;
        const v = (z + this.half) / this.size;
        return {
            u: Math.min(1, Math.max(0, u)),
            v: Math.min(1, Math.max(0, v)),
        };
    }

    _rawHeight(ix, iz, simplex) {
        const x = (ix / this.segments) * this.size - this.half;
        const z = (iz / this.segments) * this.size - this.half;

        // 峽谷軸向：沿 Z 的河谷走廊 + 橫向支流
        const nx = x * 0.00115;
        const nz = z * 0.00115;
        const base = fbm2D(simplex, nx, nz, 5, 2.05, 0.52);

        const ridge = Math.abs(simplex.noise2D(nx * 0.55 + 20, nz * 0.55 - 11));
        const canyon = Math.pow(Math.abs(simplex.noise2D(nx * 1.8, nz * 0.35 + 3)), 1.35);
        const branch = Math.pow(Math.abs(simplex.noise2D(nx * 0.4 + 8, nz * 1.6)), 1.2);

        // 中心戰場略低、外圍抬升形成盆地
        const radial = Math.hypot(x, z) / this.half;
        const rim = Math.pow(Math.min(1, Math.max(0, radial - 0.55) / 0.45), 1.6);

        let h = 0.42 + base * 0.38;
        h += ridge * 0.55;
        h -= canyon * 0.72;
        h -= branch * 0.28;
        h += rim * 0.85;

        // 主峽谷走廊（沿 -Z 飛行軸）
        const corridor = Math.exp(-((x / (this.size * 0.09)) ** 2));
        h -= corridor * 0.38;

        const amp = this.maxHeight - this.minHeight;
        return this.minHeight + Math.min(1, Math.max(0, h)) * amp;
    }

    _build() {
        const simplex = createSimplex(this.seed);
        const segs = this.segments;
        for (let iz = 0; iz <= segs; iz++) {
            for (let ix = 0; ix <= segs; ix++) {
                this.heights[this._idx(ix, iz)] = this._rawHeight(ix, iz, simplex);
            }
        }

        const geo = new THREE.PlaneGeometry(this.size, this.size, segs, segs);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            pos.setY(i, this.sampleHeight(x, z));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        // 依高度著色：谷底偏砂綠、山腰岩灰、峰頂冷灰
        const colors = new Float32Array(pos.count * 3);
        const cLow = new THREE.Color(0x3a5a32);
        const cMid = new THREE.Color(0x5a4a38);
        const cRock = new THREE.Color(0x6e6560);
        const cPeak = new THREE.Color(0xc8d0d8);
        const tmpC = new THREE.Color();
        const range = Math.max(1, this.maxHeight - this.minHeight);
        for (let i = 0; i < pos.count; i++) {
            const t = (pos.getY(i) - this.minHeight) / range;
            if (t < 0.28) tmpC.copy(cLow).lerp(cMid, t / 0.28);
            else if (t < 0.62) tmpC.copy(cMid).lerp(cRock, (t - 0.28) / 0.34);
            else tmpC.copy(cRock).lerp(cPeak, (t - 0.62) / 0.38);
            colors[i * 3] = tmpC.r;
            colors[i * 3 + 1] = tmpC.g;
            colors[i * 3 + 2] = tmpC.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.92,
            metalness: 0.04,
            flatShading: true,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.receiveShadow = true;
        this.group.add(this.mesh);

        // 外圍遠景矮丘（純視覺、不參與 heightmap）
        this._addSkirtHills();
    }

    _addSkirtHills() {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x2a3548, roughness: 1, flatShading: true, fog: true,
        });
        const n = 14;
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2;
            const dist = this.half * 0.92 + (i % 3) * 40;
            const h = 80 + (i % 5) * 28;
            const m = new THREE.Mesh(
                new THREE.ConeGeometry(60 + (i % 4) * 25, h, 5),
                mat
            );
            m.position.set(Math.cos(ang) * dist, h * 0.28, Math.sin(ang) * dist);
            this.group.add(m);
        }
    }

    /**
     * 雙線性高度採樣（地圖外視為 rim 高度）。
     * @param {number} x
     * @param {number} z
     */
    sampleHeight(x, z) {
        const { u, v } = this._worldToGrid(x, z);
        const fx = u * this.segments;
        const fz = v * this.segments;
        const ix = Math.floor(fx);
        const iz = Math.floor(fz);
        const tx = fx - ix;
        const tz = fz - iz;
        const ix1 = Math.min(this.segments, ix + 1);
        const iz1 = Math.min(this.segments, iz + 1);

        const h00 = this.heights[this._idx(ix, iz)];
        const h10 = this.heights[this._idx(ix1, iz)];
        const h01 = this.heights[this._idx(ix, iz1)];
        const h11 = this.heights[this._idx(ix1, iz1)];
        const h0 = h00 + (h10 - h00) * tx;
        const h1 = h01 + (h11 - h01) * tx;
        return h0 + (h1 - h0) * tz;
    }

    /** 雷達高度：離地高度。 */
    radarAltitude(pos) {
        return pos.y - this.sampleHeight(pos.x, pos.z);
    }

    /**
     * 投射物／通用碰撞：pivot（或點）+ clearance。
     * 近海面高度圖不判（避免海面誤爆）；真正山體仍用 clearance。
     * @param {THREE.Vector3} pos
     * @param {number} [clearance]
     */
    collides(pos, clearance = this.collisionClearance) {
        const h = this.sampleHeight(pos.x, pos.z);
        if (h <= this.waterCollisionCeil) return false;
        return pos.y < h + clearance;
    }

    /**
     * 玩家機體碰撞：機腹接觸抬升地形才算撞山。
     * @param {THREE.Vector3} pos
     * @param {{ keelOffset?: number, contactPad?: number }} [opts]
     */
    collidesPlayer(pos, opts = {}) {
        const h = this.sampleHeight(pos.x, pos.z);
        return evaluateTerrainCrash(pos.y, h, {
            playerTerrainCollision: opts.playerTerrainCollision ?? this.playerTerrainCollision,
            waterLevel: this.waterLevel,
            seaVisualClearance: this.seaVisualClearance,
            waterCollisionCeil: this.waterCollisionCeil,
            keelOffset: opts.keelOffset ?? this.keelOffset,
            contactPad: opts.contactPad ?? this.playerContactPad,
        }).crash;
    }

    /**
     * 除錯用：回傳玩家碰撞相關採樣。
     * @param {THREE.Vector3} pos
     * @param {{ keelOffset?: number }} [opts]
     */
    playerCrashProbe(pos, opts = {}) {
        const h = this.sampleHeight(pos.x, pos.z);
        const keelOffset = opts.keelOffset ?? this.keelOffset;
        const ev = evaluateTerrainCrash(pos.y, h, {
            playerTerrainCollision: this.playerTerrainCollision,
            waterLevel: this.waterLevel,
            seaVisualClearance: this.seaVisualClearance,
            waterCollisionCeil: this.waterCollisionCeil,
            keelOffset,
            contactPad: this.playerContactPad,
        });
        return {
            terrainHeight: h,
            radarAlt: ev.radarAlt,
            keelY: ev.keelY,
            keelOffset,
            waterCollisionCeil: this.waterCollisionCeil,
            contactPad: this.playerContactPad,
            terrainCrash: ev.crash,
            exemptWater: ev.exemptWater,
            exemptSeaClearance: ev.exemptSeaClearance,
            exemptDisabled: ev.exemptDisabled,
            playerTerrainCollision: this.playerTerrainCollision,
            seaVisualClearance: this.seaVisualClearance,
            clearance: this.collisionClearance,
        };
    }

    /**
     * 簡易 LOS：沿線段等距採樣，任一點低於地形+clearance 則遮擋。
     * @param {THREE.Vector3} from
     * @param {THREE.Vector3} to
     * @param {number} [samples]
     * @param {number} [clearance]
     */
    hasLineOfSight(from, to, samples = this.losSamples, clearance = this.losClearance) {
        const n = Math.max(4, samples | 0);
        for (let i = 1; i < n; i++) {
            const t = i / n;
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            const z = from.z + (to.z - from.z) * t;
            if (y < this.sampleHeight(x, z) + clearance) return false;
        }
        return true;
    }

    /**
     * 安全起飛／航點高度：地表 + 淨空。
     * @param {number} x
     * @param {number} z
     * @param {number} [above]
     */
    surfaceAltitude(x, z, above = 40) {
        return this.sampleHeight(x, z) + above;
    }

    /**
     * 在範圍內找相對較低的谷底點（給 SAM／航點用）。
     * @param {number} x
     * @param {number} z
     * @param {number} [radius]
     * @param {number} [probe]
     */
    findLocalValley(x, z, radius = 80, probe = 8) {
        let bestX = x;
        let bestZ = z;
        let bestH = this.sampleHeight(x, z);
        for (let i = 0; i < probe; i++) {
            const a = (i / probe) * Math.PI * 2;
            const px = x + Math.cos(a) * radius;
            const pz = z + Math.sin(a) * radius;
            const h = this.sampleHeight(px, pz);
            if (h < bestH) {
                bestH = h;
                bestX = px;
                bestZ = pz;
            }
        }
        return { x: bestX, z: bestZ, y: bestH };
    }

    /**
     * 找附近山脊（給 SAM 高地佈署）。
     */
    findLocalRidge(x, z, radius = 100, probe = 10) {
        let bestX = x;
        let bestZ = z;
        let bestH = this.sampleHeight(x, z);
        for (let i = 0; i < probe; i++) {
            const a = (i / probe) * Math.PI * 2 + 0.3;
            const r = radius * (0.4 + (i % 3) * 0.3);
            const px = x + Math.cos(a) * r;
            const pz = z + Math.sin(a) * r;
            const h = this.sampleHeight(px, pz);
            if (h > bestH) {
                bestH = h;
                bestX = px;
                bestZ = pz;
            }
        }
        return { x: bestX, z: bestZ, y: bestH };
    }

    dispose() {
        this.scene.remove(this.group);
        this.group.traverse((o) => {
            o.geometry?.dispose?.();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
            else o.material?.dispose?.();
        });
    }
}
