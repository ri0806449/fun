import * as THREE from 'three';
import { approach } from '../utils/math.js';
import { createSimplex } from '../utils/noise.js';

/**
 * CameraRig — spring-mass 追尾相機。
 * 位置／視線皆為彈簧－質量延遲；加力後拉並拉開 FOV；
 * 大滾轉／俯仰 look-ahead；低空／穿雲／極速 Perlin 顫動；受傷／爆炸 shake。
 */
export class CameraRig {
    /**
     * @param {THREE.PerspectiveCamera} camera
     * @param {object} hud config.hud（含 camera 子設定）
     */
    constructor(camera, hud) {
        this.camera = camera;
        const cam = hud.camera ?? {};

        this.baseFov = hud.base_fov ?? 60;
        this.maxFov = hud.max_fov ?? 80;
        this.boostFov = cam.boost_fov ?? this.maxFov;

        this.baseOffset = new THREE.Vector3(
            cam.offset_x ?? 2.2,
            cam.offset_y ?? 3.8,
            cam.offset_z ?? 15.5
        );
        this.baseLook = new THREE.Vector3(
            cam.look_x ?? -0.5,
            cam.look_y ?? -0.5,
            cam.look_z ?? -32
        );

        this.pos = new THREE.Vector3(2, 60, 118);
        this.vel = new THREE.Vector3();
        this.look = new THREE.Vector3(0, 55, 70);
        this.lookVel = new THREE.Vector3();
        this.fov = this.baseFov;
        this.shake = 0;
        this.stiffness = cam.stiffness ?? 42;
        this.damping = cam.damping ?? 10.5;
        this.lookStiff = cam.look_stiffness ?? 26;
        this.lookDamp = cam.look_damping ?? 8.2;
        this.boostPullZ = cam.boost_pull_z ?? 6.5;
        this.boostPullY = cam.boost_pull_y ?? 1.1;
        this.lookAheadRoll = cam.look_ahead_roll ?? 9.5;
        this.lookAheadPitch = cam.look_ahead_pitch ?? 7.5;
        this.shakeDecay = cam.shake_decay ?? 0.028;
        this.shakePosMul = cam.shake_pos_mul ?? 2.4;
        this.shakeRotMul = cam.shake_rot_mul ?? 0.045;
        this.turbLowAltCeil = cam.turbulence_low_alt_ceil ?? 28;
        this.turbLowAltAmp = cam.turbulence_low_alt_amp ?? 0.022;
        this.turbSpeedAmp = cam.turbulence_speed_amp ?? 0.014;
        this.turbCloudAmp = cam.turbulence_cloud_amp ?? 0.03;
        this.turbBoostAmp = cam.turbulence_boost_amp ?? 0.012;
        this.turbFreq = cam.turbulence_freq ?? 3.8;
        this.fovApproach = cam.fov_approach ?? 9;
        this.boostPullApproach = cam.boost_pull_approach ?? 2.6;

        this.boostPull = 0;
        this._noise = createSimplex(9041);
        this._time = 0;

        this._desired = new THREE.Vector3();
        this._lookDesired = new THREE.Vector3();
        this._shake = new THREE.Vector3();
        this._up = new THREE.Vector3();
        this._off = new THREE.Vector3();
        this._worldUp = new THREE.Vector3(0, 1, 0);
        this._right = new THREE.Vector3();
        this._fwd = new THREE.Vector3();
        this._euler = new THREE.Euler();
        this._quat = new THREE.Quaternion();
    }

    addShake(amount) {
        this.shake = Math.max(this.shake, amount);
    }

    reset(playerPos) {
        this.pos.set(playerPos.x + 2, playerPos.y + 5, playerPos.z + 18);
        this.vel.set(0, 0, 0);
        this.look.copy(playerPos);
        this.lookVel.set(0, 0, 0);
        this.fov = this.baseFov;
        this.shake = 0;
        this.boostPull = 0;
        this._time = 0;
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
    }

    /**
     * @param {number} dt
     * @param {THREE.Object3D} playerRoot
     * @param {object} ctx
     */
    update(dt, playerRoot, ctx) {
        const airspeedNorm = ctx.airspeedNorm ?? 0;
        const throttle = ctx.throttle ?? 0;
        const boosting = !!ctx.boosting;
        const rollAmt = ctx.rollAmt ?? 0;
        const pitchRate = ctx.pitchRate ?? 0;
        const rollRate = ctx.rollRate ?? 0;
        const gLoad = ctx.gLoad ?? 1;
        const altitude = ctx.altitude ?? 80;
        const cloudDensity = ctx.cloudDensity ?? 0;
        const time = ctx.time ?? (this._time += dt);

        const soft = 1 + Math.min(1.8, Math.abs(rollAmt) * 1.2 + Math.max(0, gLoad - 1) * 0.35);
        const stiff = this.stiffness / soft;
        const damp = this.damping * (0.85 + 0.15 / soft);

        this.boostPull = approach(
            this.boostPull,
            boosting ? 1 : airspeedNorm * 0.28,
            this.boostPullApproach,
            dt
        );

        const offset = this._off.copy(this.baseOffset);
        offset.z += this.boostPull * this.boostPullZ;
        offset.y += this.boostPull * this.boostPullY;

        this._desired.copy(offset).applyQuaternion(playerRoot.quaternion).add(playerRoot.position);
        this.vel.x += ((this._desired.x - this.pos.x) * stiff - this.vel.x * damp) * dt;
        this.vel.y += ((this._desired.y - this.pos.y) * stiff - this.vel.y * damp) * dt;
        this.vel.z += ((this._desired.z - this.pos.z) * stiff - this.vel.z * damp) * dt;
        this.pos.addScaledVector(this.vel, dt);

        // Look-ahead：世界空間偏置，大滾轉／俯仰時視線提早看向轉彎方向
        this._fwd.set(0, 0, -1).applyQuaternion(playerRoot.quaternion);
        this._right.set(1, 0, 0).applyQuaternion(playerRoot.quaternion);
        this._lookDesired.copy(this.baseLook).applyQuaternion(playerRoot.quaternion).add(playerRoot.position);
        this._lookDesired.addScaledVector(
            this._right,
            rollAmt * this.lookAheadRoll + rollRate * 2.2
        );
        this._lookDesired.addScaledVector(this._fwd, pitchRate * this.lookAheadPitch * 0.4);
        this._lookDesired.y += pitchRate * this.lookAheadPitch * 0.55;
        this._lookDesired.y -= this.boostPull * 1.35;

        const lookSoft = soft * 0.92;
        const lStiff = this.lookStiff / lookSoft;
        const lDamp = this.lookDamp * (0.88 + 0.12 / lookSoft);
        this.lookVel.x += ((this._lookDesired.x - this.look.x) * lStiff - this.lookVel.x * lDamp) * dt;
        this.lookVel.y += ((this._lookDesired.y - this.look.y) * lStiff - this.lookVel.y * lDamp) * dt;
        this.lookVel.z += ((this._lookDesired.z - this.look.z) * lStiff - this.lookVel.z * lDamp) * dt;
        this.look.addScaledVector(this.lookVel, dt);

        // FOV：基礎 60；Boost 平滑到 boost_fov（預設 80），高速亦略開
        const boostBlend = this.boostPull;
        const speedBlend = Math.pow(Math.min(1, airspeedNorm), 1.15) * 0.35;
        const targetFov = this.baseFov
            + (this.boostFov - this.baseFov) * Math.min(1, boostBlend * 0.92 + speedBlend * 0.45);
        this.fov = approach(this.fov, targetFov, this.fovApproach, dt);
        this.camera.fov = this.fov;
        this.camera.updateProjectionMatrix();

        // 事件 shake（爆炸／受傷）
        let shakeRotX = 0;
        let shakeRotY = 0;
        let shakeRotZ = 0;
        if (this.shake > 0) {
            const s = this.shake * (1.15 + throttle * 0.25);
            this._shake.set(
                (Math.random() - 0.5) * s * this.shakePosMul,
                (Math.random() - 0.5) * s * this.shakePosMul,
                (Math.random() - 0.5) * s * (this.shakePosMul * 0.5)
            );
            shakeRotX = (Math.random() - 0.5) * s * this.shakeRotMul;
            shakeRotY = (Math.random() - 0.5) * s * this.shakeRotMul;
            shakeRotZ = (Math.random() - 0.5) * s * this.shakeRotMul * 0.7;
            this.shake *= Math.pow(this.shakeDecay, dt);
            if (this.shake < 0.004) this.shake = 0;
        } else {
            this._shake.set(0, 0, 0);
        }

        // Perlin 高頻微顫：低空／穿雲／極速／加力
        const lowAlt = Math.max(0, 1 - altitude / Math.max(1, this.turbLowAltCeil));
        const speedFactor = Math.max(0, airspeedNorm - 0.72) / 0.48;
        const turbAmp = lowAlt * this.turbLowAltAmp
            + speedFactor * this.turbSpeedAmp
            + cloudDensity * this.turbCloudAmp
            + (boosting ? this.turbBoostAmp : 0);
        if (turbAmp > 0.0005) {
            const f = this.turbFreq;
            const nx = this._noise.noise2D(time * f, 0.3) * turbAmp;
            const ny = this._noise.noise2D(1.7, time * f * 1.15) * turbAmp;
            const nz = this._noise.noise2D(time * f * 0.85, 2.4) * turbAmp * 0.7;
            this._shake.x += nx * 18;
            this._shake.y += ny * 14;
            this._shake.z += nz * 10;
            shakeRotX += ny * 1.4;
            shakeRotY += nx * 1.2;
            shakeRotZ += nz * 1.6;
        }

        this.camera.position.copy(this.pos).add(this._shake);
        this._up.set(0, 1, 0).applyQuaternion(playerRoot.quaternion).lerp(this._worldUp, 0.72).normalize();
        this.camera.up.copy(this._up);
        this.camera.lookAt(this.look);

        // 在 lookAt 之後疊旋轉顫動，避免視線被死板鎖死
        if (shakeRotX !== 0 || shakeRotY !== 0 || shakeRotZ !== 0) {
            this._euler.set(shakeRotX, shakeRotY, shakeRotZ, 'YXZ');
            this._quat.setFromEuler(this._euler);
            this.camera.quaternion.multiply(this._quat);
        }
    }

    /** MENU 展示視角。 */
    showcase(playerPos) {
        this.camera.position.set(40, 35, 80);
        this.camera.lookAt(playerPos);
    }
}
