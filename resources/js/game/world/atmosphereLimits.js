/**
 * 大氣／曝光數值邊界：避免長時間天氣推進或降頻跳幀後
 * turbidity／fog／sun／exposure 漂到洗白或全黑。
 */

export const FOG_DENSITY_MIN = 1e-5;
export const FOG_DENSITY_MAX = 0.0035;
export const FOG_LIGHTNESS_MIN = 0.14;
export const FOG_LIGHTNESS_MAX = 0.34;
export const TURBIDITY_MIN = 1;
export const TURBIDITY_MAX = 14;
export const RAYLEIGH_MIN = 0.2;
export const RAYLEIGH_MAX = 1.2;
export const SUN_INTENSITY_MIN = 0.05;
export const SUN_INTENSITY_MAX = 1.0;
/** DirectionalLight 實際輸出下限（已含仰角／天氣倍率後） */
export const SUN_LIGHT_MIN = 0.18;
export const SUN_LIGHT_MAX = 1.05;
export const AMBIENT_INTENSITY_MIN = 0.12;
export const AMBIENT_INTENSITY_MAX = 0.85;
export const EXPOSURE_MIN = 0.45;
export const EXPOSURE_MAX = 1.2;
export const GRADE_EXPOSURE_MIN = 0.45;
export const GRADE_EXPOSURE_MAX = 1.25;
/** 天氣對日照的額外倍率下限（勿再與仰角係數雙重壓暗） */
export const WEATHER_SUN_DIM_MIN = 0.82;
export const WEATHER_SUN_DIM_MAX = 1.0;
export const WEATHER_FOG_MUL_MAX = 2.0;

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

export function clampWeatherSunDim(v) {
    return clamp(v, WEATHER_SUN_DIM_MIN, WEATHER_SUN_DIM_MAX);
}

export function clampWeatherFogMul(v) {
    return clamp(v, 1, WEATHER_FOG_MUL_MAX);
}

/**
 * 絕對日照強度：基準 × 仰角係數 × 天氣倍率，再夾制。
 * 仰角係數最低約 0.78，避免負仰角時再砍一刀導致「漂暗」。
 * @param {number} baseSun env.sun_intensity（應為晴天基準，勿已含天氣壓暗）
 * @param {number} elevationDeg
 * @param {number} [weatherDim=1]
 */
export function sunLightIntensityFor(baseSun, elevationDeg, weatherDim = 1) {
    const base = clampSunIntensity(baseSun);
    const elev = Number.isFinite(elevationDeg) ? elevationDeg : 0;
    const elev01 = clamp(elev / 45, 0, 1);
    const elevFactor = 0.78 + elev01 * 0.35;
    const dim = clampWeatherSunDim(weatherDim);
    return clamp(base * elevFactor * dim, SUN_LIGHT_MIN, SUN_LIGHT_MAX);
}

/** 高度霧明度：刻意壓在深藍區間，避免洗白；下限略抬避免過早變黑。 */
export function fogLightnessForAltitude(altitude) {
    const alt = Number.isFinite(altitude) ? Math.max(0, altitude) : 0;
    return clamp(0.17 + Math.min(0.15, alt / 900), FOG_LIGHTNESS_MIN, FOG_LIGHTNESS_MAX);
}
