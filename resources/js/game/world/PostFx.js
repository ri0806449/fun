import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { clampGradeExposure } from './atmosphereLimits.js';
import { resolvePostFxFlags } from './postFxFlags.js';
import {
    HEAT_SHIMMER_SHADER,
    MAX_HEAT_SOURCES,
    clearHeatSlots,
} from '../fx/HeatHaze.js';

const GRADE_SHADER = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        speed: { value: 0.5 },
        caAmount: { value: 0 },
        boostAmount: { value: 0 },
        motionBlur: { value: 0 },
        radialBlur: { value: 0 },
        cloudWet: { value: 0 },
        gradeExposure: { value: 0.9 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    // 避免：顛倒 smoothstep、依賴動態權重的 for 迴圈（部分 WebGL 實作會整屏變黑）
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float speed;
        uniform float caAmount;
        uniform float boostAmount;
        uniform float motionBlur;
        uniform float radialBlur;
        uniform float cloudWet;
        uniform float gradeExposure;
        varying vec2 vUv;
        void main(){
            vec2 uv=vUv;
            vec2 cc=uv-0.5;
            float dist=dot(cc,cc);
            float blur=clamp(speed*speed,0.0,1.0);
            float boost=clamp(boostAmount,0.0,1.0);
            float mb=clamp(motionBlur,0.0,1.0);
            float rb=clamp(radialBlur,0.0,1.5);

            uv+=cc*dist*(0.028+blur*0.05+boost*0.04);

            vec4 c=texture2D(tDiffuse,uv);

            // 簡化 motion／radial：固定 3-tap，不用動態 w 迴圈
            if(mb>0.04){
                vec2 mdir=normalize(cc+vec2(0.0001))*dist*mb*0.06*(0.55+boost*0.9);
                vec4 a=texture2D(tDiffuse,uv-mdir);
                vec4 b=texture2D(tDiffuse,uv+mdir);
                c=mix(c,(a+c+b)/3.0,clamp(mb*0.85,0.0,0.7));
            }
            float radial=blur*blur+rb*boost;
            if(radial>0.08){
                vec2 rdir=cc*dist*radial*0.05;
                vec4 a=texture2D(tDiffuse,uv-rdir);
                vec4 b=texture2D(tDiffuse,uv+rdir);
                c=mix(c,(a+c+b)/3.0,clamp(radial*0.75,0.0,0.55));
            }

            float ca=caAmount*smoothstep(0.08,0.55,dist);
            if(ca>0.001){
                float r=texture2D(tDiffuse,uv+cc*ca*0.018).r;
                float b=texture2D(tDiffuse,uv-cc*ca*0.014).b;
                c.rgb=mix(c.rgb,vec3(r,c.g,b),clamp(ca*0.85,0.0,1.0));
            }

            if(cloudWet>0.001){
                float w=clamp(cloudWet,0.0,1.0);
                c.rgb=mix(c.rgb,c.rgb*vec3(0.92,0.96,1.05)+vec3(0.08),w*0.35);
                c.rgb=mix(c.rgb,vec3(dot(c.rgb,vec3(0.3,0.59,0.11))),w*0.12);
            }

            c.rgb=mix(c.rgb,c.rgb*vec3(0.88,0.94,1.06),0.22);
            c.rgb*=max(gradeExposure,0.45);
            float vig=1.0-smoothstep(0.28,1.12,dist*(1.7+blur*0.9+boost*0.35));
            c.rgb*=clamp(vig,0.42,1.0);
            float streak=pow(max(0.0,abs(cc.x)-0.15),2.0)*(blur+boost)*0.1;
            c.rgb+=vec3(0.45,0.62,0.88)*streak;
            gl_FragColor=vec4(c.rgb,1.0);
        }`,
};

/**
 * PostFx — RenderPass + 可選 SSAO／HeatShimmer／DoF／bloom／grade／Film／Output。
 * LDR 預設（UnsignedByte、無 OutputPass）以避免 WebKit／Electron 整屏黑（見 d69dd28）。
 * 高階效果可開可關；飛行降載由 setFlightLoadShed／flags 控制。
 */
export class PostFx {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {number} width
     * @param {number} height
     * @param {object} [visual]
     * @param {object} [performance]
     */
    constructor(renderer, scene, camera, width, height, visual = {}, performance = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.visual = visual;
        this.performance = performance;
        this.composer = null;
        this.bloom = null;
        this.gradePass = null;
        this.filmPass = null;
        this.ssaoPass = null;
        this.bokehPass = null;
        /** @type {import('three').ShaderMaterial|null} Composer 外的熱氣全螢幕材質 */
        this.heatMaterial = null;
        /** @type {FullScreenQuad|null} */
        this._heatQuad = null;
        /** @type {THREE.WebGLRenderTarget|null} 無 composer 時的 beauty RT */
        this._beautyRT = null;
        this._flags = resolvePostFxFlags(visual, performance, { flying: false });
        this._useComposer = this._flags.composerEnabled;
        this._flying = false;
        this._frame = 0;
        this._heavyEnabled = true;

        this._ca = 0;
        this._caTarget = 0;
        this.caMax = visual.ca_max ?? 1.0;
        this.boostBlurScale = visual.boost_blur ?? 1.0;
        this.motionBlurScale = visual.motion_blur ?? 1.0;
        this.radialBlurScale = visual.radial_blur ?? 1.0;
        /** 加力時 DoF／grade blur 削弱（1=加力完全清晰） */
        this.boostClarity = visual.boost_clarity ?? 1.0;
        this._boost = 0;
        this._boostClarityAmt = 0;
        this._cloudWet = 0;

        this._heatSlots = Array.from(
            { length: MAX_HEAT_SOURCES },
            () => new THREE.Vector4(0, 0, 0, 0.08)
        );

        if (this._useComposer) {
            try {
                this._buildComposer(width, height, visual);
            } catch (err) {
                console.warn('[PostFx] composer 建置失敗，降級為直接 render', err);
                this._useComposer = false;
                this.composer = null;
            }
        }
        if (this._flags.heat && !this.heatMaterial) {
            this._initHeatBlit(this._flags.heatIntensity);
            this._ensureBeautyRT(width, height);
        }
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {object} visual
     */
    _buildComposer(width, height, visual) {
        const flags = this._flags;
        // 預設走 LDR（UnsignedByte、無 OutputPass）：
        // - EffectComposer 預設 HalfFloat 在部分 WebKit／Electron 合成整屏黑
        // - UnsignedByte + OutputPass 會二次 ACES 也近黑
        // 需要 bloom／HDR 時設 visual.force_hdr = true（仍可能在不支援的 GPU 黑屏）
        const forceHdr = visual.force_hdr === true;
        const gl = this.renderer.getContext();
        const canFloat = forceHdr && !!(
            gl.getExtension('EXT_color_buffer_float')
            || gl.getExtension('EXT_color_buffer_half_float')
            || gl.getExtension('WEBGL_color_buffer_float')
        );
        this._composerHdr = canFloat;

        const pr = this.renderer.getPixelRatio();
        const rt = new THREE.WebGLRenderTarget(
            Math.max(1, Math.floor(width * pr)),
            Math.max(1, Math.floor(height * pr)),
            {
                type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
                format: THREE.RGBAFormat,
                magFilter: THREE.LinearFilter,
                minFilter: THREE.LinearFilter,
                depthBuffer: true,
            }
        );
        rt.texture.name = 'EffectComposer.rt1';
        this.composer = new EffectComposer(this.renderer, rt);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        let ssaoOk = false;
        if (flags.ssao) {
            try {
                this.ssaoPass = new SSAOPass(
                    this.scene,
                    this.camera,
                    width,
                    height,
                    flags.ssaoKernelSize
                );
                this.ssaoPass.kernelRadius = flags.ssaoKernelRadius;
                this.ssaoPass.minDistance = flags.ssaoMinDistance;
                this.ssaoPass.maxDistance = flags.ssaoMaxDistance;
                this.ssaoPass.output = SSAOPass.OUTPUT.Default;
                this.composer.addPass(this.ssaoPass);
                ssaoOk = true;
            } catch (err) {
                console.warn('[PostFx] SSAO 不可用，已跳過', err);
                this.ssaoPass = null;
            }
        }

        // HeatShimmer 不進 EffectComposer（LDR＋自訂 ShaderPass 在 WebKit 易整屏黑，見 d69dd28）。
        // 改於 render() 尾端以 FullScreenQuad 折射 beauty buffer。
        if (flags.heat) {
            this._initHeatBlit(flags.heatIntensity);
        }

        let dofOk = false;
        if (flags.dof) {
            try {
                this.bokehPass = new BokehPass(this.scene, this.camera, {
                    focus: 16,
                    aperture: flags.dofAperture,
                    maxblur: flags.dofMaxBlur,
                });
                this.composer.addPass(this.bokehPass);
                dofOk = true;
            } catch (err) {
                console.warn('[PostFx] DoF/Bokeh 不可用，已跳過', err);
                this.bokehPass = null;
            }
        }

        // Bloom 內部固定 HalfFloat；僅 HDR 路徑開啟
        const bloomEnabled = this._composerHdr
            && visual.bloom_enabled !== false
            && (visual.bloom_strength ?? 0.28) > 0.01;
        if (bloomEnabled) {
            this.bloom = new UnrealBloomPass(
                new THREE.Vector2(width, height),
                visual.bloom_strength ?? 0.28,
                visual.bloom_radius ?? 0.38,
                visual.bloom_threshold ?? 0.94
            );
            this.composer.addPass(this.bloom);
        }

        // grade／film 預設關閉：ShaderPass 在部分 WebGL＋LDR composer 會整屏黑
        const gradeEnabled = visual.grade_enabled === true;
        if (gradeEnabled) {
            this.gradePass = new ShaderPass(GRADE_SHADER);
            this.gradePass.uniforms.gradeExposure.value = clampGradeExposure(visual.grade_exposure ?? 0.95);
            this.composer.addPass(this.gradePass);
        }

        if (gradeEnabled && visual.film_enabled === true && (visual.film_intensity ?? 0.2) > 0.01) {
            this.filmPass = new FilmPass(visual.film_intensity ?? 0.2, false);
            this.composer.addPass(this.filmPass);
        }

        // UnsignedByte RT 已經過 renderer.toneMapping 變成 LDR；
        // 再加 OutputPass 會二次 ACES → WebKit／LDR 路徑整屏近黑。
        // HalfFloat／HDR 路徑才需要 OutputPass 做最終 tone map。
        if (this._composerHdr) {
            this.composer.addPass(new OutputPass());
        }

        const hasExtra = bloomEnabled
            || gradeEnabled
            || this._composerHdr
            || ssaoOk
            || dofOk;
        if (!hasExtra) {
            this.composer = null;
            this._useComposer = false;
        }

        // 僅 Heat、無其他 pass 時仍需 beauty RT 供折射
        if (!this.composer && this.heatMaterial) {
            this._ensureBeautyRT(width, height);
        }

        this._applyHeavyPassEnabled(true);
    }

    /**
     * Composer 外的熱氣扭曲（避開 LDR Composer ShaderPass 整屏黑）。
     * 先以 copy shader 建材質並實際畫過一幀，再換成完整折射（否則初編譯常壞）。
     * @param {number} intensity
     */
    _initHeatBlit(intensity) {
        try {
            const copyFrag = `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tDiffuse,vUv); }`;
            this.heatMaterial = new THREE.ShaderMaterial({
                name: 'HeatShimmerBlit',
                uniforms: {
                    tDiffuse: { value: null },
                    uTime: { value: 0 },
                    uScale: { value: intensity },
                    uHeat0: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat1: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat2: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat3: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat4: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat5: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat6: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                    uHeat7: { value: new THREE.Vector4(0, 0, 0, 0.08) },
                },
                vertexShader: HEAT_SHIMMER_SHADER.vertexShader,
                fragmentShader: copyFrag,
                depthTest: false,
                depthWrite: false,
            });
            this._heatQuad = new FullScreenQuad(this.heatMaterial);
            this._heatShaderPhase = 0;
        } catch (err) {
            console.warn('[PostFx] HeatShimmer blit 不可用', err);
            this.heatMaterial = null;
            this._heatQuad = null;
        }
    }

    /**
     * @param {number} width
     * @param {number} height
     */
    _ensureBeautyRT(width, height) {
        const pr = this.renderer.getPixelRatio();
        const w = Math.max(1, Math.floor(width * pr));
        const h = Math.max(1, Math.floor(height * pr));
        if (this._beautyRT) {
            this._beautyRT.setSize(w, h);
            return;
        }
        this._beautyRT = new THREE.WebGLRenderTarget(w, h, {
            type: THREE.UnsignedByteType,
            format: THREE.RGBAFormat,
            magFilter: THREE.LinearFilter,
            minFilter: THREE.LinearFilter,
            depthBuffer: true,
        });
        this._beautyRT.texture.name = 'PostFx.beauty';
    }

    /**
     * 飛行／選單切換時重算 SSAO／DoF／Heat 開關（含 flight_* 降載）。
     * @param {boolean} flying
     */
    setFlightLoadShed(flying) {
        this._flying = !!flying;
        this._flags = resolvePostFxFlags(this.visual, this.performance, { flying: this._flying });
        this._applyHeavyPassEnabled(true);
        if (this.heatMaterial) {
            this.heatMaterial.uniforms.uScale.value = this._flags.heatIntensity;
        }
        if (this._flags.heat && !this.heatMaterial) {
            this._initHeatBlit(this._flags.heatIntensity);
        }
    }

    /**
     * @param {boolean} [force]
     */
    _applyHeavyPassEnabled(force = false) {
        const stride = this._flags.postFxStride ?? 1;
        const heavyThisFrame = force || stride <= 1 || (this._frame % stride) === 0;
        this._heavyEnabled = heavyThisFrame;

        if (this.ssaoPass) {
            this.ssaoPass.enabled = this._flags.ssao && heavyThisFrame;
        }
        if (this.bokehPass) {
            this.bokehPass.enabled = this._flags.dof && heavyThisFrame;
        }
    }

    setSize(width, height) {
        if (this.composer) {
            this.composer.setSize(width, height);
            this.bloom?.setSize(width, height);
            this.ssaoPass?.setSize(width, height);
            this.bokehPass?.setSize(width, height);
        }
        if (this.heatMaterial) {
            this._ensureBeautyRT(width, height);
        }
    }

    /**
     * @param {THREE.Vector4[]} slots
     */
    setHeatSlots(slots) {
        if (!this.heatMaterial) return;
        clearHeatSlots(this._heatSlots);
        const n = Math.min(MAX_HEAT_SOURCES, slots.length);
        for (let i = 0; i < n; i++) {
            this._heatSlots[i].copy(slots[i]);
        }
        const u = this.heatMaterial.uniforms;
        u.uHeat0.value.copy(this._heatSlots[0]);
        u.uHeat1.value.copy(this._heatSlots[1]);
        u.uHeat2.value.copy(this._heatSlots[2]);
        u.uHeat3.value.copy(this._heatSlots[3]);
        u.uHeat4.value.copy(this._heatSlots[4]);
        u.uHeat5.value.copy(this._heatSlots[5]);
        u.uHeat6.value.copy(this._heatSlots[6]);
        u.uHeat7.value.copy(this._heatSlots[7]);
    }

    /**
     * 更新 DoF 對焦距離（相機到玩家機）。
     * @param {number} focusDistance
     * @param {number} [closeness=0] 0–1，拉近／特寫時略增模糊
     * @param {{ boostClarity?: number }} [opts] boostClarity 0–1，加力時關閉／大幅減弱 DoF
     */
    setFocusDistance(focusDistance, closeness = 0, opts = {}) {
        if (!this.bokehPass?.uniforms) return;
        const focus = Number.isFinite(focusDistance) ? Math.max(0.5, focusDistance) : 16;
        this.bokehPass.uniforms.focus.value = focus;
        const baseAperture = this._flags.dofAperture;
        const baseBlur = this._flags.dofMaxBlur;
        const c = Math.max(0, Math.min(1, closeness));
        const clarity = Math.max(0, Math.min(1, opts.boostClarity ?? 0));
        this._boostClarityAmt = clarity;
        // 加力：幾乎關閉 DoF，避免後拉／look-ahead 讓機體離焦整機糊掉
        const dofScale = Math.max(0, 1 - clarity * this.boostClarity);
        this.bokehPass.uniforms.aperture.value = baseAperture * (1 + c * 1.4) * dofScale;
        this.bokehPass.uniforms.maxblur.value = baseBlur * (1 + c * 1.8) * dofScale;
        if (this._flags.dof) {
            this.bokehPass.enabled = dofScale > 0.04 && this._heavyEnabled;
        }
    }

    /**
     * @param {number} time
     * @param {number} speedNorm
     * @param {{ damage?: number, nearBoom?: number, dive?: number, boosting?: boolean, cloudWet?: number }} [impulse]
     */
    update(time, speedNorm, impulse = {}) {
        this._frame += 1;
        this._applyHeavyPassEnabled(false);

        if (this.heatMaterial) {
            this.heatMaterial.uniforms.uTime.value = time;
        }

        if (this.ssaoPass) {
            this.ssaoPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value
                .copy(this.camera.projectionMatrix);
            this.ssaoPass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value
                .copy(this.camera.projectionMatrixInverse);
        }

        if (!this.gradePass) return;

        this.gradePass.uniforms.time.value = time;
        this.gradePass.uniforms.speed.value = speedNorm;

        const dmg = impulse.damage ?? 0;
        const boom = impulse.nearBoom ?? 0;
        const dive = impulse.dive ?? 0;
        this._caTarget = Math.min(
            this.caMax,
            dmg * 0.9 + boom * 0.75 + dive * 0.55
        );
        this._ca += (this._caTarget - this._ca) * 0.12;
        if (this._caTarget < this._ca) this._ca += (this._caTarget - this._ca) * 0.08;
        this.gradePass.uniforms.caAmount.value = this._ca;

        const boosting = !!impulse.boosting;
        const boostTarget = boosting ? 1 : Math.max(0, (speedNorm - 0.85) * 3.5);
        this._boost += (boostTarget - this._boost) * (boosting ? 0.22 : 0.1);
        // 加力清晰：削弱 motion／radial，避免整機糊（週邊仍可留一點速度感）
        const clarity = boosting ? this.boostClarity : Math.max(0, this._boostClarityAmt);
        const blurKeep = Math.max(0.12, 1 - clarity * 0.92);
        const b = this._boost * this.boostBlurScale * blurKeep;
        this.gradePass.uniforms.boostAmount.value = b;
        this.gradePass.uniforms.motionBlur.value = (
            b * 0.85 * this.motionBlurScale
            + Math.max(0, speedNorm - 0.65) * 0.35 * this.motionBlurScale
        ) * blurKeep;
        this.gradePass.uniforms.radialBlur.value = (0.55 + b * 1.1) * this.radialBlurScale * blurKeep;

        const wetTarget = Math.max(0, Math.min(1, impulse.cloudWet ?? 0));
        // 絕對逼近目標，避免穿雲後 cloudWet 殘留把畫面鎖暗
        this._cloudWet += (wetTarget - this._cloudWet) * 0.15;
        if (wetTarget < 0.001 && this._cloudWet < 0.02) this._cloudWet = 0;
        this.gradePass.uniforms.cloudWet.value = this._cloudWet;
    }

    /** 瞬時色差衝擊（受傷／近距離爆炸）。 */
    pulseChromatic(amount = 0.7) {
        this._caTarget = Math.min(this.caMax, Math.max(this._caTarget, amount));
        this._ca = Math.min(this.caMax, Math.max(this._ca, amount * 0.85));
    }

    render() {
        const heatOn = this._flags.heat && this.heatMaterial && this._heatQuad;

        if (this._useComposer && this.composer) {
            if (heatOn) {
                const passes = this.composer.passes;
                const last = passes[passes.length - 1];
                const prevRTS = last.renderToScreen;
                last.renderToScreen = false;
                this.composer.render();
                last.renderToScreen = prevRTS;
                this._blitHeat(this.composer.readBuffer.texture);
                return;
            }
            this.composer.render();
            return;
        }

        if (heatOn) {
            const size = new THREE.Vector2();
            this.renderer.getSize(size);
            this._ensureBeautyRT(size.x, size.y);
            this.renderer.setRenderTarget(this._beautyRT);
            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            this._blitHeat(this._beautyRT.texture);
            return;
        }

        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * @param {THREE.Texture} beauty
     */
    _blitHeat(beauty) {
        this.heatMaterial.uniforms.tDiffuse.value = beauty;
        this.renderer.setRenderTarget(null);
        this._heatQuad.render(this.renderer);
        // 暖機：第 1 幀 copy；接著安裝完整 shader；再 nudge 一次 program（否則初編譯常整屏黑）
        if (this._heatShaderPhase === 0) {
            this.heatMaterial.fragmentShader = `${HEAT_SHIMMER_SHADER.fragmentShader}\n/* heat-v1 */\n`;
            this.heatMaterial.needsUpdate = true;
            this._heatShaderPhase = 1;
        } else if (this._heatShaderPhase === 1) {
            this.heatMaterial.fragmentShader = `${this.heatMaterial.fragmentShader} `;
            this.heatMaterial.needsUpdate = true;
            this._heatShaderPhase = 2;
        }
    }

    /** 強制關閉 composer（偵測到黑屏／不相容時由外部呼叫）。 */
    disableComposer() {
        this._useComposer = false;
    }

    /** @returns {ReturnType<typeof resolvePostFxFlags>} */
    get flags() {
        return this._flags;
    }
}
