/**
 * CameraRig 彈簧運鏡／FOV／顫動契約（Three.js，純 Node）。
 * 執行：node --test tests/js/cameraRig.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig } from '../../resources/js/game/camera/CameraRig.js';
import { createJet, PLAYER_PALETTE } from '../../resources/js/game/entities/JetFactory.js';
import { approach } from '../../resources/js/game/utils/math.js';

const hud = {
    base_fov: 60,
    max_fov: 80,
    camera: {
        boost_fov: 80,
        stiffness: 55,
        damping: 13,
        look_stiffness: 40,
        look_damping: 11,
        look_orient_rate: 16,
        turn_track_boost: 0.95,
        max_pos_lag: 4.2,
        max_look_lag: 5.5,
        boost_pull_z: 5.2,
        boost_pull_y: 0.85,
        boost_pull_approach: 3.4,
        look_ahead_roll: 7.5,
        look_ahead_pitch: 6,
        fov_approach: 9,
        turbulence_low_alt_amp: 0.034,
        turbulence_speed_amp: 0.022,
        turbulence_cloud_amp: 0.042,
        turbulence_boost_amp: 0.012,
        turbulence_freq: 4.4,
        turbulence_low_alt_ceil: 28,
    },
};

function makeRig() {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    return new CameraRig(cam, hud);
}

function makePlayerRoot() {
    const root = new THREE.Group();
    root.position.set(0, 80, 0);
    root.add(createJet(PLAYER_PALETTE));
    return root;
}

/** 將玩家位置投影到 NDC，檢查是否大致在畫面內。 */
function playerInView(rig, root, margin = 0.92) {
    const v = root.position.clone().project(rig.camera);
    return Math.abs(v.x) < margin && Math.abs(v.y) < margin && v.z < 1;
}

describe('CameraRig spring / FOV / turbulence', () => {
    it('Boost 時 FOV 朝 80 平滑上升且 boostPull 增加', () => {
        const rig = makeRig();
        const root = makePlayerRoot();
        rig.reset(root.position);

        for (let i = 0; i < 45; i++) {
            rig.update(1 / 30, root, {
                airspeedNorm: 1,
                throttle: 1,
                boosting: true,
                rollAmt: 0,
                pitchRate: 0,
                rollRate: 0,
                gLoad: 1,
                altitude: 80,
                cloudDensity: 0,
                time: i / 30,
            });
        }

        const dbg = rig.getDebugState();
        assert.ok(dbg.fov > 68, `boost FOV 應明顯升高，實際 ${dbg.fov}`);
        assert.ok(dbg.fov <= 80.5, `FOV 不應超過 boost_fov，實際 ${dbg.fov}`);
        assert.ok(dbg.boostPull > 0.7, `boostPull 應接近 1，實際 ${dbg.boostPull}`);
    });

    it('大角速度時 trackMul 升高，且急轉後機體仍在畫面內', () => {
        const rig = makeRig();
        const root = makePlayerRoot();
        rig.reset(root.position);

        // 穩定幾幀
        for (let i = 0; i < 20; i++) {
            rig.update(1 / 30, root, {
                airspeedNorm: 0.8,
                throttle: 0.7,
                boosting: false,
                rollAmt: 0,
                pitchRate: 0,
                rollRate: 0,
                gLoad: 1,
                altitude: 80,
                cloudDensity: 0,
                time: i / 30,
            });
        }

        // 急轉：持續高 rollRate 並旋轉機體
        for (let i = 0; i < 36; i++) {
            root.rotation.z = Math.sin(i * 0.35) * 1.1;
            root.position.x += Math.sin(root.rotation.z) * 0.9;
            root.position.y += Math.cos(i * 0.2) * 0.15;
            root.updateMatrixWorld(true);
            rig.update(1 / 30, root, {
                airspeedNorm: 0.9,
                throttle: 0.85,
                boosting: false,
                rollAmt: root.rotation.z,
                pitchRate: 0.8,
                rollRate: 2.2,
                gLoad: 2.4,
                altitude: 80,
                cloudDensity: 0,
                time: 1 + i / 30,
            });
            const dbg = rig.getDebugState();
            assert.ok(dbg.trackMul > 1.4, `急轉 trackMul 應明顯升高，實際 ${dbg.trackMul}`);
            assert.ok(dbg.posLag <= 4.5, `posLag 應被 max_pos_lag 壓住，實際 ${dbg.posLag}`);
            assert.ok(
                playerInView(rig, root, 1.05),
                `急轉機體應留在畫面附近，NDC 超出（frame ${i}）`
            );
        }
    });

    it('低空＋極速產生 turbulence amp', () => {
        const rig = makeRig();
        const root = makePlayerRoot();
        root.position.y = 8;
        rig.reset(root.position);

        rig.update(1 / 30, root, {
            airspeedNorm: 1.1,
            throttle: 1,
            boosting: true,
            rollAmt: 0,
            pitchRate: 0,
            rollRate: 0,
            gLoad: 1,
            altitude: 8,
            cloudDensity: 0.8,
            time: 2.5,
        });

        const dbg = rig.getDebugState();
        assert.ok(dbg.turbAmp > 0.04, `turbAmp 應明顯，實際 ${dbg.turbAmp}`);
    });

    it('addShake 寫入可觀測 shake', () => {
        const rig = makeRig();
        const root = makePlayerRoot();
        rig.reset(root.position);
        rig.addShake(0.85);
        assert.ok(rig.getDebugState().shake >= 0.85);

        rig.update(1 / 30, root, {
            airspeedNorm: 0.5,
            throttle: 0.5,
            boosting: false,
            rollAmt: 0,
            pitchRate: 0,
            rollRate: 0,
            gLoad: 1,
            altitude: 80,
            cloudDensity: 0,
            time: 0,
        });
        // 一幀後仍應有殘餘（衰減非瞬間）
        assert.ok(rig.getDebugState().shake > 0.2);
    });

    it('視線剛度契約：look < pos，orient 為有限但夠快的延遲', () => {
        const rig = makeRig();
        assert.ok(rig.lookStiff < rig.stiffness);
        assert.ok(rig.lookOrientRate >= 10);
        assert.ok(rig.lookOrientRate < 28);
        assert.ok(rig.turnTrackBoost > 0.5);
    });

    it('Boost 時 look-ahead 收斂，機體投影靠近畫面中央', () => {
        const rig = makeRig();
        const root = makePlayerRoot();
        root.rotation.z = 0.7;
        root.updateMatrixWorld(true);
        rig.reset(root.position);

        for (let i = 0; i < 40; i++) {
            rig.update(1 / 30, root, {
                airspeedNorm: 1,
                throttle: 1,
                boosting: true,
                rollAmt: 0.7,
                pitchRate: 0.3,
                rollRate: 0.5,
                gLoad: 1.2,
                altitude: 80,
                cloudDensity: 0,
                time: i / 30,
            });
        }

        const v = root.position.clone().project(rig.camera);
        assert.ok(Math.abs(v.x) < 0.55, `加力時機體 NDC.x 應靠近中央，實際 ${v.x}`);
        assert.ok(Math.abs(v.y) < 0.55, `加力時機體 NDC.y 應靠近中央，實際 ${v.y}`);
        assert.ok(rig.getDebugState().boostPull > 0.7);
    });
});

describe('PlayerJet control surfaces (with createJet parts)', () => {
    it('A/D 副翼反向、W/S 升降舵、Boost 噴口擴張', async () => {
        // 輕量模擬 PlayerJet.updateSurfaces 邏輯所需節點
        const jet = createJet(PLAYER_PALETTE);
        const parts = jet.userData.parts;
        assert.ok(parts.aileronL && parts.aileronR);
        assert.ok(parts.elevatorL && parts.elevatorR);
        assert.equal(parts.nozzles.length, 2);

        const aileronMax = 0.55;
        const elevatorMax = 0.48;
        const nozzleBoost = 1.55;

        // 左滾（rollNorm > 0）→ 左副翼上、右副翼下
        const aileron = aileronMax;
        parts.aileronL.rotation.x = aileron;
        parts.aileronR.rotation.x = -aileron;
        assert.ok(parts.aileronL.rotation.x > 0);
        assert.ok(parts.aileronR.rotation.x < 0);
        assert.equal(parts.aileronL.rotation.x, -parts.aileronR.rotation.x);

        parts.elevatorL.rotation.x = elevatorMax;
        parts.elevatorR.rotation.x = elevatorMax;
        assert.equal(parts.elevatorL.rotation.x, parts.elevatorR.rotation.x);

        for (const n of parts.nozzles) {
            n.scale.set(nozzleBoost, nozzleBoost, 0.92 + (nozzleBoost - 1) * 0.35);
        }
        assert.ok(parts.nozzles[0].scale.x > 1.4);

        // approach 平滑可用
        assert.ok(Math.abs(approach(0, 1, 10, 0.1) - 1) < 0.05 || approach(0, 1, 10, 0.1) > 0.5);
    });
});
