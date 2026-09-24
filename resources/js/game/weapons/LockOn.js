import * as THREE from 'three';

/**
 * LockOn — 畫面中央鎖定圓錐（NDC 判定）。
 * 支援敵機與 Boss 子部位；優先暴露弱點（lockPriority 較高者）。
 */
export class LockOn {
    /**
     * @param {THREE.Camera} camera
     * @param {object} config 完整設定
     * @param {{ onTick?: () => void, onLock?: () => void, losCheck?: Function }} hooks
     */
    constructor(camera, config, { onTick, onLock, losCheck } = {}) {
        const missile = config.weapons.missile;
        this.camera = camera;
        this.screenRadius = missile.lock_radius_ndc * 0.5;
        this.lockDuration = missile.lock_seconds;
        this.baseLockSeconds = missile.lock_seconds;
        this.graceAfterLock = missile.lock_grace_seconds;
        this.maxRange = missile.lock_max_range;
        this.centerY = config.hud.crosshair_center_y;
        this.onTick = onTick ?? (() => {});
        this.onLock = onLock ?? (() => {});
        /** @type {((from:THREE.Vector3,to:THREE.Vector3)=>boolean)|null} */
        this.losCheck = losCheck ?? null;

        this.candidate = null;
        this.lockedTarget = null;
        this.progress = 0;
        this.grace = 0;
        this.state = 'none';
        this._tickAcc = 0;
        this._wasLocked = false;

        this._v = new THREE.Vector3();
        this.frustum = new THREE.Frustum();
        this._mat = new THREE.Matrix4();
    }

    /** @param {(from:THREE.Vector3,to:THREE.Vector3)=>boolean} fn */
    setLosCheck(fn) {
        this.losCheck = fn;
    }

    _hasLos(from, to) {
        if (!this.losCheck) return true;
        return this.losCheck(from, to);
    }

    reset() {
        this.candidate = null;
        this.lockedTarget = null;
        this.progress = 0;
        this.grace = 0;
        this.state = 'none';
        this._tickAcc = 0;
        this._wasLocked = false;
        this.lockDuration = this.baseLockSeconds;
    }

    /** @param {number} mul */
    setLockSecondsMul(mul) {
        this.lockDuration = this.baseLockSeconds * mul;
    }

    /** @returns {{x:number,y:number,z:number}|null} */
    _project(target) {
        if (!target?.alive) return null;
        this._v.copy(target.position).project(this.camera);
        if (this._v.z > 1) return null;
        return { x: this._v.x, y: this._v.y, z: this._v.z };
    }

    _inLockCone(ndc, dist) {
        if (!ndc || dist > this.maxRange) return false;
        const cy = 1 - 2 * this.centerY;
        const aspect = innerWidth / Math.max(1, innerHeight);
        const r = Math.hypot(ndc.x * aspect, ndc.y - cy);
        return r <= this.screenRadius * 2 && ndc.z > -1 && ndc.z < 1;
    }

    /**
     * @param {number} dt
     * @param {Array<{alive:boolean, position:THREE.Vector3, lockPriority?: number}>} targets
     * @param {THREE.Vector3} playerPos
     */
    update(dt, targets, playerPos) {
        this.camera.updateMatrixWorld();
        this._mat.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this._mat);

        const cy = 1 - 2 * this.centerY;
        const aspect = innerWidth / Math.max(1, innerHeight);
        let best = null;
        let bestScore = Infinity;

        for (const target of targets) {
            if (!target.alive) continue;
            const dist = playerPos.distanceTo(target.position);
            if (dist > this.maxRange) continue;
            if (!this.frustum.containsPoint(target.position)) continue;
            if (!this._hasLos(playerPos, target.position)) continue;
            const ndc = this._project(target);
            if (!ndc || !this._inLockCone(ndc, dist)) continue;
            const prio = target.lockPriority ?? 0;
            const score = Math.hypot(ndc.x * aspect, ndc.y - cy) + dist * 0.00015 - prio * 0.08;
            if (score < bestScore) {
                bestScore = score;
                best = target;
            }
        }

        const hardAlive = !!this.lockedTarget?.alive;

        if (this.state === 'locked' && !hardAlive) {
            this.reset();
            return this.snapshot();
        }

        if (this.state === 'locked') {
            const ndc = this._project(this.lockedTarget);
            const dist = playerPos.distanceTo(this.lockedTarget.position);
            const losOk = this._hasLos(playerPos, this.lockedTarget.position);
            const inCone = !!ndc
                && losOk
                && this._inLockCone(ndc, dist)
                && this.frustum.containsPoint(this.lockedTarget.position);

            if (inCone) {
                this.grace = this.graceAfterLock;
                this.candidate = this.lockedTarget;
            } else {
                this.grace -= dt;
                if (this.grace <= 0) this.reset();
            }
            return this.snapshot();
        }

        if (best) {
            if (this.candidate !== best) {
                this.candidate = best;
                this.progress = 0;
            }
            this.state = 'tracking';
            this.progress = Math.min(1, this.progress + dt / this.lockDuration);

            this._tickAcc += dt;
            if (this._tickAcc >= 0.28 && this.progress < 1) {
                this._tickAcc = 0;
                this.onTick();
            }

            if (this.progress >= 1) {
                this.lockedTarget = this.candidate;
                this.state = 'locked';
                this.grace = this.graceAfterLock;
                if (!this._wasLocked) {
                    this._wasLocked = true;
                    this.onLock();
                }
            }
        } else {
            this.candidate = null;
            this.lockedTarget = null;
            this.progress = 0;
            this.state = 'none';
            this._wasLocked = false;
            this._tickAcc = 0;
        }

        return this.snapshot();
    }

    snapshot() {
        return {
            state: this.state,
            progress: this.progress,
            candidate: this.candidate,
            locked: this.state === 'locked' ? this.lockedTarget : null,
        };
    }

    getFireTarget() {
        return this.state === 'locked' && this.lockedTarget?.alive ? this.lockedTarget : null;
    }
}
