/**
 * PostFx 品質檔／飛行降載旗標（純 Node）。
 * 執行：node --test tests/js/postFxFlags.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeQuality,
    resolvePostFxFlags,
    QUALITY_PRESETS,
} from '../../resources/js/game/world/postFxFlags.js';
import {
    EXPOSURE_MAX,
    EXPOSURE_MIN,
    clampToneMappingExposure,
} from '../../resources/js/game/world/atmosphereLimits.js';

describe('postFxFlags', () => {
    it('品質檔：low／medium 關 SSAO／DoF，high 開', () => {
        assert.equal(normalizeQuality('nope'), 'medium');
        assert.equal(QUALITY_PRESETS.low.ssao, false);
        assert.equal(QUALITY_PRESETS.medium.dof, false);
        assert.equal(QUALITY_PRESETS.high.ssao, true);
        assert.equal(QUALITY_PRESETS.high.dof, true);

        const low = resolvePostFxFlags({ quality: 'low' });
        assert.equal(low.ssao, false);
        assert.equal(low.dof, false);
        assert.equal(low.heat, false);

        const high = resolvePostFxFlags({ quality: 'high' });
        assert.equal(high.ssao, true);
        assert.equal(high.dof, true);
        assert.equal(high.heat, false);

        const heatOn = resolvePostFxFlags({ quality: 'high', heat_haze_enabled: true });
        assert.equal(heatOn.heat, true);
    });

    it('明確開關覆寫品質檔；null 不覆寫', () => {
        const forcedOff = resolvePostFxFlags({
            quality: 'high',
            ssao_enabled: false,
            dof_enabled: false,
        });
        assert.equal(forcedOff.ssao, false);
        assert.equal(forcedOff.dof, false);

        const forcedOn = resolvePostFxFlags({
            quality: 'low',
            ssao_enabled: true,
            dof_enabled: true,
        });
        assert.equal(forcedOn.ssao, true);
        assert.equal(forcedOn.dof, true);

        const nullish = resolvePostFxFlags({
            quality: 'high',
            ssao_enabled: null,
            dof_enabled: undefined,
        });
        assert.equal(nullish.ssao, true);
        assert.equal(nullish.dof, true);
    });

    it('飛行降載可關 SSAO／DoF／Heat，並套用 stride', () => {
        const flying = resolvePostFxFlags(
            { quality: 'high', heat_haze_enabled: true },
            {
                flight_ssao: false,
                flight_dof: false,
                flight_heat_shimmer: true,
                flight_postfx_stride: 3,
            },
            { flying: true }
        );
        assert.equal(flying.ssao, false);
        assert.equal(flying.dof, false);
        assert.equal(flying.heat, true);
        assert.equal(flying.postFxStride, 3);

        const menu = resolvePostFxFlags(
            { quality: 'high' },
            { flight_ssao: false, flight_dof: false, flight_postfx_stride: 3 },
            { flying: false }
        );
        assert.equal(menu.ssao, true);
        assert.equal(menu.dof, true);
        assert.equal(menu.postFxStride, 1);
    });
});

describe('ACES exposure clamp layering', () => {
    it('目標 1.2 可通過，上限高於目標以免被夾死', () => {
        assert.ok(EXPOSURE_MAX > 1.2);
        assert.equal(clampToneMappingExposure(1.2), 1.2);
        assert.equal(clampToneMappingExposure(9), EXPOSURE_MAX);
        assert.equal(clampToneMappingExposure(0), EXPOSURE_MIN);
        assert.ok(EXPOSURE_MAX <= 1.5);
    });
});

describe('PostFx boost clarity contract', () => {
    it('boost_clarity 預設應為全清晰（加力關 DoF 模糊）', async () => {
        const { DEFAULTS } = await import('../../resources/js/game/config.js');
        assert.ok((DEFAULTS.visual.boost_clarity ?? 0) >= 0.8);
    });
});
