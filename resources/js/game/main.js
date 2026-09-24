import { loadConfig, readJsonScript } from './config.js';
import { GameCore } from './core/GameCore.js';

/**
 * Entry point：讀取後端注入的設定與排行榜，建立 GameCore 並啟動主迴圈。
 */
function boot() {
    const container = document.getElementById('game-root') ?? document.body;
    const config = loadConfig('game-config');
    const leaderboard = readJsonScript('game-leaderboard', []) ?? [];

    const game = new GameCore({ config, container, leaderboard });
    game.run();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}
