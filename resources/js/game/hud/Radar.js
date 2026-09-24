import * as THREE from 'three';

/**
 * Radar — Canvas 2D 雷達：玩家置中、機頭朝上。
 */
export class Radar {
    /**
     * @param {HTMLCanvasElement|null} canvas
     * @param {number} range
     */
    constructor(canvas, range) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext('2d') ?? null;
        this.baseRange = range;
        this.range = range;
        this.sweep = 0;
        this._fwd = new THREE.Vector3();
    }

    resetRange() {
        this.range = this.baseRange;
    }

    /**
     * @param {THREE.Object3D} playerRoot
     * @param {Array<{alive:boolean, position:THREE.Vector3}>} enemies
     * @param {THREE.Vector3[]} waypoints
     * @param {Array<{alive:boolean, position:THREE.Vector3}>} items
     */
    update(dt, playerRoot, enemies, waypoints, items) {
        const ctx = this.ctx;
        if (!ctx || !this.canvas) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w * 0.5;
        const cy = h * 0.5;
        const radius = Math.min(cx, cy) - 4;
        this.sweep = (this.sweep + dt * 1.8) % (Math.PI * 2);

        this._fwd.set(0, 0, -1).applyQuaternion(playerRoot.quaternion);
        const heading = Math.atan2(this._fwd.x, -this._fwd.z);
        const pp = playerRoot.position;

        ctx.clearRect(0, 0, w, h);

        const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
        grd.addColorStop(0, 'rgba(20,60,100,0.55)');
        grd.addColorStop(0.72, 'rgba(4,16,36,0.92)');
        grd.addColorStop(1, 'rgba(2,8,20,0.98)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.strokeStyle = 'rgba(100,180,255,0.22)';
        ctx.lineWidth = 1;
        for (const ring of [0.33, 0.66, 1]) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.strokeStyle = 'rgba(100,180,255,0.12)';
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, this.sweep - 0.45, this.sweep);
        ctx.closePath();
        const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        sweepGrad.addColorStop(0, 'rgba(100,200,255,0.28)');
        sweepGrad.addColorStop(1, 'rgba(100,200,255,0)');
        ctx.fillStyle = sweepGrad;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - 28, cy - 62);
        ctx.lineTo(cx + 28, cy - 62);
        ctx.closePath();
        ctx.fillStyle = 'rgba(100,200,255,0.10)';
        ctx.fill();

        const project = (wx, wz) => {
            const dx = wx - pp.x;
            const dz = wz - pp.z;
            const dist = Math.hypot(dx, dz);
            if (dist > this.range) return null;
            const ang = Math.atan2(dx, -dz) - heading;
            const r = (dist / this.range) * (radius - 8);
            return { x: cx + Math.sin(ang) * r, y: cy - Math.cos(ang) * r, dist };
        };

        for (let i = 0; i < waypoints.length; i++) {
            const p = project(waypoints[i].x, waypoints[i].z);
            if (!p) continue;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.beginPath();
            const ro = i === 0 ? 5 : 3.5;
            const ri = ro * 0.4;
            for (let s = 0; s < 5; s++) {
                const a = (s * 2 * Math.PI) / 5 - Math.PI / 2;
                const a2 = a + Math.PI / 5;
                if (s === 0) ctx.moveTo(Math.cos(a) * ro, Math.sin(a) * ro);
                else ctx.lineTo(Math.cos(a) * ro, Math.sin(a) * ro);
                ctx.lineTo(Math.cos(a2) * ri, Math.sin(a2) * ri);
            }
            ctx.closePath();
            ctx.fillStyle = i === 0 ? '#ffe066' : '#d4b24a';
            ctx.shadowColor = '#fa0';
            ctx.shadowBlur = i === 0 ? 8 : 4;
            ctx.fill();
            ctx.restore();
            ctx.shadowBlur = 0;
        }

        for (const item of items) {
            if (!item.alive) continue;
            const p = project(item.position.x, item.position.z);
            if (!p) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
            ctx.fillStyle = '#3f8';
            ctx.shadowColor = '#2f6';
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const p = project(enemy.position.x, enemy.position.z);
            if (!p) continue;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#ff4455';
            ctx.shadowColor = '#f30';
            ctx.shadowBlur = 6;
            ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
            ctx.restore();
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx - 5.5, cy + 6);
        ctx.lineTo(cx + 5.5, cy + 6);
        ctx.closePath();
        ctx.fillStyle = '#9cf';
        ctx.shadowColor = '#4af';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}
