import * as THREE from 'three';
import { ObjectPool } from './ObjectPool.js';

/**
 * 爆炸／彈道煙／熱焰彈／水花共用的粒子池。
 * 池內固定比例混入 flash 與 PointLight，避免執行期新建。
 */
export class ExplosionPool extends ObjectPool {
    constructor(scene, capacity, { maxTrailParticles = 90, boomParticleCount = 8 } = {}) {
        super(scene, capacity);
        this.maxTrailParticles = maxTrailParticles;
        this.boomParticleCount = boomParticleCount;
        const boomGeo = new THREE.SphereGeometry(0.4, 5, 5);
        const flashGeo = new THREE.SphereGeometry(3.2, 10, 10);

        this._fill((i) => {
            const isLight = i % 9 === 0;
            const isFlash = !isLight && i % 5 === 0;
            let obj;
            if (isLight) {
                obj = new THREE.PointLight(0xff8822, 0, 55, 2);
            } else {
                const mat = new THREE.MeshBasicMaterial({
                    color: isFlash ? 0xffeeaa : 0xffaa22,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                obj = new THREE.Mesh(isFlash ? flashGeo : boomGeo, mat);
            }
            obj.userData = {
                alive: false,
                vel: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                drag: 1,
                type: isLight ? 'light' : isFlash ? 'flash' : 'boom',
                grow: 1,
                fadeNear: false,
            };
            return obj;
        });
    }

    /** 取一個非燈光的粒子；若拿到燈光就放回。 */
    _takeMesh() {
        const obj = this._take();
        if (!obj) return null;
        if (obj.isLight) {
            this.free.push(obj);
            return null;
        }
        return obj;
    }

    _takeLight() {
        const light = this.free.find((o) => o.isLight);
        if (!light) return null;
        this.free.splice(this.free.indexOf(light), 1);
        return light;
    }

    _activate(obj, pos, opts) {
        const ud = obj.userData;
        ud.alive = true;
        if (opts.vel) ud.vel.copy(opts.vel);
        else ud.vel.set(0, 0, 0);
        ud.life = opts.life;
        ud.maxLife = opts.life;
        ud.drag = opts.drag ?? 1;
        ud.type = opts.type;
        ud.grow = opts.grow ?? 1;
        ud.fadeNear = !!opts.fadeNear;
        obj.position.copy(pos);
        if (obj.isLight) {
            obj.visible = true;
            obj.intensity = opts.intensity ?? 8;
            obj.distance = opts.distance ?? 55;
        } else {
            obj.visible = true;
            obj.scale.setScalar(opts.scale ?? 1);
            if (obj.material) {
                if (opts.color != null) obj.material.color.setHex(opts.color);
                obj.material.opacity = opts.opacity ?? 1;
                obj.material.blending = opts.blending ?? THREE.AdditiveBlending;
            }
        }
        this.active.push(obj);
        return obj;
    }

    spawnBoom(pos, scale = 1) {
        const colors = [0xffaa22, 0xff6600, 0xffee88, 0xff3300];
        const budget = Math.max(4, this.boomParticleCount ?? 8);
        const n = Math.min(budget, this.free.length);
        const smokeFrom = Math.max(2, Math.floor(n * 0.7));
        for (let i = 0; i < n; i++) {
            const mesh = this._takeMesh();
            if (!mesh) continue;
            const isSmoke = i >= smokeFrom;
            this._activate(mesh, pos, {
                type: 'boom',
                life: isSmoke ? 0.9 : 0.55,
                drag: isSmoke ? 0.9 : 0.95,
                grow: isSmoke ? 0.9 : 2.2,
                scale: (isSmoke ? 0.45 : 0.38) * scale,
                color: isSmoke ? 0x333333 : colors[i % 4],
                opacity: isSmoke ? 0.28 : 1,
                blending: isSmoke ? THREE.NormalBlending : THREE.AdditiveBlending,
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 36 * scale,
                    Math.random() * 26 * scale,
                    (Math.random() - 0.5) * 36 * scale
                ),
            });
        }

        const flash = this._takeMesh();
        if (flash) {
            this._activate(flash, pos, {
                type: 'flash', life: 0.18, drag: 1, grow: 0,
                scale: 3.2 * scale, color: 0xffeeaa, opacity: 0.9,
            });
        }

        const light = this._takeLight();
        if (light) {
            this._activate(light, pos, {
                type: 'light', life: 0.35, drag: 1, grow: 0,
                intensity: 8 * scale, distance: 55 * scale,
            });
        }
    }

    spawnMuzzle(pos) {
        const mesh = this._takeMesh();
        if (!mesh) return;
        this._activate(mesh, pos, {
            type: 'flash', life: 0.06, drag: 1, grow: 0,
            scale: 0.5, color: 0xffee88, opacity: 0.8,
        });
    }

    spawnTrail(pos, isMissile = false) {
        if (this.active.length > this.maxTrailParticles + 40) return;
        const mesh = this._takeMesh();
        if (!mesh) return;
        this._activate(mesh, pos, {
            type: 'trail',
            life: isMissile ? 0.45 : 0.55,
            drag: 0.96,
            grow: 0.18,
            scale: isMissile ? 0.08 : 0.1,
            color: 0xdce8f8,
            opacity: isMissile ? 0.18 : 0.22,
            blending: THREE.NormalBlending,
            fadeNear: true,
            vel: new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.08, (Math.random() - 0.5) * 0.12),
        });
    }

    spawnFlare(pos, vel) {
        const mesh = this._takeMesh();
        if (!mesh) return null;
        return this._activate(mesh, pos, {
            type: 'flare',
            life: 2.8,
            drag: 0.985,
            grow: 0.35,
            scale: 0.55,
            color: 0xffaa33,
            opacity: 0.95,
            vel: vel || new THREE.Vector3(
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.3) * 10,
                (Math.random() - 0.5) * 18
            ),
        });
    }

    /** 低空海面白沫／水花。 */
    spawnSplash(pos, intensity = 1) {
        const n = Math.min(3 + Math.floor(intensity * 4), this.free.length);
        const offset = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
            const mesh = this._takeMesh();
            if (!mesh) continue;
            offset.set(
                pos.x + (Math.random() - 0.5) * 6,
                pos.y + 0.2 + Math.random() * 1.5,
                pos.z + (Math.random() - 0.5) * 6
            );
            this._activate(mesh, offset, {
                type: 'boom',
                life: 0.35 + Math.random() * 0.25,
                drag: 0.92,
                grow: 1.8,
                scale: 0.25 + Math.random() * 0.4 * intensity,
                color: 0xe8f4ff,
                opacity: 0.55,
                blending: THREE.AdditiveBlending,
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 12,
                    4 + Math.random() * 14 * intensity,
                    (Math.random() - 0.5) * 12
                ),
            });
        }
    }

    release(obj) {
        if (!obj.userData.alive) return;
        if (obj.isLight) obj.intensity = 0;
        else if (obj.material) obj.material.opacity = 0;
        super.release(obj);
    }

    update(dt, cameraPos, playerPos) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const obj = this.active[i];
            const p = obj.userData;
            p.life -= dt;
            const k = p.life / p.maxLife;

            if (p.type === 'light') {
                obj.intensity = 8 * Math.max(0, k);
            } else if (obj.material) {
                let opac = k * (
                    p.type === 'trail' ? 0.2
                        : p.type === 'flash' ? 0.9
                            : p.type === 'flare' ? 0.95
                                : 0.5
                );
                if (p.fadeNear) {
                    const dCam = obj.position.distanceTo(cameraPos);
                    if (dCam < 18) opac *= Math.max(0, (dCam - 8) / 10);
                    const dJet = obj.position.distanceTo(playerPos);
                    if (dJet < 8) opac *= Math.max(0, (dJet - 3) / 5);
                }
                obj.material.opacity = Math.max(0, opac);
                if (p.type === 'boom' || p.type === 'trail' || p.type === 'flare') {
                    obj.scale.multiplyScalar(1 + dt * p.grow);
                }
                if (p.type === 'flash') obj.scale.multiplyScalar(1 + (1 - k) * 0.08);
                if (p.type === 'flare') obj.material.color.setHex(k > 0.5 ? 0xffcc44 : 0xff6622);
            }

            p.vel.multiplyScalar(p.drag);
            obj.position.addScaledVector(p.vel, dt);
            if (p.life <= 0) this.release(obj);
        }
    }
}
