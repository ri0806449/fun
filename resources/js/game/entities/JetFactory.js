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
 * 玩家機額外拆出 aileron／elevator／nozzle 節點（userData.parts）。
 * 模型朝向：rotation.y = PI，機頭朝 -Z。
 * @param {object} palette
 * @param {{ classType?: string|null }} opts
 */
export function createJet(palette = PLAYER_PALETTE, { classType = null } = {}) {
    const jet = new THREE.Group();
    const isPlayer = !classType;

    const bodyMat = new THREE.MeshStandardMaterial({
        color: palette.body,
        metalness: isPlayer ? 0.92 : 0.88,
        roughness: isPlayer ? 0.22 : 0.28,
        envMapIntensity: isPlayer ? 1.35 : 1.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: palette.dark,
        metalness: isPlayer ? 0.78 : 0.72,
        roughness: isPlayer ? 0.32 : 0.38,
        envMapIntensity: 0.95,
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: palette.accent,
        metalness: 0.82,
        roughness: 0.28,
        envMapIntensity: 1.05,
    });
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x6a727c,
        metalness: 0.9,
        roughness: 0.18,
        envMapIntensity: 1.2,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x152838,
        metalness: 0.04,
        roughness: 0.03,
        transmission: isPlayer ? 0.72 : 0.62,
        thickness: 0.65,
        transparent: true,
        opacity: isPlayer ? 0.82 : 0.88,
        envMapIntensity: 1.55,
        clearcoat: isPlayer ? 0.45 : 0,
        clearcoatRoughness: 0.12,
    });
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0x1c222c,
        metalness: 0.85,
        roughness: 0.35,
        envMapIntensity: 0.8,
    });
    const nozzleMat = new THREE.MeshStandardMaterial({
        color: 0x141414,
        metalness: 0.96,
        roughness: 0.16,
        emissive: 0x331100,
        emissiveIntensity: 0.4,
        envMapIntensity: 1.25,
    });
    const missileMat = new THREE.MeshStandardMaterial({
        color: 0xc8c8c8,
        metalness: 0.9,
        roughness: 0.22,
        envMapIntensity: 1.1,
    });

    const parts = {
        aileronL: null,
        aileronR: null,
        elevatorL: null,
        elevatorR: null,
        nozzles: [],
    };

    const fuseLen = classType === 'bomber' ? 5.4 : classType === 'drone' ? 2.6 : 4.2;
    const fuseR = classType === 'bomber' ? 0.62 : classType === 'drone' ? 0.28 : isPlayer ? 0.4 : 0.42;

    const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(fuseR, fuseLen, 6, isPlayer ? 14 : 12), bodyMat);
    fuse.rotation.z = Math.PI / 2;
    fuse.position.z = 0.1;
    fuse.castShadow = false;
    jet.add(fuse);

    if (isPlayer) {
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 3.8), panelMat);
        spine.position.set(0, fuseR * 0.85, -0.2);
        jet.add(spine);

        const choke = new THREE.Mesh(new THREE.CylinderGeometry(fuseR * 0.92, fuseR * 1.05, 1.1, 12), bodyMat);
        choke.rotation.x = Math.PI / 2;
        choke.position.z = 1.35;
        jet.add(choke);
    }

    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(fuseR * (isPlayer ? 0.95 : 0.9), classType === 'drone' ? 1.1 : 2.0, isPlayer ? 12 : 10),
        bodyMat
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = classType === 'drone' ? -2.0 : -3.35;
    jet.add(nose);

    if (classType !== 'drone') {
        const radome = new THREE.Mesh(new THREE.SphereGeometry(isPlayer ? 0.34 : 0.36, 10, 8), accentMat);
        radome.scale.set(1, 1, 1.35);
        radome.position.z = -4.1;
        jet.add(radome);

        if (isPlayer) {
            const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5), rimMat);
            pitot.rotation.x = Math.PI / 2;
            pitot.position.set(0.22, 0.05, -4.55);
            jet.add(pitot);
        }

        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(isPlayer ? 0.5 : 0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
            glassMat
        );
        canopy.scale.set(0.82, isPlayer ? 0.78 : 0.7, 1.55);
        canopy.position.set(0, isPlayer ? 0.42 : 0.38, -0.85);
        jet.add(canopy);

        if (isPlayer) {
            const frame = new THREE.Mesh(
                new THREE.TorusGeometry(0.42, 0.035, 6, 16, Math.PI * 1.15),
                rimMat
            );
            frame.rotation.x = Math.PI / 2;
            frame.rotation.z = 0.15;
            frame.position.set(0, 0.38, -0.55);
            frame.scale.set(0.95, 1.15, 1);
            jet.add(frame);

            const windshield = new THREE.Mesh(
                new THREE.BoxGeometry(0.55, 0.08, 0.9),
                rimMat
            );
            windshield.position.set(0, 0.55, -1.35);
            windshield.rotation.x = -0.35;
            jet.add(windshield);

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.45), darkMat);
            seat.position.set(0, 0.12, -0.7);
            jet.add(seat);
        }

        [-1, 1].forEach((s) => {
            if (isPlayer) {
                const duct = new THREE.Group();
                duct.position.set(s * 0.58, -0.22, -0.55);

                const lip = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.22, 0.28, 0.18, 10, 1, true),
                    rimMat
                );
                lip.rotation.x = Math.PI / 2;
                lip.position.z = -0.95;
                duct.add(lip);

                const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 1.9), darkMat);
                tunnel.position.z = 0.05;
                duct.add(tunnel);

                const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 1.5), accentMat);
                splitter.position.set(0, 0, 0.1);
                duct.add(splitter);

                jet.add(duct);
            } else {
                const intake = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 1.8), darkMat);
                intake.position.set(s * 0.55, -0.2, -0.5);
                jet.add(intake);
            }
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
        depth: classType === 'bomber' ? 0.12 : isPlayer ? 0.09 : 0.07,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 1,
    });
    const wingL = new THREE.Mesh(wingGeo, bodyMat);
    wingL.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    wingL.position.set(0, -0.08, -0.3);
    jet.add(wingL);
    const wingR = wingL.clone();
    wingR.scale.x = -1;
    jet.add(wingR);

    if (isPlayer) {
        // 前緣根部補強與翼根整流
        [-1, 1].forEach((s) => {
            const strake = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 1.4), panelMat);
            strake.position.set(s * 0.85, -0.05, -1.4);
            strake.rotation.y = s * -0.35;
            jet.add(strake);
        });
    }

    if (classType !== 'drone') {
        const tipSpan = classType === 'bomber' ? 5.0 : 3.5;
        [-1, 1].forEach((s) => {
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, isPlayer ? 0.55 : 0.5, isPlayer ? 0.9 : 0.8), accentMat);
            tip.position.set(s * tipSpan, 0.1, 1.5);
            tip.rotation.z = s * 0.15;
            jet.add(tip);
        });

        if (isPlayer) {
            // 副翼：鉸鏈在外側後緣，A/D 反向偏轉
            [-1, 1].forEach((s) => {
                const hinge = new THREE.Group();
                hinge.position.set(s * 2.55, -0.02, 1.35);
                hinge.userData.part = s < 0 ? 'aileronL' : 'aileronR';
                const flap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.045, 0.55), darkMat);
                flap.position.set(s * 0.35, 0, 0.22);
                hinge.add(flap);
                const edge = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.02, 0.08), accentMat);
                edge.position.set(s * 0.35, 0.02, 0.48);
                hinge.add(edge);
                jet.add(hinge);
                if (s < 0) parts.aileronL = hinge;
                else parts.aileronR = hinge;
            });
        }

        [-1, 1].forEach((s) => {
            const vtRoot = new THREE.Group();
            vtRoot.position.set(s * (isPlayer ? 0.52 : 0.55), isPlayer ? 0.7 : 0.75, isPlayer ? 2.15 : 2.3);
            vtRoot.rotation.z = s * -0.25;
            vtRoot.rotation.x = -0.12;

            const vt = new THREE.Mesh(
                new THREE.BoxGeometry(0.07, isPlayer ? 1.55 : 1.4, isPlayer ? 1.35 : 1.5),
                darkMat
            );
            vtRoot.add(vt);

            if (isPlayer) {
                const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.35), panelMat);
                rudder.position.set(0, 0.1, 0.55);
                vtRoot.add(rudder);

                const tipCap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.9), accentMat);
                tipCap.position.set(0, 0.78, -0.1);
                vtRoot.add(tipCap);
            }
            jet.add(vtRoot);
        });

        [-1, 1].forEach((s) => {
            if (isPlayer) {
                const stab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.045, 0.55), darkMat);
                stab.position.set(s * 1.05, 0.1, 2.35);
                jet.add(stab);

                const elevHinge = new THREE.Group();
                elevHinge.position.set(s * 1.15, 0.1, 2.62);
                elevHinge.userData.part = s < 0 ? 'elevatorL' : 'elevatorR';
                const elev = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.04, 0.42), panelMat);
                elev.position.set(s * 0.05, 0, 0.18);
                elevHinge.add(elev);
                jet.add(elevHinge);
                if (s < 0) parts.elevatorL = elevHinge;
                else parts.elevatorR = elevHinge;
            } else {
                const ht = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.75), darkMat);
                ht.position.set(s * 1.1, 0.12, 2.5);
                jet.add(ht);
            }
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
                classType === 'drone' ? 0.18 : isPlayer ? 0.28 : 0.3,
                classType === 'drone' ? 0.2 : isPlayer ? 0.32 : 0.34,
                classType === 'drone' ? 1.0 : isPlayer ? 1.95 : 1.8,
                isPlayer ? 12 : 10
            ),
            darkMat
        );
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(s * (classType === 'drone' ? 0 : 0.48), -0.18, classType === 'drone' ? 1.0 : 1.9);
        jet.add(nacelle);

        if (isPlayer) {
            const inletRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.26, 0.035, 6, 14),
                rimMat
            );
            inletRing.position.set(s * 0.48, -0.18, 0.95);
            jet.add(inletRing);
        }

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

        if (isPlayer) {
            const nozzleGroup = new THREE.Group();
            nozzleGroup.position.set(s * 0.48, -0.18, 2.85);
            nozzleGroup.userData.isNozzle = true;
            nozzleGroup.userData.part = 'nozzle';

            const nozzle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.2, 0.27, 0.38, 12),
                nozzleMat
            );
            nozzle.rotation.x = Math.PI / 2;
            nozzleGroup.add(nozzle);

            const petals = new THREE.Mesh(
                new THREE.CylinderGeometry(0.24, 0.3, 0.12, 10, 1, true),
                rimMat
            );
            petals.rotation.x = Math.PI / 2;
            petals.position.z = 0.2;
            nozzleGroup.add(petals);

            jet.add(nozzleGroup);
            parts.nozzles.push(nozzleGroup);

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

    if (isPlayer) {
        [-1, 1].forEach((s) => {
            const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.7), darkMat);
            pylon.position.set(s * 1.55, -0.28, 0.25);
            jet.add(pylon);

            const msl = new THREE.Group();
            msl.position.set(s * 1.6, -0.42, 0.3);
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.35, 7), missileMat);
            body.rotation.x = Math.PI / 2;
            msl.add(body);
            const seeker = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), accentMat);
            seeker.rotation.x = -Math.PI / 2;
            seeker.position.z = -0.72;
            msl.add(seeker);
            const fins = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.18), darkMat);
            fins.position.z = 0.55;
            msl.add(fins);
            jet.add(msl);
        });

        // 外側掛點（視覺細節，不影響彈藥邏輯）
        [-1, 1].forEach((s) => {
            const outerPylon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.45), rimMat);
            outerPylon.position.set(s * 2.6, -0.22, 0.55);
            jet.add(outerPylon);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.9), panelMat);
            rail.position.set(s * 2.6, -0.32, 0.55);
            jet.add(rail);
        });

        const belly = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 3.6), accentMat);
        belly.position.set(0, -0.42, 0.05);
        jet.add(belly);

        const gunPort = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), rimMat);
        gunPort.rotation.x = Math.PI / 2;
        gunPort.position.set(0, -0.35, -2.4);
        jet.add(gunPort);

        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4), rimMat);
        antenna.position.set(0, 0.95, 1.6);
        jet.add(antenna);
    }

    if (classType !== 'drone') {
        for (const haze of createHeatHazePlanes()) {
            jet.add(haze);
        }
    }

    jet.rotation.y = Math.PI;
    jet.userData.classType = classType;
    jet.userData.parts = parts;
    return jet;
}

/** @param {string} classType @param {boolean} elite */
export function paletteForClass(classType, elite = false) {
    if (elite) return ELITE_PALETTE;
    return CLASS_PALETTES[classType] || ENEMY_PALETTE;
}
