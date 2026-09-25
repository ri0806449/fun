/**
 * AudioManager — 真實音檔 + THREE.AudioListener / PositionalAudio 空間音訊。
 * 載入失敗時退回程序化 Web Audio，不中斷遊戲。
 * AudioContext 必須在使用者手勢後 unlock()。
 */
import * as THREE from 'three';

/** @typedef {'engine'|'afterburner'|'wind'|'enemyEngine'|'gun'|'missile'|'missileWhoosh'|'boom'|'boomLow'|'boomMid'|'boomFar'|'boost'|'sonicBoom'|'hit'|'pickup'|'scrap'|'waypoint'|'levelUp'|'achievement'|'lockTick'|'lockTone'|'lockAcquired'|'radarBeep'|'radarSolid'|'overheat'|'foxTwo'|'terrainPullUp'|'missileAlert'|'boss'|'radioStatic'} AudioKey */

const ASSET_BASE = '/audio';

/**
 * 攻擊／引擎優先厚重 wav／真實噴射感；舊 Kenney 科幻 ogg 僅作最後備援。
 */
const MANIFEST = Object.freeze({
    engine: [
        `${ASSET_BASE}/engine/jet_loop.wav`,
        `${ASSET_BASE}/engine/jet_loop.mp3`,
        `${ASSET_BASE}/engine/jet_loop.ogg`,
    ],
    afterburner: [
        `${ASSET_BASE}/engine/afterburner.wav`,
        `${ASSET_BASE}/engine/afterburner.mp3`,
        `${ASSET_BASE}/engine/afterburner.ogg`,
    ],
    wind: [`${ASSET_BASE}/engine/wind_loop.mp3`, `${ASSET_BASE}/engine/wind_loop.ogg`],
    enemyEngine: [
        `${ASSET_BASE}/engine/enemy_engine.wav`,
        `${ASSET_BASE}/engine/enemy_engine.mp3`,
        `${ASSET_BASE}/engine/enemy_engine.ogg`,
    ],
    gun: [`${ASSET_BASE}/sfx/gun.wav`, `${ASSET_BASE}/sfx/gun.ogg`],
    missile: [`${ASSET_BASE}/sfx/missile_launch.wav`, `${ASSET_BASE}/sfx/missile_launch.ogg`],
    missileWhoosh: [`${ASSET_BASE}/sfx/missile_whoosh.ogg`],
    boom: [`${ASSET_BASE}/sfx/explosion.wav`, `${ASSET_BASE}/sfx/explosion.ogg`],
    boomLow: [`${ASSET_BASE}/sfx/explosion_low.wav`, `${ASSET_BASE}/sfx/explosion_low.ogg`],
    boomMid: [`${ASSET_BASE}/sfx/explosion_mid.wav`],
    boomFar: [`${ASSET_BASE}/sfx/explosion_far.wav`],
    boost: [`${ASSET_BASE}/sfx/boost.ogg`],
    sonicBoom: [`${ASSET_BASE}/sfx/sonic_boom.mp3`],
    hit: [`${ASSET_BASE}/sfx/hit.wav`, `${ASSET_BASE}/sfx/hit.ogg`],
    pickup: [`${ASSET_BASE}/sfx/pickup.ogg`],
    scrap: [`${ASSET_BASE}/sfx/pickup.ogg`],
    waypoint: [`${ASSET_BASE}/sfx/waypoint.ogg`],
    levelUp: [`${ASSET_BASE}/sfx/levelup.ogg`],
    achievement: [`${ASSET_BASE}/sfx/levelup.ogg`],
    lockTick: [`${ASSET_BASE}/sfx/lock_tick.ogg`, `${ASSET_BASE}/sfx/radar_beep.wav`],
    lockTone: [`${ASSET_BASE}/sfx/lock_tone.ogg`, `${ASSET_BASE}/sfx/lock_acquired.wav`],
    lockAcquired: [`${ASSET_BASE}/sfx/lock_acquired.wav`],
    radarBeep: [`${ASSET_BASE}/sfx/radar_beep.wav`],
    radarSolid: [`${ASSET_BASE}/sfx/radar_lock_solid.wav`],
    overheat: [`${ASSET_BASE}/sfx/hit.wav`, `${ASSET_BASE}/sfx/hit.ogg`],
    foxTwo: [`${ASSET_BASE}/voice/fox_two.wav`],
    terrainPullUp: [`${ASSET_BASE}/voice/terrain_pull_up.wav`],
    missileAlert: [`${ASSET_BASE}/voice/missile_alert.wav`],
    boss: [`${ASSET_BASE}/music/boss_loop.ogg`],
    radioStatic: [`${ASSET_BASE}/sfx/radio_static.wav`],
});

const DEFAULT_AUDIO_CFG = Object.freeze({
    master_volume: 0.62,
    sfx_volume: 1.45,
    voice_volume: 1.4,
    engine_volume: 0.44,
    wind_volume: 0.22,
    music_volume: 0.5,
    doppler_factor: 0.85,
    max_distance: 480,
    ref_distance: 28,
    rolloff: 1.15,
    max_positional: 12,
    positional_cull_distance: 380,
    engine_throttle_exp: 1.15,
    engine_speed_exp: 1.1,
    engine_pitch_min: 0.88,
    engine_pitch_max: 1.18,
    wind_pitch_min: 0.85,
    wind_pitch_max: 1.55,
    afterburner_volume: 0.58,
    threat_beep_min_interval: 0.55,
    threat_beep_max_interval: 0.09,
    pull_up_voice_cooldown: 2.4,
    fox_two_cooldown: 0.35,
    gun_volume: 1.05,
    missile_volume: 1.08,
    missile_whoosh_volume: 0.62,
    boom_volume: 1.28,
    boom_near_distance: 58,
    boom_chest_gain: 1.4,
    hit_volume: 0.98,
    lock_tick_volume: 0.45,
    lock_tone_volume: 0.72,
    lock_acquired_volume: 0.58,
    fox_two_volume: 1.1,
    radar_beep_volume: 0.58,
    radar_solid_volume: 0.7,
    sfx_compress: true,
    sfx_makeup_gain: 1.32,
    sfx_lowshelf_hz: 130,
    sfx_lowshelf_gain_db: 5.5,
    attack_lowshelf: true,
    radio_volume: 0.72,
});

/**
 * 程序化 fallback（舊 AudioFX 精簡版），音檔缺失時使用。
 */
class ProceduralFallback {
    constructor() {
        this.ctx = null;
        this.master = null;
        this._jetSrc = null;
        this._jetGain = null;
    }

    bind(ctx, master) {
        this.ctx = ctx;
        this.master = master;
    }

    _noiseBuffer(duration = 1) {
        if (!this.ctx) return null;
        const n = Math.floor(this.ctx.sampleRate * duration);
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    beep(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
        if (!this.ctx || !this.master) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        if (slide) o.frequency.linearRampToValueAtTime(freq + slide, this.ctx.currentTime + dur);
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        o.connect(g);
        g.connect(this.master);
        o.start();
        o.stop(this.ctx.currentTime + dur);
    }

    noiseBurst(dur, vol, freq, q = 1) {
        if (!this.ctx || !this.master) return;
        const buf = this._noiseBuffer(Math.max(dur, 0.05));
        if (!buf) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq;
        f.Q.value = q;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        src.connect(f);
        f.connect(g);
        g.connect(this.master);
        src.start();
    }

    /** 低頻噴射 rumble（非高轉速鋸齒／汽車感）。 */
    jetRumble(dur = 0.35, vol = 0.22) {
        this.noiseBurst(dur, vol * 0.85, 90, 0.55);
        this.noiseBurst(dur * 0.7, vol * 0.35, 2400, 0.8);
        this.beep(48, dur * 0.9, 'sine', vol * 0.18, -12);
    }

    /** 確保程序化噴射 loop（缺檔時）。 */
    ensureJetLoop(vol = 0.0001) {
        if (!this.ctx || !this.master || this._jetSrc) return;
        const buf = this._noiseBuffer(2.0);
        if (!buf) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 40;
        const g = this.ctx.createGain();
        g.gain.value = Math.max(0.0001, vol);
        src.connect(hp);
        hp.connect(lp);
        lp.connect(g);
        g.connect(this.master);
        try { src.start(); } catch { /* */ }
        this._jetSrc = src;
        this._jetGain = g;
    }

    setJetLoopVolume(vol) {
        if (this._jetGain) this._jetGain.gain.value = Math.max(0.0001, vol);
    }

    heavyGun() {
        this.noiseBurst(0.07, 0.32, 280, 0.7);
        this.noiseBurst(0.04, 0.18, 2200, 1.4);
        this.beep(95, 0.06, 'sine', 0.16, -40);
    }

    heavyBoom(scale = 1) {
        this.noiseBurst(0.7 * scale, 0.42 * scale, 70, 0.4);
        this.noiseBurst(0.45 * scale, 0.22 * scale, 500, 0.6);
        this.beep(42, 0.65 * scale, 'sine', 0.28 * scale, -18);
    }

    radioSquawk(vol = 0.12) {
        this.noiseBurst(0.08, vol, 1800, 2.5);
        this.noiseBurst(0.18, vol * 0.6, 900, 1.2);
    }
}

export class AudioManager {
    /**
     * @param {object} [audioCfg] config.audio
     */
    constructor(audioCfg = {}) {
        this.cfg = { ...DEFAULT_AUDIO_CFG, ...audioCfg };
        this.masterVolume = this.cfg.master_volume;
        this.muted = false;
        this.started = false;
        this.loadProgress = 0;
        this.loaded = false;
        this._loadPromise = null;

        /** @type {THREE.AudioListener|null} */
        this.listener = null;
        /** @type {Map<string, AudioBuffer>} */
        this.buffers = new Map();
        /** @type {Set<string>} */
        this.missing = new Set();

        this._proc = new ProceduralFallback();
        this._loader = new THREE.AudioLoader();

        /** @type {THREE.Audio|null} */
        this.engineAudio = null;
        /** @type {THREE.Audio|null} */
        this.afterburnerAudio = null;
        /** @type {THREE.Audio|null} */
        this.windAudio = null;
        /** @type {THREE.Audio|null} */
        this.bossAudio = null;

        this.bossActive = false;
        this._boosting = false;
        this._afterburnerOneShotT = 0;

        /** @type {THREE.PositionalAudio[]} */
        this._posFree = [];
        /** @type {Map<object, THREE.PositionalAudio>} */
        this._boundPos = new Map();
        /** @type {THREE.Object3D[]} */
        this._tempAnchors = [];

        this._threatProgress = 0;
        this._threatLocked = false;
        this._threatAcc = 0;
        this._threatSolidPlaying = false;
        this._pullUpVoiceT = 0;
        this._foxTwoT = 0;
        this._missileAlertT = 0;

        this._listenerPrev = new THREE.Vector3();
        this._listenerVel = new THREE.Vector3();
        this._tmp = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();
        this._srcVel = new THREE.Vector3();
        this._paused = false;

        /** @type {THREE.Scene|null} */
        this.scene = null;

        /** 上一幀物件位置（都卜勒）— 複用 Vector3，避免每幀 clone */
        this._prevPos = new WeakMap();
        this._missileSet = new Set();
        this._enemyMeshSet = new Set();
        /** 開火音效層數（飛行降載可設 1） */
        this._gunAudioLayers = 2;

        /** @type {DynamicsCompressorNode|null} */
        this._compressor = null;
        /** @type {GainNode|null} */
        this._makeupGain = null;
        this._chainReady = false;

        /** 引擎／風切／加力：降頻＋epsilon，避免每幀 setVolume／setPlaybackRate thrashing */
        this._engineAudioAcc = 0;
        this._engineAudioPeriod = 0; // 0 = 每幀（選單）
        this._engineAudioEps = 0.012;
        this._lastEng = { pitch: -1, vol: -1, windPitch: -1, windVol: -1, abPitch: -1, abVol: -1 };
        this._pendingEngine = null;
    }

    /**
     * 將 AudioListener 掛到相機（呼叫一次）。
     * @param {THREE.Camera} camera
     * @param {THREE.Scene} [scene] 用於一次性空間音錨點
     */
    attachListener(camera, scene = null) {
        if (this.listener) return;
        this.listener = new THREE.AudioListener();
        this.listener.setMasterVolume(this.muted ? 0 : this.masterVolume);
        camera.add(this.listener);
        if (scene) this.scene = scene;
    }

    get context() {
        return this.listener?.context ?? null;
    }

    get masterNode() {
        return this.listener?.getInput?.() ?? this.listener?.gain ?? null;
    }

    /**
     * 在 listener master 後插入輕量壓縮＋makeup，抬攻擊可讀性並防削波。
     * mute 仍走 setMasterVolume，不受影響。
     */
    _ensureDynamicsChain() {
        if (this._chainReady || !this.listener || this.cfg.sfx_compress === false) return;
        const ctx = this.listener.context;
        const input = this.masterNode;
        if (!ctx || !input) return;

        try {
            input.disconnect();
        } catch {
            /* already disconnected */
        }

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -22;
        compressor.knee.value = 14;
        compressor.ratio.value = 3.2;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.18;

        const makeup = ctx.createGain();
        makeup.gain.value = Math.min(1.6, Math.max(1, this.cfg.sfx_makeup_gain ?? 1.28));

        input.connect(compressor);
        compressor.connect(makeup);
        makeup.connect(ctx.destination);

        this._compressor = compressor;
        this._makeupGain = makeup;
        this._chainReady = true;
    }

    async unlock() {
        if (!this.listener) return;
        const ctx = this.listener.context;
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
            } catch {
                /* ignore autoplay block */
            }
        }
        this._ensureDynamicsChain();
        if (!this.started) {
            this.started = true;
            this._proc.bind(ctx, this.masterNode);
            this._ensureLoops();
        }
        if (!this._loadPromise) {
            this._loadPromise = this._preloadAll();
        }
        return this._loadPromise;
    }

    async _preloadAll() {
        const keys = Object.keys(MANIFEST);
        let done = 0;
        await Promise.all(keys.map(async (key) => {
            const buf = await this._loadFirst(MANIFEST[key]);
            if (buf) this.buffers.set(key, buf);
            else this.missing.add(key);
            done += 1;
            this.loadProgress = done / keys.length;
        }));
        this.loaded = true;
        this._applyLoopBuffers();
        return this;
    }

    /**
     * @param {string[]} urls
     * @returns {Promise<AudioBuffer|null>}
     */
    _loadFirst(urls) {
        return new Promise((resolve) => {
            const tryAt = (i) => {
                if (i >= urls.length) {
                    resolve(null);
                    return;
                }
                this._loader.load(
                    urls[i],
                    (buf) => resolve(buf),
                    undefined,
                    () => tryAt(i + 1)
                );
            };
            tryAt(0);
        });
    }

    _ensureLoops() {
        if (!this.listener || this.engineAudio) return;
        this.engineAudio = new THREE.Audio(this.listener);
        this.afterburnerAudio = new THREE.Audio(this.listener);
        this.windAudio = new THREE.Audio(this.listener);
        this.bossAudio = new THREE.Audio(this.listener);
        for (const a of [this.engineAudio, this.afterburnerAudio, this.windAudio, this.bossAudio]) {
            a.setVolume(0);
            a.setLoop(true);
        }
    }

    _applyLoopBuffers() {
        this._bindLoop(this.engineAudio, 'engine', 0.0001);
        this._bindLoop(this.afterburnerAudio, 'afterburner', 0.0001);
        this._bindLoop(this.windAudio, 'wind', 0.0001);
        this._bindLoop(this.bossAudio, 'boss', 0.0001);
    }

    /**
     * @param {THREE.Audio|null} audio
     * @param {AudioKey} key
     * @param {number} vol
     */
    _bindLoop(audio, key, vol) {
        if (!audio) return;
        const buf = this.buffers.get(key);
        if (!buf) return;
        if (audio.isPlaying) audio.stop();
        audio.setBuffer(buf);
        audio.setLoop(true);
        audio.setVolume(vol);
        try {
            audio.play();
        } catch {
            /* context not ready */
        }
    }

    _canPlay() {
        return this.started && !!this.listener && !this.muted && !this._paused;
    }

    /**
     * @param {number} [gainDb]
     * @returns {BiquadFilterNode|null}
     */
    _makeLowShelf(gainDb = null) {
        if (!this.listener || this.cfg.attack_lowshelf === false) return null;
        const ctx = this.listener.context;
        const f = ctx.createBiquadFilter();
        f.type = 'lowshelf';
        f.frequency.value = this.cfg.sfx_lowshelf_hz ?? 130;
        f.gain.value = gainDb ?? this.cfg.sfx_lowshelf_gain_db ?? 5.5;
        return f;
    }

    /**
     * @param {AudioKey} key
     * @param {{ volume?: number, playbackRate?: number, bus?: 'sfx'|'voice'|'engine', lowShelf?: boolean|number }} [opts]
     */
    play(key, opts = {}) {
        if (!this._canPlay()) return;
        const buf = this.buffers.get(key);
        if (!buf || !this.listener) {
            this._procFallback(key);
            return;
        }
        const sound = new THREE.Audio(this.listener);
        sound.setBuffer(buf);
        const bus = opts.bus === 'voice'
            ? this.cfg.voice_volume
            : opts.bus === 'engine'
                ? this.cfg.engine_volume
                : this.cfg.sfx_volume;
        sound.setVolume((opts.volume ?? 0.55) * bus);
        sound.setPlaybackRate(opts.playbackRate ?? 1);
        if (opts.lowShelf !== false && (opts.lowShelf || opts.lowShelf === 0)) {
            const shelf = this._makeLowShelf(typeof opts.lowShelf === 'number' ? opts.lowShelf : null);
            if (shelf) sound.setFilter(shelf);
        }
        const ended = sound.onEnded.bind(sound);
        sound.onEnded = () => {
            ended();
            try { sound.disconnect(); } catch { /* */ }
        };
        sound.play();
    }

    /**
     * 一次性空間音（爆炸等）。錨點會自動回收。
     * @param {AudioKey} key
     * @param {THREE.Vector3} position
     * @param {{ volume?: number, playbackRate?: number }} [opts]
     */
    playAt(key, position, opts = {}) {
        if (!this._canPlay() || !this.listener) {
            this.play(key, opts);
            return;
        }
        const buf = this.buffers.get(key);
        if (!buf) {
            this._procFallback(key);
            return;
        }
        if (this._boundPos.size >= this.cfg.max_positional) {
            this.play(key, opts);
            return;
        }
        const dist = position.distanceTo(this.listener.parent?.position ?? this._listenerPrev);
        if (dist > this.cfg.positional_cull_distance) return;

        const anchor = new THREE.Object3D();
        anchor.position.copy(position);
        if (this.scene) this.scene.add(anchor);
        else this.listener.parent?.add(anchor);

        const sound = this._acquirePositional();
        if (!sound) {
            anchor.removeFromParent();
            this.play(key, opts);
            return;
        }
        anchor.add(sound);
        sound.setBuffer(buf);
        sound.setLoop(false);
        sound.setRefDistance(this.cfg.ref_distance);
        sound.setMaxDistance(this.cfg.max_distance);
        sound.setRolloffFactor(this.cfg.rolloff);
        sound.setVolume((opts.volume ?? 0.7) * this.cfg.sfx_volume);
        sound.setPlaybackRate(opts.playbackRate ?? 1);
        if (opts.lowShelf !== false && (opts.lowShelf || opts.lowShelf === 0)) {
            const shelf = this._makeLowShelf(typeof opts.lowShelf === 'number' ? opts.lowShelf : null);
            if (shelf) sound.setFilter(shelf);
        }
        this._tempAnchors.push(anchor);
        this._boundPos.set(anchor, sound);
        try {
            sound.play();
        } catch {
            this._releasePositional(anchor);
            return;
        }
        const dur = (buf.duration / (opts.playbackRate ?? 1)) * 1000 + 80;
        setTimeout(() => this._releasePositional(anchor), dur);
    }

    _acquirePositional() {
        if (!this.listener) return null;
        let sound = this._posFree.pop();
        if (!sound) {
            if (this._boundPos.size >= this.cfg.max_positional) return null;
            sound = new THREE.PositionalAudio(this.listener);
            sound.setRefDistance(this.cfg.ref_distance);
            sound.setMaxDistance(this.cfg.max_distance);
            sound.setRolloffFactor(this.cfg.rolloff);
            sound.panner.panningModel = 'HRTF';
            sound.panner.distanceModel = 'inverse';
        }
        return sound;
    }

    /** @param {object} host mesh 或錨點 */
    _releasePositional(host) {
        const sound = this._boundPos.get(host);
        if (!sound) return;
        this._boundPos.delete(host);
        try {
            if (sound.isPlaying) sound.stop();
        } catch { /* */ }
        sound.disconnect();
        host.remove?.(sound);
        if (host.isObject3D && this._tempAnchors.includes(host)) {
            host.removeFromParent();
            const i = this._tempAnchors.indexOf(host);
            if (i >= 0) this._tempAnchors.splice(i, 1);
        }
        this._posFree.push(sound);
        this._prevPos.delete(host);
    }

    /**
     * 將循環空間音綁到池物件（飛彈／敵機）。
     * @param {THREE.Object3D} object
     * @param {AudioKey} key
     * @param {{ volume?: number, loop?: boolean }} [opts]
     */
    bindPositional(object, key, opts = {}) {
        if (!this.listener || !object) return null;
        if (this._boundPos.has(object)) return this._boundPos.get(object);

        const buf = this.buffers.get(key);
        if (!buf) return null;
        if (this._boundPos.size >= this.cfg.max_positional) return null;

        const sound = this._acquirePositional();
        if (!sound) return null;
        object.add(sound);
        sound.setBuffer(buf);
        sound.setLoop(opts.loop !== false);
        sound.setRefDistance(this.cfg.ref_distance * (opts.loop === false ? 0.7 : 1));
        sound.setMaxDistance(this.cfg.max_distance);
        sound.setRolloffFactor(this.cfg.rolloff);
        sound.setVolume((opts.volume ?? 0.45) * this.cfg.sfx_volume);
        this._boundPos.set(object, sound);
        if (this._canPlay()) {
            try {
                sound.play();
            } catch { /* */ }
        }
        return sound;
    }

    /** @param {THREE.Object3D} object */
    unbindPositional(object) {
        if (!object) return;
        this._releasePositional(object);
    }

    /** 釋放所有綁定的空間音（重開／結束局）。 */
    clearSpatial() {
        for (const host of [...this._boundPos.keys()]) {
            this._releasePositional(host);
        }
        this._threatProgress = 0;
        this._threatLocked = false;
        this._threatAcc = 0;
        this._threatSolidPlaying = false;
    }

    /**
     * 同步飛彈／敵機空間音，並更新都卜勒 pitch。
     * @param {number} dt
     * @param {{ camera: THREE.Camera, missiles?: THREE.Object3D[], enemies?: Array<{ mesh: THREE.Object3D, alive: boolean, position: THREE.Vector3 }> }} ctx
     */
    updateSpatial(dt, ctx) {
        if (!this.started || !this.listener) return;
        const cam = ctx.camera;
        const camPos = cam.position;
        if (dt > 0) {
            this._listenerVel.copy(camPos).sub(this._listenerPrev).multiplyScalar(1 / Math.max(dt, 1e-4));
        }
        this._listenerPrev.copy(camPos);

        const missiles = ctx.missiles ?? [];
        const missileSet = this._missileSet;
        missileSet.clear();
        for (const m of missiles) missileSet.add(m);
        for (const [obj] of [...this._boundPos.entries()]) {
            if (obj.userData?.__audioKind === 'missile' && !missileSet.has(obj)) {
                this.unbindPositional(obj);
            }
        }
        for (const m of missiles) {
            const dist = m.position.distanceTo(camPos);
            if (dist > this.cfg.positional_cull_distance) {
                if (this._boundPos.has(m)) this.unbindPositional(m);
                continue;
            }
            if (!this._boundPos.has(m)) {
                m.userData.__audioKind = 'missile';
                this.bindPositional(m, 'missileWhoosh', {
                    volume: this.cfg.missile_whoosh_volume ?? 0.55,
                    loop: true,
                });
            }
            this._applyDoppler(m, dt);
        }

        const enemies = ctx.enemies ?? [];
        const enemyMeshes = this._enemyMeshSet;
        enemyMeshes.clear();
        for (const e of enemies) {
            if (!e?.alive || !e.mesh) continue;
            enemyMeshes.add(e.mesh);
            const dist = e.position.distanceTo(camPos);
            if (dist > this.cfg.positional_cull_distance) {
                if (this._boundPos.has(e.mesh)) this.unbindPositional(e.mesh);
                continue;
            }
            if (!this._boundPos.has(e.mesh)) {
                e.mesh.userData.__audioKind = 'enemy';
                this.bindPositional(e.mesh, 'enemyEngine', { volume: 0.28, loop: true });
            }
            this._applyDoppler(e.mesh, dt);
        }
        for (const [obj] of [...this._boundPos.entries()]) {
            if (obj.userData?.__audioKind === 'enemy' && !enemyMeshes.has(obj)) {
                this.unbindPositional(obj);
            }
        }

        this._updateThreatBeep(dt);
        if (this._pullUpVoiceT > 0) this._pullUpVoiceT = Math.max(0, this._pullUpVoiceT - dt);
        if (this._foxTwoT > 0) this._foxTwoT = Math.max(0, this._foxTwoT - dt);
        if (this._missileAlertT > 0) this._missileAlertT = Math.max(0, this._missileAlertT - dt);
        if (this._afterburnerOneShotT > 0) this._afterburnerOneShotT = Math.max(0, this._afterburnerOneShotT - dt);
    }

    /**
     * 以相對徑向速度模擬都卜勒（Three.js 0.186 無 setDopplerFactor）。
     * @param {THREE.Object3D} object
     * @param {number} dt
     */
    _applyDoppler(object, dt) {
        const sound = this._boundPos.get(object);
        if (!sound || !this.listener) return;
        let prev = this._prevPos.get(object);
        if (!prev || dt <= 0) {
            if (!prev) {
                prev = new THREE.Vector3();
                this._prevPos.set(object, prev);
            }
            prev.copy(object.position);
            return;
        }
        this._srcVel.copy(object.position).sub(prev).multiplyScalar(1 / dt);
        prev.copy(object.position);

        const listenerPos = this.listener.parent?.position ?? this._listenerPrev;
        this._tmp.copy(object.position).sub(listenerPos);
        const dist = this._tmp.length();
        if (dist < 0.01) return;
        this._tmp.multiplyScalar(1 / dist);
        const closing = this._srcVel.dot(this._tmp) - this._listenerVel.dot(this._tmp);
        // closing > 0 → 靠近 → pitch 升高
        const factor = this.cfg.doppler_factor;
        const rate = THREE.MathUtils.clamp(1 + (closing / 320) * factor, 0.72, 1.45);
        sound.setPlaybackRate(rate);
    }

    /**
     * @param {number} progress 0..1 SAM 鎖定進度
     * @param {boolean} locked 硬鎖
     */
    setThreatLock(progress, locked = false) {
        this._threatProgress = THREE.MathUtils.clamp(progress, 0, 1);
        const wasLocked = this._threatLocked;
        this._threatLocked = locked || this._threatProgress >= 0.999;
        if (this._threatLocked && !wasLocked && this._missileAlertT <= 0) {
            this._missileAlertT = 3.5;
            this.play('missileAlert', { volume: 0.85, bus: 'voice' });
        }
        if (!this._threatLocked && this._threatProgress <= 0) {
            this._threatSolidPlaying = false;
        }
    }

    _updateThreatBeep(dt) {
        if (!this._canPlay()) return;
        if (this._threatProgress <= 0.02 && !this._threatLocked) {
            this._threatAcc = 0;
            return;
        }
        if (this._threatLocked) {
            this._threatAcc += dt;
            if (!this._threatSolidPlaying || this._threatAcc > 0.5) {
                this._threatSolidPlaying = true;
                this._threatAcc = 0;
                this.play('radarSolid', { volume: this.cfg.radar_solid_volume ?? 0.7 });
            }
            return;
        }
        const t = this._threatProgress;
        const interval = THREE.MathUtils.lerp(
            this.cfg.threat_beep_min_interval,
            this.cfg.threat_beep_max_interval,
            t * t
        );
        this._threatAcc += dt;
        if (this._threatAcc >= interval) {
            this._threatAcc = 0;
            const rate = 1 + t * 0.55;
            const beepBase = this.cfg.radar_beep_volume ?? 0.58;
            this.play('radarBeep', { volume: beepBase * (0.7 + t * 0.55), playbackRate: rate });
        }
    }

    /**
     * 飛行中降頻引擎音參數寫入（Hz；0 或未設 = 每幀）。
     * @param {number} hz
     * @param {number} [epsilon]
     */
    setEngineAudioCadence(hz, epsilon = 0.012) {
        this._engineAudioPeriod = hz > 0 ? 1 / hz : 0;
        this._engineAudioEps = Math.max(0, epsilon);
        this._engineAudioAcc = 0;
    }

    /**
     * 引擎／風切／加力（非線性曲線）。
     * @param {number} throttle
     * @param {number} airspeedNorm
     * @param {{ gLoad?: number, turnRate?: number, boosting?: boolean, windBoost?: number, dt?: number }} [extra]
     */
    setEngine(throttle, airspeedNorm, extra = {}) {
        if (!this.started || !this.listener || this.muted) return;
        this._pendingEngine = { throttle, airspeedNorm, extra };
        const dt = extra.dt ?? 0;
        if (this._engineAudioPeriod > 0) {
            this._engineAudioAcc += dt;
            if (this._engineAudioAcc < this._engineAudioPeriod) return;
            this._engineAudioAcc = 0;
        }
        this._flushEngineAudio();
    }

    _flushEngineAudio() {
        const pending = this._pendingEngine;
        if (!pending) return;
        const { throttle, airspeedNorm, extra } = pending;
        const gLoad = extra.gLoad ?? 1;
        const turnRate = extra.turnRate ?? 0;
        const boosting = !!extra.boosting;
        const windBoost = extra.windBoost ?? 0;
        this._boosting = boosting;

        const thr = THREE.MathUtils.clamp(throttle, 0, 1);
        const spd = THREE.MathUtils.clamp(airspeedNorm, 0, 1.25);
        const tCurve = thr ** this.cfg.engine_throttle_exp;
        const sCurve = Math.min(1, spd) ** this.cfg.engine_speed_exp;

        // 窄 pitch：低油門深沉 rumble、高油門輕微嘶鳴，避免像汽車催轉
        const pitch = THREE.MathUtils.lerp(
            this.cfg.engine_pitch_min,
            this.cfg.engine_pitch_max,
            tCurve * 0.72 + sCurve * 0.28
        );
        const engVol = (0.22 + tCurve * 0.48 + sCurve * 0.18 + (boosting ? 0.08 : 0))
            * this.cfg.engine_volume
            * (this._paused ? 0 : 1);

        const eps = this._engineAudioEps;
        const last = this._lastEng;

        if (this.engineAudio?.buffer) {
            if (Math.abs(pitch - last.pitch) > eps) {
                this.engineAudio.setPlaybackRate(pitch);
                last.pitch = pitch;
            }
            const vol = Math.max(0.0001, engVol);
            if (Math.abs(vol - last.vol) > eps) {
                this.engineAudio.setVolume(vol);
                last.vol = vol;
            }
            if (!this.engineAudio.isPlaying && this._canPlay()) {
                try { this.engineAudio.play(); } catch { /* */ }
            }
        } else if (this.missing.has('engine')) {
            this._proc.ensureJetLoop(engVol * 0.85);
            this._proc.setJetLoopVolume(Math.max(0.0001, engVol * 0.85));
        }

        const gFactor = Math.min(1.8, Math.abs(gLoad - 1) * 0.45);
        const turnFactor = Math.min(1, Math.abs(turnRate) * 0.55);
        const windAmt = Math.min(1.35, sCurve * 0.7 + gFactor + turnFactor * 0.35
            + (boosting ? 0.22 : 0) + windBoost);
        const windPitch = THREE.MathUtils.lerp(
            this.cfg.wind_pitch_min,
            this.cfg.wind_pitch_max,
            Math.min(1, windAmt)
        );
        const windVol = (0.03 + windAmt * 0.62) * this.cfg.wind_volume * (this._paused ? 0 : 1);
        if (this.windAudio?.buffer) {
            if (Math.abs(windPitch - last.windPitch) > eps) {
                this.windAudio.setPlaybackRate(windPitch);
                last.windPitch = windPitch;
            }
            const wv = Math.max(0.0001, windVol);
            if (Math.abs(wv - last.windVol) > eps) {
                this.windAudio.setVolume(wv);
                last.windVol = wv;
            }
            if (!this.windAudio.isPlaying && this._canPlay()) {
                try { this.windAudio.play(); } catch { /* */ }
            }
        }

        const abVol = boosting
            ? this.cfg.afterburner_volume * (0.6 + tCurve * 0.5)
            : 0.0001;
        const abPitch = boosting ? 1.02 + sCurve * 0.12 : 1;
        if (this.afterburnerAudio?.buffer) {
            if (Math.abs(abPitch - last.abPitch) > eps) {
                this.afterburnerAudio.setPlaybackRate(abPitch);
                last.abPitch = abPitch;
            }
            const av = Math.max(0.0001, abVol * (this._paused ? 0 : 1));
            if (Math.abs(av - last.abVol) > eps * 0.5 || (boosting !== (last.abVol > 0.01))) {
                this.afterburnerAudio.setVolume(av);
                last.abVol = av;
            }
            if (!this.afterburnerAudio.isPlaying && this._canPlay()) {
                try { this.afterburnerAudio.play(); } catch { /* */ }
            }
        }
    }

    /**
     * 開火音層數（1= thrump 單層；2+= 疊金屬）。
     * @param {number} layers
     */
    setGunAudioLayers(layers) {
        this._gunAudioLayers = Math.max(1, layers | 0);
    }

    gun() {
        const vol = this.cfg.gun_volume ?? 1.05;
        const layers = this._gunAudioLayers ?? 2;
        // 可重疊短樣本：主層 thrump；（可選）輕金屬層
        this.play('gun', {
            volume: vol,
            playbackRate: 0.88 + Math.random() * 0.22,
            lowShelf: 6.5,
        });
        if (layers >= 2) {
            this.play('gun', {
                volume: vol * 0.38,
                playbackRate: 1.05 + Math.random() * 0.18,
                lowShelf: 3.5,
            });
        }
        if (this.missing.has('gun')) this._proc.heavyGun();
    }

    /**
     * @param {{ foxTwo?: boolean }} [opts] 玩家發射時播 Fox Two
     */
    missile(opts = {}) {
        const vol = this.cfg.missile_volume ?? 1.08;
        this.play('missile', { volume: vol, playbackRate: 0.92 + Math.random() * 0.1, lowShelf: 7 });
        // 疊一層低頻 thruster
        this.play('missile', { volume: vol * 0.42, playbackRate: 0.72, lowShelf: 9 });
        if (opts.foxTwo !== false && this._foxTwoT <= 0) {
            this._foxTwoT = this.cfg.fox_two_cooldown;
            this.play('foxTwo', { volume: this.cfg.fox_two_volume ?? 1.1, bus: 'voice' });
        }
        if (this.missing.has('missile')) {
            this._proc.jetRumble(0.45, 0.28);
            this._proc.noiseBurst(0.35, 0.2, 900, 0.7);
        }
    }

    /**
     * @param {number} [scale]
     * @param {THREE.Vector3|null} [position]
     */
    boom(scale = 1, position = null) {
        const base = this.cfg.boom_volume ?? 1.28;
        const nearDist = this.cfg.boom_near_distance ?? 58;
        const chest = this.cfg.boom_chest_gain ?? 1.4;
        let near = 1;
        if (position && this.listener?.parent) {
            const d = position.distanceTo(this.listener.parent.position);
            near = THREE.MathUtils.clamp(1.35 - d / nearDist, 0.55, 1.35);
        }
        const vol = Math.min(1.55, base * 0.7 * scale * (near > 1 ? near * (chest / 1.2) : near));
        const rate = THREE.MathUtils.clamp(1.08 - scale * 0.1, 0.62, 1.15);
        const shelf = 4 + near * 4;
        const playBoom = (key, v, r, ls) => {
            if (position) this.playAt(key, position, { volume: v, playbackRate: r, lowShelf: ls });
            else this.play(key, { volume: v, playbackRate: r, lowShelf: ls });
        };
        // 分層：中頻碎裂 + 低頻 boom +（近距）遠尾轟鳴
        playBoom('boom', vol, rate, shelf);
        playBoom('boomMid', vol * 0.55, rate * 1.05, shelf * 0.6);
        playBoom('boomLow', vol * (0.55 + near * 0.35), rate * 0.85, shelf + 2);
        if (near > 0.95 || scale > 1.2) {
            playBoom('boomFar', vol * 0.4 * near, rate * 0.75, shelf);
        }
        if (this.missing.has('boom')) this._proc.heavyBoom(scale * near);
    }

    boost() {
        this.play('boost', { volume: 0.55 });
        if (this._afterburnerOneShotT <= 0) {
            this._afterburnerOneShotT = 1.2;
            this.play('sonicBoom', { volume: 0.4, playbackRate: 1.05 });
        }
        if (this.missing.has('boost')) {
            this._proc.noiseBurst(0.4, 0.18, 900, 0.7);
            this._proc.beep(100, 0.5, 'sawtooth', 0.1, 200);
        }
    }

    pickup() {
        this.play('pickup', { volume: 0.45, playbackRate: 1.05 });
        if (this.missing.has('pickup')) {
            this._proc.beep(660, 0.08, 'sine', 0.1);
            setTimeout(() => this._proc.beep(990, 0.12, 'sine', 0.1), 70);
        }
    }

    scrap() {
        this.play('scrap', { volume: 0.35, playbackRate: 1.2 });
        if (this.missing.has('scrap')) {
            this._proc.beep(520, 0.05, 'triangle', 0.08);
        }
    }

    levelUp() {
        this.play('levelUp', { volume: 0.55 });
        if (this.missing.has('levelUp')) {
            this._proc.beep(440, 0.1, 'sine', 0.12);
            setTimeout(() => this._proc.beep(660, 0.12, 'sine', 0.12), 90);
        }
    }

    achievement() {
        this.play('achievement', { volume: 0.55, playbackRate: 1.1 });
        if (this.missing.has('achievement')) {
            this._proc.beep(523, 0.1, 'square', 0.1);
            setTimeout(() => this._proc.beep(659, 0.1, 'square', 0.1), 100);
        }
    }

    hit() {
        const vol = this.cfg.hit_volume ?? 0.98;
        this.play('hit', { volume: vol, playbackRate: 0.9 + Math.random() * 0.15, lowShelf: 7 });
        this.play('hit', { volume: vol * 0.4, playbackRate: 0.7, lowShelf: 9 });
        if (this.missing.has('hit')) {
            this._proc.noiseBurst(0.22, 0.32, 220, 0.8);
            this._proc.beep(90, 0.15, 'sine', 0.14, -30);
        }
    }

    /**
     * 無線電靜電／失真開頭（Radio Chatter）。
     * @param {number} [vol]
     */
    radioBurst(vol = null) {
        const v = vol ?? this.cfg.radio_volume ?? 0.72;
        if (this.buffers.has('radioStatic')) {
            this.play('radioStatic', { volume: v * 0.55, playbackRate: 0.9 + Math.random() * 0.25 });
        } else {
            this._proc.radioSquawk(v * 0.18);
        }
    }

    /**
     * 以 Web Speech 播報無線電台詞，套 bandpass＋失真濾波。
     * @param {string} line
     * @param {{ volume?: number }} [opts]
     */
    speakRadio(line, opts = {}) {
        if (!this._canPlay() || !line) return;
        this.radioBurst(opts.volume);
        const syn = typeof window !== 'undefined' ? window.speechSynthesis : null;
        if (!syn || typeof SpeechSynthesisUtterance === 'undefined') {
            this._procRadioTone(line);
            return;
        }
        try {
            syn.cancel();
            const u = new SpeechSynthesisUtterance(String(line));
            u.rate = 1.05;
            u.pitch = 0.85;
            u.volume = Math.min(1, (opts.volume ?? this.cfg.radio_volume ?? 0.72) * 0.85);
            // 瀏覽器語音無法直接進 AudioContext filter；搭配靜電營造無線電感
            syn.speak(u);
        } catch {
            this._procRadioTone(line);
        }
    }

    _procRadioTone(line) {
        const n = Math.min(8, Math.max(3, String(line).length / 12));
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                this._proc.beep(380 + i * 40 + Math.random() * 80, 0.05, 'square', 0.05);
                this._proc.noiseBurst(0.04, 0.06, 1400, 2);
            }, i * 55);
        }
    }

    waypoint() {
        this.play('waypoint', { volume: 0.45 });
        if (this.missing.has('waypoint')) {
            this._proc.beep(520, 0.1, 'sine', 0.1);
            setTimeout(() => this._proc.beep(780, 0.15, 'sine', 0.1), 90);
        }
    }

    lockTone() {
        this.play('lockTone', { volume: this.cfg.lock_tone_volume ?? 0.72 });
        this.play('lockAcquired', { volume: this.cfg.lock_acquired_volume ?? 0.58 });
        if (this.missing.has('lockTone')) {
            this._proc.beep(880, 0.07, 'square', 0.16);
            setTimeout(() => this._proc.beep(880, 0.07, 'square', 0.16), 95);
        }
    }

    lockTick() {
        this.play('lockTick', { volume: this.cfg.lock_tick_volume ?? 0.45 });
        if (this.missing.has('lockTick')) this._proc.beep(720, 0.035, 'square', 0.09);
    }

    overheat() {
        this.play('overheat', { volume: 0.4, playbackRate: 0.7 });
        if (this.missing.has('overheat')) {
            this._proc.beep(140, 0.2, 'sawtooth', 0.1, -60);
            this._proc.noiseBurst(0.25, 0.12, 500, 1);
        }
    }

    /** GPWS：優先真實語音，避免與程序化警報疊加。 */
    pullUp() {
        if (!this._canPlay()) return;
        if (this._pullUpVoiceT > 0) return;
        this._pullUpVoiceT = this.cfg.pull_up_voice_cooldown;
        if (this.buffers.has('terrainPullUp')) {
            this.play('terrainPullUp', { volume: 0.95, bus: 'voice' });
            return;
        }
        this._proc.beep(880, 0.09, 'square', 0.14);
        setTimeout(() => this._proc.beep(880, 0.09, 'square', 0.14), 110);
        setTimeout(() => this._proc.beep(660, 0.12, 'sawtooth', 0.1), 230);
        this._proc.noiseBurst(0.18, 0.08, 1200, 1.4);
    }

    bossWarn() {
        this.play('boomLow', { volume: 0.7, playbackRate: 0.6 });
        this.play('radarSolid', { volume: this.cfg.radar_solid_volume ?? 0.7 });
        if (this.missing.has('boomLow')) {
            this._proc.beep(110, 0.35, 'sawtooth', 0.18, -40);
            this._proc.beep(55, 0.5, 'sine', 0.22, -20);
        }
    }

    /** @param {boolean} on */
    setBossBgm(on) {
        this.bossActive = !!on;
        if (!this.bossAudio) return;
        if (on && this.buffers.has('boss') && !this.bossAudio.buffer) {
            this._bindLoop(this.bossAudio, 'boss', 0.0001);
        }
        const vol = on && !this.muted && !this._paused
            ? 0.085 * this.cfg.music_volume
            : 0.0001;
        this.bossAudio.setVolume(Math.max(0.0001, vol));
        if (on && this._canPlay() && this.bossAudio.buffer && !this.bossAudio.isPlaying) {
            try { this.bossAudio.play(); } catch { /* */ }
        }
    }

    /** @param {boolean} paused */
    setPaused(paused) {
        this._paused = !!paused;
        if (!this.started) return;
        const muteLoops = paused || this.muted;
        for (const a of [this.engineAudio, this.afterburnerAudio, this.windAudio]) {
            if (!a) continue;
            if (muteLoops) a.setVolume(0.0001);
        }
        if (this.bossAudio) {
            this.bossAudio.setVolume(
                !muteLoops && this.bossActive ? 0.085 * this.cfg.music_volume : 0.0001
            );
        }
        for (const sound of this._boundPos.values()) {
            if (paused && sound.isPlaying) {
                try { sound.pause(); } catch { /* */ }
            } else if (!paused && !this.muted && sound.buffer && !sound.isPlaying) {
                try { sound.play(); } catch { /* */ }
            }
        }
    }

    /** @returns {boolean} 切換後是否靜音 */
    toggleMute() {
        this.muted = !this.muted;
        if (this.listener) {
            this.listener.setMasterVolume(this.muted ? 0 : this.masterVolume);
        }
        if (this.muted) {
            for (const a of [this.engineAudio, this.afterburnerAudio, this.windAudio, this.bossAudio]) {
                a?.setVolume(0.0001);
            }
        }
        return this.muted;
    }

    /** @param {AudioKey} key */
    _procFallback(key) {
        if (!this._canPlay()) return;
        switch (key) {
            case 'gun':
                this._proc.heavyGun();
                break;
            case 'missile':
            case 'missileWhoosh':
                this._proc.jetRumble(0.35, 0.22);
                break;
            case 'boom':
            case 'boomLow':
            case 'boomMid':
            case 'boomFar':
                this._proc.heavyBoom(1);
                break;
            case 'hit':
                this._proc.noiseBurst(0.16, 0.26, 220, 0.9);
                break;
            case 'radioStatic':
                this._proc.radioSquawk(0.14);
                break;
            case 'radarBeep':
            case 'lockTick':
                this._proc.beep(980, 0.06, 'square', 0.12);
                break;
            case 'radarSolid':
                this._proc.beep(1100, 0.4, 'square', 0.14);
                break;
            case 'foxTwo':
            case 'terrainPullUp':
            case 'missileAlert':
                this._proc.beep(440, 0.15, 'triangle', 0.1);
                break;
            default:
                this._proc.beep(520, 0.08, 'sine', 0.08);
        }
    }
}
