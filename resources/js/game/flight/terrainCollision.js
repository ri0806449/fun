/**
 * 玩家 vs 地形撞擊（純函式）。
 *
 * 街機契約（貼海優先）：
 * - 預設關閉玩家高度圖撞山（playerTerrainCollision=false）：避免「看海卻撞隱形坡」
 * - 若啟用：離水面尚有 seaVisualClearance 時绝不地形 GAMEOVER；近海坡岸豁免；
 *   其餘以機腹接觸抬升地形為準。
 *
 * @param {number} altitudeY pivot 世界 Y
 * @param {number} terrainHeight 該點高度圖
 * @param {{
 *   playerTerrainCollision?: boolean,
 *   waterLevel?: number,
 *   seaVisualClearance?: number,
 *   waterCollisionCeil?: number,
 *   keelOffset?: number,
 *   contactPad?: number,
 * }} [opts]
 * @returns {{
 *   crash: boolean,
 *   keelY: number,
 *   radarAlt: number,
 *   exemptWater: boolean,
 *   exemptSeaClearance: boolean,
 *   exemptDisabled: boolean,
 * }}
 */
export function evaluateTerrainCrash(altitudeY, terrainHeight, opts = {}) {
    // 預設關閉玩家高度圖撞山；僅當明確 opts.playerTerrainCollision === true 才啟用
    const enabled = opts.playerTerrainCollision === true;
    const waterLevel = opts.waterLevel ?? 0;
    const seaVisualClearance = opts.seaVisualClearance ?? 10;
    const waterCollisionCeil = opts.waterCollisionCeil ?? 40;
    const keelOffset = opts.keelOffset ?? -1.35;
    const contactPad = opts.contactPad ?? 0.35;
    const y = Number.isFinite(altitudeY) ? altitudeY : 0;
    const h = Number.isFinite(terrainHeight) ? terrainHeight : 0;
    const keelY = y + keelOffset;
    const radarAlt = y - h;

    if (!enabled) {
        return {
            crash: false,
            keelY,
            radarAlt,
            exemptWater: true,
            exemptSeaClearance: false,
            exemptDisabled: true,
        };
    }

    // 視覺上離海尚有明顯距離 → 禁止地形誤殺（隱形坡／山脊）
    if (y >= waterLevel + seaVisualClearance) {
        return {
            crash: false,
            keelY,
            radarAlt,
            exemptWater: false,
            exemptSeaClearance: true,
            exemptDisabled: false,
        };
    }

    const exemptWater = h <= waterCollisionCeil;
    if (exemptWater) {
        return {
            crash: false,
            keelY,
            radarAlt,
            exemptWater: true,
            exemptSeaClearance: false,
            exemptDisabled: false,
        };
    }

    return {
        crash: keelY < h + contactPad,
        keelY,
        radarAlt,
        exemptWater: false,
        exemptSeaClearance: false,
        exemptDisabled: false,
    };
}
