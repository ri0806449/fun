import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import {
    createProceduralLensflare,
    loadTextureWithFallback,
} from './textureFallbacks.js';

/** 可變陽光方向（各系統共享；SceneBuilder 依 elevation／azimuth 更新）。 */
export const SUN_DIR = new THREE.Vector3(-0.55, 0.32, 0.45).normalize();

/**
 * FBM 積雲片：多層噪點雕刻外型，避免球體 fresnel 的「一圈圈」外觀。
 * 用平面 billboard 群組疊加，穿雲密度仍靠 group 半徑。
 */
const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
uniform vec3 uColor;
uniform vec3 uSunDir;
varying vec2 vUv;

float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float valueNoise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;
    for(int i = 0; i < 5; i++){
        v += a * valueNoise(p);
        p = p * 2.07 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}

void main(){
    vec2 p = vUv * 2.0 - 1.0;
    // 壓扁＋輕微傾斜，打破正圓輪廓
    p.x *= 0.92;
    p.y *= 1.28;
    p += vec2(uSeed * 0.013, -uSeed * 0.009);

    float n1 = fbm(p * 2.15 + uSeed + uTime * 0.012);
    float n2 = fbm(p * 4.4 - uSeed * 0.6 + vec2(2.1, -1.3) + uTime * 0.007);
    float n3 = fbm(p * 1.05 + uSeed * 0.35 + vec2(-3.0, 1.8));
    float n4 = fbm(p * 7.2 + uSeed * 1.1);

    // 多葉瓣積雲密度：大尺度起伏 + 中尺度翻湧 + 細紋
    float lobes = n1 * 0.48 + n2 * 0.32 + n3 * 0.2;
    lobes += (n4 - 0.5) * 0.12;

    // 柔邊 envelope（非硬圓）：橢圓衰減 + 噪點啃邊
    float ell = length(p * vec2(0.78, 1.05));
    float envelope = 1.0 - smoothstep(0.22, 1.08, ell);
    envelope *= smoothstep(0.08, 0.55, lobes + 0.18);

    float dens = smoothstep(0.28, 0.78, lobes * 0.85 + envelope * 0.55);
    dens *= envelope;
    dens = pow(max(dens, 0.0), 1.12);

    float alpha = dens * uOpacity;
    if(alpha < 0.018) discard;

    float heightShade = smoothstep(-0.95, 0.75, p.y + (n2 - 0.5) * 0.35);
    float sunAmt = clamp(dot(normalize(uSunDir), vec3(0.15, 0.92, 0.1)), 0.0, 1.0);
    float lit = 0.52 + 0.48 * sunAmt;
    vec3 shade = uColor * mix(0.48, 0.78, 1.0 - heightShade);
    vec3 litCol = mix(uColor, vec3(1.0, 0.97, 0.93), 0.22 + sunAmt * 0.18);
    vec3 col = mix(shade, litCol, lit * heightShade);
    // 向陽側輕微銀邊（噪點 rim，非圓環）
    float rim = dens * (1.0 - dens) * (0.35 + sunAmt * 0.65);
    col = mix(col, vec3(1.0, 0.96, 0.9), rim * 0.22);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.86));
}
`;

/**
 * SceneBuilder — 天空（Sky.js）、太陽光、Lensflare、FBM 積雲片、島嶼／遠景。
 */
export class SceneBuilder {
    /**
     * @param {THREE.Scene} scene
     * @param {object} environment config.environment
     */
    constructor(scene, environment) {
        this.scene = scene;
        this.env = environment;
        this.decor = new THREE.Group();
        this.cloudGroups = [];
        this.distantCraft = [];
        this._fogBase = environment.fog_density ?? 0.00048;
        this._fogHeight = environment.fog_height ?? 180;
        this.sunDirection = SUN_DIR.clone();
        this._flareAnchor = null;
        this._lensflare = null;
        this._cloudPlaneGeo = null;
        this._tmp = new THREE.Vector3();
        this._fogColor = new THREE.Color();
        this._lastFogAlt = Number.NaN;
        this._lastFogDens = Number.NaN;
        /** 雲 billboard／uniforms 更新步幅（1=每幀）；飛行中可提高 */
        this.cloudUpdateStride = 1;
        /** 高度霧重算最小高度差（公尺）；飛行中可加大 */
        this.fogAltitudeEpsilon = 2;
        scene.add(this.decor);
    }

    buildAll() {
        this._buildSky();
        this._buildLights();
        // 燈光建立後再套一次仰角／強度，避免 _buildSky 時 sunLight 尚未存在
        this._updateSunPosition();
        this._buildLensflare();
        this._applyHeightFog(120);
        this.rebuildDecor();
    }

    /** 高度霧：低空較濃、高空較稀。複用 Color，避免每幀 new 觸發 GC。 */
    _applyHeightFog(altitude, force = false) {
        const eps = this.fogAltitudeEpsilon;
        if (!force && Number.isFinite(this._lastFogAlt) && Math.abs(altitude - this._lastFogAlt) < eps) {
            return;
        }
        this._lastFogAlt = altitude;

        const h = this._fogHeight;
        const t = Math.max(0, Math.min(0.85, altitude / (h * 2.2)));
        const dens = this._fogBase * (1.35 - t);
        this._fogColor.setHSL(0.58, 0.42, 0.16 + Math.min(0.14, altitude / 900));
        if (!this.scene.fog || !(this.scene.fog instanceof THREE.FogExp2)) {
            this.scene.fog = new THREE.FogExp2(this._fogColor.getHex(), dens);
            this._lastFogDens = dens;
            return;
        }
        this.scene.fog.color.copy(this._fogColor);
        if (!Number.isFinite(this._lastFogDens) || Math.abs(dens - this._lastFogDens) > 1e-7) {
            this.scene.fog.density = dens;
            this._lastFogDens = dens;
        }
    }

    _buildSky() {
        this.sky = new Sky();
        this.sky.scale.setScalar(this.env.sky_scale ?? 4500);
        this.scene.add(this.sky);
        this._patchSkySunShader(this.sky.material);
        this._applySkyUniforms();
        this._updateSunPosition();
    }

    /**
     * 確認 build 後太陽盤／暈光修改真的進 shader：
     * - 柔化硬邊 sundisc（50000 clamp → smoothstep）
     * - 壓低內建 760× 高光，再由 showSunDisc uniform 微調
     * - 關閉 Sky 內建平面噪點雲，避免與場景積雲搶戲
     */
    _patchSkySunShader(material) {
        if (!material?.fragmentShader) return;
        let fs = material.fragmentShader;
        const before = fs;

        fs = fs.replace(
            'float sundisc = clamp( ( cosTheta - sunAngularDiameterCos ) * 50000.0, 0.0, 1.0 ) * showSunDisc;',
            [
                // 柔邊太陽盤：可辨方向但不刺眼
                'float sundiscCore = smoothstep( sunAngularDiameterCos - 0.00022, sunAngularDiameterCos + 0.00004, cosTheta );',
                'float sundiscHalo = smoothstep( sunAngularDiameterCos - 0.0018, sunAngularDiameterCos - 0.0001, cosTheta );',
                'float sundisc = mix( sundiscHalo * 0.22, sundiscCore, sundiscCore ) * showSunDisc;',
            ].join('\n\t\t\t')
        );
        fs = fs.replace(
            'vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );',
            'vec3 sundiscColor = ( 95.0 * sundisc ) * min( vSunE * Fex, 14.0 );'
        );

        if (fs !== before) {
            material.fragmentShader = fs;
            material.needsUpdate = true;
        }
    }

    _applySkyUniforms() {
        if (!this.sky?.material?.uniforms) return;
        const u = this.sky.material.uniforms;
        u.turbidity.value = this.env.sky_turbidity ?? 14.0;
        u.rayleigh.value = this.env.sky_rayleigh ?? 0.72;
        u.mieCoefficient.value = this.env.sky_mie_coefficient ?? 0.0032;
        u.mieDirectionalG.value = this.env.sky_mie_directional_g ?? 0.48;
        // Sky.js 太陽盤預設極亮（~760×）；shader 已壓基數，再以倍率微調
        if (u.showSunDisc) {
            u.showSunDisc.value = Math.max(0, Math.min(1, this.env.sky_sun_disc ?? 0.06));
        }
        // 關閉天穹內建雲層（場景改用 FBM 積雲片）
        if (u.cloudCoverage) u.cloudCoverage.value = 0;
    }

    _updateSunPosition() {
        const elev = this.env.sky_elevation ?? 3.2;
        const azi = this.env.sky_azimuth ?? 185;
        const phi = THREE.MathUtils.degToRad(90 - elev);
        const theta = THREE.MathUtils.degToRad(azi);
        this.sunDirection.setFromSphericalCoords(1, phi, theta);
        SUN_DIR.copy(this.sunDirection);

        if (this.sky?.material?.uniforms?.sunPosition) {
            this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
        }
        if (this.sunLight) {
            this.sunLight.position.copy(this.sunDirection).multiplyScalar(220);
            // 低仰角時再降強度、偏暖（基準來自 config）
            const elev01 = Math.max(0, Math.min(1, elev / 45));
            const base = this.env.sun_intensity ?? 0.38;
            this.sunLight.intensity = base * (0.65 + elev01 * 0.4);
            this.sunLight.color.setHSL(0.07 + elev01 * 0.04, 0.48, 0.82);
        }
    }

    _buildLights() {
        const sunI = this.env.sun_intensity ?? 0.38;
        const ambI = this.env.ambient_intensity ?? 0.28;
        const hemiI = this.env.hemisphere_intensity ?? 0.42;
        const fillI = this.env.fill_intensity ?? 0.26;
        const rimI = this.env.rim_intensity ?? 0.18;

        this.sunLight = new THREE.DirectionalLight(0xffd4a8, sunI);
        this.sunLight.position.copy(this.sunDirection).multiplyScalar(220);
        this.scene.add(this.sunLight);
        this.scene.add(new THREE.AmbientLight(0x2a4060, ambI));
        this.scene.add(new THREE.HemisphereLight(0x5a7aa0, 0x081828, hemiI));

        const fill = new THREE.DirectionalLight(0x5a78a8, fillI);
        fill.position.set(60, 25, -40);
        this.scene.add(fill);

        const rim = new THREE.DirectionalLight(0xff9966, rimI);
        rim.position.set(40, 10, -80);
        this.scene.add(rim);

        this.exhaustLight = new THREE.PointLight(0xff6622, 0, 28, 2);
        this.scene.add(this.exhaustLight);
    }

    _buildLensflare() {
        if (this.env.lensflare_enabled === false) return;

        const flare0 = loadTextureWithFallback(
            '/textures/lensflare/lensflare0.png',
            () => createProceduralLensflare(256, true),
            { colorSpace: THREE.SRGBColorSpace }
        );
        const flare2 = loadTextureWithFallback(
            '/textures/lensflare/lensflare2.png',
            () => createProceduralLensflare(128, false),
            { colorSpace: THREE.SRGBColorSpace }
        );
        const flare3 = loadTextureWithFallback(
            '/textures/lensflare/lensflare3.png',
            () => createProceduralLensflare(64, false),
            { colorSpace: THREE.SRGBColorSpace }
        );

        const s = Math.max(0.1, Math.min(1.2, this.env.lensflare_scale ?? 0.25));
        this._lensflare = new Lensflare();
        this._lensflare.addElement(new LensflareElement(flare0, 520 * s, 0, new THREE.Color(0xffdcc0)));
        this._lensflare.addElement(new LensflareElement(flare3, 50 * s, 0.25, new THREE.Color(0xbb7744)));
        this._lensflare.addElement(new LensflareElement(flare2, 90 * s, 0.45, new THREE.Color(0x5577aa)));
        this._lensflare.addElement(new LensflareElement(flare3, 70 * s, 0.7, new THREE.Color(0xaa5522)));
        this._lensflare.addElement(new LensflareElement(flare2, 130 * s, 0.9, new THREE.Color(0xddccaa)));

        // 遠距錨點：跟隨相機沿陽光方向，直視太陽時才明顯
        this._flareAnchor = new THREE.Object3D();
        this._flareAnchor.add(this._lensflare);
        this.scene.add(this._flareAnchor);
    }

    _makeIsland(x, z, s = 1, style = 0) {
        const g = new THREE.Group();
        const sandCols = [0xc9b896, 0xd4c4a0, 0xb8a878];
        const hillCols = [0x2a6b38, 0x1e5530, 0x3a7a42, 0x4a6840];

        const sand = new THREE.Mesh(
            new THREE.CylinderGeometry(48 * s * (style === 2 ? 0.7 : 1), 58 * s, 3.5 + style, 10 + style * 2),
            new THREE.MeshStandardMaterial({ color: sandCols[style % 3], roughness: 0.9, metalness: 0.05 })
        );
        sand.position.y = 1.5;
        g.add(sand);

        if (style !== 2) {
            const hill = new THREE.Mesh(
                new THREE.ConeGeometry(28 * s, 18 * s + style * 4, 7),
                new THREE.MeshStandardMaterial({ color: hillCols[style % 4], roughness: 1, flatShading: true })
            );
            hill.position.y = 10 * s;
            g.add(hill);
            for (let k = 0; k < 3; k++) {
                const peak = new THREE.Mesh(
                    new THREE.ConeGeometry(8 * s, 10 * s, 5),
                    new THREE.MeshStandardMaterial({ color: hillCols[(style + k) % 4], roughness: 1, flatShading: true })
                );
                peak.position.set((k - 1) * 14 * s, 8 * s, (k % 2) * 8 * s);
                g.add(peak);
            }
        } else {
            const atoll = new THREE.Mesh(
                new THREE.TorusGeometry(22 * s, 4 * s, 6, 16),
                new THREE.MeshStandardMaterial({ color: 0x2a6b50, roughness: 0.95 })
            );
            atoll.rotation.x = Math.PI / 2;
            atoll.position.y = 2;
            g.add(atoll);
        }

        const treeMat = new THREE.MeshStandardMaterial({ color: 0x1a4a28, roughness: 1, flatShading: true });
        const treeCount = style === 3 ? 4 : 6 + (style === 2 ? 4 : 0);
        for (let i = 0; i < treeCount; i++) {
            const t = new THREE.Mesh(new THREE.ConeGeometry(2.2 * s, 7 * s, 5), treeMat);
            const a = (i / treeCount) * Math.PI * 2 + Math.random();
            const r = (14 + Math.random() * 22) * s;
            t.position.set(Math.cos(a) * r, 4 * s, Math.sin(a) * r);
            g.add(t);
        }

        g.position.set(x, 0, z);
        this.decor.add(g);
    }

    _buildIslands() {
        for (let i = 0; i < this.env.island_count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 200 + Math.random() * 1600;
            this._makeIsland(Math.cos(ang) * dist, Math.sin(ang) * dist - 400, 0.6 + Math.random() * 1.4, i % 4);
        }
    }

    _buildMountains() {
        const count = this.env.mountain_count;
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a2a40, roughness: 1, flatShading: true });
        const mat2 = new THREE.MeshStandardMaterial({ color: 0x243550, roughness: 1, flatShading: true });
        const mat3 = new THREE.MeshStandardMaterial({ color: 0x152030, roughness: 1, flatShading: true });
        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2 + Math.random() * 0.15;
            const dist = 1400 + Math.random() * 700;
            const h = 220 + Math.random() * 320;
            const m = new THREE.Mesh(
                new THREE.ConeGeometry(140 + Math.random() * 180, h, 5 + ((Math.random() * 3) | 0)),
                i % 3 === 0 ? mat3 : i % 2 ? mat : mat2
            );
            m.position.set(Math.cos(ang) * dist, h * 0.35, Math.sin(ang) * dist);
            this.decor.add(m);
            if (Math.random() > 0.4) {
                const m2 = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.random() * 120, h * 0.75, 5), mat);
                m2.position.set(Math.cos(ang + 0.08) * (dist - 80), h * 0.25, Math.sin(ang + 0.08) * (dist - 80));
                this.decor.add(m2);
            }
        }
    }

    _makeCloudMat(opacity, seed) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: opacity },
                uTime: { value: 0 },
                uSeed: { value: seed },
                uColor: { value: new THREE.Color(0xe6eef8) },
                uSunDir: { value: this.sunDirection.clone() },
            },
            vertexShader: CLOUD_VERT,
            fragmentShader: CLOUD_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
            fog: true,
        });
    }

    /**
     * FBM 噪點積雲片：多層錯開平面，柔邊 alpha，避免圓盤／甜甜圈外觀。
     */
    _buildClouds() {
        const total = Math.max(0, this.env.cloud_count ?? 18);
        const quality = this.env.cloud_quality ?? 0; // 0=低 1=中 2=高
        const sheetsMul = quality >= 2 ? 1.15 : quality >= 1 ? 1 : 0.55;

        const perLayer = [
            Math.round(total * 0.28),
            Math.round(total * 0.4),
            Math.max(0, total - Math.round(total * 0.28) - Math.round(total * 0.4)),
        ];

        // 共用幾何；每片獨立 material（seed／opacity）
        const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);

        for (let layer = 0; layer < 3; layer++) {
            for (let i = 0; i < perLayer[layer]; i++) {
                const opac = layer === 0
                    ? 0.38 + Math.random() * 0.22
                    : layer === 1 ? 0.44 + Math.random() * 0.26 : 0.32 + Math.random() * 0.2;
                const cg = new THREE.Group();
                const scale = (layer === 0 ? 90 : layer === 1 ? 62 : 120) + Math.random() * (layer === 2 ? 130 : 70);
                const sheetCount = Math.max(2, Math.round((3 + Math.random() * 2.5) * sheetsMul));

                for (let j = 0; j < sheetCount; j++) {
                    const seed = (i * 17.3 + j * 9.1 + layer * 31.7) % 100;
                    const mat = this._makeCloudMat(opac * (0.55 + Math.random() * 0.45), seed);
                    const m = new THREE.Mesh(planeGeo, mat);
                    const sx = scale * (0.55 + Math.random() * 0.7);
                    const sy = scale * (0.28 + Math.random() * 0.38);
                    m.scale.set(sx, sy, 1);
                    m.position.set(
                        (Math.random() - 0.5) * scale * 1.15,
                        (Math.random() - 0.5) * scale * 0.22,
                        (Math.random() - 0.5) * scale * 0.85
                    );
                    // 錯開朝向：近似體積感，不全是對相機的圓片
                    m.rotation.y = Math.random() * Math.PI;
                    m.rotation.x = (Math.random() - 0.5) * 0.35;
                    m.rotation.z = (Math.random() - 0.5) * 0.25;
                    m.renderOrder = -2;
                    m.userData.billboard = j % 2 === 0; // 半數跟隨相機，其餘固定姿態
                    cg.add(m);
                }

                const yBase = layer === 0 ? 240 : layer === 1 ? 110 : 420;
                cg.position.set(
                    (Math.random() - 0.5) * 4200,
                    yBase + Math.random() * 80,
                    (Math.random() - 0.5) * 4200
                );
                cg.userData.drift = 2 + Math.random() * 5;
                cg.userData.radius = scale * 0.9;
                this.decor.add(cg);
                this.cloudGroups.push(cg);
            }
        }

        // 幾何由各 mesh 共享；dispose 時只 dispose 一次
        this._cloudPlaneGeo = planeGeo;
    }

    /**
     * 相機／機體在雲內的密度 0–1（穿雲效果用）。
     * @param {THREE.Vector3} position
     */
    sampleCloudDensity(position) {
        let dens = 0;
        for (const cg of this.cloudGroups) {
            const r = cg.userData.radius || 40;
            const r2 = r * r;
            const d2 = position.distanceToSquared(cg.position);
            if (d2 < r2) {
                dens = Math.max(dens, 1 - Math.sqrt(d2) / r);
            }
        }
        return dens;
    }

    _buildBuoys() {
        const poleMat = new THREE.MeshStandardMaterial({
            color: 0xcc4422, metalness: 0.4, roughness: 0.5, emissive: 0x441100, emissiveIntensity: 0.3,
        });
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
        for (let i = 0; i < this.env.buoy_count; i++) {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 4, 6), poleMat));
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat);
            lamp.position.y = 2.5;
            g.add(lamp);
            g.position.set((Math.random() - 0.5) * 1200, 0, -200 - Math.random() * 2000);
            g.userData.isBuoy = true;
            this.decor.add(g);
        }
    }

    _buildDistantPatrol() {
        for (let f = 0; f < 3; f++) {
            const form = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const dummy = new THREE.Mesh(
                    new THREE.ConeGeometry(2.5, 10, 4),
                    new THREE.MeshBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.55 })
                );
                dummy.rotation.x = Math.PI / 2;
                dummy.position.set((i - 1.5) * 28, Math.sin(i) * 6, i * 18);
                form.add(dummy);
            }
            form.position.set((f - 1) * 400, 120 + f * 30, -800 - f * 700);
            form.userData = { speed: 8 + f * 2, phase: f };
            this.decor.add(form);
            this.distantCraft.push(form);
        }
    }

    rebuildDecor() {
        while (this.decor.children.length) {
            const child = this.decor.children[0];
            this.decor.remove(child);
            child.traverse?.((o) => {
                // 共用雲平面幾何稍後統一 dispose
                if (o.geometry && o.geometry !== this._cloudPlaneGeo) o.geometry.dispose?.();
                if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
                else o.material?.dispose?.();
            });
        }
        if (this._cloudPlaneGeo) {
            this._cloudPlaneGeo.dispose();
            this._cloudPlaneGeo = null;
        }
        this.cloudGroups.length = 0;
        this.distantCraft.length = 0;
        if ((this.env.island_count ?? 0) > 0) this._buildIslands();
        if ((this.env.mountain_count ?? 0) > 0) this._buildMountains();
        this._buildClouds();
        if ((this.env.buoy_count ?? 0) > 0) this._buildBuoys();
        this._buildDistantPatrol();
    }

    /**
     * @param {number} dt
     * @param {number} time
     * @param {THREE.Camera} [camera]
     */
    /**
     * @param {number} dt
     * @param {number} time
     * @param {THREE.Camera} [camera]
     * @param {{ updateFog?: boolean }} [opts]
     */
    update(dt, time, camera = null, opts = {}) {
        if (camera && opts.updateFog !== false) this._applyHeightFog(camera.position.y);

        // Lensflare 錨在相機前方陽光方向
        if (this._flareAnchor && camera) {
            this._flareAnchor.position
                .copy(camera.position)
                .addScaledVector(this.sunDirection, 800);
            this._flareAnchor.visible = this.sunDirection.y > -0.05;
        }

        this._cloudTick = (this._cloudTick | 0) + 1;
        const stride = Math.max(1, this.cloudUpdateStride | 0);
        const doCloudVisual = (this._cloudTick % stride) === 0;
        const camPos = camera?.position;
        for (const cg of this.cloudGroups) {
            cg.position.x += (cg.userData.drift || 3) * dt * 0.35;
            if (cg.position.x > 2300) cg.position.x = -2300;

            if (!doCloudVisual) continue;

            // 遠雲再降頻：近雲依 stride，遠雲約 2×stride
            let near = true;
            if (camPos) {
                const dx = cg.position.x - camPos.x;
                const dz = cg.position.z - camPos.z;
                near = (dx * dx + dz * dz) < 900000; // ~950m
            }
            if (!near && (this._cloudTick % (stride * 2)) !== 0) continue;

            for (const child of cg.children) {
                if (child.material?.uniforms?.uTime) {
                    child.material.uniforms.uTime.value = time;
                }
                // 太陽方向極少變動；僅在近雲幀寫入即可
                if (near && child.material?.uniforms?.uSunDir) {
                    child.material.uniforms.uSunDir.value.copy(this.sunDirection);
                }
                if (camera && child.userData.billboard) {
                    child.quaternion.copy(camera.quaternion);
                }
            }
        }
        for (const form of this.distantCraft) {
            form.position.z -= form.userData.speed * dt;
            form.position.y += Math.sin(time * 0.4 + form.userData.phase) * 0.15;
            if (form.position.z < -3200) form.position.z = 200;
        }
        // 浮標動畫不需每幀；隔幀即可
        if ((this._cloudTick & 1) === 1) {
            for (const child of this.decor.children) {
                if (child.userData.isBuoy) {
                    child.position.y = Math.sin(time * 1.5 + child.position.x * 0.01) * 0.6;
                }
            }
        }
    }
}
