import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SUN_DIR } from './SceneBuilder.js';

/**
 * 以 Sky.js 大氣散射烘焙 PMREM；失敗時回退程序化球體。
 * @param {THREE.WebGLRenderer} renderer
 * @param {import('./SceneBuilder.js').SceneBuilder} [sceneBuilder]
 * @returns {THREE.Texture|null}
 */
export function buildProceduralEnvMap(renderer, sceneBuilder = null) {
    try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();

        const envScene = new THREE.Scene();
        let skyMesh;

        const env = sceneBuilder?.env ?? {};

        if (sceneBuilder?.sky) {
            // 暫借既有 Sky 參數，獨立實例避免移動主場景節點
            skyMesh = new Sky();
            skyMesh.scale.setScalar(env.sky_scale ?? 4500);
            const src = sceneBuilder.sky.material.uniforms;
            const dst = skyMesh.material.uniforms;
            dst.turbidity.value = src.turbidity.value;
            dst.rayleigh.value = src.rayleigh.value;
            dst.mieCoefficient.value = src.mieCoefficient.value;
            dst.mieDirectionalG.value = src.mieDirectionalG.value;
            dst.sunPosition.value.copy(src.sunPosition.value);
            // EnvMap 不需要太陽盤高光，避免反射過曝
            if (dst.showSunDisc) dst.showSunDisc.value = 0;
            if (dst.cloudCoverage) dst.cloudCoverage.value = 0;
        } else {
            skyMesh = new Sky();
            skyMesh.scale.setScalar(env.sky_scale ?? 4500);
            const u = skyMesh.material.uniforms;
            u.turbidity.value = env.sky_turbidity ?? 14.0;
            u.rayleigh.value = env.sky_rayleigh ?? 0.72;
            u.mieCoefficient.value = env.sky_mie_coefficient ?? 0.0032;
            u.mieDirectionalG.value = env.sky_mie_directional_g ?? 0.48;
            u.sunPosition.value.copy(SUN_DIR);
            if (u.showSunDisc) u.showSunDisc.value = 0;
            if (u.cloudCoverage) u.cloudCoverage.value = 0;
        }

        envScene.add(skyMesh);

        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(90, 32),
            new THREE.MeshStandardMaterial({
                color: 0x081828,
                metalness: 0.85,
                roughness: 0.22,
                side: THREE.DoubleSide,
            })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        envScene.add(ground);

        const sunI = env.sun_intensity ?? 0.38;
        const hemiI = env.hemisphere_intensity ?? 0.42;
        const sun = new THREE.DirectionalLight(0xffd4a8, sunI);
        sun.position.copy(SUN_DIR).multiplyScalar(40);
        envScene.add(sun);
        envScene.add(new THREE.HemisphereLight(0x5a7aa0, 0x081828, hemiI));

        const envMap = pmrem.fromScene(envScene, 0.06).texture;
        pmrem.dispose();
        skyMesh.geometry.dispose();
        skyMesh.material.dispose();
        ground.geometry.dispose();
        ground.material.dispose();
        return envMap;
    } catch {
        return null;
    }
}
