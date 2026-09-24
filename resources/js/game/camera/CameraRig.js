import * as THREE from 'three';
import { approach } from '../utils/math.js';

/**
 * CameraRig — spring-mass 追尾相機。
 * 高 G／大滾轉時彈簧變軟；加力時後拉並拉開 FOV；受傷時 shake。
 */
export class CameraRig {
    /**
     * @param {THREE.PerspectiveCamera} camera
     * @param {object} hud config.hud
     */
    constructor(camera, hud) {
        this.camera = camera;
        this.baseFov = hud.base_fov;
        this.maxFov = hud.max_fov;

        this.baseOffset = new THREE.Vector3(2.2, 3.8, 15.5);
        this.baseLook = new THREE.Vector3(-0.5, -0.5, -32);
        this.pos = new THREE.Vector3(2, 60, 118);
        this.vel = new THREE.Vector3();
        this.look = new THREE.Vector3(0, 55, 70);
        this.lookVel = new THREE.Vector3();
        this.fov = this.baseFov;
        this.shake = 0;
        this.stiffness = 48;
        this.damping = 11;
        this.lookStiff = 36;
        this.lookDamp = 9;
        this.boostPull = 0;

        this._desired = new THREE.Vector3();
        this._lookDesired = new THREE.Vector3();
        this._shake = new THREE.Vector3();
        this._up = new THREE.Vector3();
        this._off = new THREE.Vector3();
        this._worldUp = new THREE.Vector3(0, 1, 0);
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
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
    }

    update(dt, playerRoot, airspeedNorm, throttle, boosting, rollAmt, gLoad) {
        const soft = 1 + Math.min(1.8, Math.abs(rollAmt) * 1.2 + Math.max(0, gLoad - 1) * 0.35);
        const stiff = this.stiffness / soft;
        const damp = this.damping * (0.85 + 0.15 / soft);

        this.boostPull = approach(this.boostPull, boosting ? 1 : airspeedNorm * 0.35, 2.8, dt);

        const offset = this._off.copy(this.baseOffset);
        offset.z += this.boostPull * 5.5;
        offset.y += this.boostPull * 0.9;

        this._desired.copy(offset).applyQuaternion(playerRoot.quaternion).add(playerRoot.position);
        this.vel.x += ((this._desired.x - this.pos.x) * stiff - this.vel.x * damp) * dt;
        this.vel.y += ((this._desired.y - this.pos.y) * stiff - this.vel.y * damp) * dt;
        this.vel.z += ((this._desired.z - this.pos.z) * stiff - this.vel.z * damp) * dt;
        this.pos.addScaledVector(this.vel, dt);

        this._lookDesired.copy(this.baseLook).applyQuaternion(playerRoot.quaternion).add(playerRoot.position);
        this._lookDesired.y -= this.boostPull * 1.2;
        this.lookVel.x += ((this._lookDesired.x - this.look.x) * this.lookStiff - this.lookVel.x * this.lookDamp) * dt;
        this.lookVel.y += ((this._lookDesired.y - this.look.y) * this.lookStiff - this.lookVel.y * this.lookDamp) * dt;
        this.lookVel.z += ((this._lookDesired.z - this.look.z) * this.lookStiff - this.lookVel.z * this.lookDamp) * dt;
        this.look.addScaledVector(this.lookVel, dt);

        const targetFov = this.baseFov + (this.maxFov - this.baseFov) * (
            Math.pow(airspeedNorm, 1.1) * 0.7 + this.boostPull * 0.55
        );
        this.fov = approach(this.fov, targetFov, 10, dt);
        this.camera.fov = this.fov;
        this.camera.updateProjectionMatrix();

        if (this.shake > 0) {
            const s = this.shake * (1.1 + throttle * 0.2);
            this._shake.set(
                (Math.random() - 0.5) * s * 2.2,
                (Math.random() - 0.5) * s * 2.2,
                (Math.random() - 0.5) * s * 1.1
            );
            this.shake *= Math.pow(0.03, dt);
            if (this.shake < 0.004) this.shake = 0;
        } else {
            this._shake.set(0, 0, 0);
        }

        this.camera.position.copy(this.pos).add(this._shake);
        this._up.set(0, 1, 0).applyQuaternion(playerRoot.quaternion).lerp(this._worldUp, 0.72).normalize();
        this.camera.up.copy(this._up);
        this.camera.lookAt(this.look);
    }

    /** MENU 展示視角。 */
    showcase(playerPos) {
        this.camera.position.set(40, 35, 80);
        this.camera.lookAt(playerPos);
    }
}
