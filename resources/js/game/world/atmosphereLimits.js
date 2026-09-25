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
/**
 * ACES Filmic 目標曝光約 1.2；上限留餘裕避免天氣／grade 再推高時被硬夾回洗白前一刻。
 * 真正防洗白仍靠 fog／sun／bloom threshold／此夾制分層，而非把目標壓暗。
 */
export const EXPOSURE_MAX = 1.45;
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

/**
 * Sky.js 為單位 BoxGeometry 再 scale；半邊長 = scale/2。
 * 天穹若釘在原點，直飛超過此距離會穿出盒子 → 背景清／黑破圖。
 * @param {number} skyScale
 */
export function skyHalfExtent(skyScale) {
    const s = Number(skyScale);
    return Math.max(1, Number.isFinite(s) ? s : 4500) * 0.5;
}

/**
 * 相機 far 必須大於天穹半邊長，否則跟隨相機後仍會裁掉天空盒面。
 * @param {number} skyScale
 * @param {number} [margin=1.35]
 */
export function cameraFarForSky(skyScale, margin = 1.35) {
    const m = Number.isFinite(margin) && margin > 1 ? margin : 1.35;
    return Math.ceil(skyHalfExtent(skyScale) * 2 * m);
}

/**
 * 每幀把天穹中心鎖在相機上，避免長距離直飛穿出 Sky box。
 * @param {import('three').Object3D|null|undefined} sky
 * @param {{ position: { x:number, y:number, z:number } }|null|undefined} camera
 */
export function syncSkyDomeToCamera(sky, camera) {
    if (!sky || !camera?.position) return false;
    const p = camera.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    sky.position.x = p.x;
    sky.position.y = p.y;
    sky.position.z = p.z;
    sky.frustumCulled = false;
    return true;
}
