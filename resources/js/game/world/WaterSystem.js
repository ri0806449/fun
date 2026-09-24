import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { SUN_DIR } from './SceneBuilder.js';
import { createProceduralWaterNormals } from './textureFallbacks.js';

/**
 * WaterSystem — 官方 Water.js：法線動態海浪、太陽高光、鏡面反射。
 * 取代舊有自製反射 RT；與地形共存於低窪／外圍。
 */
export class WaterSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {object} [cfg] config.environment / water 相關
     */
    constructor(scene, cfg = {}) {
        this.scene = scene;
        this.cfg = cfg;

        const size = cfg.water_size ?? 10000;
        const segments = cfg.water_segments ?? 32;
        const level = cfg.water_level ?? 0;
        const texSize = cfg.water_reflection_size ?? 512;
        const distortion = cfg.water_distortion ?? 3.7;
        const waterColor = new THREE.Color(cfg.water_color ?? 0x001e0f);
        const sunColor = new THREE.Color(cfg.water_sun_color ?? 0xb88860);
        const alpha = cfg.water_alpha ?? 1.0;

        // 風向（世界 XZ）與波浪流速 → 影響 time 推進與法線 scale
        const windDeg = cfg.water_wind_deg ?? 35;
        const windRad = THREE.MathUtils.degToRad(windDeg);
        this.windDir = new THREE.Vector2(Math.cos(windRad), Math.sin(windRad)).normalize();
        this.waveSpeed = cfg.water_wave_speed ?? 1.0;
        this.flowSpeed = cfg.water_flow_speed ?? 0.035;
        this._time = 0;

        const normals = createProceduralWaterNormals(256);
        normals.wrapS = normals.wrapT = THREE.RepeatWrapping;

        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

        this.water = new Water(geometry, {
            textureWidth: texSize,
            textureHeight: texSize,
            waterNormals: normals,
            sunDirection: SUN_DIR.clone(),
            sunColor,
            waterColor,
            distortionScale: distortion,
            fog: scene.fog != null,
            alpha,
        });

        this.water.rotation.x = -Math.PI / 2;
        this.water.position.y = level;
        this.water.renderOrder = -1;

        if (this.water.material?.uniforms?.size) {
            this.water.material.uniforms.size.value = cfg.water_normal_scale ?? 4.0;
        }

        // 非同步升級為真實法線貼圖；失敗則保留程序化 fallback
        const loader = new THREE.TextureLoader();
        loader.load(
            '/textures/water/waternormals.jpg',
            (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.needsUpdate = true;
                if (this.water.material?.uniforms?.normalSampler) {
                    const old = this.water.material.uniforms.normalSampler.value;
                    this.water.material.uniforms.normalSampler.value = tex;
                    old?.dispose?.();
                }
            },
            undefined,
            () => { /* keep procedural */ }
        );

        this.mesh = this.water;
        scene.add(this.water);
    }

    /** 水面高度（與碰撞／飛沫對齊）。 */
    get level() {
        return this.water.position.y;
    }

    /**
     * @param {number} time 累積秒
     * @param {THREE.Vector3} cameraPos
     * @param {THREE.Vector3} [sunDir]
     */
    update(time, cameraPos, sunDir = null) {
        this._time = time;
        const mat = this.water.material;
        if (!mat?.uniforms) return;

        // 風向偏置：流速沿風向推進相位
        const flow = this.flowSpeed * this.waveSpeed;
        mat.uniforms.time.value = time * this.waveSpeed
            + this.windDir.x * flow * time * 12
            + this.windDir.y * flow * time * 7;

        if (sunDir && mat.uniforms.sunDirection) {
            mat.uniforms.sunDirection.value.copy(sunDir);
        } else if (mat.uniforms.sunDirection) {
            mat.uniforms.sunDirection.value.copy(SUN_DIR);
        }

        if (mat.uniforms.eye && cameraPos) {
            mat.uniforms.eye.value.copy(cameraPos);
        }
    }

    onResize(_aspect) {
        // Water.js 以 mesh onBeforeRender 自管反射 RT；無需手動相機 aspect。
    }

    /**
     * 相容舊呼叫：官方 Water 已在 onBeforeRender 內渲染反射，此處為 no-op。
     */
    renderReflection(_renderer, _camera) {
        // intentionally empty
    }

    dispose() {
        this.scene.remove(this.water);
        this.water.geometry?.dispose?.();
        this.water.material?.dispose?.();
    }
}
