import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

/** 機砲彈丸池；速度單位為 m/s，位置以 velocity * dt 積分。 */
export class BulletPool extends ObjectPool {
    constructor(scene, capacity) {
        super(scene, capacity);
        const geo = new THREE.CapsuleGeometry(0.08, 0.6, 2, 4);
        this._fill(() => {
            const mat = new THREE.MeshBasicMaterial({ color: 0xffff66, blending: THREE.AdditiveBlending });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.userData = {
                alive: false,
                velocity: new THREE.Vector3(),
                life: 0,
                team: 'player',
                damage: 1,
            };
            return mesh;
        });
    }

    spawn(origin, quat, velocity, { team = 'player', life = 2, damage = 1, color = 0xffff66 } = {}) {
        const mesh = this._take();
        if (!mesh) return null;
        mesh.visible = true;
        mesh.position.copy(origin);
        mesh.quaternion.copy(quat);
        mesh.material.color.setHex(color);
        const ud = mesh.userData;
        ud.alive = true;
        ud.velocity.copy(velocity);
        ud.life = life;
        ud.team = team;
        ud.damage = damage;
        this.active.push(mesh);
        return mesh;
    }
}
