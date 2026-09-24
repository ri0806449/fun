<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Sky Fighter</title>

    @vite(['resources/css/game.css', 'resources/js/game/main.js'])
</head>
<body>
    {{-- 後端注入：遊戲平衡設定與排行榜初始資料（避免 inline JS 變數） --}}
    <script type="application/json" id="game-config">@json($config)</script>
    <script type="application/json" id="game-leaderboard">@json($leaderboard)</script>

    <div id="game-root"></div>

    <div id="fx-overlay"><div id="speed-lines"></div></div>
    <div id="cloud-drops" aria-hidden="true"></div>
    <div id="damage-flash"></div>

    @include('game.partials.hud')

    <div id="msg"></div>
    <div id="wave-toast"></div>
    <div id="boss-warning" aria-live="assertive">
        <div class="bw-inner">
            <div class="bw-label">WARNING</div>
            <div class="bw-title">FLYING FORTRESS</div>
            <div class="bw-sub">INBOUND · DESTROY TURRETS &amp; ENGINES</div>
        </div>
    </div>

    @include('game.partials.menus', ['leaderboard' => $leaderboard])
</body>
</html>
