/** 以固定速率 r 逼近目標值。 */
export function approach(current, target, rate, dt) {
    const delta = target - current;
    const step = rate * dt;
    return Math.abs(delta) <= step ? target : current + Math.sign(delta) * step;
}

export function formatTime(seconds) {
    const s = Math.max(0, seconds);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
}
