import * as THREE from 'three';
import {
    clampAmbientIntensity,
    clampFogDensity,
    clampRayleigh,
    clampSunIntensity,
    clampTurbidity,
    TURBIDITY_MAX,
} from './atmosphereLimits.js';

/** 雨天 turbidity 上限（Preetham 過高易乳白白） */
const TURBIDITY_RAIN_CAP = TURBIDITY_MAX;

/**
 * WeatherSystem — 任務時間推進：晴 → 黃昏 → 雨。
 * 所有天空／霧／光強度以基準值絕對插值並夾制，避免長時間累積洗白。
 */
export class WeatherSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {object} sceneBuilder SceneBuilder
     * @param {object} cfg config.weather
     */
    constructor(scene, sceneBuilder, cfg = {}) {
        this.scene = scene;
        this.sceneBuilder = sceneBuilder;
        this.cfg = cfg;
        this.enabled = cfg.enabled !== false;
        this.phase = 'clear';
        this.progress = 0;
        this.rainIntensity = 0;
        this.glitchT = 0;
        this._glitchAcc = 0;
        this._rain = null;
        this._rainGeo = null;
        this._rainMat = null;
        this._rainStrideCursor = 0;
        this._skyDirty = true;
        this._lastDusk = -1;
        this._lastRain = -1;
        this._baseElev = sceneBuilder?.env?.sky_elevation ?? 3.2;
        this._baseFog = clampFogDensity(sceneBuilder?._fogBase ?? 0.00068);
        this._baseSun = clampSunIntensity(sceneBuilder?.env?.sun_intensity ?? 0.38);
        this._baseAmb = clampAmbientIntensity(sceneBuilder?.env?.ambient_intensity ?? 0.28);
        if (this.enabled) this._buildRain();
    }

    _buildRain() {
        const count = this.cfg.rain_particles ?? 480;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 80;
            positions[i * 3 + 1] = Math.random() * 40;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
        this._rainGeo = new THREE.BufferGeometry();
        this._rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        // NormalBlending：Additive 在雨相後期會把整屏洗白
        this._rainMat = new THREE.PointsMaterial({
            color: 0xa8c8e8,
            size: 0.35,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });
        this._rain = new THREE.Points(this._rainGeo, this._rainMat);
        this._rain.frustumCulled = false;
        this._rain.visible = false;
        this.scene.add(this._rain);
    }

    reset() {
        this.phase = 'clear';
        this.progress = 0;
        this.rainIntensity = 0;
        this.glitchT = 0;
        this._glitchAcc = 0;
        this._lastDusk = -1;
        this._lastRain = -1;
        this._skyDirty = true;
        this._applySky(0, 0);
        if (this._rainMat) this._rainMat.opacity = 0;
        if (this._rain) this._rain.visible = false;
    }

    /**
     * @param {number} dt
     * @param {number} elapsed
     * @param {number} timeLimit
     * @param {THREE.Camera} camera
     */
    update(dt, elapsed, timeLimit, camera) {
        if (!this.enabled) {
            return { phase: 'clear', rainIntensity: 0, radarGlitch: false, phaseChanged: false };
        }

        const limit = Math.max(1, timeLimit || 300);
        this.progress = THREE.MathUtils.clamp(elapsed / limit, 0, 1);

        const duskAt = this.cfg.dusk_at ?? 0.35;
        const rainAt = this.cfg.rain_at ?? 0.62;

        let next = 'clear';
        if (this.progress >= rainAt) next = 'rain';
        else if (this.progress >= duskAt) next = 'dusk';

        const phaseChanged = next !== this.phase;
        this.phase = next;

        let duskBlend = 0;
        let rainBlend = 0;
        if (this.progress >= duskAt) {
            duskBlend = THREE.MathUtils.clamp(
                (this.progress - duskAt) / Math.max(0.05, rainAt - duskAt),
                0,
                1
            );
        }
        if (this.progress >= rainAt) {
            rainBlend = THREE.MathUtils.clamp((this.progress - rainAt) / 0.18, 0, 1);
        }
        this.rainIntensity = rainBlend;

        // Sky／fog／燈光變動緩慢，由外部以 weather_hz 降頻呼叫 forceSky 或內部偵測顯著變化
        const duskDelta = Math.abs(duskBlend - this._lastDusk);
        const rainDelta = Math.abs(rainBlend - this._lastRain);
        if (this._skyDirty || duskDelta > 0.02 || rainDelta > 0.02 || phaseChanged) {
            this._applySky(duskBlend, rainBlend);
            this._lastDusk = duskBlend;
            this._lastRain = rainBlend;
            this._skyDirty = false;
        }
        this._updateRain(dt, camera, rainBlend);

        let radarGlitch = false;
        if (rainBlend > 0.2) {
            this._glitchAcc += dt;
            const interval = this.cfg.radar_glitch_interval ?? 7.5;
            if (this._glitchAcc >= interval) {
                this._glitchAcc = 0;
                this.glitchT = this.cfg.radar_glitch_duration ?? 0.55;
            }
        }
        if (this.glitchT > 0) {
            this.glitchT = Math.max(0, this.glitchT - dt);
            radarGlitch = true;
        }

        return { phase: this.phase, rainIntensity: rainBlend, radarGlitch, phaseChanged };
    }

    _applySky(duskBlend, rainBlend) {
        const sb = this.sceneBuilder;
        if (!sb?.env) return;

        const d = THREE.MathUtils.clamp(duskBlend, 0, 1);
        const r = THREE.MathUtils.clamp(rainBlend, 0, 1);

        const elevClear = this.cfg.elevation_clear ?? this._baseElev;
        const elevDusk = this.cfg.elevation_dusk ?? -2.5;
        const elevRain = this.cfg.elevation_rain ?? -6;
        const elev = d < 1
            ? THREE.MathUtils.lerp(elevClear, elevDusk, d)
            : THREE.MathUtils.lerp(elevDusk, elevRain, r);

        sb.env.sky_elevation = elev;
        sb.env.sky_turbidity = clampTurbidity(THREE.MathUtils.lerp(
            this.cfg.turbidity_clear ?? 10,
            Math.min(TURBIDITY_RAIN_CAP, this.cfg.turbidity_rain ?? 14),
            Math.max(d * 0.5, r)
        ));
        sb.env.sky_rayleigh = clampRayleigh(THREE.MathUtils.lerp(0.72, 0.95, d));
        sb.env.sun_intensity = clampSunIntensity(this._baseSun * THREE.MathUtils.lerp(
            1,
            0.45,
            Math.max(d, r * 0.8)
        ));
        sb.env.ambient_intensity = clampAmbientIntensity(
            this._baseAmb * THREE.MathUtils.lerp(1, 0.7, d)
        );

        const fogMul = Math.min(2.6, Math.max(1, this.cfg.fog_mul_rain ?? 2.4));
        const fogTarget = clampFogDensity(this._baseFog * THREE.MathUtils.lerp(1, fogMul, r));
        // 強制同步高度霧：降頻路徑不會因高度沒變而漏掉雨霧加濃
        if (typeof sb.setFogBase === 'function') {
            sb.setFogBase(fogTarget);
        } else {
            sb._fogBase = fogTarget;
            sb._applyHeightFog?.(sb._lastFogAlt || 120, true);
        }

        sb._applySkyUniforms?.();
        sb._updateSunPosition?.();

        if (sb.sunLight) {
            const warm = d * (1 - r * 0.5);
            // 絕對 setHSL（非 offset），避免色溫累積變白
            sb.sunLight.color.setHSL(0.07 + warm * 0.02, 0.45 + warm * 0.25, 0.78 - r * 0.15);
        }
    }

    _updateRain(dt, camera, intensity) {
        if (!this._rain || !camera) return;
        this._rain.visible = intensity > 0.05;
        if (this._rainMat) this._rainMat.opacity = Math.min(0.5, intensity * 0.42);
        if (intensity < 0.05) return;

        this._rain.position.copy(camera.position);
        const pos = this._rainGeo.attributes.position;
        const arr = pos.array;
        const stride = Math.max(1, this.cfg.rain_update_stride ?? 2);
        const fall = (this.cfg.rain_speed ?? 42) * dt * stride * (0.7 + intensity);
        const start = this._rainStrideCursor % stride;
        this._rainStrideCursor = (this._rainStrideCursor + 1) % stride;
        for (let i = start * 3; i < arr.length; i += 3 * stride) {
            arr[i + 1] -= fall * (0.7 + (i % 7) * 0.08);
            if (arr[i + 1] < -5) {
                arr[i] = (Math.random() - 0.5) * 80;
                arr[i + 1] = 25 + Math.random() * 20;
                arr[i + 2] = (Math.random() - 0.5) * 80;
            }
        }
        pos.needsUpdate = true;
    }

    dispose() {
        if (this._rain) {
            this.scene.remove(this._rain);
            this._rainGeo?.dispose();
            this._rainMat?.dispose();
            this._rain = null;
        }
    }
}
