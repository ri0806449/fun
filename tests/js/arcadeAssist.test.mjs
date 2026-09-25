/**
 * 街機鬆鍵回正單元測試（純 Node，不需瀏覽器）。
 * 執行：node --test tests/js/arcadeAssist.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeArcadeRateTargets } from '../../resources/js/game/flight/ArcadeAssist.js';
import { DEFAULTS } from '../../resources/js/game/config.js';

const assist = { ...DEFAULTS.flight.assist };
const limits = {
    maxPitch: DEFAULTS.flight.max_pitch,
    maxRoll: DEFAULTS.flight.max_roll,
    maxYaw: DEFAULTS.flight.max_yaw,
};

describe('computeArcadeRateTargets', () => {
    it('按住滾轉時目標率跟隨指令，不強制回正', () => {
        const t = computeArcadeRateTargets({
            rollCmd: 1,
            bank: 0.9,
            airspeedNorm: 1,
            ...limits,
            assist,
        });
        assert.equal(t.rollActive, true);
        assert.ok(Math.abs(t.rollTarget - limits.maxRoll) < 1e-9);
        assert.equal(t.rollLerpMul, 1);
    });

    it('鬆開滾轉後目標率與 bank 反向，驅動回平', () => {
        const t = computeArcadeRateTargets({
            rollCmd: 0,
            bank: 0.8,
            airspeedNorm: 1,
            ...limits,
            assist,
        });
        assert.equal(t.rollActive, false);
        assert.ok(t.rollTarget < 0, '正 bank 應產生負 rollTarget');
        assert.ok(Math.abs(t.rollTarget) > 0.5);
        assert.ok(t.rollLerpMul > 1);
    });

    it('bank 近 0 時鬆鍵直接 snap 目標為 0', () => {
        const t = computeArcadeRateTargets({
            rollCmd: 0,
            bank: 0.01,
            airspeedNorm: 1,
            ...limits,
            assist,
        });
        assert.equal(t.rollTarget, 0);
    });

    it('大傾角回正強於小傾角', () => {
        const mild = computeArcadeRateTargets({
            rollCmd: 0,
            bank: 0.4,
            airspeedNorm: 1,
            ...limits,
            assist,
        });
        const steep = computeArcadeRateTargets({
            rollCmd: 0,
            bank: 1.2,
            airspeedNorm: 1,
            ...limits,
            assist,
        });
        assert.ok(Math.abs(steep.rollTarget) > Math.abs(mild.rollTarget));
    });

    it('俯仰鬆開時適度朝水平回中且有上限', () => {
        const t = computeArcadeRateTargets({
            pitchCmd: 0,
            nosePitch: 0.6,
            ...limits,
            assist,
        });
        assert.equal(t.pitchActive, false);
        assert.ok(t.pitchTarget < 0, '抬頭應產生負 pitchTarget 回中');
        const cap = limits.maxPitch * assist.pitch_level_cap;
        assert.ok(Math.abs(t.pitchTarget) <= cap + 1e-9);
    });

    it('按住俯仰時仍可滿額爬升指令', () => {
        const t = computeArcadeRateTargets({
            pitchCmd: 1,
            nosePitch: 0.6,
            ...limits,
            assist,
        });
        assert.equal(t.pitchActive, true);
        assert.ok(Math.abs(t.pitchTarget - limits.maxPitch) < 1e-9);
    });

    it('方向舵鬆開目標為 0 且加快 release lerp', () => {
        const held = computeArcadeRateTargets({
            yawCmd: 1,
            ...limits,
            assist,
        });
        const released = computeArcadeRateTargets({
            yawCmd: 0,
            ...limits,
            assist,
        });
        assert.ok(Math.abs(held.yawTarget - limits.maxYaw) < 1e-9);
        assert.equal(released.yawTarget, 0);
        assert.ok(released.yawLerpMul > 1);
    });

    it('assist.enabled=false 時鬆滾轉不再注入回正率', () => {
        const t = computeArcadeRateTargets({
            rollCmd: 0,
            bank: 0.9,
            airspeedNorm: 1,
            ...limits,
            assist: { ...assist, enabled: false },
        });
        assert.equal(t.rollTarget, 0);
    });
});
