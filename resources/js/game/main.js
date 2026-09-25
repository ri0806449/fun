import { loadConfig, readJsonScript } from './config.js';
import { GameCore } from './core/GameCore.js';
import {
    formatWebGLFailureMessage,
    isEmbeddedBrowser,
    preferredPlayUrl,
    probeWebGLSupport,
} from './utils/createWebGLRenderer.js';

let bootStarted = false;

/**
 * Entry point：讀取後端注入的設定與排行榜，建立 GameCore 並啟動主迴圈。
 * 重複載入（HMR／腳本重跑）會先 dispose 舊實例，避免 WebGL context 累積。
 */
function showBootError(err) {
    const status = document.getElementById('menu-boot-status');
    if (status) status.hidden = true;

    const probe = probeWebGLSupport();
    const playUrl = preferredPlayUrl();
    let msg = err?.message ? String(err.message) : String(err || 'unknown error');

    // 非我們格式化過的錯誤：包一層；WebGL 類一律走繁中指引
    const looksWebGL = /webgl|WebGL|繪圖環境|getContext/i.test(msg);
    if (looksWebGL && !msg.includes('127.0.0.1') && !msg.startsWith('無法') && !msg.startsWith('此內建') && !msg.startsWith('WebGL context')) {
        msg = formatWebGLFailureMessage(err instanceof Error ? err : new Error(msg));
    } else if (!msg.startsWith('無法') && !msg.startsWith('繪圖') && !msg.startsWith('此內建') && !msg.startsWith('WebGL context') && !msg.startsWith('引擎')) {
        msg = `引擎啟動失敗：${msg}`;
    }

    const box = document.getElementById('menu-boot-error');
    if (box) {
        box.hidden = false;
        box.textContent = msg;
    }

    const reload = document.getElementById('btn-boot-reload');
    if (reload) {
        reload.hidden = false;
        reload.onclick = () => location.reload();
    }

    const external = document.getElementById('btn-boot-external');
    if (external) {
        const showExternal = !probe.ok || probe.embedded || isEmbeddedBrowser();
        external.hidden = !showExternal;
        external.dataset.url = playUrl;
        external.textContent = `用系統瀏覽器開啟 ${playUrl}`;
        external.onclick = async (e) => {
            e.preventDefault();
            const url = external.dataset.url || playUrl;
            try {
                await navigator.clipboard?.writeText?.(url);
            } catch {
                // ignore
            }
            // 盡量開系統瀏覽器；Cursor 內建可能仍攔截，網址已在按鈕文字／剪貼簿
            window.open(url, '_blank', 'noopener,noreferrer');
        };
    }

    console.error('[Sky Fighter] boot failed', err, probe);
}

function disposePreviousGame() {
    const prev = window.__skyFighter;
    if (!prev) return;
    try {
        prev.dispose?.();
    } catch (err) {
        console.warn('[Sky Fighter] dispose previous game failed', err);
    }
    window.__skyFighter = null;
}

function boot() {
    if (bootStarted && window.__skyFighter) return;

    // 隱藏分頁先不建 renderer，避免背景分頁佔用／耗盡 context
    if (document.hidden) {
        const status = document.getElementById('menu-boot-status');
        if (status) {
            status.hidden = false;
            status.textContent = '分頁在背景，回到此分頁後會自動啟動引擎…';
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) boot();
        }, { once: true });
        return;
    }

    bootStarted = true;
    try {
        disposePreviousGame();

        const container = document.getElementById('game-root') ?? document.body;
        const config = loadConfig('game-config');
        const leaderboard = readJsonScript('game-leaderboard', []) ?? [];

        const game = new GameCore({ config, container, leaderboard });
        window.__skyFighter = game;
        game.run();
        bindPageLifecycle(game);
    } catch (err) {
        bootStarted = false;
        showBootError(err);
    }
}

/** 分頁隱藏時暫停迴圈，減輕 GPU；顯示時恢復（MENU 狀態仍可預覽）。 */
function bindPageLifecycle(game) {
    if (game._lifecycleBound) return;
    game._lifecycleBound = true;

    document.addEventListener('visibilitychange', () => {
        if (!window.__skyFighter || window.__skyFighter !== game) return;
        if (document.hidden) {
            game.loop?.stop?.();
        } else if (game.loop && !game.loop.running) {
            game.loop.start();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}

// Vite HMR：重載模組時釋放舊 context
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        disposePreviousGame();
        bootStarted = false;
    });
}
