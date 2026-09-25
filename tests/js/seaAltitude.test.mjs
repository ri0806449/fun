/**
 * 掠海／撞海／地形誤殺（街機：離水面尚遠絕不可 GAMEOVER）。
 * 執行：node --test tests/js/seaAltitude.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { evaluateSeaAltitude } from '../../resources/js/game/flight/seaAltitude.js';
import { evaluateTerrainCrash } from '../../resources/js/game/flight/terrainCollision.js';
import { TerrainSystem } from '../../resources/js/game/world/TerrainSystem.js';
import { createJet, PLAYER_PALETTE } from '../../resources/js/game/entities/JetFactory.js';

const KEEL = -1.35;
const CRASH = -0.5;
const SPRAY = 15;

describe('evaluateSeaAltitude', () => {
    it('離水面尚遠的平飛（pivot≈5–40）絕不撞海', () => {
        for (const y of [40, 20, 12, 8, 5, 3, 2]) {
            const r = evaluateSeaAltitude(y, {
                crashAltitude: CRASH,
                sprayAltitude: SPRAY,
                keelOffset: KEEL,
            });
            assert.equal(r.waterCrash, false, `y=${y} 不應 WATER IMPACT`);
            assert.ok(r.keelY > CRASH, `機腹仍高於撞海面 (keelY=${r.keelY})`);
        }
    });

    it('俯衝使機腹明顯沒入水面才 waterCrash', () => {
        const skim = evaluateSeaAltitude(1.2, {
            crashAltitude: CRASH,
            sprayAltitude: SPRAY,
            keelOffset: KEEL,
        });
        assert.equal(skim.waterCrash, false);

        const dive = evaluateSeaAltitude(0.7, {
            crashAltitude: CRASH,
            sprayAltitude: SPRAY,
            keelOffset: KEEL,
        });
        assert.equal(dive.waterCrash, true);
    });
});

describe('evaluateTerrainCrash arcade defaults', () => {
    it('預設關閉玩家高度圖撞山：任何高度圖都不因地形 GAMEOVER', () => {
        for (const [y, h] of [[20, 60], [30, 100], [15, 56], [8, 45], [5, 2]]) {
            const r = evaluateTerrainCrash(y, h, {
                playerTerrainCollision: false,
                keelOffset: KEEL,
            });
            assert.equal(r.crash, false, `y=${y} h=${h}`);
            assert.equal(r.exemptDisabled, true);
        }
    });

    it('啟用撞山時：離海 seaVisualClearance 以上不撞隱形坡', () => {
        const r = evaluateTerrainCrash(25, 80, {
            playerTerrainCollision: true,
            seaVisualClearance: 10,
            waterLevel: 0,
            keelOffset: KEEL,
        });
        assert.equal(r.crash, false);
        assert.equal(r.exemptSeaClearance, true);
    });

    it('啟用撞山且低於 clearance 時：機腹沒入高山才撞', () => {
        const clear = evaluateTerrainCrash(8, 50, {
            playerTerrainCollision: true,
            seaVisualClearance: 10,
            waterCollisionCeil: 40,
            keelOffset: KEEL,
            contactPad: 0.35,
        });
        // y=8 < 10 → 不豁免海距；h=50 > ceil → 機腹 6.65 < 50.35 → crash
        assert.equal(clear.crash, true);

        const above = evaluateTerrainCrash(12, 50, {
            playerTerrainCollision: true,
            seaVisualClearance: 10,
            waterCollisionCeil: 40,
            keelOffset: KEEL,
        });
        assert.equal(above.crash, false);
        assert.equal(above.exemptSeaClearance, true);
    });
});

describe('TerrainSystem collidesPlayer default off', () => {
    it('y=20 沿全飛行軸掠過山脊亦不地形撞毀；僅水面可殺', () => {
        const scene = new THREE.Scene();
        const terrain = new TerrainSystem(scene, {
            size: 3200,
            segments: 64,
            max_height: 190,
            min_height: 2,
            seed: 4242,
            collision_clearance: 3.2,
            water_collision_ceil: 40,
            player_terrain_collision: false,
            sea_visual_clearance: 10,
            player_contact_pad: 0.35,
            keel_offset: KEEL,
        });

        assert.equal(terrain.playerTerrainCollision, false);

        let hits = 0;
        for (let z = 100; z >= -800; z -= 10) {
            const pos = new THREE.Vector3(0, 20, z);
            if (terrain.collidesPlayer(pos)) hits++;
        }
        assert.equal(hits, 0, '預設關閉高度圖撞山時路徑上不應有地形 hit');

        // 機腹穿海仍由 seaAltitude 負責（此處只證地形）
        const water = evaluateSeaAltitude(0.5, {
            crashAltitude: CRASH,
            sprayAltitude: SPRAY,
            keelOffset: KEEL,
        });
        assert.equal(water.waterCrash, true);
    });
});

describe('JetFactory keelOffset', () => {
    it('玩家機提供與 bbox 一致的 keelOffset', () => {
        const jet = createJet(PLAYER_PALETTE);
        assert.ok(Number.isFinite(jet.userData.keelOffset));
        assert.ok(jet.userData.keelOffset < -1.0);
        assert.ok(jet.userData.keelOffset > -2.0);
    });
});
