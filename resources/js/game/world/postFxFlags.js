/**
 * PostFx 品質／飛行降載旗標解析（純邏輯，可在 Node 測試）。
 * 明確 visual.*_enabled 覆寫品質檔預設；飛行中再套用 performance.flight_*。
 */

/** @typedef {'low'|'medium'|'high'} PostFxQuality */

/**
 * @type {Record<PostFxQuality, {
 *   ssao: boolean,
 *   dof: boolean,
 *   heat: boolean,
 *   ssaoKernelSize: number,
 *   dofAperture: number,
 *   dofMaxBlur: number,
 * }>}
 */
export const QUALITY_PRESETS = {
    low: {
        ssao: false,
        dof: false,
        heat: false,
        ssaoKernelSize: 16,
        dofAperture: 0.00008,
        dofMaxBlur: 0.0025,
    },
    medium: {
        ssao: false,
        dof: false,
        heat: false,
        ssaoKernelSize: 16,
        dofAperture: 0.00012,
        dofMaxBlur: 0.0035,
    },
    high: {
        ssao: true,
        dof: true,
        // HeatShimmer blit 需顯式 heat_haze_enabled（部分 WebGL 初編譯會整屏黑）
        heat: false,
        ssaoKernelSize: 32,
        dofAperture: 0.00018,
        dofMaxBlur: 0.0055,
    },
};

/**
 * @param {string|undefined} raw
 * @returns {PostFxQuality}
 */
export function normalizeQuality(raw) {
    if (raw === 'low' || raw === 'high' || raw === 'medium') {
        return raw;
    }
    return 'medium';
}

/**
 * @param {object} [visual]
 * @param {object} [performance]
 * @param {{ flying?: boolean }} [ctx]
 */
export function resolvePostFxFlags(visual = {}, performance = {}, ctx = {}) {
    const quality = normalizeQuality(visual.quality);
    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.medium;
    const flying = !!ctx.flying;

    const pickBool = (raw, fallback) => {
        if (raw === true || raw === false) return raw;
        return fallback;
    };

    let ssao = pickBool(visual.ssao_enabled, preset.ssao);
    let dof = pickBool(visual.dof_enabled, preset.dof);
    let heat = pickBool(visual.heat_haze_enabled, preset.heat);

    if (flying) {
        if (performance.flight_ssao === false) {
            ssao = false;
        }
        if (performance.flight_dof === false) {
            dof = false;
        }
        if (performance.flight_heat_shimmer === false) {
            heat = false;
        }
    }

    const strideRaw = flying
        ? (performance.flight_postfx_stride ?? 1)
        : 1;
    const stride = Math.max(1, strideRaw | 0);

    return {
        quality,
        composerEnabled: visual.composer_enabled !== false,
        ssao,
        dof,
        heat,
        ssaoKernelSize: Math.max(
            8,
            (visual.ssao_kernel_size ?? preset.ssaoKernelSize) | 0
        ),
        ssaoKernelRadius: visual.ssao_kernel_radius ?? 8,
        ssaoMinDistance: visual.ssao_min_distance ?? 0.004,
        ssaoMaxDistance: visual.ssao_max_distance ?? 0.12,
        dofAperture: visual.dof_aperture ?? preset.dofAperture,
        dofMaxBlur: visual.dof_maxblur ?? preset.dofMaxBlur,
        heatIntensity: visual.heat_haze_intensity ?? 1,
        heatMaxSources: Math.min(8, Math.max(1, (visual.heat_haze_max_sources ?? 8) | 0)),
        /** 飛行中 SSAO／DoF 每 N 幀計算一次（1=每幀） */
        postFxStride: stride,
    };
}
