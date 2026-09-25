import * as THREE from 'three';

/** 後處理熱氣扭曲最多同時來源數（與 HEAT_SHIMMER_SHADER 固定迴圈對齊） */
export const MAX_HEAT_SOURCES = 8;

const HEAT_VERT = /* glsl */ `
varying vec2 vUv;
varying float vViewZ;
void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
}
`;

const HEAT_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying float vViewZ;

void main(){
    float radial = 1.0 - length(vUv - 0.5) * 2.0;
    radial = smoothstep(0.0, 0.85, radial);
    float n = fract(sin(dot(vUv * 40.0 + uTime * 2.5, vec2(12.9898, 78.233))) * 43758.5453);
    float wave = sin(vUv.y * 28.0 + uTime * 14.0 + n * 6.28) * 0.5 + 0.5;
    // 僅微弱加性光柱；真正背景折射由 HeatShimmer ShaderPass 負責
    float alpha = radial * uIntensity * (0.06 + wave * 0.08);
    vec3 col = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.55, 0.2), wave * 0.65);
    float fade = smoothstep(2.0, 8.0, vViewZ);
    gl_FragColor = vec4(col, alpha * fade);
}
`;

/**
 * 全螢幕熱氣扭曲：依螢幕空間熱源 UV 折射 tDiffuse。
 * 固定 8 源、無函式 early-return；amp 門檻避免 NaN*0 整屏黑（見 WebKit LDR）。
 */
export const HEAT_SHIMMER_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uScale: { value: 1 },
        // xy=uv, z=strength, w=radius（strength=0 視為未啟用）
        uHeat0: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat1: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat2: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat3: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat4: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat5: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat6: { value: new THREE.Vector4(0, 0, 0, 0.08) },
        uHeat7: { value: new THREE.Vector4(0, 0, 0, 0.08) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uScale;
        uniform vec4 uHeat0;
        uniform vec4 uHeat1;
        uniform vec4 uHeat2;
        uniform vec4 uHeat3;
        uniform vec4 uHeat4;
        uniform vec4 uHeat5;
        uniform vec4 uHeat6;
        uniform vec4 uHeat7;
        varying vec2 vUv;

        vec2 addHeat(vec2 off, vec4 h, vec2 uv) {
            float str = clamp(h.z, 0.0, 2.0);
            if (str > 0.001) {
                vec2 d = uv - h.xy;
                float dist = length(d);
                float fall = 1.0 - smoothstep(0.0, max(h.w, 0.01), dist);
                float amp = str * fall * fall * uScale * 0.014;
                if (amp > 0.00015) {
                    float invLen = 1.0 / max(dist, 1e-4);
                    vec2 dir = d * invLen;
                    vec2 perp = vec2(-dir.y, dir.x);
                    float n = sin(dist * 48.0 - uTime * 9.0)
                            + sin(dist * 76.0 + uTime * 13.0) * 0.55;
                    off += (dir * n + perp * n * 0.45) * amp;
                }
            }
            return off;
        }

        void main(){
            vec2 uv = vUv;
            vec2 off = vec2(0.0);
            off = addHeat(off, uHeat0, uv);
            off = addHeat(off, uHeat1, uv);
            off = addHeat(off, uHeat2, uv);
            off = addHeat(off, uHeat3, uv);
            off = addHeat(off, uHeat4, uv);
            off = addHeat(off, uHeat5, uv);
            off = addHeat(off, uHeat6, uv);
            off = addHeat(off, uHeat7, uv);
            off = clamp(off, vec2(-0.035), vec2(0.035));
            vec2 suv = clamp(uv + off, vec2(0.001), vec2(0.999));
            gl_FragColor = texture2D(tDiffuse, suv);
        }
    `,
};

/**
 * 引擎噴口熱扭曲標記平面（微弱加性光柱 + 供投影採樣的錨點）。
 * @param {{ span?: number, y?: number, z?: number }} [opts]
 */
export function createHeatHazePlanes(opts = {}) {
    const span = opts.span ?? 0.48;
    const y = opts.y ?? -0.18;
    const z = opts.z ?? 4.2;
    const geo = new THREE.PlaneGeometry(1.1, 2.4, 1, 1);
    const planes = [];

    [-1, 1].forEach((side) => {
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 0 },
            },
            vertexShader: HEAT_VERT,
            fragmentShader: HEAT_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(side * span, y, z);
        mesh.rotation.y = Math.PI;
        mesh.userData.isHeatHaze = true;
        mesh.userData.heatStrength = 1;
        mesh.userData.heatRadius = 0.09;
        mesh.renderOrder = 3;
        planes.push(mesh);
    });

    return planes;
}

/**
 * 飛彈尾焰熱氣錨點（極小不可見球，僅供投影）。
 * @param {{ strength?: number, radius?: number }} [opts]
 */
export function createMissileHeatAnchor(opts = {}) {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    mesh.position.set(0, 0, 0.85);
    mesh.userData.isHeatHaze = true;
    mesh.userData.heatStrength = opts.strength ?? 0.75;
    mesh.userData.heatRadius = opts.radius ?? 0.055;
    mesh.visible = false;
    return mesh;
}

/** @param {THREE.Object3D} jetRoot */
export function updateHeatHaze(jetRoot, time, intensity) {
    jetRoot.traverse((o) => {
        if (!o.userData?.isHeatHaze) return;
        if (o.material?.uniforms) {
            o.material.uniforms.uTime.value = time;
            o.material.uniforms.uIntensity.value = intensity;
        }
        // 加性片僅在有強度時顯示；錨點本身可保持 invisible
        if (o.material && o.material.visible !== false && o.material.type === 'ShaderMaterial') {
            o.visible = intensity > 0.02;
        }
        o.userData._heatIntensity = intensity;
    });
}

const _wp = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/**
 * 將場景中 isHeatHaze 錨點投影到螢幕 UV，寫入 Vector4 陣列（最多 max）。
 * @param {THREE.Object3D} root
 * @param {THREE.Camera} camera
 * @param {THREE.Vector4[]} outSlots
 * @param {number} [intensityScale=1]
 * @returns {number} 寫入數量
 */
export function projectHeatSources(root, camera, outSlots, intensityScale = 1) {
    let written = 0;
    const max = outSlots.length;
    root.traverse((o) => {
        if (written >= max) return;
        if (!o.userData?.isHeatHaze) return;
        const inten = (o.userData._heatIntensity ?? 0) * (o.userData.heatStrength ?? 1) * intensityScale;
        if (inten < 0.03) return;
        o.getWorldPosition(_wp);
        _ndc.copy(_wp).project(camera);
        if (_ndc.z < -1 || _ndc.z > 1) return;
        if (Math.abs(_ndc.x) > 1.25 || Math.abs(_ndc.y) > 1.25) return;
        const uvX = _ndc.x * 0.5 + 0.5;
        const uvY = _ndc.y * 0.5 + 0.5;
        const slot = outSlots[written];
        slot.set(uvX, uvY, Math.min(2, inten), o.userData.heatRadius ?? 0.08);
        written += 1;
    });
    return written;
}

/**
 * 將世界座標熱源投影進既有 slots（從 startIndex 起寫）。
 * @param {{x:number,y:number,z:number,strength?:number,radius?:number}[]} points
 * @param {THREE.Camera} camera
 * @param {THREE.Vector4[]} outSlots
 * @param {number} [startIndex=0]
 * @returns {number} 下一個可寫 index
 */
export function projectWorldHeatPoints(points, camera, outSlots, startIndex = 0) {
    let idx = startIndex;
    for (let i = 0; i < points.length && idx < outSlots.length; i++) {
        const p = points[i];
        const inten = p.strength ?? 0.7;
        if (inten < 0.03) continue;
        _wp.set(p.x, p.y, p.z);
        _ndc.copy(_wp).project(camera);
        if (_ndc.z < -1 || _ndc.z > 1) continue;
        if (Math.abs(_ndc.x) > 1.25 || Math.abs(_ndc.y) > 1.25) continue;
        outSlots[idx].set(
            _ndc.x * 0.5 + 0.5,
            _ndc.y * 0.5 + 0.5,
            Math.min(2, inten),
            p.radius ?? 0.055
        );
        idx += 1;
    }
    return idx;
}

/** 清空 heat slot 陣列 */
export function clearHeatSlots(slots) {
    for (let i = 0; i < slots.length; i++) {
        slots[i].set(0, 0, 0, 0.08);
    }
}
