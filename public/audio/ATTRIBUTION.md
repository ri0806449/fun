# Audio Attribution

本專案音效僅使用可自由商用／CC0／同等寬鬆授權素材，**未**使用 Ace Combat 或其他受版權保護之遊戲原聲。

## Kenney.nl — Sci-fi Sounds（CC0）

- 來源：https://kenney.nl/assets/sci-fi-sounds
- 授權：Creative Commons CC0（可商用、署名非必須；建議註明 Kenney.nl）
- 使用檔案：
  - `engine/jet_loop.ogg` ← `spaceEngineLarge_001.ogg`
  - `engine/afterburner.ogg` ← `thrusterFire_002.ogg`
  - `engine/wind_loop.ogg` ← `spaceEngineLow_000.ogg`（風切備援）
  - `engine/enemy_engine.ogg` ← `spaceEngineSmall_002.ogg`
  - `sfx/explosion.ogg` ← `explosionCrunch_004.ogg`
  - `sfx/explosion_low.ogg` ← `lowFrequency_explosion_000.ogg`
  - `sfx/gun.ogg` ← `laserSmall_002.ogg`
  - `sfx/missile_launch.ogg` ← `laserLarge_001.ogg`
  - `sfx/missile_whoosh.ogg` ← `thrusterFire_000.ogg`
  - `sfx/hit.ogg` ← `impactMetal_002.ogg`
  - `sfx/boost.ogg` ← `forceField_001.ogg`
  - `music/boss_loop.ogg` ← `computerNoise_001.ogg`

## Kenney.nl — Interface Sounds（CC0）

- 來源：https://kenney.nl/assets/interface-sounds
- 授權：CC0
- 使用檔案：
  - `sfx/pickup.ogg` ← `confirmation_001.ogg`
  - `sfx/waypoint.ogg` ← `pluck_001.ogg`（若存在）／介面音
  - `sfx/levelup.ogg` ← `maximize_006.ogg`
  - `sfx/lock_tone.ogg` ← `bong_001.ogg`
  - `sfx/lock_tick.ogg` ← `switch_007.ogg`

## Mixkit — Free Sound Effects（Mixkit License）

- 授權：https://mixkit.co/license/#sfxFree（免費商用，無需署名）
- 使用檔案：
  - `engine/jet_loop.mp3` ← Jet plane hum flying
  - `engine/afterburner.mp3` ← Sci-fi rocket engine
  - `engine/wind_loop.mp3` ← Vibrating wind passing by
  - `engine/enemy_engine.mp3` ← War plane loop
  - `sfx/sonic_boom.mp3` ← Landing jet flying whoosh
  - `sfx/flyby.mp3` ← Fast jet engine flying over
  - `sfx/flyby_rumble.mp3` ← Airplane flying by rumble

## 專案自製（CC0／本專案原始）

- `sfx/radar_beep.wav`、`sfx/radar_lock_solid.wav`、`sfx/lock_acquired.wav`  
  — 以 Python 合成之雷達鎖定音（BEEP／硬鎖長音）
- `voice/fox_two.wav`、`voice/terrain_pull_up.wav`、`voice/missile_alert.wav`  
  — 以系統語音合成產生之座艙語音（非商業遊戲原聲取樣；若需嚴格 CC0 錄音可替換）

## Fallback

若瀏覽器無法解碼或檔案缺失，`AudioManager` 會退回程序化 Web Audio（振盪器／噪聲），遊戲不應因此崩潰。
