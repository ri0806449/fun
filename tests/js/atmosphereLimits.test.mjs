/**
 * 大氣邊界與天氣漂暗／洗白防呆單元測試（純 Node，不需瀏覽器）。
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
    clampWeatherFogMul,
    fogLightnessForAltitude,
    sunLightIntensityFor,
    FOG_LIGHTNESS_MAX,
    TURBIDITY_MAX,
    EXPOSURE_MAX,
    EXPOSURE_MIN,
    SUN_LIGHT_MIN,
    WEATHER_FOG_MUL_MAX,
} from '../../resources/js/game/world/atmosphereLimits.js';
import { WeatherSystem } from '../../resources/js/game/world/WeatherSystem.js';

describe('atmosphereLimits', () => {
    it('夾制 turbidity／fog／exposure，避免洗白或全黑', () => {
        assert.equal(clampTurbidity(99), TURBIDITY_MAX);
        assert.equal(clampTurbidity(-1), 1);
        assert.equal(clampFogDensity(1), 0.0035);
        assert.equal(clampFogDensity(0), 1e-5);
        assert.equal(clampToneMappingExposure(9), EXPOSURE_MAX);
        assert.equal(clampToneMappingExposure(0), EXPOSURE_MIN);
        assert.equal(clampSunIntensity(5), 1.0);
        assert.equal(clampWeatherFogMul(9), WEATHER_FOG_MUL_MAX);
    });

    it('霧明度隨高度上升但仍封頂，不漂到白', () => {
        assert.ok(fogLightnessForAltitude(0) < 0.22);
        assert.ok(fogLightnessForAltitude(0) >= 0.14);
        assert.ok(Math.abs(fogLightnessForAltitude(5000) - 0.32) < 1e-9);
        assert.ok(fogLightnessForAltitude(5000) <= FOG_LIGHTNESS_MAX);
        assert.ok(fogLightnessForAltitude(Number.NaN) >= 0.14);
        assert.ok(fogLightnessForAltitude(5000) < 0.5);
    });

    it('sunLightIntensityFor 為絕對公式且有下限，不因負仰角崩到全黑', () => {
        const clear = sunLightIntensityFor(0.38, 8, 1);
        const dusk = sunLightIntensityFor(0.38, 2.5, 0.86);
        const rain = sunLightIntensityFor(0.38, 0.5, 0.86);
        assert.ok(clear >= SUN_LIGHT_MIN);
        assert.ok(dusk >= SUN_LIGHT_MIN);
        assert.ok(rain >= SUN_LIGHT_MIN);
        assert.ok(rain < clear, '雨／黃昏應比晴天略暗，但不可漂沒');
        // 重複呼叫同一輸入必須位元級穩定（無累乘）
        assert.equal(sunLightIntensityFor(0.38, 0.5, 0.86), rain);
        assert.ok(sunLightIntensityFor(0.38, -10, 0.5) >= SUN_LIGHT_MIN);
    });
});

describe('WeatherSystem washout／darken guards', () => {
    function mockBuilder(fogBase = 0.00068) {
        const env = {
            sky_elevation: 8,
            sky_turbidity: 10,
            sky_rayleigh: 0.72,
            sun_intensity: 0.38,
            ambient_intensity: 0.28,
            weather_sun_dim: 1,
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
                this.sunLight.intensity = sunLightIntensityFor(
                    this.env.sun_intensity,
                    this.env.sky_elevation,
                    this.env.weather_sun_dim ?? 1
                );
            },
            get forcedFogCount() { return forcedFog; },
        };
    }

    const weatherCfg = {
        dusk_at: 0.35,
        rain_at: 0.62,
        turbidity_rain: 99,
        fog_mul_rain: 1.85,
        elevation_clear: 8,
        elevation_dusk: 2.5,
        elevation_rain: 0.5,
        rain_particles: 8,
    };

    it('雨相會強制 setFogBase，且 turbidity／sun 不爆表', () => {
        const scene = new THREE.Scene();
        const sb = mockBuilder();
        const wx = new WeatherSystem(scene, sb, weatherCfg);

        const before = sb.forcedFogCount;
        wx.update(0.25, 280, 300, { position: new THREE.Vector3(0, 120, 0) });
        assert.ok(sb.forcedFogCount > before, '雨／黃昏應觸發 setFogBase');
        assert.ok(sb.env.sky_turbidity <= TURBIDITY_MAX);
        assert.ok(sb.env.sun_intensity <= 1.0);
        assert.equal(sb.env.sun_intensity, 0.38, '日照基準應維持晴天值，不雙重壓暗');
        assert.ok(sb._fogBase > 0.00068 * 0.9);
        assert.equal(wx._rainMat.blending, THREE.NormalBlending);
    });

    it('reset 回到晴天基準，不殘留雨霧倍率', () => {
        const scene = new THREE.Scene();
        const sb = mockBuilder(0.00068);
        const wx = new WeatherSystem(scene, sb, {
            ...weatherCfg,
            dusk_at: 0.1,
            rain_at: 0.2,
        });
        wx.update(0.25, 290, 300, { position: new THREE.Vector3() });
        wx.reset();
        assert.ok(Math.abs(sb._fogBase - 0.00068) < 1e-6);
        assert.equal(wx.phase, 'clear');
        assert.equal(wx.rainIntensity, 0);
        assert.equal(sb.env.weather_sun_dim, 1);
        assert.equal(sb.env.sun_intensity, 0.38);
    });

    it('長時間天氣推進：日照／霧為絕對插值，不單調累乘漂暗', () => {
        const scene = new THREE.Scene();
        const sb = mockBuilder();
        const wx = new WeatherSystem(scene, sb, weatherCfg);
        const cam = { position: new THREE.Vector3(0, 120, 0) };

        const sunSamples = [];
        const fogSamples = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            wx.update(0.25, t * 300, 300, cam);
            sunSamples.push(sb.sunLight.intensity);
            fogSamples.push(sb._fogBase);
            assert.ok(sb.sunLight.intensity >= SUN_LIGHT_MIN, `t=${t} sun 低於下限`);
            assert.equal(sb.env.sun_intensity, 0.38);
        }

        // 同進度重複套用不得再往下漂
        const rainSun = sb.sunLight.intensity;
        const rainFog = sb._fogBase;
        for (let i = 0; i < 120; i++) {
            wx.update(0.25, 300, 300, cam);
        }
        assert.equal(sb.sunLight.intensity, rainSun);
        assert.equal(sb._fogBase, rainFog);

        // 雨相終點應比晴天略暗／霧略濃，但不可崩到接近全黑的舊雙重壓暗水位（~0.11）
        assert.ok(sunSamples[0] > sunSamples[sunSamples.length - 1]);
        assert.ok(sunSamples[sunSamples.length - 1] >= 0.2);
        assert.ok(fogSamples[fogSamples.length - 1] <= 0.00068 * WEATHER_FOG_MUL_MAX + 1e-9);
        assert.ok(fogSamples[fogSamples.length - 1] < 0.002);
    });
});
