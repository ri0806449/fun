/**
 * 輕量 2D Simplex Noise（Ken Perlin / Stefan Gustavson 風格精簡實作）。
 * 無外部依賴，供地形高度圖使用。
 */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPerm(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0;
    for (let i = 255; i > 0; i--) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const j = s % (i + 1);
        const t = p[i];
        p[i] = p[j];
        p[j] = t;
    }
    const perm = new Uint8Array(512);
    const permMod = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        perm[i] = p[i & 255];
        permMod[i] = perm[i] % 8;
    }
    return { perm, permMod };
}

function dot2(g, x, y) {
    return g[0] * x + g[1] * y;
}

/**
 * @param {number} [seed]
 * @returns {{ noise2D:(x:number,y:number)=>number }}
 */
export function createSimplex(seed = 1337) {
    const { perm, permMod } = buildPerm(seed);

    function noise2D(xin, yin) {
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - (i - t);
        const y0 = yin - (j - t);

        let i1;
        let j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else { i1 = 0; j1 = 1; }

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        const ii = i & 255;
        const jj = j & 255;

        let n0 = 0;
        let n1 = 0;
        let n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            const gi0 = GRAD[permMod[ii + perm[jj]]];
            t0 *= t0;
            n0 = t0 * t0 * dot2(gi0, x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            const gi1 = GRAD[permMod[ii + i1 + perm[jj + j1]]];
            t1 *= t1;
            n1 = t1 * t1 * dot2(gi1, x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            const gi2 = GRAD[permMod[ii + 1 + perm[jj + 1]]];
            t2 *= t2;
            n2 = t2 * t2 * dot2(gi2, x2, y2);
        }

        return 70 * (n0 + n1 + n2);
    }

    return { noise2D };
}

/**
 * fBm：多八度疊加，回傳約 [-1, 1]。
 * @param {{ noise2D:(x:number,y:number)=>number }} simplex
 * @param {number} x
 * @param {number} y
 * @param {number} [octaves]
 * @param {number} [lacunarity]
 * @param {number} [gain]
 */
export function fbm2D(simplex, x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amp * simplex.noise2D(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
}
