import * as THREE from 'three';

/**
 * WorldHud — 世界座標 → DOM 標籤（敵機／航點／Boss 部位）。
 */
export class WorldHud {
    /**
     * @param {THREE.Camera} camera
     * @param {HTMLElement} root
     * @param {{ centerY?: number, farCull?: number }} options
     */
    constructor(camera, root, { centerY = 0.42, farCull = 380 } = {}) {
        this.camera = camera;
        this.root = root;
        this.centerY = centerY;
        this.farCull = farCull;
        this._v = new THREE.Vector3();
        this._pool = [];
    }

    _acquire() {
        let el = this._pool.pop();
        if (!el) {
            el = document.createElement('div');
            el.className = 'wh-box';
            el.innerHTML = '<div class="bracket"><span class="tag"></span></div><span class="lbl"></span>';
            this.root.appendChild(el);
        }
        el.style.display = 'block';
        return el;
    }

    _releaseUnused(used) {
        const keep = new Set(used);
        for (const child of [...this.root.children]) {
            if (keep.has(child)) continue;
            child.style.display = 'none';
            this._pool.push(child);
        }
    }

    /** @returns {{x:number,y:number,off:boolean}|null} */
    projectToScreen(worldPos) {
        this._v.copy(worldPos).project(this.camera);
        if (this._v.z > 1) return null;

        const w = innerWidth;
        const h = innerHeight;
        let x = (this._v.x * 0.5 + 0.5) * w;
        let y = (-this._v.y * 0.5 + 0.5) * h;
        let off = false;

        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) {
            off = true;
            const cx = w * 0.5;
            const cy = h * this.centerY;
            const ang = Math.atan2(y - cy, x - cx);
            const pad = 28;
            const rx = w * 0.5 - pad;
            const ry = h * 0.5 - pad;
            const c = Math.cos(ang);
            const s = Math.sin(ang);
            const t = 1 / Math.sqrt((c * c) / (rx * rx) + (s * s) / (ry * ry));
            x = cx + c * t;
            y = cy + s * t;
        }
        return { x, y, off };
    }

    _place(worldPos, opts, used) {
        const scr = this.projectToScreen(worldPos);
        if (!scr) return;
        const el = this._acquire();
        el.className = `wh-box ${opts.cls}${scr.off ? ' offscreen' : ''}`;
        el.style.left = `${scr.x}px`;
        el.style.top = `${scr.y}px`;
        el.querySelector('.tag').textContent = opts.tag;
        el.querySelector('.lbl').textContent = opts.lbl;
        used.push(el);
    }

    /**
     * @param {Array<object>} enemies
     * @param {THREE.Vector3[]} waypoints
     * @param {THREE.Vector3} playerPos
     * @param {{candidate:object|null, locked:object|null, state:string}} lockSnap
     * @param {Array<object>} [bossParts]
     */
    update(enemies, waypoints, playerPos, lockSnap, bossParts = []) {
        if (!this.root) return;
        const used = [];

        waypoints.forEach((wp, i) => {
            const dist = Math.floor(playerPos.distanceTo(wp));
            this._place(wp, {
                cls: `wp${i === 0 ? ' current' : ''}`,
                tag: '[  ]',
                lbl: i === 0 ? `WP ${dist}m` : `W${i + 1} ${dist}m`,
            }, used);
        });

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dist = Math.floor(playerPos.distanceTo(enemy.position));
            const isLocked = lockSnap.locked === enemy;
            const isTracking = lockSnap.candidate === enemy && lockSnap.state === 'tracking';

            if (!isLocked && !isTracking && dist > this.farCull) {
                this._v.copy(enemy.position).project(this.camera);
                if (this._v.z > 1 || Math.abs(this._v.x) > 1.15 || Math.abs(this._v.y) > 1.15) continue;
            }

            let cls = 'enemy';
            if (enemy.classType === 'interceptor') cls += ' interceptor';
            else if (enemy.classType === 'bomber') cls += ' bomber';
            else if (enemy.classType === 'drone') cls += ' drone';
            if (isLocked) cls += ' locked';
            else if (isTracking) cls += ' tracking';

            this._place(enemy.position, {
                cls,
                tag: isLocked ? '[!!]' : '[  ]',
                lbl: `${isLocked ? 'TGT' : (enemy.hudTag || 'ENM')} ${dist}m`,
            }, used);
        }

        for (const part of bossParts) {
            if (!part._alive) continue;
            if (part.kind === 'bridge' && part.parent?.shieldActive) continue;
            if (part.kind === 'hull' && !part.parent?.shieldActive) continue;
            if (part.kind === 'hull') continue; // 護盾用全艦觀感，不逐格顯示 hull

            const dist = Math.floor(playerPos.distanceTo(part.position));
            const isLocked = lockSnap.locked === part;
            const isTracking = lockSnap.candidate === part && lockSnap.state === 'tracking';

            if (!isLocked && !isTracking && dist > this.farCull * 1.5) {
                this._v.copy(part.position).project(this.camera);
                if (this._v.z > 1 || Math.abs(this._v.x) > 1.2 || Math.abs(this._v.y) > 1.2) continue;
            }

            let cls = 'boss-part';
            if (part.kind === 'engine') cls += ' engine';
            else if (part.kind === 'turret') cls += ' turret';
            else if (part.kind === 'bridge') cls += ' bridge';
            if (isLocked) cls += ' locked';
            else if (isTracking) cls += ' tracking';

            this._place(part.position, {
                cls,
                tag: isLocked ? '[!!]' : '[  ]',
                lbl: `${isLocked ? 'TGT' : (part.hudTag || 'BOSS')} ${dist}m`,
            }, used);
        }

        this._releaseUnused(used);
    }

    clear() {
        if (!this.root) return;
        for (const child of [...this.root.children]) {
            child.style.display = 'none';
            this._pool.push(child);
        }
    }
}
