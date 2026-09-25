import { MathUtils } from 'three';

/**
 * MouseAim — 舊版滑鼠虛擬搖桿（已停用）。
 * 飛行改為純鍵盤 + ArcadeAssist 鬆鍵回正；保留此類別供參考，GameCore 不再綁定／驅動飛機。
 * 若日後重開 MouseAim，應與鍵盤指令在死區／權重上協調，避免「越打越歪」。
 */
export class MouseAim {
    constructor({ centerY = 0.42 } = {}) {
        this.nx = 0;
        this.ny = 0;
        this.sx = 0;
        this.sy = 0;
        this.active = false;
        this.centerY = centerY;
        this.sensitivity = 1.15;
        this.smooth = 10;
        this.deadzone = 0.04;
        this.maxCmd = 1;
    }

    setFromClient(clientX, clientY) {
        this.nx = ((clientX / innerWidth) - 0.5) * 2 * this.sensitivity;
        this.ny = ((clientY / innerHeight) - this.centerY) * 2 * this.sensitivity;
        this.nx = MathUtils.clamp(this.nx, -1.35, 1.35);
        this.ny = MathUtils.clamp(this.ny, -1.35, 1.35);
        this.active = true;
    }

    update(dt) {
        const k = 1 - Math.exp(-this.smooth * dt);
        this.sx += (this.nx - this.sx) * k;
        this.sy += (this.ny - this.sy) * k;
    }

    /** 瞄準點相對畫面中立位置的像素偏移，供 HUD 繪製。 */
    screenOffset() {
        return {
            x: (this.sx / this.sensitivity) * 0.5 * innerWidth,
            y: (this.sy / this.sensitivity) * 0.5 * innerHeight,
        };
    }

    /** @returns {{ pitch:number, roll:number }} 正規化操縱指令 */
    commands() {
        let x = this.sx;
        let y = this.sy;
        const mag = Math.hypot(x, y);
        if (mag < this.deadzone) return { pitch: 0, roll: 0 };
        const scale = Math.min(1, (mag - this.deadzone) / (1 - this.deadzone));
        x = (x / mag) * scale;
        y = (y / mag) * scale;
        return {
            roll: MathUtils.clamp(-x * this.maxCmd, -1, 1),
            pitch: MathUtils.clamp(-y * this.maxCmd, -1, 1),
        };
    }

    reset() {
        this.nx = this.ny = this.sx = this.sy = 0;
        this.active = false;
    }
}
