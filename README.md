# Sky Fighter（Laravel）

由單檔 `fly.html` 重構成的 Laravel 專案，方便往後擴充後端 API、排行榜與遊戲平衡設定。

專案路徑：`/Users/mark44/funP`

## 啟動

```bash
cd /Users/mark44/funP

# 依賴（首次）
/Users/mark44/fun/.bin/composer install   # 或系統 composer
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate

# 後端（預設 8088；本機 8000 常被其他專案佔用）
php artisan serve --host=127.0.0.1 --port=8088

# 前端（另開終端；開發時熱更新）
npm run dev
```

瀏覽器開 `http://127.0.0.1:8088`。

若 `8088` 也被佔用，可改埠，例如 `--port=8765`。

正式環境請先 `npm run build` 再 `php artisan serve`（或用 Nginx／Herd）。

## 架構概要

```
app/
  Http/Controllers/GameController.php      # 遊戲頁
  Http/Controllers/Api/ScoreController.php # 排行榜 API
  Models/Score.php
  Services/LeaderboardService.php
config/game.php                            # 遊戲平衡數值（注入前端）
resources/
  views/game/                              # Blade HUD / 選單
  css/game.css
  js/game/                                 # ES Module 遊戲核心
    main.js
    config.js
    core/   flight/   entities/   weapons/
    camera/ hud/      world/      net/
routes/web.php   → GET /
routes/api.php   → GET|POST /api/scores
legacy/fly.html                            # 舊單檔參考
```

前端入口 `resources/js/game/main.js` 會讀取 Blade 注入的：

- `#game-config` ← `config/game.php`
- `#game-leaderboard` ← 排行榜

並與 `config.js` 的預設值深層合併。

## API

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/scores?limit=10` | 排行榜 |
| POST | `/api/scores` | 上傳成績（throttle 30/min） |

POST body：

```json
{
  "pilot_name": "MAVERICK",
  "score": 4200,
  "kills": 12,
  "waypoints_cleared": 6,
  "wave_reached": 3,
  "duration_seconds": 184,
  "outcome": "mission_complete"
}
```

`outcome` 允許：`mission_complete` / `time_up` / `shot_down` / `water_impact` / `terrain_crash` / `boss_defeated`。

## 調平衡

改 `config/game.php`（飛行、武器、敵機、波次、計分…），重新整理頁面即可，不必改 JS。

飛行手感（鬆鍵滾轉回平／俯仰適度回中）在 `flight.assist`；與 `resources/js/game/config.js` 同步。

操作：W/S 俯仰 · A/D 滾轉（鬆開回平）· Q/E 舵 · Shift/Ctrl 油門 · R 加力 · Space 機砲 · F 飛彈。

## 測試

```bash
php artisan test
npm run build
```

## 與舊檔關係

`legacy/fly.html` 僅作歷史參考，執行請用本專案。
