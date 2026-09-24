import * as THREE from 'three';

/**
 * 程序化貼圖 fallback：無網／載入失敗時不崩，仍可跑水面與光暈。
 */

function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}

/** 簡易法線貼圖（可 tile），供 Water.js 使用。 */
export function createProceduralWaterNormals(size = 256) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = x / size;
            const v = y / size;
            const n1 = hash2(u * 8.0, v * 8.0);
            const n2 = hash2(u * 19.0 + 3.1, v * 17.0 - 1.7);
            const n3 = hash2(u * 41.0 - 2.2, v * 37.0 + 4.4);
            const h = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
            const hx = hash2((u + 1 / size) * 8.0, v * 8.0);
            const hy = hash2(u * 8.0, (v + 1 / size) * 8.0);
            const dx = (hx - h) * 4.0;
            const dy = (hy - h) * 4.0;
            const nx = Math.max(-1, Math.min(1, -dx));
            const ny = Math.max(-1, Math.min(1, -dy));
            const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
            const i = (y * size + x) * 4;
            data[i] = ((nx * 0.5 + 0.5) * 255) | 0;
            data[i + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
            data[i + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
            data[i + 3] = 255;
        }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
}

/** Canvas 徑向光暈貼圖。 */
export function createProceduralLensflare(size = 256, soft = true) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (soft) {
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.12, 'rgba(255,240,200,0.85)');
        g.addColorStop(0.35, 'rgba(255,200,120,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.2, 'rgba(255,220,160,0.55)');
        g.addColorStop(0.55, 'rgba(120,180,255,0.12)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

/**
 * 嘗試載入 URL；失敗則用 fallback 工廠。
 * @param {string} url
 * @param {() => THREE.Texture} fallbackFactory
 * @param {{ wrap?: number, colorSpace?: string }} [opts]
 * @returns {THREE.Texture}
 */
export function loadTextureWithFallback(url, fallbackFactory, opts = {}) {
    const tex = fallbackFactory();
    if (opts.wrap != null) {
        tex.wrapS = tex.wrapT = opts.wrap;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
        url,
        (loaded) => {
            if (opts.wrap != null) {
                loaded.wrapS = loaded.wrapT = opts.wrap;
            }
            if (opts.colorSpace) {
                loaded.colorSpace = opts.colorSpace;
            }
            loaded.needsUpdate = true;
            // 原地替換影像，讓已綁定的 material 跟著更新
            tex.image = loaded.image;
            tex.format = loaded.format;
            tex.type = loaded.type;
            tex.colorSpace = loaded.colorSpace;
            tex.needsUpdate = true;
            loaded.dispose();
        },
        undefined,
        () => {
            /* keep procedural fallback */
        }
    );

    return tex;
}
