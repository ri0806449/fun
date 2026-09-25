import { GameState } from '../core/GameState.js';
import { formatTime } from '../utils/math.js';

const q = (id) => document.getElementById(id);

/**
 * Hud — 遊戲唯一的 DOM 呈現層。
 * 其他模組（WeaponSystem／LockOn…）保持純邏輯，狀態由 GameCore 推進這裡。
 */
export class Hud {
    /**
     * @param {object} config 完整設定
     * @param {{
     *   onStart?:Function,onRestart?:Function,onResume?:Function,onToggleMute?:Function,
     *   onOpenHangar?:Function,onCloseHangar?:Function,onBuyUpgrade?:Function,
     *   onPickPerk?:Function,onEndHangar?:Function
     * }} handlers
     */
    constructor(config, handlers = {}) {
        this.config = config;
        this.handlers = handlers;

        this.el = {
            loading: q('loading'),
            pilotName: q('pilot-name'),
            startBtn: q('btn-start'),
            hangarBtn: q('btn-hangar'),
            hangarPanel: q('hangar-panel'),
            hangarScrap: q('hangar-scrap'),
            hangarUpgrades: q('hangar-upgrades'),
            hangarAchievements: q('hangar-achievements'),
            hangarBack: q('btn-hangar-back'),
            menuScrap: q('menu-scrap'),
            levelupPanel: q('levelup-panel'),
            levelupChoices: q('levelup-choices'),
            achToast: q('ach-toast'),
            scrapUi: q('scrap-ui'),
            score: q('score'),
            scoreFloat: q('score-float'),
            timer: q('timer'),
            hpFill: q('hp-fill'),
            shieldFill: q('shield-fill'),
            bars: q('bars'),
            routeDots: q('route-dots'),
            routeCount: q('route-count'),
            routeHint: q('route-hint'),
            spdChip: q('spd-chip'),
            spd: q('spd-ui'),
            alt: q('alt-ui'),
            radAlt: q('rad-alt-ui'),
            gpws: q('gpws-alert'),
            dist: q('dist'),
            compassArrow: q('compass-arrow'),
            lockCircle: q('lock-circle'),
            lockStatus: q('lock-status'),
            weaponLabel: q('weapon-label'),
            boostCd: q('boost-cd'),
            ammo: q('ammo'),
            missileCd: q('missile-cd'),
            heatBar: q('heat-bar'),
            heatFill: q('heat-fill'),
            gunAbility: q('gun-ability'),
            muteBtn: q('mute-btn'),
            msg: q('msg'),
            waveToast: q('wave-toast'),
            bossWarning: q('boss-warning'),
            damageFlash: q('damage-flash'),
            fxOverlay: q('fx-overlay'),
            speedLines: q('speed-lines'),
            cloudDrops: q('cloud-drops'),
            pausePanel: q('pause-panel'),
            endPanel: q('end-panel'),
            endTitle: q('end-title'),
            endScore: q('end-score'),
            endKills: q('end-kills'),
            endTime: q('end-time'),
            endWave: q('end-wave'),
            endRank: q('end-rank'),
            leaderboard: q('leaderboard-rows'),
            worldHud: q('world-hud'),
            radarCanvas: q('radar-canvas'),
            radioBox: q('radio-box'),
            radioCall: q('radio-call'),
            radioText: q('radio-text'),
            stuntBanner: q('stunt-banner'),
            rainOverlay: q('rain-overlay'),
            radarGlitch: q('radar-glitch'),
        };

        this._waveToastTimer = 0;
        this._scorePopTimer = 0;
        this._damageTimer = 0;
        this._achToastTimer = 0;
        this._radioTimer = 0;
        this._bindControls();
        this.renderRoute(0, config.mission.waypoint_count, true);
    }

    _bindControls() {
        const {
            onStart, onRestart, onResume, onToggleMute,
            onOpenHangar, onCloseHangar, onEndHangar,
        } = this.handlers;

        // 委派＋直接綁定雙保險，避免單一 listener 漏綁或被覆蓋
        const bindClick = (el, fn) => {
            if (!el || typeof fn !== 'function') return;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (el.disabled) return;
                fn();
            });
        };

        bindClick(this.el.startBtn, onStart);
        bindClick(this.el.hangarBtn, onOpenHangar);
        bindClick(this.el.hangarBack, onCloseHangar);
        bindClick(q('btn-end-hangar'), onEndHangar);

        this.el.pilotName?.addEventListener('click', (e) => e.stopPropagation());
        this.el.pilotName?.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !this.el.startBtn?.disabled) onStart?.();
        });

        this.el.muteBtn?.addEventListener('click', () => onToggleMute?.());
        bindClick(q('btn-restart'), onRestart);
        bindClick(q('btn-pause-restart'), onRestart);
        bindClick(q('btn-resume'), onResume);
    }

    /** GameCore 完成初始化後呼叫：解鎖選單按鈕。 */
    markReady() {
        for (const btn of [this.el.startBtn, this.el.hangarBtn]) {
            if (!btn) continue;
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
        }
        const status = q('menu-boot-status');
        if (status) status.hidden = true;
        const err = q('menu-boot-error');
        if (err) err.hidden = true;
        const reload = q('btn-boot-reload');
        if (reload) reload.hidden = true;
        const external = q('btn-boot-external');
        if (external) external.hidden = true;
    }

    /** boot 失敗時顯示錯誤，按鈕維持 disabled。 */
    markBootError(message) {
        const status = q('menu-boot-status');
        if (status) status.hidden = true;
        const err = q('menu-boot-error');
        if (err) {
            err.hidden = false;
            err.textContent = message || '遊戲引擎啟動失敗，請重新整理。';
        }
        const reload = q('btn-boot-reload');
        if (reload) {
            reload.hidden = false;
            reload.onclick = () => location.reload();
        }
        const external = q('btn-boot-external');
        if (external) {
            const playUrl = `${location.protocol}//127.0.0.1:8088/`;
            external.hidden = false;
            external.dataset.url = playUrl;
            external.textContent = `用系統瀏覽器開啟 ${playUrl}`;
            external.onclick = async (e) => {
                e.preventDefault();
                try {
                    await navigator.clipboard?.writeText?.(playUrl);
                } catch {
                    // ignore
                }
                window.open(playUrl, '_blank', 'noopener,noreferrer');
            };
        }
        for (const btn of [this.el.startBtn, this.el.hangarBtn]) {
            if (!btn) continue;
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
        }
    }

    get pilotName() {
        const raw = (this.el.pilotName?.value ?? '').trim();
        return (raw || 'PILOT').slice(0, 32);
    }

    hideLoading() {
        const loading = this.el.loading;
        if (!loading) return;
        loading.style.opacity = '0';
        setTimeout(() => loading.remove(), 500);
        this.el.loading = null;
    }

    // —— 狀態面板 ——

    applyState(state) {
        this.el.pausePanel?.classList.toggle('show', state === GameState.PAUSED);
        this.el.endPanel?.classList.toggle('show', state === GameState.GAMEOVER);
        this.el.levelupPanel?.classList.toggle('show', state === GameState.LEVEL_UP);
        this.el.hangarPanel?.classList.toggle('show', state === GameState.HANGAR);
        const interactive = state !== GameState.PLAYING;
        document.body.style.cursor = state === GameState.PLAYING ? 'crosshair' : 'default';
        if (state === GameState.PLAYING && this.el.msg) this.el.msg.style.display = 'none';
        void interactive;
    }

    showEnd({ title, score, kills, elapsed, wave }) {
        if (this.el.msg) this.el.msg.style.display = 'none';
        if (this.el.endTitle) this.el.endTitle.textContent = title;
        if (this.el.endScore) this.el.endScore.textContent = String(score);
        if (this.el.endKills) this.el.endKills.textContent = String(kills);
        if (this.el.endTime) this.el.endTime.textContent = formatTime(elapsed);
        if (this.el.endWave) this.el.endWave.textContent = String(wave);
        this.setRank(null);
    }

    setRank(rank) {
        if (!this.el.endRank) return;
        if (rank == null) {
            this.el.endRank.textContent = '';
            this.el.endRank.classList.remove('show');
            return;
        }
        this.el.endRank.textContent = `RANK #${rank}`;
        this.el.endRank.classList.add('show');
    }

    /** @param {Array<{pilot_name:string,score:number,kills:number}>} rows */
    renderLeaderboard(rows) {
        const host = this.el.leaderboard;
        if (!host || !Array.isArray(rows)) return;
        host.innerHTML = '';
        rows.slice(0, 10).forEach((row, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="lb-rank">${i + 1}</span>`
                + `<span class="lb-name"></span>`
                + `<span class="lb-score">${Number(row.score) || 0}</span>`;
            li.querySelector('.lb-name').textContent = row.pilot_name ?? 'PILOT';
            host.appendChild(li);
        });
    }

    // —— 機庫／Level-up ——

    /** @param {number} scrap */
    setScrap(scrap) {
        if (this.el.scrapUi) this.el.scrapUi.textContent = String(scrap);
        if (this.el.hangarScrap) this.el.hangarScrap.textContent = String(scrap);
        if (this.el.menuScrap) {
            this.el.menuScrap.innerHTML = `SCRAP <b>${scrap}</b>`;
        }
    }

    /**
     * @param {import('../meta/MetaStore.js').MetaStore} store
     */
    renderHangar(store) {
        const upHost = this.el.hangarUpgrades;
        const achHost = this.el.hangarAchievements;
        if (!upHost || !achHost) return;

        this.setScrap(store.scrap);
        upHost.innerHTML = '';
        const upgrades = this.config.meta?.upgrades ?? {};
        for (const [id, def] of Object.entries(upgrades)) {
            const level = store.upgradeLevel(id);
            const max = def.max_level ?? 5;
            const cost = store.upgradeCost(id);
            const row = document.createElement('div');
            row.className = 'hangar-row';
            const maxed = level >= max;
            row.innerHTML = `
                <div class="info">
                    <div class="title">${def.name_zh || def.name}</div>
                    <div class="desc">${def.name} · Lv ${level}/${max}</div>
                </div>
                <div class="meta">${maxed ? 'MAX' : `${cost} SCRAP`}</div>
            `;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = maxed ? 'MAX' : 'UPGRADE';
            btn.disabled = maxed || !store.canUpgrade(id);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handlers.onBuyUpgrade?.(id);
            });
            row.appendChild(btn);
            upHost.appendChild(row);
        }

        achHost.innerHTML = '';
        const ach = this.config.achievements ?? {};
        for (const [id, def] of Object.entries(ach)) {
            const unlocked = store.hasAchievement(id);
            const row = document.createElement('div');
            row.className = `hangar-row ${unlocked ? 'unlocked' : 'locked'}`;
            row.innerHTML = `
                <div class="info">
                    <div class="title">${def.name_zh || def.name}</div>
                    <div class="desc">${def.desc || ''}</div>
                </div>
                <div class="meta">${unlocked ? '✓' : `+${def.reward_scrap ?? 0}`}</div>
            `;
            achHost.appendChild(row);
        }
    }

    /**
     * @param {{ id: string, def: object }[]} choices
     */
    showLevelUp(choices) {
        const host = this.el.levelupChoices;
        if (!host) return;
        host.innerHTML = '';
        for (const { id, def } of choices) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'perk-card';
            card.innerHTML = `
                <div class="perk-name">${def.name ?? id}</div>
                <div class="perk-zh">${def.name_zh ?? ''}</div>
                <div class="perk-desc">${def.desc ?? ''}</div>
            `;
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handlers.onPickPerk?.(id);
            });
            host.appendChild(card);
        }
    }

    /**
     * @param {string} title
     * @param {number} reward
     */
    showAchievementToast(title, reward) {
        const el = this.el.achToast;
        if (!el) return;
        el.textContent = `ACHIEVEMENT · ${title}` + (reward > 0 ? ` · +${reward} SCRAP` : '');
        el.classList.add('show');
        clearTimeout(this._achToastTimer);
        this._achToastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    // —— 即時數值 ——

    setScore(score) {
        if (this.el.score) this.el.score.textContent = String(score);
    }

    popScore(delta) {
        const el = this.el.score;
        const fl = this.el.scoreFloat;
        if (el) {
            el.classList.remove('pop');
            void el.offsetWidth;
            el.classList.add('pop');
            clearTimeout(this._scorePopTimer);
            this._scorePopTimer = setTimeout(() => el.classList.remove('pop'), 180);
        }
        if (fl) {
            fl.textContent = `+${delta}`;
            fl.classList.remove('show');
            void fl.offsetWidth;
            fl.classList.add('show');
        }
    }

    setTimer(seconds) {
        if (this.el.timer) this.el.timer.textContent = formatTime(seconds);
    }

    /**
     * @param {number} hpPercent
     * @param {number} shieldPercent 0–100；無護盾時傳 0
     * @param {{ combatBuff?: boolean }} [opts]
     */
    setBars(hpPercent, shieldPercent, opts = {}) {
        if (this.el.hpFill) this.el.hpFill.style.width = `${Math.max(0, hpPercent)}%`;
        if (this.el.shieldFill) this.el.shieldFill.style.width = `${Math.max(0, shieldPercent)}%`;
        this.el.bars?.classList.toggle('shield-low', shieldPercent < 1);
        this.el.bars?.classList.toggle('buff-hot', !!opts.combatBuff);
    }

    setTelemetry(airspeed, altitude, hot, radarAlt = null) {
        if (this.el.spd) this.el.spd.textContent = String(Math.floor(airspeed * 3.6));
        if (this.el.alt) this.el.alt.textContent = String(Math.floor(altitude * 14));
        if (this.el.radAlt && radarAlt != null) {
            this.el.radAlt.textContent = String(Math.max(0, Math.floor(radarAlt)));
            this.el.radAlt.parentElement?.classList.toggle('warn', radarAlt < 80);
            this.el.radAlt.parentElement?.classList.toggle('danger', radarAlt < 50);
        }
        this.el.spdChip?.classList.toggle('hot', hot);
    }


    showRadio(callsign, line) {
        const box = this.el.radioBox;
        if (!box) return;
        if (this.el.radioCall) this.el.radioCall.textContent = callsign || 'COM';
        if (this.el.radioText) this.el.radioText.textContent = line || '';
        box.classList.add('show');
        clearTimeout(this._radioTimer);
        const secs = (this.config.radio?.display_seconds ?? 4.2) * 1000;
        this._radioTimer = setTimeout(() => box.classList.remove('show'), secs);
    }

    hideRadio() {
        this.el.radioBox?.classList.remove('show');
        clearTimeout(this._radioTimer);
    }

    setStuntBanner(active, mul = 2) {
        const el = this.el.stuntBanner;
        if (!el) return;
        el.textContent = `[LOW ALTITUDE MULTIPLIER x${mul}]`;
        el.classList.toggle('show', !!active);
    }

    setRainOverlay(intensity = 0) {
        const el = this.el.rainOverlay;
        if (!el) return;
        const on = intensity > 0.08;
        el.classList.toggle('show', on);
        el.style.opacity = String(Math.min(0.85, intensity * 0.9));
    }

    setRadarGlitch(active) {
        const on = !!active;
        this.el.radarGlitch?.classList.toggle('show', on);
        const radar = this.el.radarCanvas?.parentElement;
        radar?.classList.toggle('glitch', on);
    }

    /** @param {boolean} active GPWS Pull Up 警示 */
    setGpws(active) {
        const el = this.el.gpws;
        if (!el) return;
        el.classList.toggle('show', !!active);
    }

    setDistance(distance) {
        if (!this.el.dist) return;
        this.el.dist.textContent = distance == null ? '—' : String(Math.floor(distance));
    }

    setCompass(degrees) {
        if (!this.el.compassArrow) return;
        this.el.compassArrow.style.transform = `translate(-50%,-70%) rotate(${degrees}deg)`;
    }

    renderRoute(cleared, total, hasWaypoints) {
        const dots = this.el.routeDots;
        if (dots) {
            dots.innerHTML = '';
            for (let i = 0; i < total; i++) {
                const span = document.createElement('span');
                if (i < cleared) span.className = 'done';
                else if (i === cleared && hasWaypoints) span.className = 'current';
                dots.appendChild(span);
            }
        }
        if (this.el.routeCount) this.el.routeCount.textContent = `${cleared}/${total}`;
        if (this.el.routeHint) {
            this.el.routeHint.textContent = hasWaypoints ? `RING ${cleared + 1} / ${total}` : 'COMPLETE';
        }
    }

    /** @param {{state:string, progress:number}} snap */
    setLock(snap) {
        const circle = this.el.lockCircle;
        const status = this.el.lockStatus;
        if (!circle || !status) return;
        circle.classList.remove('tracking', 'locked');
        status.classList.remove('tracking', 'locked');
        if (snap.state === 'locked') {
            circle.classList.add('locked');
            status.classList.add('locked');
            status.textContent = 'LOCK ON';
        } else if (snap.state === 'tracking') {
            circle.classList.add('tracking');
            status.classList.add('tracking');
            status.textContent = `TRACKING ${Math.floor(snap.progress * 100)}%`;
        } else {
            status.textContent = 'NO LOCK';
        }
    }

    /** @param {import('../weapons/WeaponSystem.js').WeaponSystem} weapons */
    setWeapons(weapons) {
        if (this.el.ammo) this.el.ammo.textContent = String(weapons.missiles);
        if (this.el.missileCd) {
            this.el.missileCd.textContent = weapons.missileCd > 0 ? weapons.missileCd.toFixed(1) : 'MSL';
        }
        if (this.el.heatFill) this.el.heatFill.style.width = `${Math.min(100, weapons.gunHeat * 100)}%`;
        this.el.heatBar?.classList.toggle('hot', weapons.gunHeat > 0.55 && !weapons.gunOverheated);
        this.el.heatBar?.classList.toggle('oh', weapons.gunOverheated);
        this.el.gunAbility?.classList.toggle('overheat', weapons.gunOverheated);
        const gunCd = q('gun-cd');
        if (gunCd) gunCd.textContent = weapons.gunOverheated ? 'OVERHEAT' : 'GUN';
    }

    setBoost(cooldown) {
        if (!this.el.boostCd) return;
        this.el.boostCd.textContent = cooldown > 0 ? cooldown.toFixed(1) : 'READY';
    }

    setWeaponLabel(text) {
        if (this.el.weaponLabel) this.el.weaponLabel.textContent = text;
    }

    setSpeedFx(speedNorm, boosting) {
        const fast = speedNorm > 0.72 || boosting;
        const boost = boosting || speedNorm > 0.92;
        if (this.el.speedLines) {
            this.el.speedLines.style.opacity = String(
                Math.max(0, (speedNorm - 0.32) * 2.1 + (boosting ? 0.25 : 0))
            );
            this.el.speedLines.classList.toggle('radial', boost || speedNorm > 0.8);
        }
        this.el.fxOverlay?.classList.toggle('fast', fast && !boost);
        this.el.fxOverlay?.classList.toggle('boost', boost);
    }

    /** 穿雲水滴疊層（0–1）。 */
    setCloudFx(density) {
        const el = this.el.cloudDrops;
        if (!el) return;
        const d = Math.max(0, Math.min(1, density));
        el.style.opacity = String(d * 0.95);
        el.classList.toggle('active', d > 0.12);
    }

    flashDamage() {
        const el = this.el.damageFlash;
        if (!el) return;
        el.style.opacity = '1';
        clearTimeout(this._damageTimer);
        this._damageTimer = setTimeout(() => { el.style.opacity = '0'; }, 120);
    }

    showWaveToast(message) {
        const el = this.el.waveToast;
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this._waveToastTimer);
        this._waveToastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    /** Boss 全螢幕警告；duration 秒後自動關閉。 */
    showBossWarning(duration = 3.8) {
        const el = this.el.bossWarning;
        if (!el) return;
        el.classList.add('show');
        clearTimeout(this._bossWarnTimer);
        this._bossWarnTimer = setTimeout(() => el.classList.remove('show'), duration * 1000);
    }

    hideBossWarning() {
        this.el.bossWarning?.classList.remove('show');
        clearTimeout(this._bossWarnTimer);
    }

    setMuted(muted) {
        if (this.el.muteBtn) this.el.muteBtn.textContent = muted ? '🔇' : '🔊';
    }

    /** 重開時把所有暫態視覺歸零。 */
    resetVisuals() {
        this.setScore(0);
        this.setBars(100, 100);
        this.setBoost(0);
        this.setWeaponLabel('CANNON · SPACE / MISSILE · F');
        this.setLock({ state: 'none', progress: 0 });
        this.setGpws(false);
        this.el.spdChip?.classList.remove('hot');
        this.el.radAlt?.parentElement?.classList.remove('warn', 'danger');
        this.el.fxOverlay?.classList.remove('fast', 'boost');
        this.el.speedLines?.classList.remove('radial');
        if (this.el.speedLines) this.el.speedLines.style.opacity = '0';
        this.setCloudFx(0);
        this.hideBossWarning();
        this.setRank(null);
    }
}
