/**
 * 大氣邊界與天氣洗白防呆單元測試（純 Node，不需瀏覽器）。
 * 執行：node --test tests/js/atmosphereLimits.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    clampFogDensity,
    clampTurbidity,
    clampToneMappingExposure,
    clampSunIntensity,
    fogLightnessForAltitude,
    FOG_LIGHTNESS_MAX,
    TURBIDITY_MAX,
    EXPOSURE_MAX,
} from '../../resources/js/game/world/atmosphereLimits.js';
import { WeatherSystem } from '../../resources/js/game/world/WeatherSystem.js';

describe('atmosphereLimits', () => {
    it('夾制 turbidity／fog／exposure，避免洗白或全黑', () => {
        assert.equal(clampTurbidity(99), TURBIDITY_MAX);
        assert.equal(clampTurbidity(-1), 1);
        assert.equal(clampFogDensity(1), 0.0035);
        assert.equal(clampFogDensity(0), 1e-5);
        assert.equal(clampToneMappingExposure(9), EXPOSURE_MAX);
        assert.equal(clampToneMappingExposure(0), 0.35);
        assert.equal(clampSunIntensity(5), 1.0);
    });

    it('霧明度隨高度上升但仍封頂，不漂到白', () => {
        assert.ok(fogLightnessForAltitude(0) < 0.2);
        assert.ok(Math.abs(fogLightnessForAltitude(5000) - 0.3) < 1e-9);
        assert.ok(fogLightnessForAltitude(5000) <= FOG_LIGHTNESS_MAX);
        assert.ok(fogLightnessForAltitude(Number.NaN) >= 0.12);
        assert.ok(fogLightnessForAltitude(5000) < 0.5);
    });
});

describe('WeatherSystem washout guards', () => {
    function mockBuilder(fogBase = 0.00068) {
        const env = {
            sky_elevation: 8,
            sky_turbidity: 10,
            sky_rayleigh: 0.72,
            sun_intensity: 0.38,
            ambient_intensity: 0.28,
        };
        const sunLight = { color: new THREE.Color(0xffd4a8), intensity: 0.38, position: new THREE.Vector3() };
        let forcedFog = 0;
        return {
            env,
            sunLight,
            ambientLight: { intensity: 0.28 },
            _fogBase: fogBase,
            _lastFogAlt: 120,
            setFogBase(d) {
                this._fogBase = clampFogDensity(d);
                forcedFog += 1;
            },
            _applySkyUniforms() {
                this.env.sky_turbidity = clampTurbidity(this.env.sky_turbidity);
            },
            _updateSunPosition() {
                this.sunLight.intensity = clampSunIntensity(this.env.sun_intensity);
            },
            get forcedFogCount() { return forcedFog; },
        };
    }

    it('雨相會強制 setFogBase，且 turbidity／sun 不爆表', () => {
        const scene = new THREE.Scene();
        const sb = mockBuilder();
        const wx = new WeatherSystem(scene, sb, {
            dusk_at: 0.35,
            rain_at: 0.5,
            turbidity_rain: 99,
            fog_mul_rain: 2.4,
            elevation_clear: 8,
            elevation_dusk: 1.5,
            elevation_rain: -2.5,
            rain_particles: 8,
        });

        const before = sb.forcedFogCount;
        wx.update(0.25, 280, 300, { position: new THREE.Vector3(0, 120, 0) });
        assert.ok(sb.forcedFogCount > before, '雨／黃昏應觸發 setFogBase');
        assert.ok(sb.env.sky_turbidity <= TURBIDITY_MAX);
        assert.ok(sb.env.sun_intensity <= 1.0);
        assert.ok(sb._fogBase > 0.00068 * 0.9);
        assert.equal(wx._rainMat.blending, THREE.NormalBlending);
    });

    it('reset 回到晴天基準，不殘留雨霧倍率', () => {
        const scene = new THREE.Scene();
        const sb = mockBuilder(0.00068);
        const wx = new WeatherSystem(scene, sb, {
            dusk_at: 0.1,
            rain_at: 0.2,
            fog_mul_rain: 2.4,
            rain_particles: 4,
        });
        wx.update(0.25, 290, 300, { position: new THREE.Vector3() });
        wx.reset();
        assert.ok(Math.abs(sb._fogBase - 0.00068) < 1e-6);
        assert.equal(wx.phase, 'clear');
        assert.equal(wx.rainIntensity, 0);
    });
});
