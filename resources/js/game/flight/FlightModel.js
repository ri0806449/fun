import * as THREE from 'three';
import { MathUtils } from 'three';

/**
 * FlightModel — 推力／升力（g-load 曲線）／二次阻力／重力積分。
 * 街機取向：速度方向會緩慢對齊機頭，保留部分慣性側滑。
 */
export class FlightModel {
    /** @param {object} flight config.flight */
    constructor(flight) {
        this.stallSpeed = flight.stall_speed;
        this.cruiseSpeed = flight.cruise_speed;
        this.maxSpeed = flight.max_speed;
        this.minSpeed = flight.min_speed;
        this.thrustForce = flight.thrust;
        this.boostExtra = Math.max(0, flight.boost_thrust - flight.thrust);
        this.dragCoeff = flight.drag_coefficient;
        this.gravity = flight.gravity;
        this.aoaLiftGain = flight.aoa_lift_gain;
        this.velocityAlign = flight.velocity_align;

        this._fwd = new THREE.Vector3();
        this._up = new THREE.Vector3();
        this._velDir = new THREE.Vector3();
        this._lift = new THREE.Vector3();
        this._thrust = new THREE.Vector3();
        this._drag = new THREE.Vector3();
        this._grav = new THREE.Vector3();
        this._aligned = new THREE.Vector3();
    }

    /**
     * @returns {{ airspeed:number, aoa:number, stallMul:number, gApprox:number }}
     */
    integrate(dt, root, velocity, throttle, boosting) {
        const forward = this._fwd.set(0, 0, -1).applyQuaternion(root.quaternion);
        const wingUp = this._up.set(0, 1, 0).applyQuaternion(root.quaternion);

        let speed = velocity.length();
        if (speed < 0.01) {
            velocity.copy(forward).multiplyScalar(this.minSpeed);
            speed = this.minSpeed;
        }
        const velDir = this._velDir.copy(velocity).multiplyScalar(1 / speed);

        // AoA：機頭俯仰 − 航跡俯仰
        const nosePitch = Math.asin(MathUtils.clamp(forward.y, -1, 1));
        const pathPitch = Math.asin(MathUtils.clamp(velDir.y, -1, 1));
        const aoa = MathUtils.clamp(nosePitch - pathPitch, -0.85, 0.85);

        const stallRatio = speed / this.stallSpeed;
        const stallMul = stallRatio < 1 ? Math.pow(Math.max(0.05, stallRatio), 2.2) : 1;

        // 升力以可支撐重量的 g 倍數建模：巡航 ≈1g，失速不足 1g
        const speedRatio = speed / this.cruiseSpeed;
        const aoaTerm = 1 + this.aoaLiftGain * aoa;
        const gLoad = MathUtils.clamp(
            stallMul * aoaTerm * Math.min(1.15, 0.55 + 0.45 * speedRatio),
            0,
            2.6
        );
        const lift = this._lift.copy(wingUp).multiplyScalar(this.gravity * gLoad);

        const thrustMag = this.thrustForce * throttle + (boosting ? this.boostExtra : 0);
        const thrust = this._thrust.copy(forward).multiplyScalar(thrustMag);
        const drag = this._drag.copy(velDir).multiplyScalar(-this.dragCoeff * speed * speed);
        const grav = this._grav.set(0, -this.gravity, 0);

        velocity.addScaledVector(thrust, dt);
        velocity.addScaledVector(lift, dt);
        velocity.addScaledVector(drag, dt);
        velocity.addScaledVector(grav, dt);

        speed = velocity.length();
        const aligned = this._aligned.copy(forward).multiplyScalar(speed);
        const alignK = 1 - Math.exp(-this.velocityAlign * dt);
        velocity.lerp(aligned, alignK * 0.55);

        // 中立姿態輕微修平航跡，避免數值漂移爬升
        if (Math.abs(aoa) < 0.08 && Math.abs(nosePitch) < 0.12) {
            velocity.y *= Math.pow(0.25, dt);
        }

        speed = velocity.length();
        if (speed > this.maxSpeed) velocity.multiplyScalar(this.maxSpeed / speed);
        if (speed < this.minSpeed * 0.5) {
            velocity.addScaledVector(forward, this.minSpeed * 0.15 * dt);
        }

        root.position.addScaledVector(velocity, dt);

        return { airspeed: velocity.length(), aoa, stallMul, gApprox: gLoad };
    }
}
