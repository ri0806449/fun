/**
 * ObjectPool — 預先建立固定數量的 Object3D，遊戲中只借還不新建。
 * 子類別負責建立 mesh 與定義 userData 形狀。
 */
export class ObjectPool {
    /**
     * @param {import('three').Scene} scene
     * @param {number} capacity
     */
    constructor(scene, capacity) {
        this.scene = scene;
        this.capacity = capacity;
        this.free = [];
        this.active = [];
    }

    /** 由子類別在建構時呼叫。 */
    _fill(factory) {
        for (let i = 0; i < this.capacity; i++) {
            const obj = factory(i);
            obj.visible = false;
            obj.userData.alive = false;
            this.scene.add(obj);
            this.free.push(obj);
        }
    }

    _take() {
        return this.free.pop() || null;
    }

    release(obj) {
        if (!obj.userData.alive) return;
        obj.userData.alive = false;
        obj.visible = false;
        const idx = this.active.indexOf(obj);
        if (idx >= 0) this.active.splice(idx, 1);
        this.free.push(obj);
    }

    releaseAll() {
        while (this.active.length) this.release(this.active[this.active.length - 1]);
    }

    dispose() {
        for (const obj of [...this.active, ...this.free]) {
            this.scene.remove(obj);
            obj.geometry?.dispose?.();
            obj.material?.dispose?.();
        }
        this.active.length = 0;
        this.free.length = 0;
    }
}
