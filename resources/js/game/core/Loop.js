/**
 * 主迴圈：封裝 requestAnimationFrame 與 dt 夾制，遊戲邏輯只收到 (dt, elapsedSeconds)。
 * 過大的 dt spike 會放大物理／相機頓感，故可於飛行中收緊 maxDelta。
 */
export class Loop {
    /**
     * @param {(dt: number, time: number) => void} step
     * @param {{ maxDelta?: number }} [options]
     */
    constructor(step, { maxDelta = 0.05 } = {}) {
        this.step = step;
        this.maxDelta = maxDelta;
        this.running = false;
        this.lastTime = 0;
        this._raf = 0;
        this._tick = this._tick.bind(this);
    }

    /** @param {number} seconds */
    setMaxDelta(seconds) {
        this.maxDelta = Math.max(0.016, seconds);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this._raf = requestAnimationFrame(this._tick);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this._raf);
    }

    _tick(now) {
        if (!this.running) return;
        this._raf = requestAnimationFrame(this._tick);
        const dt = Math.min((now - this.lastTime) / 1000, this.maxDelta);
        this.lastTime = now;
        this.step(dt, now * 0.001);
    }
}
