/**
 * RadioChatter — 僚機／塔台無線電對話（DOM＋AudioManager 濾波／TTS）。
 * 冷卻避免刷屏；台詞依事件池抽取。
 */

const DEFAULT_LINES = Object.freeze({
    takeoff: [
        'Tower: Cleared for departure. Good hunting.',
        'Wing: Wheels up. Stay sharp out there.',
        'Tower: Radar contact clear. You are weapons free.',
    ],
    kill: [
        'Wing: Target destroyed, good job!',
        'Tower: Splash one. Nice shooting.',
        'Wing: Bandit down. Keep the pace.',
    ],
    damage: [
        'Wing: Watch your six, they are on your tail!',
        'Tower: You are taking hits — break left!',
        'Wing: Armor warning. Evade and climb.',
    ],
    time_low: [
        'Tower: Fuel window closing. Finish the route.',
        'Wing: Clock is bleeding. Push for the rings.',
        'Tower: Mission time critical. No sightseeing.',
    ],
    low_alt: [
        'Wing: Dirt nap altitude — you got guts.',
        'Tower: Terrain proximity. Still scoring it.',
    ],
    close_call: [
        'Wing: Close call! That was tight.',
        'Tower: Near miss logged. Adrenaline bonus.',
    ],
    rain: [
        'Tower: Weather front inbound. Expect clutter.',
        'Wing: Rain on the canopy. Trust your instruments.',
    ],
    boss: [
        'Tower: Heavy contact — Flying Fortress ahead!',
        'Wing: Big bird on scope. Hit the hardpoints.',
    ],
});

export class RadioChatter {
    /**
     * @param {object} cfg config.radio
     * @param {{ show?: Function, hide?: Function, speak?: Function }} io
     */
    constructor(cfg = {}, io = {}) {
        this.cfg = cfg;
        this.io = io;
        this.enabled = cfg.enabled !== false;
        this.cooldown = 0;
        this._timeLowSent = false;
        this._rainSent = false;
        this._lowAltSent = false;
        this.lines = { ...DEFAULT_LINES, ...(cfg.lines || {}) };
    }

    reset() {
        this.cooldown = 0;
        this._timeLowSent = false;
        this._rainSent = false;
        this._lowAltSent = false;
        this.io.hide?.();
    }

    /** @param {number} dt */
    update(dt) {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    }

    /**
     * @param {string} event
     * @param {{ force?: boolean }} [opts]
     */
    trigger(event, opts = {}) {
        if (!this.enabled) return false;
        if (!opts.force && this.cooldown > 0) return false;
        const pool = this.lines[event];
        if (!pool?.length) return false;
        const line = pool[Math.floor(Math.random() * pool.length)];
        const callsign = this.cfg.callsign ?? 'COM';
        this.io.show?.(callsign, line);
        this.io.speak?.(line);
        this.cooldown = this.cfg.cooldown ?? 6.5;
        return true;
    }

    noteTime(missionTimeLeft) {
        const thresh = this.cfg.time_low_seconds ?? 60;
        if (!this._timeLowSent && missionTimeLeft <= thresh && missionTimeLeft > 0) {
            this._timeLowSent = true;
            this.trigger('time_low', { force: true });
        }
    }

    noteRainStart() {
        if (this._rainSent) return;
        this._rainSent = true;
        this.trigger('rain');
    }

    noteLowAlt() {
        if (this._lowAltSent) return;
        this._lowAltSent = true;
        this.trigger('low_alt');
    }
}
