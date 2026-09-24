{{-- MENU（載入／開始）、HANGAR、LEVEL_UP、PAUSED、GAMEOVER 面板 --}}

<div id="loading">
    <h1>SKY FIGHTER</h1>
    <div class="bar"><i></i></div>

    <div class="menu-panel">
        <div class="pilot-field">
            <label for="pilot-name">CALLSIGN</label>
            <input id="pilot-name" type="text" maxlength="32" value="PILOT" autocomplete="off" spellcheck="false">
        </div>
        <div class="menu-scrap" id="menu-scrap">SCRAP <b>0</b></div>
        <div class="end-actions">
            <button type="button" class="end-btn primary" id="btn-start">START MISSION</button>
            <button type="button" class="end-btn secondary" id="btn-hangar">HANGAR</button>
        </div>
        @include('game.partials.leaderboard', ['leaderboard' => $leaderboard])
    </div>

    <p>START · 純鍵盤飛行 · 滑鼠選升級</p>
    <p class="menu-help">W/S 俯仰 · A/D 滾轉 · Q/E 舵 · Shift/Ctrl 油門 · R 加力 · Space 機砲 · F 飛彈 · Esc 暫停</p>
    <p class="menu-help">擊退敵波後可選局內 Perk · 零件於機庫永久強化</p>
</div>

{{-- 機庫：永久升級 + 成就牆 --}}
<div id="hangar-panel">
    <div id="hangar-card">
        <h2>HANGAR</h2>
        <div class="hangar-scrap">零件 <b id="hangar-scrap">0</b></div>

        <section class="hangar-section">
            <h3>PERMANENT UPGRADES</h3>
            <div id="hangar-upgrades" class="hangar-upgrades"></div>
        </section>

        <section class="hangar-section">
            <h3>ACHIEVEMENTS</h3>
            <div id="hangar-achievements" class="hangar-achievements"></div>
        </section>

        <div class="end-actions">
            <button type="button" class="end-btn secondary" id="btn-hangar-back">返回選單</button>
        </div>
    </div>
</div>

{{-- 局內 Level-up：三選一 --}}
<div id="levelup-panel">
    <div id="levelup-card">
        <h2>WAVE CLEAR · LEVEL UP</h2>
        <p class="levelup-sub">選擇一項當局強化</p>
        <div id="levelup-choices" class="levelup-choices"></div>
    </div>
</div>

{{-- 成就 toast --}}
<div id="ach-toast" aria-live="polite"></div>

<div id="pause-panel">
    <div id="pause-card">
        <h2>PAUSED</h2>
        <div class="end-actions">
            <button type="button" class="end-btn primary" id="btn-resume">繼續</button>
            <button type="button" class="end-btn secondary" id="btn-pause-restart">重新開始</button>
        </div>
    </div>
</div>

<div id="end-panel">
    <div id="end-card">
        <h2 id="end-title">MISSION END</h2>
        <div class="end-score" id="end-score">0</div>
        <div class="end-sub">FINAL SCORE</div>
        <div id="end-rank"></div>
        <div id="end-stats">
            <span>擊墜 <b id="end-kills">0</b></span>
            <span>時間 <b id="end-time">00:00</b></span>
            <span>波次 <b id="end-wave">0</b></span>
        </div>

        @include('game.partials.leaderboard', [
            'leaderboard' => $leaderboard,
            'rowsId' => 'leaderboard-rows',
            'title' => 'LEADERBOARD',
        ])

        <div class="end-actions">
            <button type="button" class="end-btn primary" id="btn-restart">重新開始</button>
            <button type="button" class="end-btn secondary" id="btn-end-hangar">機庫</button>
        </div>
    </div>
</div>
