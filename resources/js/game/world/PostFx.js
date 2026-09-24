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
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float speed;
        uniform float caAmount;
        uniform float boostAmount;
        uniform float motionBlur;
        uniform float radialBlur;
        uniform float cloudWet;
        uniform float gradeExposure;
        varying vec2 vUv;
        void main(){
            vec2 uv=vUv; vec2 cc=uv-0.5; float dist=dot(cc,cc);
            float blur=speed*speed;
            float boost=clamp(boostAmount,0.0,1.0);
            float mb=clamp(motionBlur,0.0,1.0);
            float rb=clamp(radialBlur,0.0,1.5);

            // 基礎速度拉伸 + Boost 加劇
            uv+=cc*dist*(0.035+blur*0.06+boost*0.05);

            float ca = caAmount * smoothstep(0.08, 0.55, dist);
            vec2 rOff = cc * ca * 0.018;
            vec2 bOff = -cc * ca * 0.014;

            // Motion blur：沿徑向多採樣（Boost 時偏強）
            vec4 c = vec4(0.0);
            float wSum = 0.0;
            vec2 mdir = normalize(cc + vec2(0.0001)) * dist;
            for(int i=0;i<5;i++){
                float fi=float(i);
                float t=(fi/4.0)-0.5;
                float w=(1.0-abs(t)*0.85) * mix(step(fi,0.5), 1.0, mb);
                vec2 off=mdir*t*mb*0.085*(0.55+boost*0.9);
                c+=texture2D(tDiffuse,uv+off)*w;
                wSum+=w;
            }
            c/=max(wSum,0.001);

            // 邊緣 Radial blur（衝刺張力）
            float radial=blur*blur+rb*boost;
            if(radial>0.08){
                vec2 rdir=cc*dist;
                vec4 a=texture2D(tDiffuse,uv-rdir*radial*0.055);
                vec4 b=c;
                vec4 c2=texture2D(tDiffuse,uv+rdir*radial*0.055);
                c=mix(b,(a+b+c2)/3.0,clamp(radial*0.9,0.0,0.72));
            }

            if(ca>0.001){
                float r = texture2D(tDiffuse, uv + rOff).r;
                float g = c.g;
                float b = texture2D(tDiffuse, uv + bOff).b;
                c.rgb = mix(c.rgb, vec3(r,g,b), clamp(ca * 0.85, 0.0, 1.0));
            }

            // 穿雲濕潤：略降對比、偏冷白
            if(cloudWet>0.001){
                float w=clamp(cloudWet,0.0,1.0);
                c.rgb=mix(c.rgb, c.rgb*vec3(0.92,0.96,1.05)+vec3(0.08), w*0.35);
                c.rgb=mix(c.rgb, vec3(dot(c.rgb,vec3(0.3,0.59,0.11))), w*0.12);
            }

            c.rgb=mix(c.rgb,c.rgb*vec3(0.88,0.94,1.06),0.28);
            c.rgb*=gradeExposure;
            float vig=smoothstep(1.05-blur*0.25-boost*0.12,0.22,dist*(2.0+blur*1.4+boost*0.6));
            c.rgb*=vig;
            float streak=pow(max(0.0,abs(cc.x)-0.15),2.0)*(blur+boost)*0.12;
            c.rgb+=vec3(0.45,0.62,0.88)*streak;
            gl_FragColor=c;
        }`,
};

/**
 * PostFx — bloom + FilmPass + 色調／暈影／Motion Blur／Radial Blur／色差 + OutputPass。
 */
export class PostFx {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {number} width
     * @param {number} height
     * @param {{ bloom_strength?: number, bloom_radius?: number, bloom_threshold?: number, grade_exposure?: number, film_intensity?: number, boost_blur?: number, motion_blur?: number, radial_blur?: number }} [visual]
     */
    constructor(renderer, scene, camera, width, height, visual = {}) {
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        const bloomStrength = visual.bloom_strength ?? 0.28;
        const bloomRadius = visual.bloom_radius ?? 0.38;
        const bloomThreshold = visual.bloom_threshold ?? 0.94;
        this.bloom = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            bloomStrength,
            bloomRadius,
            bloomThreshold
        );
        this.composer.addPass(this.bloom);

        this.gradePass = new ShaderPass(GRADE_SHADER);
        this.gradePass.uniforms.gradeExposure.value = visual.grade_exposure ?? 0.82;
        this.composer.addPass(this.gradePass);

        this.filmPass = new FilmPass(visual.film_intensity ?? 0.2, false);
        this.composer.addPass(this.filmPass);

        this.composer.addPass(new OutputPass());

        this._ca = 0;
        this._caTarget = 0;
        this.caMax = visual.ca_max ?? 1.0;
        this.boostBlurScale = visual.boost_blur ?? 1.0;
        this.motionBlurScale = visual.motion_blur ?? 1.0;
        this.radialBlurScale = visual.radial_blur ?? 1.0;
        this._boost = 0;
        this._cloudWet = 0;
    }

    setSize(width, height) {
        this.composer.setSize(width, height);
        this.bloom.setSize(width, height);
    }

    /**
     * @param {number} time
     * @param {number} speedNorm
     * @param {{ damage?: number, nearBoom?: number, dive?: number, boosting?: boolean, cloudWet?: number }} [impulse]
     */
    update(time, speedNorm, impulse = {}) {
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
        this.composer.render();
    }
}
