import * as THREE from 'three';

/**
 * 建立 WebGLRenderer：顯式 canvas／手動 getContext、多組屬性備援、
 * 清掉容器內舊 canvas，並提供環境偵測與繁中錯誤訊息。
 *
 * @param {HTMLElement} container
 * @param {{ antialias?: boolean }} [prefs]
 * @returns {THREE.WebGLRenderer}
 */
export function createWebGLRenderer(container, prefs = {}) {
    disposeContainerCanvases(container);

    const wantAA = prefs.antialias !== false;
    const attempts = buildAttempts(wantAA);

    let lastError = null;
    for (const attempt of attempts) {
        let canvas = null;
        try {
            canvas = document.createElement('canvas');
            canvas.style.display = 'block';
            const context = acquireContext(canvas, attempt);
            if (!context) {
                throw new Error(`getContext(${attempt.forceWebGL1 ? 'webgl1' : 'webgl2|webgl'}) returned null`);
            }
            if (typeof context.isContextLost === 'function' && context.isContextLost()) {
                throw new Error('WebGL context lost immediately after getContext');
            }

            const renderer = new THREE.WebGLRenderer({
                canvas,
                context,
                antialias: !!attempt.antialias,
                alpha: !!attempt.alpha,
                depth: attempt.depth !== false,
                stencil: !!attempt.stencil,
                powerPreference: attempt.powerPreference ?? 'default',
                premultipliedAlpha: attempt.premultipliedAlpha !== false,
                preserveDrawingBuffer: !!attempt.preserveDrawingBuffer,
                failIfMajorPerformanceCaveat: false,
            });

            const gl = renderer.getContext();
            if (!gl || (typeof gl.isContextLost === 'function' && gl.isContextLost())) {
                renderer.dispose();
                loseCanvasContext(canvas);
                throw new Error('WebGL context lost immediately after create');
            }
            return renderer;
        } catch (err) {
            lastError = err;
            if (canvas) {
                loseCanvasContext(canvas);
                canvas.width = 0;
                canvas.height = 0;
            }
        }
    }

    throw new Error(formatWebGLFailureMessage(lastError));
}

/**
 * 輕量偵測：是否能取得任何 WebGL context（會立刻 lose，不佔用配額）。
 * @returns {{ ok: boolean, api: string|null, embedded: boolean, vendor: string|null, gpu: string|null }}
 */
export function probeWebGLSupport() {
    const embedded = isEmbeddedBrowser();
    const canvas = document.createElement('canvas');
    const tryTypes = ['webgl2', 'webgl', 'experimental-webgl'];
    let gl = null;
    let api = null;
    for (const type of tryTypes) {
        try {
            gl = canvas.getContext(type, { failIfMajorPerformanceCaveat: false });
        } catch {
            gl = null;
        }
        if (gl) {
            api = type;
            break;
        }
    }

    const info = {
        ok: !!(gl && !(typeof gl.isContextLost === 'function' && gl.isContextLost())),
        api,
        embedded,
        vendor: null,
        gpu: null,
    };

    if (gl) {
        try {
            info.vendor = String(gl.getParameter(gl.VENDOR) ?? '');
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            info.gpu = dbg
                ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
                : String(gl.getParameter(gl.RENDERER) ?? '');
        } catch {
            // ignore
        }
        loseCanvasContext(canvas);
    }

    return info;
}

/** Cursor／Electron 內建瀏覽器（WebGL 配額常與 IDE 共用，較易失敗）。 */
export function isEmbeddedBrowser() {
    const ua = navigator.userAgent || '';
    return /Cursor\//i.test(ua) || /Electron\//i.test(ua);
}

/** 建議使用者開啟的本機網址（與 package.json serve 腳本一致）。 */
export function preferredPlayUrl() {
    const { protocol, hostname } = window.location;
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
        return `${protocol}//127.0.0.1:8088/`;
    }
    return `${protocol}//${hostname}${window.location.port ? `:${window.location.port}` : ''}/`;
}

/**
 * @param {Error|null} lastError
 * @returns {string}
 */
export function formatWebGLFailureMessage(lastError = null) {
    const probe = probeWebGLSupport();
    const playUrl = preferredPlayUrl();
    const detail = lastError?.message ? `（${lastError.message}）` : '';

    if (!probe.ok) {
        if (probe.embedded) {
            return [
                '此內建瀏覽器無法建立 WebGL 繪圖環境。',
                `請改用系統 Chrome／Edge 開啟 ${playUrl}`,
                '（關閉其他遊戲分頁，並確認未關閉硬體加速）。',
                detail,
            ].join('');
        }
        return [
            '無法建立 WebGL 繪圖環境。',
            `請用系統 Chrome／Edge 開啟 ${playUrl}，`,
            '關閉其他遊戲分頁後重新整理，並確認未關閉硬體加速。',
            detail,
        ].join('');
    }

    // probe 成功卻建立失敗：多半是 context 配額耗盡或屬性不相容
    if (probe.embedded) {
        return [
            'WebGL context 建立失敗（內建瀏覽器配額可能已滿）。',
            `請關閉其他遊戲／預覽分頁，或改用系統 Chrome 開啟 ${playUrl}。`,
            detail,
        ].join('');
    }

    return [
        '無法建立 WebGL 繪圖環境。',
        '請關閉其他遊戲分頁後重新整理；',
        `或改用 Chrome／Edge 開啟 ${playUrl}，並確認未關閉硬體加速。`,
        detail,
    ].join('');
}

/** @param {boolean} wantAA */
function buildAttempts(wantAA) {
    /** @type {Array<Record<string, unknown>>} */
    const base = [
        { antialias: wantAA, powerPreference: 'high-performance', alpha: false },
        { antialias: wantAA, powerPreference: 'default', alpha: false },
        { antialias: false, powerPreference: 'default', alpha: false },
        { antialias: false, powerPreference: 'low-power', alpha: false },
        { antialias: false, powerPreference: 'default', alpha: true },
        { antialias: false, powerPreference: 'default', alpha: false, preserveDrawingBuffer: true },
        { antialias: false, powerPreference: 'default', alpha: false, depth: true, stencil: false },
        // 最後備援：強制 WebGL1
        { antialias: false, powerPreference: 'default', alpha: false, forceWebGL1: true },
        { antialias: false, forceWebGL1: true },
    ];
    return base;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, unknown>} attempt
 * @returns {RenderingContext|null}
 */
function acquireContext(canvas, attempt) {
    const attrs = {
        alpha: !!attempt.alpha,
        depth: attempt.depth !== false,
        stencil: !!attempt.stencil,
        antialias: !!attempt.antialias,
        premultipliedAlpha: attempt.premultipliedAlpha !== false,
        preserveDrawingBuffer: !!attempt.preserveDrawingBuffer,
        powerPreference: attempt.powerPreference ?? 'default',
        failIfMajorPerformanceCaveat: false,
    };

    if (attempt.forceWebGL1) {
        return safeGetContext(canvas, 'webgl', attrs)
            || safeGetContext(canvas, 'experimental-webgl', attrs);
    }

    return safeGetContext(canvas, 'webgl2', attrs)
        || safeGetContext(canvas, 'webgl', attrs)
        || safeGetContext(canvas, 'experimental-webgl', attrs);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {WebGLContextAttributes} attrs
 */
function safeGetContext(canvas, type, attrs) {
    try {
        return canvas.getContext(type, attrs);
    } catch {
        return null;
    }
}

/** @param {HTMLCanvasElement} canvas */
function loseCanvasContext(canvas) {
    if (!canvas) return;
    // 只對「已存在」的 context 呼叫 lose；同一 canvas 重複 getContext 會回傳既有者
    for (const type of ['webgl2', 'webgl', 'experimental-webgl']) {
        try {
            const gl = canvas.getContext(type);
            if (gl && typeof gl.getExtension === 'function') {
                gl.getExtension('WEBGL_lose_context')?.loseContext?.();
                return;
            }
        } catch {
            // continue
        }
    }
}

/** @param {HTMLElement} container */
export function disposeContainerCanvases(container) {
    if (!container) return;
    const canvases = [...container.querySelectorAll('canvas')];
    for (const canvas of canvases) {
        loseCanvasContext(canvas);
        try {
            canvas.width = 0;
            canvas.height = 0;
        } catch {
            // ignore
        }
        canvas.remove();
    }
}
