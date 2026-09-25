import { MathUtils } from 'three';

/**
 * ArcadeAssist — 街機鬆鍵回正（純函式）。
 *
 * 對齊 War Thunder 街機／MouseAim 手感：
 * - 滾轉：無指令時以滾轉角回平（auto-level），大傾角加強、空速略加權
 * - 俯仰：無指令時適度朝水平回中（可爬升，勿鎖死）
 * - 方向舵：無指令時目標率為 0；呼叫端可用較快 release lerp
 *
 * 不依賴場景、PlayerJet 或產品特例；各軸指令由呼叫端正規化到 [-1,1]。
 */

/**
 * @typedef {object} ArcadeAssistConfig
 * @property {boolean} [enabled]
 * @property {number} roll_deadzone
 * @property {number} pitch_deadzone
 * @property {number} yaw_deadzone
 * @property {number} roll_level_rate
 * @property {number} roll_level_excess_rad
 * @property {number} roll_level_excess_mul
 * @property {number} roll_level_speed_mul
 * @property {number} roll_snap_rad
 * @property {number} pitch_level_rate
 * @property {number} pitch_level_cap
 * @property {number} release_lerp_mul
 */

/**
 * @param {object} args
 * @param {number} args.pitchCmd
 * @param {number} args.rollCmd
 * @param {number} args.yawCmd
 * @param {number} args.bank          滾轉角（rad，右翼下為正慣例與此專案 getRollAmount 一致）
 * @param {number} args.nosePitch     機頭俯仰（rad，抬頭為正）
 * @param {number} args.airspeedNorm  空速正規化（約 0～1.2）
 * @param {number} args.maxPitch
 * @param {number} args.maxRoll
 * @param {number} args.maxYaw
 * @param {ArcadeAssistConfig} args.assist
 * @returns {{
 *   pitchTarget: number,
 *   rollTarget: number,
 *   yawTarget: number,
 *   pitchLerpMul: number,
 *   rollLerpMul: number,
 *   yawLerpMul: number,
 *   rollActive: boolean,
 *   pitchActive: boolean,
 *   yawActive: boolean,
 * }}
 */
export function computeArcadeRateTargets({
    pitchCmd = 0,
    rollCmd = 0,
    yawCmd = 0,
    bank = 0,
    nosePitch = 0,
    airspeedNorm = 1,
    maxPitch = 1.05,
    maxRoll = 1.85,
    maxYaw = 0.42,
    assist = {},
}) {
    const enabled = assist.enabled !== false;
    const rollDz = assist.roll_deadzone ?? 0.02;
    const pitchDz = assist.pitch_deadzone ?? 0.02;
    const yawDz = assist.yaw_deadzone ?? 0.02;
    const releaseMul = assist.release_lerp_mul ?? 1.35;

    const rollActive = Math.abs(rollCmd) > rollDz;
    const pitchActive = Math.abs(pitchCmd) > pitchDz;
    const yawActive = Math.abs(yawCmd) > yawDz;

    let pitchTarget = pitchCmd * maxPitch;
    let rollTarget = rollCmd * maxRoll;
    let yawTarget = yawCmd * maxYaw;

    if (enabled && !rollActive) {
        const snap = assist.roll_snap_rad ?? 0.025;
        if (Math.abs(bank) <= snap) {
            rollTarget = 0;
        } else {
            let strength = assist.roll_level_rate ?? 2.6;
            const excessRad = assist.roll_level_excess_rad ?? 0.7;
            const excessMul = assist.roll_level_excess_mul ?? 1.4;
            const speedMul = assist.roll_level_speed_mul ?? 0.35;
            const absBank = Math.abs(bank);
            if (absBank > excessRad) {
                strength *= 1 + (absBank - excessRad) * excessMul;
            }
            strength *= 1 + MathUtils.clamp(airspeedNorm, 0, 1.2) * speedMul;
            // KeyA → +rollRate → +bank；回正目標率與 bank 反向
            rollTarget = MathUtils.clamp(-bank * strength, -maxRoll, maxRoll);
        }
    }

    if (enabled && !pitchActive) {
        const rate = assist.pitch_level_rate ?? 0.48;
        const capFrac = assist.pitch_level_cap ?? 0.32;
        const cap = maxPitch * capFrac;
        pitchTarget = MathUtils.clamp(-nosePitch * rate, -cap, cap);
    }

    if (!yawActive) {
        yawTarget = 0;
    }

    return {
        pitchTarget,
        rollTarget,
        yawTarget,
        pitchLerpMul: pitchActive ? 1 : releaseMul,
        rollLerpMul: rollActive ? 1 : releaseMul,
        yawLerpMul: yawActive ? 1 : releaseMul,
        rollActive,
        pitchActive,
        yawActive,
    };
}
