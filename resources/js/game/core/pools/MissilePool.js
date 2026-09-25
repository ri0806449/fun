import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';
import { createMissileHeatAnchor } from '../../fx/HeatHaze.js';

/**
 * 飛彈池。userData.target 指向 EnemyJet（需具備 alive / position），
 * guided=false 時為無導引彈。
 */
export class MissilePool extends ObjectPool {
    constructor(scene, capacity, defaults) {
        super(scene, capacity);
        this.defaults = defaults;
        const geo = new THREE.CylinderGeometry(0.1, 0.14, 1.5, 6);
        this._fill(() => {
            const mat = new THREE.MeshStandardMaterial({
                color: 0xd0d0d0,
                metalness: 0.8,
                roughness: 0.25,
                emissive: 0x221100,
                emissiveIntensity: 0.4,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = Math.PI / 2;
            const heat = createMissileHeatAnchor({ strength: 0.85, radius: 0.05 });
            mesh.add(heat);
            mesh.userData = {
                alive: false,
                velocity: new THREE.Vector3(),
                target: null,
                guided: false,
                life: 0,
                smokeT: 0,
                accel: defaults.acceleration,
                maxSpeed: defaults.max_speed,
                maxTurn: defaults.max_turn_rate,
                confused: 0,
                owner: null,
                damage: defaults.damage ?? 1,
                heatAnchor: heat,
            };
            return mesh;
        });
    }

    spawn(origin, quat, velocity, opts = {}) {
        const mesh = this._take();
        if (!mesh) return null;
        mesh.visible = true;
        mesh.position.copy(origin);
        mesh.quaternion.copy(quat);
        const ud = mesh.userData;
        ud.alive = true;
        ud.velocity.copy(velocity);
        ud.target = opts.target || null;
        ud.guided = !!opts.guided;
        ud.life = opts.life ?? this.defaults.guided_life;
        ud.smokeT = 0;
        ud.accel = opts.accel ?? this.defaults.acceleration;
        ud.maxSpeed = opts.maxSpeed ?? this.defaults.max_speed;
        ud.maxTurn = opts.maxTurn ?? this.defaults.max_turn_rate;
        ud.confused = 0;
        ud.owner = opts.owner || null;
        ud.damage = opts.damage ?? this.defaults.damage ?? 1;
        if (ud.heatAnchor) {
            ud.heatAnchor.userData._heatIntensity = 0.9;
        }
        this.active.push(mesh);
        return mesh;
    }

    release(mesh) {
        if (!mesh.userData.alive) return;
        mesh.userData.target = null;
        mesh.userData.guided = false;
        if (mesh.userData.heatAnchor) {
            mesh.userData.heatAnchor.userData._heatIntensity = 0;
        }
        super.release(mesh);
    }
}
