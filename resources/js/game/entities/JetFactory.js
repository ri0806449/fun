import * as THREE from 'three';
import { createHeatHazePlanes } from '../fx/HeatHaze.js';

export const PLAYER_PALETTE = { body: 0x8b939e, dark: 0x2e3540, accent: 0x4a5568, glow: 0xff6622 };
export const ENEMY_PALETTE = { body: 0xb04848, dark: 0x401818, accent: 0x602828, glow: 0xff4422 };
export const ELITE_PALETTE = { body: 0xc9a227, dark: 0x4a3010, accent: 0x8a6020, glow: 0xffaa22 };

/** 敵機類型配色／翼型差異，方便辨識。 */
export const CLASS_PALETTES = Object.freeze({
    interceptor: { body: 0x4a6a88, dark: 0x1a2838, accent: 0x2a90c8, glow: 0x44ccff },
    bomber: { body: 0x5a6848, dark: 0x242818, accent: 0x6a7840, glow: 0xaacc44 },
    drone: { body: 0x3a2848, dark: 0x180c22, accent: 0x8844aa, glow: 0xcc66ff },
});

/**
 * 建立戰機模型。排氣焰以 userData.isExhaust 標記，由 PlayerJet 驅動。
 * 模型朝向：rotation.y = PI，機頭朝 -Z。
 * @param {object} palette
 * @param {{ classType?: string|null }} opts
 */
export function createJet(palette = PLAYER_PALETTE, { classType = null } = {}) {
    const jet = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
        color: palette.body, metalness: 0.88, roughness: 0.28, envMapIntensity: 1.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: palette.dark, metalness: 0.72, roughness: 0.38, envMapIntensity: 0.9,
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: palette.accent, metalness: 0.8, roughness: 0.32, envMapIntensity: 1.0,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a3048, metalness: 0.05, roughness: 0.04,
        transmission: 0.62, thickness: 0.55, transparent: true, opacity: 0.88,
        envMapIntensity: 1.4,
    });

    const fuseLen = classType === 'bomber' ? 5.4 : classType === 'drone' ? 2.6 : 4.2;
    const fuseR = classType === 'bomber' ? 0.62 : classType === 'drone' ? 0.28 : 0.42;
    const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(fuseR, fuseLen, 6, 12), bodyMat);
    fuse.rotation.z = Math.PI / 2;
    fuse.position.z = 0.1;
    jet.add(fuse);

    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(fuseR * 0.9, classType === 'drone' ? 1.1 : 2.0, 10),
        bodyMat
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = classType === 'drone' ? -2.0 : -3.35;
    jet.add(nose);

    if (classType !== 'drone') {
        const radome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), accentMat);
        radome.scale.set(1, 1, 1.3);
        radome.position.z = -4.1;
        jet.add(radome);

        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
            glassMat
        );
        canopy.scale.set(0.85, 0.7, 1.5);
        canopy.position.set(0, 0.38, -0.9);
        jet.add(canopy);

        [-1, 1].forEach((s) => {
            const intake = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 1.8), darkMat);
            intake.position.set(s * 0.55, -0.2, -0.5);
            jet.add(intake);
        });
    }

    const wingShape = new THREE.Shape();
    if (classType === 'interceptor') {
        wingShape.moveTo(0, 0);
        wingShape.lineTo(2.8, 0.4);
        wingShape.lineTo(0.2, 3.4);
        wingShape.lineTo(0, 0.2);
    } else if (classType === 'bomber') {
        wingShape.moveTo(0, 0);
        wingShape.lineTo(5.2, 1.4);
        wingShape.lineTo(4.6, 3.6);
        wingShape.lineTo(0.3, 3.2);
        wingShape.lineTo(0, 0.4);
    } else if (classType === 'drone') {
        wingShape.moveTo(0, 0);
        wingShape.lineTo(1.6, 0.6);
        wingShape.lineTo(0.2, 1.8);
        wingShape.lineTo(0, 0.2);
    } else {
        wingShape.moveTo(0, 0);
        wingShape.lineTo(3.6, 2.2);
        wingShape.lineTo(0.4, 2.9);
        wingShape.lineTo(0, 0.3);
    }
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
        depth: classType === 'bomber' ? 0.12 : 0.07,
        bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1,
    });
    const wingL = new THREE.Mesh(wingGeo, bodyMat);
    wingL.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    wingL.position.set(0, -0.08, -0.3);
    jet.add(wingL);
    const wingR = wingL.clone();
    wingR.scale.x = -1;
    jet.add(wingR);

    if (classType !== 'drone') {
        [-1, 1].forEach((s) => {
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.8), accentMat);
            tip.position.set(s * (classType === 'bomber' ? 5.0 : 3.5), 0.1, 1.5);
            tip.rotation.z = s * 0.15;
            jet.add(tip);
        });
        [-1, 1].forEach((s) => {
            const vt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.4, 1.5), darkMat);
            vt.position.set(s * 0.55, 0.75, 2.3);
            vt.rotation.z = s * -0.25;
            vt.rotation.x = -0.12;
            jet.add(vt);
        });
        [-1, 1].forEach((s) => {
            const ht = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.75), darkMat);
            ht.position.set(s * 1.1, 0.12, 2.5);
            jet.add(ht);
        });
    } else {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.8), darkMat);
        fin.position.set(0, 0.4, 1.2);
        jet.add(fin);
    }

    const engineSides = classType === 'drone' ? [0] : [-1, 1];
    engineSides.forEach((s) => {
        const nacelle = new THREE.Mesh(
            new THREE.CylinderGeometry(
                classType === 'drone' ? 0.18 : 0.3,
                classType === 'drone' ? 0.2 : 0.34,
                classType === 'drone' ? 1.0 : 1.8,
                10
            ),
            darkMat
        );
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(s * (classType === 'drone' ? 0 : 0.48), -0.18, classType === 'drone' ? 1.0 : 1.9);
        jet.add(nacelle);

        const flame = new THREE.Mesh(
            new THREE.ConeGeometry(classType === 'drone' ? 0.12 : 0.2, classType === 'drone' ? 0.7 : 1.2, 8),
            new THREE.MeshBasicMaterial({
                color: palette.glow, transparent: true, opacity: 0.85,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        flame.rotation.x = Math.PI / 2;
        flame.position.set(s * (classType === 'drone' ? 0 : 0.48), -0.18, classType === 'drone' ? 1.7 : 3.5);
        flame.userData.isExhaust = true;
        jet.add(flame);

        const core = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.7, 6),
            new THREE.MeshBasicMaterial({
                color: 0xffeecc, transparent: true, opacity: 0.95,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        );
        core.rotation.x = Math.PI / 2;
        core.position.set(s * (classType === 'drone' ? 0 : 0.48), -0.18, classType === 'drone' ? 1.5 : 3.25);
        core.userData.isExhaust = true;
        jet.add(core);

        if (!classType) {
            const nozzle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.22, 0.28, 0.35, 10),
                new THREE.MeshStandardMaterial({
                    color: 0x1a1a1a, metalness: 0.95, roughness: 0.18,
                    emissive: 0x331100, emissiveIntensity: 0.35, envMapIntensity: 1.2,
                })
            );
            nozzle.rotation.x = Math.PI / 2;
            nozzle.position.set(s * 0.48, -0.18, 2.85);
            jet.add(nozzle);

            const plume = new THREE.Mesh(
                new THREE.ConeGeometry(0.28, 2.6, 8),
                new THREE.MeshBasicMaterial({
                    color: 0x66aaff, transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                })
            );
            plume.rotation.x = Math.PI / 2;
            plume.position.set(s * 0.48, -0.18, 4.6);
            plume.userData.isAfterburner = true;
            jet.add(plume);
        }
    });

    if (classType === 'bomber') {
        const turretMat = new THREE.MeshStandardMaterial({
            color: 0x333328, metalness: 0.7, roughness: 0.4,
        });
        [[0, 0.85, 0.2], [0, -0.75, 0.4]].forEach((p, i) => {
            const cupola = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), turretMat);
            cupola.position.set(p[0], p[1], p[2]);
            cupola.userData.bomberTurret = i === 0 ? 'dorsal' : 'ventral';
            jet.add(cupola);
        });
    }

    if (!classType) {
        [-1, 1].forEach((s) => {
            const msl = new THREE.Mesh(
                new THREE.CylinderGeometry(0.07, 0.07, 1.3, 6),
                new THREE.MeshStandardMaterial({
                    color: 0xc8c8c8, metalness: 0.9, roughness: 0.22, envMapIntensity: 1.1,
                })
            );
            msl.rotation.x = Math.PI / 2;
            msl.position.set(s * 1.6, -0.35, 0.3);
            jet.add(msl);
        });
        const belly = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 3.5), accentMat);
        belly.position.set(0, -0.4, 0);
        jet.add(belly);
    }

    if (classType !== 'drone') {
        for (const haze of createHeatHazePlanes()) {
            jet.add(haze);
        }
    }

    jet.rotation.y = Math.PI;
    jet.userData.classType = classType;
    return jet;
}

/** @param {string} classType @param {boolean} elite */
export function paletteForClass(classType, elite = false) {
    if (elite) return ELITE_PALETTE;
    return CLASS_PALETTES[classType] || ENEMY_PALETTE;
}
