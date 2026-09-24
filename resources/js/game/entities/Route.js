import * as THREE from 'three';

/**
 * Route — 智慧航點：以轉向約束產生控制點，再用 CatmullRomCurve3 平滑軌跡。
 * 通過判定由 GameCore 呼叫 tryAdvance；本類負責幾何、引導光環與航線緞帶。
 */
export class Route {
    /**
     * @param {THREE.Scene} scene
     * @param {object} mission config.mission
     */
    constructor(scene, mission) {
        this.scene = scene;
        this.mission = mission;
        /** @type {THREE.Vector3[]} */
        this.waypoints = [];
        /** @type {THREE.Group[]} */
        this.rings = [];
        this.cleared = 0;
        this.ribbon = new THREE.Group();
        scene.add(this.ribbon);
    }

    get total() { return this.mission.waypoint_count; }

    get next() { return this.waypoints[0] ?? null; }

    get complete() { return this.waypoints.length === 0; }

    /**
     * @param {{ sampleHeight?: (x:number,z:number)=>number, surfaceAltitude?: (x:number,z:number,above?:number)=>number }|null} terrain
     * @param {THREE.Vector3} [origin] 起飛點（預設世界原點附近）
     */
    generate(terrain = null, origin = null) {
        this.clear();

        const start = origin?.clone?.() ?? new THREE.Vector3(0, 145, 100);
        const pts = this._buildConstrainedPoints(start, terrain);
        const ringR = Math.max(10, (this.mission.waypoint_radius ?? 72) * 0.22);
        const guideScale = this.mission.waypoint_guide_ring_scale ?? 2.4;

        for (const wp of pts) {
            this.waypoints.push(wp.clone());
            this.rings.push(this._createRingGroup(wp, ringR, guideScale));
        }

        this.cleared = 0;
        this.buildRibbon();
    }

    /**
     * 相鄰水平轉向 ≤ maxTurn，首點推至 firstZ，高度貼合地形安全離地。
     * @param {THREE.Vector3} origin
     * @param {{ sampleHeight?: Function, surfaceAltitude?: Function }|null} terrain
     * @returns {THREE.Vector3[]}
     */
    _buildConstrainedPoints(origin, terrain) {
        const count = this.total;
        const spacing = this.mission.waypoint_spacing ?? 320;
        const firstZ = this.mission.waypoint_first_z ?? -800;
        const maxTurn = THREE.MathUtils.degToRad(this.mission.waypoint_max_turn_deg ?? 30);
        const clrMin = this.mission.waypoint_clearance_min ?? 38;
        const clrMax = this.mission.waypoint_clearance_max ?? 78;
        const spread = this.mission.waypoint_spread ?? 480;

        /** @type {THREE.Vector3[]} */
        const pts = [];

        // Waypoint 1：起飛點前方至少 firstZ（或等价距離）
        const minAhead = Math.abs(origin.z - firstZ);
        const firstDist = Math.max(minAhead, Math.abs(firstZ) * 0.85);
        // 水平方位：0 = 正前方 -Z；±maxTurn 內略偏
        let bearing = (Math.random() - 0.5) * maxTurn * 0.4;

        const first = new THREE.Vector3(
            origin.x + Math.sin(bearing) * firstDist,
            0,
            origin.z - Math.cos(bearing) * firstDist
        );
        // 確保 Z 至少到達 firstZ（起飛點 z≈100 時 ≈ -800）
        if (first.z > firstZ) {
            first.z = firstZ;
            first.x = origin.x + (Math.random() - 0.5) * Math.min(120, spread * 0.25);
        }
        first.y = this._safeAltitude(first.x, first.z, terrain, clrMin, clrMax);
        pts.push(first);

        for (let i = 1; i < count; i++) {
            const prev = pts[i - 1];
            const prevPrev = i >= 2 ? pts[i - 2] : origin;
            const inbound = Math.atan2(prev.x - prevPrev.x, -(prev.z - prevPrev.z));
            const turn = (Math.random() * 2 - 1) * maxTurn;
            bearing = inbound + turn;

            const step = spacing * (0.88 + Math.random() * 0.28);
            const next = new THREE.Vector3(
                prev.x + Math.sin(bearing) * step,
                0,
                prev.z - Math.cos(bearing) * step
            );

            // 輕微側向抖動但不破壞轉向約束：再投影回允許扇區
            const rawBearing = Math.atan2(next.x - prev.x, -(next.z - prev.z));
            let delta = rawBearing - inbound;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            delta = THREE.MathUtils.clamp(delta, -maxTurn, maxTurn);
            const locked = inbound + delta;
            next.x = prev.x + Math.sin(locked) * step;
            next.z = prev.z - Math.cos(locked) * step;

            // 限制過度橫向漂移
            const maxAbsX = spread * 0.85;
            if (Math.abs(next.x) > maxAbsX) {
                next.x = Math.sign(next.x) * maxAbsX;
                // 重新夾緊轉向
                const corrected = Math.atan2(next.x - prev.x, -(next.z - prev.z));
                let d2 = corrected - inbound;
                while (d2 > Math.PI) d2 -= Math.PI * 2;
                while (d2 < -Math.PI) d2 += Math.PI * 2;
                d2 = THREE.MathUtils.clamp(d2, -maxTurn, maxTurn);
                const b2 = inbound + d2;
                next.x = prev.x + Math.sin(b2) * step;
                next.z = prev.z - Math.cos(b2) * step;
            }

            next.y = this._safeAltitude(next.x, next.z, terrain, clrMin, clrMax);
            pts.push(next);
        }

        return pts;
    }

    /**
     * @param {number} x
     * @param {number} z
     * @param {{ sampleHeight?: Function, surfaceAltitude?: Function }|null} terrain
     * @param {number} clrMin
     * @param {number} clrMax
     */
    _safeAltitude(x, z, terrain, clrMin, clrMax) {
        const above = clrMin + Math.random() * Math.max(1, clrMax - clrMin);
        if (terrain?.surfaceAltitude) return terrain.surfaceAltitude(x, z, above);
        if (terrain?.sampleHeight) return terrain.sampleHeight(x, z) + above;
        return 45 + Math.random() * 55;
    }

    /**
     * @param {THREE.Vector3} wp
     * @param {number} ringR
     * @param {number} guideScale
     */
    _createRingGroup(wp, ringR, guideScale) {
        const group = new THREE.Group();
        group.position.copy(wp);

        const main = new THREE.Mesh(
            new THREE.TorusGeometry(ringR, 0.55, 12, 48),
            new THREE.MeshBasicMaterial({
                color: 0x66e0ff, transparent: true, opacity: 0.7,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        main.userData.role = 'main';
        group.add(main);

        const halo = new THREE.Mesh(
            new THREE.TorusGeometry(ringR, 1.9, 8, 32),
            new THREE.MeshBasicMaterial({
                color: 0x2288ff, transparent: true, opacity: 0.14,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        halo.userData.role = 'halo';
        group.add(halo);

        // 半透明動態旋轉引導光環
        const guideR = ringR * guideScale;
        const guide = new THREE.Mesh(
            new THREE.TorusGeometry(guideR, 0.35, 10, 64),
            new THREE.MeshBasicMaterial({
                color: 0xa8f0ff, transparent: true, opacity: 0.38,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        guide.userData.role = 'guide';
        guide.rotation.x = Math.PI * 0.5;
        group.add(guide);

        const guideOuter = new THREE.Mesh(
            new THREE.TorusGeometry(guideR * 1.08, 0.18, 8, 64),
            new THREE.MeshBasicMaterial({
                color: 0x44ddff, transparent: true, opacity: 0.22,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        guideOuter.userData.role = 'guideOuter';
        guideOuter.rotation.x = Math.PI * 0.5;
        group.add(guideOuter);

        this.scene.add(group);
        return group;
    }

    clear() {
        for (const ring of this.rings) this._disposeRing(ring);
        this.rings.length = 0;
        this.waypoints.length = 0;
        this.cleared = 0;
        this._clearRibbon();
    }

    _disposeRing(ring) {
        this.scene.remove(ring);
        ring.traverse((o) => {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
        });
    }

    _clearRibbon() {
        while (this.ribbon.children.length) {
            const child = this.ribbon.children[0];
            this.ribbon.remove(child);
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        }
    }

    buildRibbon() {
        this._clearRibbon();
        if (this.waypoints.length < 2) return;

        // CatmullRom 平滑三維曲線（含當前剩餘航點）
        const curve = new THREE.CatmullRomCurve3(
            this.waypoints.map((w) => w.clone()),
            false,
            'catmullrom',
            0.5
        );
        const pts = this.waypoints.length;
        const tubular = Math.max(32, pts * 12);

        this.ribbon.add(new THREE.Mesh(
            new THREE.TubeGeometry(curve, tubular, 0.7, 6, false),
            new THREE.MeshBasicMaterial({
                color: 0x44ccff, transparent: true, opacity: 0.24,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        ));
        this.ribbon.add(new THREE.Mesh(
            new THREE.TubeGeometry(curve, Math.max(24, pts * 8), 2.2, 5, false),
            new THREE.MeshBasicMaterial({
                color: 0x2288ff, transparent: true, opacity: 0.09,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        ));
    }

    /**
     * 判斷是否通過下一個航點；通過時回傳被移除的環位置。
     * @returns {THREE.Vector3|null}
     */
    tryAdvance(playerPos) {
        if (!this.waypoints.length) return null;
        if (playerPos.distanceTo(this.waypoints[0]) >= this.mission.waypoint_radius) return null;

        this.waypoints.shift();
        const ring = this.rings.shift();
        const pos = ring ? ring.position.clone() : null;
        if (ring) this._disposeRing(ring);
        this.cleared++;
        this.buildRibbon();
        return pos;
    }

    update(dt) {
        this.rings.forEach((group, i) => {
            const isNext = i === 0;
            group.children.forEach((child) => {
                const role = child.userData?.role;
                if (role === 'main') {
                    child.rotation.x += dt * 0.45;
                    child.rotation.y += dt * 0.85;
                    if (child.material) {
                        child.material.opacity = isNext ? 0.92 : 0.28;
                        child.material.color.setHex(isNext ? 0x88ffcc : 0x66ccee);
                    }
                } else if (role === 'halo') {
                    child.rotation.z -= dt * 0.35;
                    if (child.material) child.material.opacity = isNext ? 0.2 : 0.08;
                } else if (role === 'guide') {
                    child.rotation.z += dt * (isNext ? 1.35 : 0.55);
                    if (child.material) {
                        child.material.opacity = isNext
                            ? 0.42 + Math.sin(performance.now() * 0.004) * 0.12
                            : 0.12;
                        child.material.color.setHex(isNext ? 0xc8ffe8 : 0x66ccee);
                    }
                } else if (role === 'guideOuter') {
                    child.rotation.z -= dt * (isNext ? 0.9 : 0.4);
                    if (child.material) {
                        child.material.opacity = isNext
                            ? 0.28 + Math.sin(performance.now() * 0.005 + 1) * 0.08
                            : 0.08;
                    }
                }
            });
        });
    }

    distanceToNext(playerPos) {
        return this.waypoints.length ? playerPos.distanceTo(this.waypoints[0]) : null;
    }
}
