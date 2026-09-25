import * as THREE from 'three';
import { MathUtils } from 'three';
import { FlightModel } from '../flight/FlightModel.js';
import { createJet, PLAYER_PALETTE } from './JetFactory.js';
import { approach } from '../utils/math.js';
import { updateHeatHaze } from '../fx/HeatHaze.js';

/**
 * PlayerJet — 姿態控制、油門、物理積分與排氣視覺。
 */
export class PlayerJet {
    /**
     * @param {THREE.Scene} scene
     * @param {object} config 合併後的完整設定
     */
    constructor(scene, config) {
        this.config = config;
        this.scene = scene;
        this.startPos = new THREE.Vector3(0, config.player.start_altitude, 100);
        this.startSpeed = config.player.start_speed;
        this.maxHp = config.player.max_hp;
        this.crashAltitude = config.environment.crash_altitude;
        this.sprayAltitude = config.environment.sea_spray_altitude;
        this.boostDuration = config.flight.boost_duration;
        this.boostKick = config.flight.boost_speed_kick;

        this.root = new THREE.Group();
        this.root.position.copy(this.startPos);
        this.mesh = createJet(PLAYER_PALETTE);
        this.root.add(this.mesh);
        scene.add(this.root);

        this.model = new FlightModel(config.flight);
        this.velocity = new THREE.Vector3(0, 0, -this.startSpeed);
        this.throttle = 0.5;
        this.throttleTarget = 0.5;
        this.pitchRate = 0;
        this.rollRate = 0;
        this.yawRate = 0;
        this.boosting = false;
        this.boostTimer = 0;
        this.prevThrottle = 0.5;
        this.hp = this.maxHp;
        this.shield = 0;
        this.telemetry = { airspeed: this.startSpeed, aoa: 0, stallMul: 1, gApprox: 1 };

        this.MAX_PITCH = 1.05;
        this.MAX_ROLL = 1.85;
        this.MAX_YAW = 0.42;
        this.INPUT_LERP = 5.2;
        this.THROTTLE_LERP = 1.3;
        this.BANK_TURN = 0.85;

        this._fwd = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._worldUp = new THREE.Vector3(0, 1, 0);
        this._gunOrigin = new THREE.Vector3();
        this._gunDir = new THREE.Vector3();
        this._missileOrigin = new THREE.Vector3();
    }

    get position() { return this.root.position; }

    get quaternion() { return this.root.quaternion; }

    get alive() { return this.hp > 0 && this.mesh.visible; }

    get airspeed() { return this.telemetry.airspeed; }

    get airspeedNorm() {
        return MathUtils.clamp(this.airspeed / this.model.maxSpeed, 0, 1.2);
    }

    reset() {
        this.root.position.copy(this.startPos);
        this.root.quaternion.identity();
        this.velocity.set(0, 0, -this.startSpeed);
        this.throttle = 0.5;
        this.throttleTarget = 0.5;
        this.pitchRate = this.rollRate = this.yawRate = 0;
        this.boosting = false;
        this.boostTimer = 0;
        this.prevThrottle = 0.5;
        this.hp = this.maxHp;
        this.shield = 0;
        this.mesh.visible = true;
        this.telemetry = { airspeed: this.startSpeed, aoa: 0, stallMul: 1, gApprox: 1 };
    }

    takeDamage(amount) {
        let remain = amount;
        if (this.shield > 0) {
            const absorbed = Math.min(this.shield, remain);
            this.shield -= absorbed;
            remain -= absorbed;
        }
        if (remain > 0) this.hp -= remain;
        return this.hp;
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return this.hp;
    }

    /** 加力：油門全開 + 空速注入，後續由阻力平滑衰減。 */
    triggerBoost() {
        this.throttleTarget = 1;
        this.boosting = true;
        this.boostTimer = this.boostDuration;
        this.velocity.addScaledVector(this.getForward(), this.boostKick);
        const cap = this.model.maxSpeed * 1.15;
        const sp = this.velocity.length();
        if (sp > cap) this.velocity.multiplyScalar(cap / sp);
    }

    getForward() {
        return this._fwd.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    }

    getGunOrigin() {
        return this._gunOrigin.set(0, 0, -4.5).applyMatrix4(this.root.matrixWorld);
    }

    getGunDirection() {
        return this._gunDir.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    }

    getMissileOrigin() {
        return this._missileOrigin.set(1.2, -0.3, -0.5).applyMatrix4(this.root.matrixWorld);
    }

    /** 純鍵盤：W/S 俯仰、A/D 滾轉、Q/E 方向舵、Shift/Ctrl 油門。 */
    updateControls(dt, keys) {
        let pitchCmd = 0;
        let rollCmd = 0;
        let yawCmd = 0;

        if (keys.KeyW || keys.ArrowUp) pitchCmd = 1;
        if (keys.KeyS || keys.ArrowDown) pitchCmd = -1;
        if (keys.KeyA || keys.ArrowLeft) rollCmd = 1;
        if (keys.KeyD || keys.ArrowRight) rollCmd = -1;
        if (keys.KeyQ) yawCmd = 1;
        if (keys.KeyE) yawCmd = -1;

        if (keys.ShiftLeft || keys.ShiftRight) {
            this.throttleTarget = Math.min(1, this.throttleTarget + 0.6 * dt);
        }
        if (keys.ControlLeft || keys.ControlRight) {
            this.throttleTarget = Math.max(0.08, this.throttleTarget - 0.6 * dt);
        }

        this.pitchRate = approach(this.pitchRate, pitchCmd * this.MAX_PITCH, this.INPUT_LERP * this.MAX_PITCH, dt);
        this.rollRate = approach(this.rollRate, rollCmd * this.MAX_ROLL, this.INPUT_LERP * this.MAX_ROLL, dt);
        this.yawRate = approach(this.yawRate, yawCmd * this.MAX_YAW, this.INPUT_LERP * this.MAX_YAW, dt);
        this.throttle = approach(this.throttle, this.throttleTarget, this.THROTTLE_LERP, dt);

        if (this.boostTimer > 0) {
            this.boostTimer -= dt;
            if (this.boostTimer <= 0) this.boosting = false;
        }
    }

    updateAttitude(dt) {
        this.root.rotateZ(this.rollRate * dt);
        this.root.rotateX(this.pitchRate * dt);
        this.root.rotateY(this.yawRate * dt);

        this._right.set(1, 0, 0).applyQuaternion(this.root.quaternion);
        const bank = Math.asin(MathUtils.clamp(this._right.y, -1, 1));
        this.root.rotateOnWorldAxis(
            this._worldUp,
            Math.sin(bank) * this.BANK_TURN * (0.35 + this.throttle) * dt
        );
    }

    /** @returns {{ waterCrash:boolean, lowAlt:boolean, foam:number }} */
    updatePhysics(dt) {
        this.telemetry = this.model.integrate(dt, this.root, this.velocity, this.throttle, this.boosting);

        const y = this.root.position.y;
        if (y < this.crashAltitude) return { waterCrash: true, lowAlt: true, foam: 1 };
        if (y < this.sprayAltitude) {
            const span = Math.max(0.001, this.sprayAltitude - this.crashAltitude);
            return { waterCrash: false, lowAlt: true, foam: (this.sprayAltitude - y) / span };
        }
        return { waterCrash: false, lowAlt: false, foam: 0 };
    }

    updateExhaust(exhaustLight, time = 0) {
        const thr = this.throttle;
        const thrDelta = thr - this.prevThrottle;
        this.prevThrottle = thr;
        const afterburn = this.boosting || thr > 0.88;

        for (const c of this.mesh.children) {
            if (c.userData.isExhaust) {
                const boost = afterburn ? 1.45 : 1;
                c.material.opacity = 0.25 + thr * 0.75;
                c.scale.set(
                    (0.55 + thr * 0.7) * boost,
                    (0.5 + thr * 1.8) * boost * (afterburn ? 1.35 : 1),
                    (0.55 + thr * 0.7) * boost
                );
                c.material.color.setHex(
                    afterburn ? 0xb8ddff : thr > 0.55 ? 0xffaa44 : 0xff5522
                );
            }
            if (c.userData.isAfterburner) {
                const inten = this.boosting ? 0.85 : thr > 0.88 ? (thr - 0.88) / 0.12 * 0.55 : 0;
                c.material.opacity = inten;
                c.visible = inten > 0.04;
                const pulse = 1 + Math.sin(time * 28) * 0.08;
                c.scale.set(0.9 + thr * 0.4, (1.2 + thr * 1.6) * pulse, 0.9 + thr * 0.4);
                c.material.color.setHex(this.boosting ? 0x88ccff : 0xff8844);
            }
        }

        const hazeIntensity = this.boosting ? 1.0 : thr > 0.8 ? (thr - 0.8) * 3.5 : 0;
        updateHeatHaze(this.mesh, time, hazeIntensity);

        const fwd = this.getForward();
        exhaustLight.position.copy(this.root.position).addScaledVector(fwd, -3);
        exhaustLight.intensity = thr * (4.5 + thr * 3) + (this.boosting ? 4.5 : 0);
        exhaustLight.color.setHex(afterburn ? 0x88bbff : 0xff6622);
        return thrDelta;
    }

    getRollAmount() {
        this._right.set(1, 0, 0).applyQuaternion(this.root.quaternion);
        return Math.asin(MathUtils.clamp(this._right.y, -1, 1));
    }
}
