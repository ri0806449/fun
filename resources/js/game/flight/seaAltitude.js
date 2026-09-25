/**
 * 海面／掠海高度判定（純函式，供 PlayerJet 與單元測試共用）。
 *
 * 街機契約：允許機腹貼近海面平飛；僅當機腹（keel）低於 crash 平面才算撞海。
 * crashAltitude 對的是機腹世界 Y，不是 pivot。
 *
 * @param {number} altitudeY 機體 pivot 世界 Y
 * @param {{
 *   crashAltitude?: number,
 *   sprayAltitude?: number,
 *   keelOffset?: number,
 * }} [opts]
 * @returns {{ waterCrash: boolean, lowAlt: boolean, foam: number, keelY: number }}
 */
export function evaluateSeaAltitude(altitudeY, opts = {}) {
    const crashAltitude = opts.crashAltitude ?? 0;
    const sprayAltitude = opts.sprayAltitude ?? 15;
    const keelOffset = opts.keelOffset ?? 0;
    const y = Number.isFinite(altitudeY) ? altitudeY : 0;
    const keelY = y + keelOffset;

    if (keelY < crashAltitude) {
        return { waterCrash: true, lowAlt: true, foam: 1, keelY };
    }
    if (y < sprayAltitude) {
        const span = Math.max(0.001, sprayAltitude - crashAltitude);
        return {
            waterCrash: false,
            lowAlt: true,
            foam: Math.min(1, Math.max(0, (sprayAltitude - y) / span)),
            keelY,
        };
    }
    return { waterCrash: false, lowAlt: false, foam: 0, keelY };
}
