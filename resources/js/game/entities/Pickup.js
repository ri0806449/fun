import * as THREE from 'three';

/** 補給品：supply（回血＋限時火力）/ weapon / scrap（零件）。 */
export class Pickup {
    /**
     * @param {THREE.Scene} scene
     * @param {'supply'|'weapon'|'scrap'} type
     * @param {THREE.Vector3} pos
     * @param {{ amount?: number }} [opts]
     */
    constructor(scene, type, pos, opts = {}) {
        this.scene = scene;
        this.type = type;
        this.amount = opts.amount ?? 1;

        let color = 0x44ccff;
        if (type === 'supply') color = 0x33ff88;
        else if (type === 'scrap') color = 0xffc24a;

        const size = type === 'scrap' ? 1.35 : 2;
        this.mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(size, 0),
            new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: type === 'scrap' ? 0.85 : 0.6,
                metalness: 0.5, roughness: 0.3,
            })
        );
        this.mesh.position.copy(pos);
        this.mesh.add(new THREE.Mesh(
            new THREE.SphereGeometry(size * 1.6, 12, 12),
            new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: type === 'scrap' ? 0.18 : 0.12,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        ));
        scene.add(this.mesh);
        this._phase = Math.random() * Math.PI * 2;
        this._magnetVel = new THREE.Vector3();
    }

    get position() { return this.mesh.position; }

    get alive() { return !!this.mesh.parent; }

    update(dt, time) {
        this.mesh.rotation.y += dt * (this.type === 'scrap' ? 2.4 : 1.8);
        this.mesh.position.y += Math.sin(time * 2 + this._phase) * 0.02;
        if (this._magnetVel.lengthSq() > 0.01) {
            this.mesh.position.addScaledVector(this._magnetVel, dt);
            this._magnetVel.multiplyScalar(0.92);
        }
    }

    /** 磁鐵吸引：朝目標加速。 */
    pullToward(target, speed, dt) {
        this._magnetVel.copy(target).sub(this.mesh.position);
        const len = this._magnetVel.length();
        if (len < 0.001) return;
        this._magnetVel.multiplyScalar(speed / len);
        this.mesh.position.addScaledVector(this._magnetVel, dt);
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.traverse((o) => {
            o.geometry?.dispose?.();
            o.material?.dispose?.();
        });
    }
}
