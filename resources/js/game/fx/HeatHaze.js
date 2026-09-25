import * as THREE from 'three';

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
    float alpha = radial * uIntensity * (0.18 + wave * 0.22);
    // 半透明噪點近似熱扭曲／體積光柱（全螢幕折射成本高，改以加性體積近似）
    vec3 col = mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.55, 0.2), wave * 0.65);
    float fade = smoothstep(2.0, 8.0, vViewZ);
    gl_FragColor = vec4(col, alpha * fade);
}
`;

/**
 * 引擎噴口熱扭曲／體積光柱平面（加性 shader）。
 * 由 PlayerJet 在加力或高油門時提高 intensity。
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
        mesh.renderOrder = 3;
        planes.push(mesh);
    });

    return planes;
}

/** @param {THREE.Object3D} jetRoot */
export function updateHeatHaze(jetRoot, time, intensity) {
    jetRoot.traverse((o) => {
        if (!o.userData?.isHeatHaze || !o.material?.uniforms) return;
        o.material.uniforms.uTime.value = time;
        o.material.uniforms.uIntensity.value = intensity;
        o.visible = intensity > 0.02;
    });
}
