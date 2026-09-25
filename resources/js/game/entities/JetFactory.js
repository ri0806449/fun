import * as THREE from 'three';
import { createHeatHazePlanes } from '../fx/HeatHaze.js';

/** 低可視霧灰／深灰／前緣淺灰（玩家機） */
export const PLAYER_PALETTE = {
    body: 0x858b94,
    dark: 0x4a5058,
    accent: 0xaab0b8,
    edge: 0xd0d4da,
    glow: 0xff6622,
};
export const ENEMY_PALETTE = { body: 0xb04848, dark: 0x401818, accent: 0x602828, glow: 0xff4422 };
export const ELITE_PALETTE = { body: 0xc9a227, dark: 0x4a3010, accent: 0x8a6020, glow: 0xffaa22 };

/** 敵機類型配色／翼型差異，方便辨識。 */
export const CLASS_PALETTES = Object.freeze({
    interceptor: { body: 0x4a6a88, dark: 0x1a2838, accent: 0x2a90c8, glow: 0x44ccff },
    bomber: { body: 0x5a6848, dark: 0x242818, accent: 0x6a7840, glow: 0xaacc44 },
    drone: { body: 0x3a2848, dark: 0x180c22, accent: 0x8844aa, glow: 0xcc66ff },
});

/**
 * 自製簡化翼面標記（非官方貼圖）。
 * @param {'102'|'unit'|'badge'} kind
 */
function createMarkingTexture(kind) {
    const size = kind === 'badge' ? 128 : 256;
    // Node／無 DOM 時略過繪製，仍回傳可用的 DataTexture 佔位
    if (typeof document === 'undefined') {
        const data = new Uint8Array([255, 255, 255, 200]);
        const tex = new THREE.DataTexture(data, 1, 1);
        tex.needsUpdate = true;
        return tex;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    if (kind === '102') {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = 'bold 110px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('102', size / 2, size / 2);
    } else if (kind === 'unit') {
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('U.N. MARINE', size / 2, size / 2);
    } else {
        // 簡化盾徽：黃邊＋深心，非授權角色標誌
        ctx.beginPath();
        ctx.moveTo(64, 18);
        ctx.lineTo(108, 36);
        ctx.lineTo(100, 100);
        ctx.lineTo(64, 118);
        ctx.lineTo(28, 100);
        ctx.lineTo(20, 36);
        ctx.closePath();
        ctx.fillStyle = '#d4b020';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(64, 32);
        ctx.lineTo(92, 44);
        ctx.lineTo(86, 90);
        ctx.lineTo(64, 104);
        ctx.lineTo(42, 90);
        ctx.lineTo(36, 44);
        ctx.closePath();
        ctx.fillStyle = '#1a1c20';
        ctx.fill();
        ctx.fillStyle = '#d4b020';
        ctx.beginPath();
        ctx.arc(64, 62, 12, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
}

function markingMaterial(map, opacity = 0.95) {
    return new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
}

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

    if (isPlayer) {
        return buildPlayerJet(jet, palette);
    }

    return buildEnemyJet(jet, palette, classType);
}

/**
 * 玩家機：匿蹤前掠翼／頂進氣／V 形雙垂尾／矩形矢量噴口（低面數近似）。
 * @param {THREE.Group} jet
 * @param {object} palette
 */
function buildPlayerJet(jet, palette) {
    const bodyMat = new THREE.MeshStandardMaterial({
        color: palette.body,
        metalness: 0.48,
        roughness: 0.55,
        envMapIntensity: 0.75,
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: palette.dark,
        metalness: 0.42,
        roughness: 0.62,
        envMapIntensity: 0.55,
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: palette.accent ?? 0xaab0b8,
        metalness: 0.5,
        roughness: 0.5,
        envMapIntensity: 0.65,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
        color: palette.edge ?? 0xd0d4da,
        metalness: 0.4,
        roughness: 0.52,
        envMapIntensity: 0.6,
    });
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x525860,
        metalness: 0.4,
        roughness: 0.6,
        envMapIntensity: 0.48,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a2834,
        metalness: 0.05,
        roughness: 0.04,
        transmission: 0.68,
        thickness: 0.55,
        transparent: true,
        opacity: 0.78,
        envMapIntensity: 1.2,
        clearcoat: 0.35,
        clearcoatRoughness: 0.15,
    });
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0x1c2228,
        metalness: 0.55,
        roughness: 0.45,
        envMapIntensity: 0.35,
    });
    const nozzleMat = new THREE.MeshStandardMaterial({
        color: 0x121418,
        metalness: 0.85,
        roughness: 0.28,
        emissive: 0x331100,
        emissiveIntensity: 0.35,
        envMapIntensity: 0.7,
    });
    const missileMat = new THREE.MeshStandardMaterial({
        color: 0xb8bcc0,
        metalness: 0.55,
        roughness: 0.4,
        envMapIntensity: 0.5,
    });

    const parts = {
        aileronL: null,
        aileronR: null,
        elevatorL: null,
        elevatorR: null,
        nozzles: [],
    };

    // —— 扁平升力體機身 ——
    const fuse = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.52, 4.4), bodyMat);
    fuse.position.set(0, 0.02, 0.15);
    jet.add(fuse);

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 3.2), panelMat);
    spine.position.set(0, 0.32, -0.15);
    jet.add(spine);

    // 長鼻＋淺灰鼻錐
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.35, 10), bodyMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -3.2;
    jet.add(nose);

    const radome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), edgeMat);
    radome.scale.set(1, 0.95, 1.45);
    radome.position.z = -4.25;
    jet.add(radome);

    const antiGlare = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.85), darkMat);
    antiGlare.position.set(0, 0.28, -2.15);
    jet.add(antiGlare);

    // 座艙罩（長泡型）
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
        glassMat
    );
    canopy.scale.set(0.78, 0.72, 1.85);
    canopy.position.set(0, 0.48, -1.15);
    jet.add(canopy);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 1.55), rimMat);
    frame.position.set(0, 0.42, -1.05);
    jet.add(frame);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.7), rimMat);
    windshield.position.set(0, 0.55, -1.85);
    windshield.rotation.x = -0.38;
    jet.add(windshield);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.4), darkMat);
    seat.position.set(0, 0.18, -0.95);
    jet.add(seat);

    // 頂部矩形進氣口（座艙後方）
    [-1, 1].forEach((s) => {
        const intake = new THREE.Group();
        intake.position.set(s * 0.32, 0.48, 0.15);

        const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 1.15), darkMat);
        intake.add(box);

        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.12), rimMat);
        lip.position.set(0, 0.08, -0.55);
        intake.add(lip);

        for (let i = 0; i < 4; i++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.04), accentMat);
            slat.position.set(0, 0.1, -0.35 + i * 0.18);
            intake.add(slat);
        }

        const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 1.6), panelMat);
        tunnel.position.set(0, -0.18, 0.55);
        intake.add(tunnel);

        jet.add(intake);
    });

    // 前緣鴨翼（升降舵鉸鏈）
    [-1, 1].forEach((s) => {
        const elevHinge = new THREE.Group();
        elevHinge.position.set(s * 0.72, 0.12, -1.85);
        elevHinge.userData.part = s < 0 ? 'elevatorL' : 'elevatorR';

        const canardShape = new THREE.Shape();
        canardShape.moveTo(0, 0);
        canardShape.lineTo(0.05, 0.55);
        canardShape.lineTo(0.95, 0.2);
        canardShape.lineTo(0.9, -0.08);
        canardShape.closePath();
        const canardGeo = new THREE.ExtrudeGeometry(canardShape, {
            depth: 0.045,
            bevelEnabled: false,
        });
        const canard = new THREE.Mesh(canardGeo, bodyMat);
        canard.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        if (s > 0) canard.scale.x = -1;
        elevHinge.add(canard);

        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.06), edgeMat);
        edge.position.set(s * 0.35, 0.01, -0.12);
        elevHinge.add(edge);

        jet.add(elevHinge);
        if (s < 0) parts.elevatorL = elevHinge;
        else parts.elevatorR = elevHinge;
    });

    // 前掠梯形主翼（翼尖相對翼根更靠前）
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.05);
    wingShape.lineTo(0.15, 2.55);
    wingShape.lineTo(4.15, 1.15);
    wingShape.lineTo(3.95, -0.85);
    wingShape.lineTo(0.2, -0.15);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
        depth: 0.085,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 1,
    });

    const wingL = new THREE.Mesh(wingGeo, bodyMat);
    wingL.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    wingL.position.set(0, -0.02, -0.15);
    jet.add(wingL);
    const wingR = wingL.clone();
    wingR.scale.x = -1;
    jet.add(wingR);

    // 前緣淺灰條
    [-1, 1].forEach((s) => {
        const le = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.12), edgeMat);
        le.position.set(s * 2.05, 0.04, -0.55);
        le.rotation.y = s * 0.42;
        jet.add(le);
    });

    // 翼根整流／深灰內翼分色
    [-1, 1].forEach((s) => {
        const root = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 1.8), darkMat);
        root.position.set(s * 0.95, 0.0, 0.15);
        root.rotation.y = s * -0.12;
        jet.add(root);
    });

    // 翼尖整流
    [-1, 1].forEach((s) => {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.95), accentMat);
        tip.position.set(s * 4.05, 0.08, -0.35);
        tip.rotation.z = s * 0.12;
        tip.rotation.y = s * 0.35;
        jet.add(tip);
    });

    // 副翼：外側後緣
    [-1, 1].forEach((s) => {
        const hinge = new THREE.Group();
        hinge.position.set(s * 2.85, 0.0, 1.05);
        hinge.userData.part = s < 0 ? 'aileronL' : 'aileronR';
        const flap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.04, 0.52), darkMat);
        flap.position.set(s * 0.4, 0, 0.2);
        hinge.add(flap);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.02, 0.07), accentMat);
        edge.position.set(s * 0.4, 0.02, 0.44);
        hinge.add(edge);
        jet.add(hinge);
        if (s < 0) parts.aileronL = hinge;
        else parts.aileronR = hinge;
    });

    // 翼面自製標記
    const tex102 = createMarkingTexture('102');
    const texUnit = createMarkingTexture('unit');
    const texBadge = createMarkingTexture('badge');

    const mark102 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.55),
        markingMaterial(tex102)
    );
    mark102.rotation.x = -Math.PI / 2;
    mark102.position.set(2.35, 0.055, 0.35);
    jet.add(mark102);

    const markUnit = new THREE.Mesh(
        new THREE.PlaneGeometry(1.55, 0.32),
        markingMaterial(texUnit)
    );
    markUnit.rotation.x = -Math.PI / 2;
    markUnit.rotation.z = 0.35;
    markUnit.position.set(-2.15, 0.055, 0.15);
    jet.add(markUnit);

    // V 形雙垂尾（明顯外傾）
    [-1, 1].forEach((s) => {
        const vtRoot = new THREE.Group();
        vtRoot.position.set(s * 0.58, 0.55, 1.95);
        vtRoot.rotation.z = s * -0.55;
        vtRoot.rotation.x = -0.08;

        const vt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.65, 1.45), darkMat);
        vtRoot.add(vt);

        const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.38), panelMat);
        rudder.position.set(0, 0.05, 0.58);
        vtRoot.add(rudder);

        const tipCap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.95), edgeMat);
        tipCap.position.set(0, 0.82, -0.05);
        vtRoot.add(tipCap);

        if (s < 0) {
            const badge = new THREE.Mesh(
                new THREE.PlaneGeometry(0.38, 0.42),
                markingMaterial(texBadge, 0.9)
            );
            badge.position.set(-0.045, 0.25, -0.15);
            badge.rotation.y = Math.PI / 2;
            vtRoot.add(badge);
        }

        jet.add(vtRoot);
    });

    // 雙矩形引擎艙＋turkey-feather 噴口
    [-1, 1].forEach((s) => {
        const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 2.05), darkMat);
        nacelle.position.set(s * 0.42, -0.12, 1.75);
        jet.add(nacelle);

        const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 1.6), panelMat);
        fairing.position.set(s * 0.42, 0.12, 1.55);
        jet.add(fairing);

        const nozzleGroup = new THREE.Group();
        nozzleGroup.position.set(s * 0.42, -0.12, 2.75);
        nozzleGroup.userData.isNozzle = true;
        nozzleGroup.userData.part = 'nozzle';

        // 矩形噴管本體
        const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.42), nozzleMat);
        nozzleGroup.add(nozzle);

        const liner = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.2, 0.08),
            new THREE.MeshStandardMaterial({
                color: 0x221808,
                metalness: 0.7,
                roughness: 0.35,
                emissive: 0xff4400,
                emissiveIntensity: 0.25,
            })
        );
        liner.position.z = 0.18;
        nozzleGroup.add(liner);

        // turkey feathers：上下左右鋸齒瓣片
        const petalMat = rimMat;
        [[0, 0.16, 0.28, 0.38, 0.05, 0.14], [0, -0.16, 0.28, 0.38, 0.05, 0.14],
            [0.2, 0, 0.28, 0.05, 0.26, 0.14], [-0.2, 0, 0.28, 0.05, 0.26, 0.14]].forEach((p) => {
            const petal = new THREE.Mesh(new THREE.BoxGeometry(p[3], p[4], p[5]), petalMat);
            petal.position.set(p[0], p[1], p[2]);
            nozzleGroup.add(petal);
        });
        // 鋸齒前緣細節
        for (let i = -1; i <= 1; i++) {
            const chevron = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.1), accentMat);
            chevron.position.set(i * 0.12, 0.15, 0.34);
            nozzleGroup.add(chevron);
            const chevronB = chevron.clone();
            chevronB.position.y = -0.15;
            nozzleGroup.add(chevronB);
        }

        jet.add(nozzleGroup);
        parts.nozzles.push(nozzleGroup);

        // 焰體仍用錐體：PlayerJet 以 scale.y 拉長（與敵機契約一致）；矩形感由噴口瓣片承擔
        const flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 1.15, 6),
            new THREE.MeshBasicMaterial({
                color: palette.glow,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        flame.rotation.x = Math.PI / 2;
        flame.position.set(s * 0.42, -0.12, 3.45);
        flame.userData.isExhaust = true;
        jet.add(flame);

        const core = new THREE.Mesh(
            new THREE.ConeGeometry(0.07, 0.65, 5),
            new THREE.MeshBasicMaterial({
                color: 0xffeecc,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        core.rotation.x = Math.PI / 2;
        core.position.set(s * 0.42, -0.12, 3.2);
        core.userData.isExhaust = true;
        jet.add(core);

        const plume = new THREE.Mesh(
            new THREE.ConeGeometry(0.26, 2.5, 6),
            new THREE.MeshBasicMaterial({
                color: 0x66aaff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        plume.rotation.x = Math.PI / 2;
        plume.position.set(s * 0.42, -0.12, 4.45);
        plume.userData.isAfterburner = true;
        jet.add(plume);
    });

    // 掛載
    [-1, 1].forEach((s) => {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.65), darkMat);
        pylon.position.set(s * 1.65, -0.28, 0.2);
        jet.add(pylon);

        const msl = new THREE.Group();
        msl.position.set(s * 1.7, -0.42, 0.25);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.25, 7), missileMat);
        body.rotation.x = Math.PI / 2;
        msl.add(body);
        const seeker = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 6), accentMat);
        seeker.rotation.x = -Math.PI / 2;
        seeker.position.z = -0.68;
        msl.add(seeker);
        const fins = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.16), darkMat);
        fins.position.z = 0.5;
        msl.add(fins);
        jet.add(msl);
    });

    [-1, 1].forEach((s) => {
        const outerPylon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.4), rimMat);
        outerPylon.position.set(s * 2.85, -0.2, 0.45);
        jet.add(outerPylon);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.8), panelMat);
        rail.position.set(s * 2.85, -0.3, 0.45);
        jet.add(rail);
    });

    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 3.4), panelMat);
    belly.position.set(0, -0.38, 0.05);
    jet.add(belly);

    const gunPort = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), rimMat);
    gunPort.rotation.x = Math.PI / 2;
    gunPort.position.set(0, -0.3, -2.55);
    jet.add(gunPort);

    // 面板線感：幾條細刻槽
    for (let i = 0; i < 5; i++) {
        const groove = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.01, 0.02), rimMat);
        groove.position.set(0, 0.29, -1.6 + i * 0.55);
        jet.add(groove);
    }

    for (const haze of createHeatHazePlanes({ span: 0.42, y: -0.12, z: 4.1 })) {
        jet.add(haze);
    }

    jet.rotation.y = Math.PI;
    // 機腹相對 pivot 的最低 Y（供水面撞海判定；略取整避免浮點抖動）
    const keelBox = new THREE.Box3().setFromObject(jet);
    jet.userData.keelOffset = Math.round(keelBox.min.y * 100) / 100;
    jet.userData.classType = null;
    jet.userData.parts = parts;
    return jet;
}

/**
 * 敵機：維持輕量膠囊機身／既有翼型分支。
 * @param {THREE.Group} jet
 * @param {object} palette
 * @param {string} classType
 */
function buildEnemyJet(jet, palette, classType) {
    const bodyMat = new THREE.MeshStandardMaterial({
        color: palette.body,
        metalness: 0.88,
        roughness: 0.28,
        envMapIntensity: 1.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: palette.dark,
        metalness: 0.72,
        roughness: 0.38,
        envMapIntensity: 0.95,
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: palette.accent,
        metalness: 0.82,
        roughness: 0.28,
        envMapIntensity: 1.05,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x152838,
        metalness: 0.04,
        roughness: 0.03,
        transmission: 0.62,
        thickness: 0.65,
        transparent: true,
        opacity: 0.88,
        envMapIntensity: 1.55,
    });

    const parts = {
        aileronL: null,
        aileronR: null,
        elevatorL: null,
        elevatorR: null,
        nozzles: [],
    };

    const fuseLen = classType === 'bomber' ? 5.4 : classType === 'drone' ? 2.6 : 4.2;
    const fuseR = classType === 'bomber' ? 0.62 : classType === 'drone' ? 0.28 : 0.42;

    const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(fuseR, fuseLen, 6, 12), bodyMat);
    fuse.rotation.z = Math.PI / 2;
    fuse.position.z = 0.1;
    fuse.castShadow = false;
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
        radome.scale.set(1, 1, 1.35);
        radome.position.z = -4.1;
        jet.add(radome);

        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
            glassMat
        );
        canopy.scale.set(0.82, 0.7, 1.55);
        canopy.position.set(0, 0.38, -0.85);
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

    if (classType !== 'drone') {
        const tipSpan = classType === 'bomber' ? 5.0 : 3.5;
        [-1, 1].forEach((s) => {
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.8), accentMat);
            tip.position.set(s * tipSpan, 0.1, 1.5);
            tip.rotation.z = s * 0.15;
            jet.add(tip);
        });

        [-1, 1].forEach((s) => {
            const vtRoot = new THREE.Group();
            vtRoot.position.set(s * 0.55, 0.75, 2.3);
            vtRoot.rotation.z = s * -0.25;
            vtRoot.rotation.x = -0.12;
            const vt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.4, 1.5), darkMat);
            vtRoot.add(vt);
            jet.add(vtRoot);
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
