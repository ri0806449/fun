/**
 * 玩家機控制面／噴口契約（Three.js，純 Node）。
 * 執行：node --test tests/js/jetFactory.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJet, PLAYER_PALETTE, paletteForClass } from '../../resources/js/game/entities/JetFactory.js';

describe('createJet player parts contract', () => {
    it('玩家機提供 aileron／elevator／nozzles 節點', () => {
        const jet = createJet(PLAYER_PALETTE);
        const parts = jet.userData.parts;

        assert.ok(parts.aileronL, 'aileronL');
        assert.ok(parts.aileronR, 'aileronR');
        assert.ok(parts.elevatorL, 'elevatorL');
        assert.ok(parts.elevatorR, 'elevatorR');
        assert.ok(Array.isArray(parts.nozzles));
        assert.equal(parts.nozzles.length, 2);
        assert.equal(parts.aileronL.userData.part, 'aileronL');
        assert.equal(parts.aileronR.userData.part, 'aileronR');
        assert.equal(parts.elevatorL.userData.part, 'elevatorL');
        assert.equal(parts.elevatorR.userData.part, 'elevatorR');
        for (const n of parts.nozzles) {
            assert.equal(n.userData.isNozzle, true);
            assert.equal(n.userData.part, 'nozzle');
        }
    });

    it('玩家機直屬子節點含排氣與加力標記', () => {
        const jet = createJet(PLAYER_PALETTE);
        const exhaust = jet.children.filter((c) => c.userData.isExhaust);
        const ab = jet.children.filter((c) => c.userData.isAfterburner);
        assert.ok(exhaust.length >= 2);
        assert.equal(ab.length, 2);
    });

    it('敵機不建立可動控制面，仍可建立', () => {
        const jet = createJet(paletteForClass('interceptor'), { classType: 'interceptor' });
        const parts = jet.userData.parts;
        assert.equal(parts.aileronL, null);
        assert.equal(parts.nozzles.length, 0);
        assert.equal(jet.userData.classType, 'interceptor');
    });
});
