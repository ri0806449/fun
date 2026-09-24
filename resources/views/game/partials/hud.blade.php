{{-- 飛行 HUD：狀態列、雷達、準星／鎖定、能力列 --}}
<div id="hud">
    <div id="top">
        <div id="player-card">
            <div id="flag"></div>
            <div>
                <div class="name">PILOT</div>
                <div class="score-wrap">
                    <div class="score-label">SCORE</div>
                    <div class="score" id="score">0</div>
                    <div id="score-float"></div>
                </div>
            </div>
        </div>

        <div id="center-status">
            <div id="timer-row">
                <span class="ico">&#9992;</span>
                <span id="timer">{{ sprintf('%02d:%02d', intdiv($config['mission']['time_limit'], 60), $config['mission']['time_limit'] % 60) }}</span>
                <span class="ico">&#9672;</span>
            </div>
            <div id="bars">
                <div class="bar-row">
                    <span class="bar-label">ARMOR</span>
                    <div class="bar-wrap"><div class="bar-fill" id="hp-fill"></div></div>
                </div>
                <div class="bar-row">
                    <span class="bar-label">SHIELD</span>
                    <div class="bar-wrap"><div class="bar-fill" id="shield-fill"></div></div>
                </div>
            </div>
            <div id="route-progress">
                <span>ROUTE</span>
                <div id="route-dots"></div>
                <span id="route-count">0/{{ $config['mission']['waypoint_count'] }}</span>
            </div>
        </div>

        <div id="resources">
            <div class="stat-chip scrap" id="scrap-chip"><span class="lbl">SCRAP</span><span class="val" id="scrap-ui">0</span></div>
            <div class="stat-chip spd" id="spd-chip"><span class="lbl">IAS</span><span class="val" id="spd-ui">0</span></div>
            <div class="stat-chip alt"><span class="lbl">ALT</span><span class="val" id="alt-ui">0</span></div>
            <div class="stat-chip rad-alt"><span class="lbl">RALT</span><span class="val" id="rad-alt-ui">—</span></div>
            <div id="nav-panel">
                <div id="compass"><div id="compass-arrow"></div></div>
                <div class="dist-label">NEXT WAYPOINT</div>
                <div class="dist-val"><span id="dist">0</span> m</div>
                <div class="route-txt" id="route-hint">RING 1 / {{ $config['mission']['waypoint_count'] }}</div>
            </div>
        </div>
    </div>

    @include('game.partials.radar')

    <div id="crosshair" title="機頭參考">
        <div class="ring"></div><div class="ring2"></div>
        <div class="tick t"></div><div class="tick b"></div>
        <div class="tick l"></div><div class="tick r"></div>
        <div class="dot"></div>
    </div>

    <div id="lock-circle"></div>
    <div id="lock-status">NO LOCK</div>
    <div id="gpws-alert" aria-live="assertive">PULL UP! PULL UP!</div>
    <div id="world-hud"></div>

    <div id="weapon-label">CANNON · SPACE / MISSILE · F</div>

    <div id="abilities">
        <div class="ability">
            <span class="key">R</span>
            <div class="icon">&#10226;</div>
            <div class="cd" id="boost-cd">READY</div>
        </div>
        <div class="ability active" id="msl-ability">
            <span class="key">F</span>
            <div class="icon">&#9672;</div>
            <div class="ammo" id="ammo">{{ $config['player']['start_missiles'] }}</div>
            <div class="cd" id="missile-cd">MSL</div>
        </div>
        <div class="ability" id="gun-ability">
            <span class="key">&#9251;</span>
            <div class="icon">&#10022;</div>
            <div class="heat-bar" id="heat-bar"><i id="heat-fill"></i></div>
            <div class="cd" id="gun-cd">GUN</div>
        </div>
    </div>

    <div id="help">W/S 俯仰 · A/D 滾轉 · Q/E 舵 · Shift/Ctrl 油門 · R 加力 · F 導彈 · Space 機砲 · ESC 暫停 · M 靜音</div>
    <button id="mute-btn" type="button" title="靜音">&#128266;</button>
</div>
