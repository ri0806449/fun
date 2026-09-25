import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
            c.rgb*=max(gradeExposure,0.35);
            float vig=1.0-smoothstep(0.22,1.05,dist*(2.0+blur*1.2+boost*0.5));
            c.rgb*=clamp(vig,0.15,1.0);
            float streak=pow(max(0.0,abs(cc.x)-0.15),2.0)*(blur+boost)*0.1;
            c.rgb+=vec3(0.45,0.62,0.88)*streak;
            gl_FragColor=vec4(c.rgb,1.0);
        }`,
};

/**
 * PostFx — bloom + FilmPass + 色調／暈影／Motion Blur／Radial Blur／色差 + OutputPass。
 * 在不支援 HalfFloat RT 的 WebKit／部分 GPU 上自動降級為直接 render（避免整屏黑）。
 */
export class PostFx {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {number} width
     * @param {number} height
     * @param {{ bloom_strength?: number, bloom_radius?: number, bloom_threshold?: number, grade_exposure?: number, film_intensity?: number, boost_blur?: number, motion_blur?: number, radial_blur?: number, bloom_enabled?: boolean, film_enabled?: boolean, composer_enabled?: boolean }} [visual]
     */
    constructor(renderer, scene, camera, width, height, visual = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.visual = visual;
        this.composer = null;
        this.bloom = null;
        this.gradePass = null;
        this.filmPass = null;
        this._useComposer = visual.composer_enabled !== false;

        this._ca = 0;
        this._caTarget = 0;
        this.caMax = visual.ca_max ?? 1.0;
        this.boostBlurScale = visual.boost_blur ?? 1.0;
        this.motionBlurScale = visual.motion_blur ?? 1.0;
        this.radialBlurScale = visual.radial_blur ?? 1.0;
        this._boost = 0;
        this._cloudWet = 0;

        if (this._useComposer) {
            try {
                this._buildComposer(width, height, visual);
            } catch {
                this._useComposer = false;
                this.composer = null;
            }
        }
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {object} visual
     */
    _buildComposer(width, height, visual) {
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
            this.gradePass.uniforms.gradeExposure.value = visual.grade_exposure ?? 0.95;
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

        // 僅有 RenderPass 時 composer 等於多一次 RT blit，直接關掉走 renderer.render
        const hasExtra = bloomEnabled || gradeEnabled || this._composerHdr;
        if (!hasExtra) {
            this.composer = null;
            this._useComposer = false;
        }
    }

    setSize(width, height) {
        if (!this.composer) return;
        this.composer.setSize(width, height);
        this.bloom?.setSize(width, height);
    }

    /**
     * @param {number} time
     * @param {number} speedNorm
     * @param {{ damage?: number, nearBoom?: number, dive?: number, boosting?: boolean, cloudWet?: number }} [impulse]
     */
    update(time, speedNorm, impulse = {}) {
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
        const b = this._boost * this.boostBlurScale;
        this.gradePass.uniforms.boostAmount.value = b;
        this.gradePass.uniforms.motionBlur.value = b * 0.85 * this.motionBlurScale
            + Math.max(0, speedNorm - 0.65) * 0.35 * this.motionBlurScale;
        this.gradePass.uniforms.radialBlur.value = (0.55 + b * 1.1) * this.radialBlurScale;

        const wetTarget = impulse.cloudWet ?? 0;
        this._cloudWet += (wetTarget - this._cloudWet) * 0.15;
        this.gradePass.uniforms.cloudWet.value = this._cloudWet;
    }

    /** 瞬時色差衝擊（受傷／近距離爆炸）。 */
    pulseChromatic(amount = 0.7) {
        this._caTarget = Math.min(this.caMax, Math.max(this._caTarget, amount));
        this._ca = Math.min(this.caMax, Math.max(this._ca, amount * 0.85));
    }

    render() {
        if (this._useComposer && this.composer) {
            this.composer.render();
            return;
        }
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
    }

    /** 強制關閉 composer（偵測到黑屏／不相容時由外部呼叫）。 */
    disableComposer() {
        this._useComposer = false;
    }
}
