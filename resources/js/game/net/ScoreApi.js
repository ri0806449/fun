/**
 * ScoreApi — 排行榜讀寫。
 * 網路失敗一律靜默降級（回傳 null），絕不讓遊戲流程中斷。
 */
export class ScoreApi {
    constructor({ storeUrl = '/api/scores', indexUrl = '/api/scores' } = {}) {
        this.storeUrl = storeUrl;
        this.indexUrl = indexUrl;
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
    }

    get _headers() {
        return {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': this.csrfToken,
        };
    }

    /**
     * 上傳一筆成績。欄位需對齊 StoreScoreRequest。
     * @param {{pilot_name:string,score:number,kills:number,waypoints_cleared:number,wave_reached:number,duration_seconds:number,outcome:string}} payload
     * @returns {Promise<{score:object, rank:number|null}|null>}
     */
    async submit(payload) {
        try {
            const res = await fetch(this.storeUrl, {
                method: 'POST',
                headers: this._headers,
                body: JSON.stringify(payload),
            });
            if (!res.ok) return null;
            const json = await res.json();
            return { score: json.data ?? null, rank: json.rank ?? null };
        } catch {
            return null;
        }
    }

    /**
     * @param {number} limit
     * @returns {Promise<Array<object>|null>}
     */
    async leaderboard(limit = 10) {
        try {
            const res = await fetch(`${this.indexUrl}?limit=${limit}`, {
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            });
            if (!res.ok) return null;
            const json = await res.json();
            return Array.isArray(json.data) ? json.data : null;
        } catch {
            return null;
        }
    }
}
