/**
 * 大氣／曝光數值邊界：避免長時間天氣推進或降頻跳幀後
 * turbidity／fog／sun／exposure 漂到洗白或全黑。
 */

export const FOG_DENSITY_MIN = 1e-5;
export const FOG_DENSITY_MAX = 0.0035;
export const FOG_LIGHTNESS_MIN = 0.12;
export const FOG_LIGHTNESS_MAX = 0.32;
export const TURBIDITY_MIN = 1;
export const TURBIDITY_MAX = 14;
export const RAYLEIGH_MIN = 0.2;
export const RAYLEIGH_MAX = 1.2;
export const SUN_INTENSITY_MIN = 0.05;
export const SUN_INTENSITY_MAX = 1.0;
export const AMBIENT_INTENSITY_MIN = 0.05;
export const AMBIENT_INTENSITY_MAX = 0.85;
export const EXPOSURE_MIN = 0.35;
export const EXPOSURE_MAX = 1.2;
export const GRADE_EXPOSURE_MIN = 0.35;
export const GRADE_EXPOSURE_MAX = 1.25;

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
}

export function clampFogDensity(v) {
    return clamp(v, FOG_DENSITY_MIN, FOG_DENSITY_MAX);
}

export function clampTurbidity(v) {
    return clamp(v, TURBIDITY_MIN, TURBIDITY_MAX);
}

export function clampRayleigh(v) {
    return clamp(v, RAYLEIGH_MIN, RAYLEIGH_MAX);
}

export function clampSunIntensity(v) {
    return clamp(v, SUN_INTENSITY_MIN, SUN_INTENSITY_MAX);
}

export function clampAmbientIntensity(v) {
    return clamp(v, AMBIENT_INTENSITY_MIN, AMBIENT_INTENSITY_MAX);
}

export function clampToneMappingExposure(v) {
    return clamp(v, EXPOSURE_MIN, EXPOSURE_MAX);
}

export function clampGradeExposure(v) {
    return clamp(v, GRADE_EXPOSURE_MIN, GRADE_EXPOSURE_MAX);
}

/** 高度霧明度：刻意壓在深藍區間，避免洗白。 */
export function fogLightnessForAltitude(altitude) {
    const alt = Number.isFinite(altitude) ? Math.max(0, altitude) : 0;
    return clamp(0.16 + Math.min(0.14, alt / 900), FOG_LIGHTNESS_MIN, FOG_LIGHTNESS_MAX);
}
