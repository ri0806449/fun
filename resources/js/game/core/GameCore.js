import * as THREE from 'three';
import { MathUtils } from 'three';

import { GameState, Outcome, OUTCOME_TITLES } from './GameState.js';
import { Loop } from './Loop.js';
import { AudioManager } from './AudioManager.js';
import { BulletPool } from './pools/BulletPool.js';
import { MissilePool } from './pools/MissilePool.js';
import { ExplosionPool } from './pools/ExplosionPool.js';

import { SceneBuilder } from '../world/SceneBuilder.js';
import { WaterSystem } from '../world/WaterSystem.js';
import { TerrainSystem } from '../world/TerrainSystem.js';
import { GroundDefense } from '../world/GroundDefense.js';
import { PostFx } from '../world/PostFx.js';
import { buildProceduralEnvMap } from '../world/EnvMap.js';
import { ContrailSystem } from '../fx/ContrailSystem.js';

import { PlayerJet } from '../entities/PlayerJet.js';
import { WaveManager } from '../entities/WaveManager.js';
import { FlyingFortress } from '../entities/FlyingFortress.js';
import { Pickup } from '../entities/Pickup.js';
import { Route } from '../entities/Route.js';

import { WeaponSystem } from '../weapons/WeaponSystem.js';
import { LockOn } from '../weapons/LockOn.js';
import { CameraRig } from '../camera/CameraRig.js';
import { Hud } from '../hud/Hud.js';
import { WorldHud } from '../hud/WorldHud.js';
import { Radar } from '../hud/Radar.js';
import { ScoreApi } from '../net/ScoreApi.js';
import { PerkPool } from '../perks/PerkPool.js';
import { RunModifiers } from '../perks/RunModifiers.js';
import { MetaStore } from '../meta/MetaStore.js';
import { AchievementTracker } from '../meta/AchievementTracker.js';
import { RadioChatter } from '../hud/RadioChatter.js';
import { WeatherSystem } from '../world/WeatherSystem.js';
import { StuntScoring } from '../scoring/StuntScoring.js';
import { clampToneMappingExposure, cameraFarForSky } from '../world/atmosphereLimits.js';
import { createWebGLRenderer, disposeContainerCanvases } from '../utils/createWebGLRenderer.js';
import {
    clearHeatSlots,
    projectHeatSources,
    MAX_HEAT_SOURCES,
} from '../fx/HeatHaze.js';

/**
 * GameCore — 組裝場景、實體、HUD 與主迴圈，並持有遊戲狀態。
 * 所有平衡數值來自注入的 config；DOM 只透過 Hud／WorldHud／Radar 觸及。
 */
export class GameCore {
    /**
     * @param {{ config: object, container?: HTMLElement, leaderboard?: Array<object> }} options
     */
    constructor({ config, container = document.body, leaderboard = [] }) {
        this.config = config;
        this.container = container;
        this.state = GameState.MENU;
        this.keys = {};

        this.audio = new AudioManager(config.audio ?? {});
        this.scoreApi = new ScoreApi();

        this._initRenderer();
        this.audio.attachListener(this.camera, this.scene);

        this.sceneBuilder = new SceneBuilder(this.scene, config.environment);
        this.sceneBuilder.buildAll();
        const envMap = buildProceduralEnvMap(this.renderer, this.sceneBuilder);
        if (envMap) {
            this.scene.environment = envMap;
            this.scene.environmentIntensity = config.visual?.env_intensity ?? 0.45;
        }
        this.terrain = new TerrainSystem(this.scene, config.terrain ?? {});
        this.water = new WaterSystem(this.scene, config.environment ?? {});
        this.groundDefense = new GroundDefense(this.scene, this.terrain, config.ground_defense ?? {});
        this.postFx = new PostFx(
            this.renderer, this.scene, this.camera, innerWidth, innerHeight,
            config.visual ?? {},
            config.performance ?? {}
        );
        this.contrails = new ContrailSystem(this.scene, {
            capacity: config.visual?.contrail_capacity ?? 64,
            g_threshold: config.visual?.contrail_g_threshold ?? 2.2,
            spawn_interval: config.visual?.contrail_interval ?? 0.045,
        });

        this.bulletPool = new BulletPool(this.scene, config.pools.bullets);
        this.missilePool = new MissilePool(this.scene, config.pools.missiles, config.weapons.missile);
        this.explosionPool = new ExplosionPool(this.scene, config.pools.explosions, {
            maxTrailParticles: config.pools.max_trail_particles,
            boomParticleCount: config.pools.boom_particle_count ?? 8,
        });

        this.player = new PlayerJet(this.scene, config);
        this.weapons = new WeaponSystem(config);
        this.weapons.onOverheat = () => this.audio.overheat();

        this.cameraRig = new CameraRig(this.camera, config.hud);
        this.cameraRig.reset(this.player.position);

        this.lockOn = new LockOn(this.camera, config, {
            onTick: () => this.audio.lockTick(),
            onLock: () => this.audio.lockTone(),
            losCheck: (from, to) => this.terrain.hasLineOfSight(from, to),
        });

        this.hud = new Hud(config, {
            onStart: () => this.startGame(),
            onRestart: () => this.restartGame(),
            onResume: () => this.setState(GameState.PLAYING),
            onToggleMute: () => this.toggleMute(),
            onOpenHangar: () => this.openHangar(),
            onCloseHangar: () => this.closeHangar(),
            onEndHangar: () => this.openHangarFromEnd(),
            onBuyUpgrade: (id) => this.buyUpgrade(id),
            onPickPerk: (id) => this.pickPerk(id),
        });
        this.worldHud = new WorldHud(this.camera, this.hud.el.worldHud, {
            centerY: config.hud.crosshair_center_y,
        });
        this.radar = new Radar(this.hud.el.radarCanvas, config.hud.radar_range);

        this.weather = new WeatherSystem(this.scene, this.sceneBuilder, config.weather ?? {});
        this.stunts = new StuntScoring(config.stunts ?? {});
        this.radio = new RadioChatter(config.radio ?? {}, {
            show: (callsign, line) => this.hud.showRadio(callsign, line),
            hide: () => this.hud.hideRadio(),
            speak: (line) => this.audio.speakRadio(line),
        });


        this.perkPool = new PerkPool(config.perks);
        this.runMods = new RunModifiers(this.perkPool);
        this.metaStore = new MetaStore(config);
        this.achievements = new AchievementTracker(config.achievements, this.metaStore, {
            onUnlock: (id, def, reward) => {
                this.audio.achievement();
                this.hud.showAchievementToast(def?.name_zh || def?.name || id, reward);
                this.hud.setScrap(this.metaStore.scrap);
            },
        });
        this.hud.setScrap(this.metaStore.scrap);
        this.hud.renderHangar(this.metaStore);

        this.baseFlightThrust = config.flight.thrust;
        this.baseMaxHp = config.player.max_hp;
        this.baseMissileCd = config.weapons.missile.cooldown;
        this.baseBoostDuration = config.flight.boost_duration;

        this.route = new Route(this.scene, config.mission);
        this.waves = new WaveManager(this.scene, config, {
            onToast: (msg) => this.hud.showWaveToast(msg),
            onWaveCleared: (wave) => this._onWaveCleared(wave),
        });
        this.waves.setTerrain(this.terrain);

        /** @type {Pickup[]} */
        this.items = [];

        this.score = 0;
        this.kills = 0;
        this.elapsed = 0;
        this.weaponPower = 1;
        /** 限時火力 Buff 剩餘秒數（射速＋傷害） */
        this.combatBuffT = 0;
        this.missionTime = config.mission.time_limit;
        this.boostCd = 0;
        this.lastHp = config.player.max_hp;
        this.trailAcc = 0;
        this.foamAcc = 0;
        this.ambientBoomT = 8;
        this._grazeCd = 0;
        this.outcome = null;
        this.pilotName = 'PILOT';
        this._scoreSubmitted = false;
        this.lockSnap = { state: 'none', progress: 0, candidate: null, locked: null };
        this.radarAlt = 0;
        this.gpwsActive = false;
        this.gpwsAcc = 0;
        this.weather?.reset();
        this._lastWx = null;
        this._cloudDensCache = 0;
        if (this._perfAcc) {
            this._perfAcc.radar = 0;
            this._perfAcc.worldHud = 0;
            this._perfAcc.weather = 0;
            this._perfAcc.hudBars = 0;
            this._perfAcc.spatial = 0;
            this._perfAcc.frame = 0;
            this._perfAcc.cloudDens = 0;
            this._perfAcc.fog = 0;
            this._perfAcc.lock = 0;
        }
        this._activeBoomBudget = 0;
        this.stunts?.reset();
        this.radio?.reset();
        /** @type {FlyingFortress|null} */
        this.boss = null;
        this.bossTriggered = false;
        this.bossWarningT = 0;
        this.bossPendingSpawn = false;

        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._tmp = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();
        this._tmp3 = new THREE.Vector3();
        this._tmp4 = new THREE.Vector3();
        this._gunRight = new THREE.Vector3();
        this._gunUp = new THREE.Vector3(0, 1, 0);
        this._mslSteer = new THREE.Vector3();
        this._lockTargets = [];
        this._radarContacts = [];
        this._cloudDensCache = 0;
        this._heatSlots = Array.from(
            { length: MAX_HEAT_SOURCES },
            () => new THREE.Vector4(0, 0, 0, 0.08)
        );
        this._baseBoomParticles = config.pools?.boom_particle_count ?? 8;
        this._baseMaxTrail = config.pools?.max_trail_particles ?? 56;
        this._baseCloudStride = 1;
        this._basePixelRatio = Math.min(
            typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
            this.config.performance?.max_pixel_ratio ?? 1.5
        );
        this._menuWaterReflectionInterval = this.config.environment?.water_reflection_interval ?? 3;
        this._defaultLosSamples = this.config.terrain?.los_samples ?? 24;

        this.hud.renderLeaderboard(leaderboard);
        this.hud.renderRoute(0, this.route.total, true);
        this.loop = new Loop((dt, time) => this.update(dt, time));
        this._bindInput();
        this.hud.markReady();
    }

    _initRenderer() {
        this.scene = new THREE.Scene();
        // 霧密度由 SceneBuilder 依高度動態調整
        const fogDens = this.config.environment?.fog_density ?? 0.00048;
        this.scene.fog = new THREE.FogExp2(0x1c456e, fogDens);
        // 天穹短暫不可見時的 fallback（勿用預設黑清色，否則直飛穿出會瞬間黑屏）
        this.scene.background = new THREE.Color(0x1c456e);

        const skyScale = this.config.environment?.sky_scale ?? 4500;
        const camFar = Math.max(
            this.config.hud?.camera?.far ?? 0,
            this.config.environment?.camera_far ?? 0,
            cameraFarForSky(skyScale)
        );
        this.camera = new THREE.PerspectiveCamera(
            this.config.hud.base_fov,
            innerWidth / innerHeight,
            0.4,
            camFar
        );

        this.renderer = createWebGLRenderer(this.container, {
            antialias: this.config.performance?.antialias !== false,
        });
        this.renderer.setSize(innerWidth, innerHeight);
        const maxPr = this.config.performance?.max_pixel_ratio ?? 1.5;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, maxPr));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = clampToneMappingExposure(
            this.config.visual?.tone_mapping_exposure ?? 1.2
        );
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);

        // context 被系統回收時提示重新整理，避免默默黑屏
        this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('[Sky Fighter] WebGL context lost');
            this.hud?.markBootError?.(
                '繪圖環境已中斷（可能開啟過多分頁）。請重新整理頁面。'
            );
        }, false);

        // 非關鍵系統降頻累積器
        this._perfAcc = {
            radar: 0,
            worldHud: 0,
            weather: 0,
            hudBars: 0,
            spatial: 0,
            frame: 0,
            cloudDens: 0,
            fog: 0,
            lock: 0,
        };
        this._activeBoomBudget = 0;
        this._lastWx = null;
    }

    // ── 狀態 ─────────────────────────────

    setState(next) {
        if (this.state === next) return;
        const prev = this.state;
        this.state = next;
        this.hud.applyState(next);
        const paused = next === GameState.PAUSED
            || next === GameState.GAMEOVER
            || next === GameState.MENU
            || next === GameState.HANGAR
            || next === GameState.LEVEL_UP;
        this.audio.setPaused(paused);

        // 暫停／升級選單仍屬「任務中」，避免反覆切換 DPR／反射造成頓挫
        const wasMission = prev === GameState.PLAYING
            || prev === GameState.PAUSED
            || prev === GameState.LEVEL_UP;
        const nowMission = next === GameState.PLAYING
            || next === GameState.PAUSED
            || next === GameState.LEVEL_UP;
        if (wasMission !== nowMission) this._applyFlightPerfMode(nowMission);
    }

    /**
     * 飛行／任務中套用激進降載；回選單／結束後還原展示設定。
     * @param {boolean} flying
     */
    _applyFlightPerfMode(flying) {
        const perf = this.config.performance ?? {};
        const env = this.config.environment ?? {};

        if (flying) {
            const flightPr = perf.flight_max_pixel_ratio ?? 1.1;
            this.renderer.setPixelRatio(Math.min(
                typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
                flightPr
            ));
            const refl = perf.flight_water_reflection_interval;
            this.water.setReflectionInterval(
                refl === undefined ? 0 : Math.max(0, refl | 0)
            );
            this.water.setUniformHz(perf.flight_water_uniform_hz ?? 12);
            this._baseCloudStride = Math.max(1, perf.flight_cloud_update_stride ?? 5);
            this.sceneBuilder.cloudUpdateStride = this._baseCloudStride;
            this.sceneBuilder.cloudFarSkipMul = Math.max(2, perf.flight_cloud_far_skip_mul ?? 3);
            this.sceneBuilder.distantCraftStride = Math.max(1, perf.flight_distant_craft_stride ?? 3);
            this.sceneBuilder.orbitStrideBoost = 1;
            this.sceneBuilder.fogAltitudeEpsilon = 10;
            this.audio.setEngineAudioCadence(
                perf.flight_engine_audio_hz ?? 8,
                perf.flight_engine_audio_epsilon ?? 0.016
            );
            this.audio.setGunAudioLayers(perf.flight_gun_audio_layers ?? 1);
            this.loop.setMaxDelta(perf.flight_max_delta ?? 0.04);
            if (this.terrain) {
                this.terrain.losSamples = Math.max(4, perf.flight_los_samples ?? 8);
            }
            this.explosionPool.allowLights = perf.flight_explosion_lights === true;
            this.explosionPool.boomParticleCount = Math.max(
                3,
                perf.combat_boom_particle_count ?? this._baseBoomParticles
            );
            this.explosionPool.maxTrailParticles = Math.max(
                16,
                perf.combat_max_trail_particles ?? this._baseMaxTrail
            );
            this.contrails.setSpawnIntervalMul(perf.flight_contrail_spawn_mul ?? 1.75);
            this._cloudDensCache = this.sceneBuilder.sampleCloudDensity(this.camera.position);
            if (this._perfAcc) {
                this._perfAcc.cloudDens = 0;
                this._perfAcc.fog = 0;
                this._perfAcc.lock = 0;
            }
            this.postFx?.setFlightLoadShed(true);
        } else {
            this.renderer.setPixelRatio(this._basePixelRatio);
            this.water.setReflectionInterval(
                this._menuWaterReflectionInterval ?? env.water_reflection_interval ?? 3
            );
            this.water.setUniformHz(0);
            this.sceneBuilder.cloudUpdateStride = 1;
            this.sceneBuilder.cloudFarSkipMul = 2;
            this.sceneBuilder.distantCraftStride = 1;
            this.sceneBuilder.orbitStrideBoost = 1;
            this.sceneBuilder.fogAltitudeEpsilon = 2;
            this.audio.setEngineAudioCadence(0);
            this.audio.setGunAudioLayers(2);
            this.loop.setMaxDelta(0.05);
            if (this.terrain) {
                this.terrain.losSamples = this._defaultLosSamples;
            }
            this.explosionPool.allowLights = true;
            this.explosionPool.boomParticleCount = this._baseBoomParticles;
            this.explosionPool.maxTrailParticles = this._baseMaxTrail;
            this.contrails.setSpawnIntervalMul(1);
            this.postFx?.setFlightLoadShed(false);
        }
    }

    togglePause() {
        if (this.state === GameState.PLAYING) this.setState(GameState.PAUSED);
        else if (this.state === GameState.PAUSED) this.setState(GameState.PLAYING);
    }

    toggleMute() {
        this.hud.setMuted(this.audio.toggleMute());
    }

    openHangar() {
        if (this.state !== GameState.MENU && this.state !== GameState.GAMEOVER) return;
        this.audio.unlock();
        this.hud.renderHangar(this.metaStore);
        this.setState(GameState.HANGAR);
    }

    /** 從結算進機庫（先關結算視覺由 applyState 處理）。 */
    openHangarFromEnd() {
        this.audio.unlock();
        this.hud.renderHangar(this.metaStore);
        this.setState(GameState.HANGAR);
    }

    closeHangar() {
        if (this.state !== GameState.HANGAR) return;
        // 若 loading 仍在 → 回 MENU；否則回 GAMEOVER（從結算進入時）
        if (this.hud.el.loading) this.setState(GameState.MENU);
        else this.setState(GameState.GAMEOVER);
    }

    buyUpgrade(id) {
        if (!this.metaStore.tryUpgrade(id)) return;
        this.audio.pickup();
        this.hud.renderHangar(this.metaStore);
        this.hud.setScrap(this.metaStore.scrap);
    }

    startGame() {
        if (this.state !== GameState.MENU && this.state !== GameState.HANGAR) return;
        this.audio.unlock();
        this.pilotName = this.hud.pilotName;
        this.hud.hideLoading();
        this.resetWorld();
        this.setState(GameState.PLAYING);
        this.radio?.trigger('takeoff', { force: true });
    }

    restartGame() {
        this.audio.unlock();
        this.resetWorld();
        this.setState(GameState.PLAYING);
    }

    /**
     * 波次清空 → 進入 LEVEL_UP（Boss 期間跳過）。
     * @param {number} wave
     */
    _onWaveCleared(wave) {
        this.achievements.noteWaveClear(this.player.hp, wave);

        const skipBoss = this.config.perks?.skip_on_boss !== false;
        const bossNeed = this.config.boss?.kills_to_trigger ?? 30;
        if (
            skipBoss
            && (this.bossTriggered || this.bossPendingSpawn || this.boss?.alive || this.kills >= bossNeed)
        ) {
            this.waves.holdNextWave = false;
            return;
        }

        if (this.state !== GameState.PLAYING) return;

        this.waves.holdNextWave = true;
        this.waves.pending = false;
        const choices = this.perkPool.roll(this.config.perks?.choices ?? 3, this.runMods.ownedSet());
        if (choices.length === 0) {
            this.waves.holdNextWave = false;
            this.waves.queueWave(this.config.waves.cooldown_after_clear ?? 2.2);
            return;
        }
        this.hud.showLevelUp(choices);
        this.audio.levelUp();
        this.setState(GameState.LEVEL_UP);
    }

    /** @param {string} perkId */
    pickPerk(perkId) {
        if (this.state !== GameState.LEVEL_UP) return;
        this.runMods.apply(perkId, {
            player: this.player,
            weapons: this.weapons,
            lockOn: this.lockOn,
            radar: this.radar,
        });
        this.hud.setWeapons(this.weapons);
        this.waves.holdNextWave = false;
        this.waves.queueWave(this.config.waves.cooldown_after_clear ?? 2.2);
        this.setState(GameState.PLAYING);
        this.hud.showWaveToast(`PERK · ${this.perkPool.get(perkId)?.name_zh || perkId}`);
    }

    resetWorld() {
        this.bulletPool.releaseAll();
        this.missilePool.releaseAll();
        this.explosionPool.releaseAll();
        this.audio.clearSpatial();
        this.audio.setThreatLock(0, false);
        this.waves.reset();
        for (const item of this.items) item.dispose();
        this.items.length = 0;

        this.score = 0;
        this.kills = 0;
        this.elapsed = 0;
        this.weaponPower = 1;
        this.combatBuffT = 0;
        this.missionTime = this.config.mission.time_limit;
        this.boostCd = 0;
        this.trailAcc = 0;
        this.foamAcc = 0;
        this.ambientBoomT = 8;
        this.outcome = null;
        this._scoreSubmitted = false;
        this.radarAlt = 0;
        this.gpwsActive = false;
        this.gpwsAcc = 0;
        this._lastWx = null;
        this._cloudDensCache = 0;
        this._activeBoomBudget = 0;
        if (this._perfAcc) {
            this._perfAcc.radar = 0;
            this._perfAcc.worldHud = 0;
            this._perfAcc.weather = 0;
            this._perfAcc.hudBars = 0;
            this._perfAcc.spatial = 0;
            this._perfAcc.frame = 0;
            this._perfAcc.cloudDens = 0;
            this._perfAcc.fog = 0;
            this._perfAcc.lock = 0;
        }
        this.weather?.reset();
        this.stunts?.reset();
        this.radio?.reset();
        this._disposeBoss();
        this.bossTriggered = false;
        this.bossWarningT = 0;
        this.bossPendingSpawn = false;
        this._shieldDownAnnounced = false;
        this.audio.setBossBgm(false);

        this.runMods.reset();
        this.achievements.resetRun();
        this.radar.resetRange();

        // 還原基礎參數再套用 meta／run
        this.player.maxHp = this.baseMaxHp;
        this.player.boostDuration = this.baseBoostDuration;
        this.player.model.thrustForce = this.baseFlightThrust;
        this.player.reset();

        const metaResult = this.metaStore.applyToRun({
            player: this.player,
            weapons: this.weapons,
            baseFlightThrust: this.baseFlightThrust,
            baseMaxHp: this.baseMaxHp,
            baseMissileCd: this.baseMissileCd,
        });
        this.weapons.reset();
        // meta 飛彈冷卻需在 weapons.reset 之後再套一次
        this.weapons.missileCdMax = this.baseMissileCd * Math.max(
            0.4,
            1 - this.metaStore.upgradeLevel('missile_cd')
                * (this.config.meta?.upgrades?.missile_cd?.cooldown_mul_per_level ?? 0.08)
        );
        this.player.shield = metaResult.shield ?? 0;
        this.lastHp = this.player.hp + this.player.shield;

        // 起飛點抬到峽谷上方淨空
        const spawnY = this.terrain.surfaceAltitude(
            this.player.position.x,
            this.player.position.z,
            this.config.player.start_altitude * 0.55
        );
        this.player.position.y = Math.max(this.player.position.y, spawnY);
        this.lockOn.reset();
        this.contrails.reset();
        this.worldHud.clear();
        this.cameraRig.reset(this.player.position);

        this.groundDefense.reset();
        this.route.generate(this.terrain, this.player.position);
        this.hud.resetVisuals();
        this.hud.setWeapons(this.weapons);
        this.hud.setScrap(this.metaStore.scrap);
        this.hud.renderRoute(0, this.route.total, true);
        this.hud.setTimer(this.missionTime);
        this.waves.setPaused(false);
        this.waves.holdNextWave = false;
        this.waves.spawnWave(this.player, 'start');
    }

    _disposeBoss() {
        if (this.boss) {
            this.boss.dispose();
            this.boss = null;
        }
    }

    /** @param {string} outcome Outcome 之一 */
    endGame(outcome) {
        this.outcome = outcome;
        // 結束時清掉速度暗角，避免 GAMEOVER 殘留 .fast/.boost 把結算畫面壓暗
        this.hud.setSpeedFx(0, false);
        this.hud.setCloudFx?.(0);
        this.hud.showEnd({
            title: OUTCOME_TITLES[outcome] ?? 'MISSION END',
            score: this.score,
            kills: this.kills,
            elapsed: this.elapsed,
            wave: this.waves.wave,
        });
        this.setState(GameState.GAMEOVER);
        this.submitScore();
    }

    /**
     * 記錄撞毀當下遙測（瀏覽器 CDP／除錯用）。
     * @param {string} outcome
     * @param {{ keelY?: number, waterCrash?: boolean }} [phys]
     */
    _recordCrashDebug(outcome, phys = {}) {
        const pos = this.player.position;
        const probe = this.terrain.playerCrashProbe(pos, {
            keelOffset: this.player.keelOffset,
        });
        const snapshot = {
            outcome,
            pivotY: pos.y,
            x: pos.x,
            z: pos.z,
            keelY: phys.keelY ?? probe.keelY,
            keelOffset: this.player.keelOffset,
            terrainHeight: probe.terrainHeight,
            radarAlt: probe.radarAlt,
            clearance: probe.clearance,
            waterCollisionCeil: probe.waterCollisionCeil,
            contactPad: probe.contactPad,
            exemptWater: probe.exemptWater,
            exemptSeaClearance: probe.exemptSeaClearance,
            exemptDisabled: probe.exemptDisabled,
            playerTerrainCollision: probe.playerTerrainCollision,
            seaVisualClearance: probe.seaVisualClearance,
            terrainCrash: probe.terrainCrash,
            waterCrash: !!phys.waterCrash,
            crashAltitude: this.player.crashAltitude,
            t: this.elapsed,
        };
        this.lastCrashDebug = snapshot;
        if (typeof window !== 'undefined') {
            window.__lastCrashDebug = snapshot;
        }
        return snapshot;
    }

    /** 上傳成績；任何失敗都靜默降級。 */
    async submitScore() {
        if (this._scoreSubmitted) return;
        this._scoreSubmitted = true;

        const result = await this.scoreApi.submit({
            pilot_name: this.pilotName || this.hud.pilotName,
            score: Math.max(0, Math.round(this.score)),
            kills: this.kills,
            waypoints_cleared: this.route.cleared,
            wave_reached: Math.max(1, this.waves.wave),
            duration_seconds: Math.round(this.elapsed),
            outcome: this.outcome ?? Outcome.TIME_UP,
        });

        if (result?.rank) this.hud.setRank(result.rank);
        const rows = await this.scoreApi.leaderboard(10);
        if (rows) this.hud.renderLeaderboard(rows);
    }

    // ── 事件 ─────────────────────────────

    _bindInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
            if (e.code === 'Escape') {
                e.preventDefault();
                this.togglePause();
                return;
            }
            if (this.state !== GameState.PLAYING) return;
            if (e.code === 'KeyF') this.fireMissile();
            if (e.code === 'KeyR' && this.boostCd <= 0) {
                this.player.triggerBoost();
                this.boostCd = this.config.flight.boost_cooldown;
                this.audio.boost();
            }
            if (e.code === 'KeyM') this.toggleMute();
        });

        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        window.addEventListener('resize', () => {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
            this.water.onResize(this.camera.aspect);
            this.renderer.setSize(innerWidth, innerHeight);
            this.postFx.setSize(innerWidth, innerHeight);
        });
    }

    // ── 戰鬥 ─────────────────────────────

    addScore(n) {
        this.score += n;
        this.hud.setScore(this.score);
        this.hud.popScore(n);
    }

    spawnExplosion(pos, scale = 1) {
        const maxBooms = this.config.performance?.max_simultaneous_booms ?? 4;
        const camCfg = this.config.hud?.camera ?? {};
        // 以玩家距離為主（相機彈簧滯後時仍要「近爆猛震」）
        const distCam = pos.distanceTo(this.camera.position);
        const distPlayer = this.player ? pos.distanceTo(this.player.position) : distCam;
        const dist = Math.min(distCam, distPlayer);
        const nearR = camCfg.near_boom_radius ?? 55;
        const nearMul = camCfg.near_boom_shake_mul ?? 2.2;
        let distMul = 0.2;
        if (dist < nearR) {
            distMul = 1 + (1 - dist / nearR) * nearMul;
        } else if (dist < nearR * 3.5) {
            distMul = Math.max(0.2, 1 - (dist - nearR) / (nearR * 2.5));
        }
        const shakeAmt = 0.55 * scale * distMul;

        if (scale < 1.5 && this._activeBoomBudget >= maxBooms) {
            // 小爆炸超預算：只播音＋輕震，略過粒子
            this.audio.boom(scale * 0.7, pos);
            this.cameraRig.addShake(shakeAmt * 0.55);
            return;
        }
        this._activeBoomBudget += 1;
        this.audio.boom(scale, pos);
        this.cameraRig.addShake(shakeAmt);
        this.explosionPool.spawnBoom(pos, scale);
        if (distCam < 90) {
            this.postFx.pulseChromatic(Math.min(1, (1 - distCam / 90) * scale * 0.85));
        }
    }

    addContrail(pos, isMissile = false) {
        if (pos.distanceTo(this.camera.position) < 12) return;
        this.explosionPool.spawnTrail(pos, isMissile);
    }

    shootGun() {
        const gun = this.config.weapons.gun;
        this.achievements.noteFire();
        this.audio.gun();
        this.cameraRig.addShake(0.06);
        const origin = this.player.getGunOrigin();
        const baseDir = this.player.getGunDirection();
        const count = this.runMods.spreadGun ? this.runMods.spreadCount : 1;
        const spread = this.runMods.spreadAngle;
        this._gunRight.crossVectors(baseDir, this._gunUp);
        if (this._gunRight.lengthSq() < 0.01) this._gunRight.set(1, 0, 0);
        else this._gunRight.normalize();

        for (let i = 0; i < count; i++) {
            this._tmp4.copy(baseDir);
            if (count > 1) {
                const t = (i / (count - 1)) - 0.5;
                this._tmp4.addScaledVector(this._gunRight, Math.sin(t * spread * 2) * 2).normalize();
            }
            this._tmp4.multiplyScalar(gun.projectile_speed);
            this.bulletPool.spawn(origin, this.player.quaternion, this._tmp4, {
                team: 'player',
                life: gun.projectile_life,
                damage: gun.damage * this.weaponPower * this._combatDamageMul(),
                color: 0xffff66,
            });
        }
        this.explosionPool.spawnMuzzle(origin);
    }

    fireMissile() {
        if (!this.weapons.canFireMissile()) return;
        const cfg = this.config.weapons.missile;
        this.achievements.noteFire();
        this.weapons.consumeMissile();
        this.hud.setWeapons(this.weapons);
        this.audio.missile({ foxTwo: true });
        this.cameraRig.addShake(0.12);

        const target = this.lockOn.getFireTarget();
        const guided = !!target;
        const dir = this.player.getGunDirection();
        const launchSpeed = cfg.initial_speed + this.player.airspeed * 0.85;

        this.missilePool.spawn(
            this.player.getMissileOrigin(),
            this.player.quaternion,
            dir.multiplyScalar(launchSpeed),
            {
                target: guided ? target : null,
                guided,
                life: guided ? cfg.guided_life : cfg.dumb_life,
                accel: cfg.acceleration,
                maxSpeed: cfg.max_speed,
                maxTurn: cfg.max_turn_rate * this.runMods.missileTurnMul,
                owner: 'player',
            }
        );
    }

    destroyEnemy(enemy, score) {
        const pos = enemy.position.clone();
        const elite = enemy.elite;
        const mul = enemy.scoreMul ?? 1;
        this.spawnExplosion(pos, elite ? 1.8 : enemy.classType === 'drone' ? 0.9 : 1.3);
        this.kills++;
        this.achievements.noteKills(this.kills);
        this.waves.remove(enemy);
        this.addScore(Math.round(score * mul) + (elite ? this.config.scoring.elite_bonus : 0));
        this.radio?.trigger('kill');

        if (this.runMods.lifestealHeal > 0) {
            this.player.heal(this.runMods.lifestealHeal);
        }

        if (elite && Math.random() < this.config.enemy.elite_drop_chance) {
            const type = Math.random() < this.config.pickups.supply_drop_chance ? 'supply' : 'weapon';
            this.items.push(new Pickup(this.scene, type, pos.clone().add(new THREE.Vector3(0, 2, 0))));
        }

        this._maybeDropScrap(pos, elite);
        this._checkBossTrigger();
    }

    /**
     * @param {THREE.Vector3} pos
     * @param {boolean} elite
     */
    _maybeDropScrap(pos, elite) {
        const scrapCfg = this.config.meta?.scrap ?? {};
        const chance = scrapCfg.drop_chance ?? 0.72;
        if (Math.random() > chance) return;
        const min = scrapCfg.amount_min ?? 2;
        const max = scrapCfg.amount_max ?? 6;
        let amount = min + Math.floor(Math.random() * (max - min + 1));
        if (elite) amount += scrapCfg.elite_bonus ?? 4;
        this.items.push(new Pickup(
            this.scene,
            'scrap',
            pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6)),
            { amount }
        ));
    }

    _checkBossTrigger() {
        const need = this.config.boss?.kills_to_trigger ?? 30;
        if (this.bossTriggered || this.kills < need) return;
        this.bossTriggered = true;
        this.bossPendingSpawn = true;
        this.bossWarningT = this.config.boss?.warning_seconds ?? 3.8;
        if (this.config.boss?.pause_waves !== false) {
            this.waves.setPaused(true);
            this.waves.pending = false;
        }
        this.hud.showBossWarning(this.bossWarningT);
        this.hud.showWaveToast('BOSS WARNING · FLYING FORTRESS');
        this.audio.bossWarn();
        this.audio.setBossBgm(true);
        this.radio?.trigger('boss', { force: true });
    }

    _spawnBoss() {
        const cfg = this.config.boss ?? {};
        const dist = cfg.spawn_distance ?? 780;
        const fwd = this._tmp.set(0, 0, -1).applyQuaternion(this.player.quaternion);
        const ang = Math.atan2(fwd.x, -fwd.z) + (Math.random() - 0.5) * 0.6;
        const x = this.player.position.x + Math.sin(ang) * dist;
        const z = this.player.position.z - Math.cos(ang) * dist;
        let y = MathUtils.clamp(this.player.position.y + 20, cfg.min_altitude ?? 70, cfg.max_altitude ?? 150);
        if (this.terrain) {
            const floor = this.terrain.sampleHeight(x, z);
            y = Math.max(floor + 50, y);
        }

        this.boss = new FlyingFortress(this.scene, cfg, new THREE.Vector3(x, y, z));
        this.boss.onExplosion = (pos, scale) => this.spawnExplosion(pos, scale);
        this.boss.onPartDestroyedHook = (part) => {
            const partScore = this.config.scoring.boss_part ?? cfg.part_score ?? 180;
            this.addScore(partScore);
            if (part.kind !== 'bridge' && this.boss && !this.boss.shieldActive && !this._shieldDownAnnounced) {
                this._shieldDownAnnounced = true;
                this.hud.showWaveToast('SHIELD DOWN · TARGET BRIDGE');
            }
        };
        this.boss.onDefeatedHook = () => this._onBossDefeated();
        this.hud.showWaveToast('FORTRESS IN RANGE');
    }

    _onBossDefeated() {
        const cfg = this.config.boss ?? {};
        const defeatScore = this.config.scoring.boss_defeat ?? cfg.defeat_score ?? 5000;
        this.addScore(defeatScore);
        this.audio.setBossBgm(false);
        this.audio.boom(3);
        this.hud.showWaveToast('FORTRESS DESTROYED');
        this.cameraRig.addShake(1.2);
        this.achievements.noteBossDefeated();

        // 設計選擇：擊毀要塞直接以高潮結局勝利（boss_defeated）
        if (cfg.end_on_defeat !== false) {
            setTimeout(() => {
                if (this.state === GameState.PLAYING) {
                    this.endGame(Outcome.BOSS_DEFEATED);
                }
            }, 1800);
        } else {
            this.waves.setPaused(false);
            this.waves.queueWave(2.5);
        }
    }

    /** 鎖定目標：一般敵機 + Boss 可鎖部位。 */
    _collectLockTargets() {
        this._lockTargets.length = 0;
        for (const e of this.waves.enemies) {
            if (e.alive) this._lockTargets.push(e);
        }
        if (this.boss?.alive) {
            for (const p of this.boss.getLockTargets()) {
                this._lockTargets.push(p);
            }
        }
        return this._lockTargets;
    }

    _updateBullets(dt) {
        const playerHitR = this.config.player.hit_radius;
        const enemyHitR = this.config.weapons.gun.hit_radius;
        if (this._grazeCd > 0) this._grazeCd = Math.max(0, this._grazeCd - dt);

        for (let i = this.bulletPool.active.length - 1; i >= 0; i--) {
            const b = this.bulletPool.active[i];
            const ud = b.userData;
            b.position.addScaledVector(ud.velocity, dt);
            ud.life -= dt;
            let dead = ud.life <= 0;

            if (!dead && ud.team === 'player') {
                for (const enemy of this.waves.enemies) {
                    if (!enemy.alive) continue;
                    if (b.position.distanceTo(enemy.position) >= Math.max(enemyHitR, enemy.hitRadius)) continue;
                    enemy.takeDamage(ud.damage);
                    this.spawnExplosion(b.position.clone(), 0.35);
                    dead = true;
                    if (enemy.hp <= 0) this.destroyEnemy(enemy, this.config.scoring.enemy_gun_kill);
                    break;
                }
                if (!dead && this.boss?.alive) {
                    const result = this.boss.applyDamageAt(b.position, ud.damage, 0);
                    if (result.hit) {
                        this.spawnExplosion(b.position.clone(), result.shieldBlocked ? 0.55 : 0.4);
                        if (result.shieldBlocked) this.cameraRig.addShake(0.04);
                        dead = true;
                    }
                }
            } else if (!dead && (ud.team === 'enemy' || ud.team === 'aaa')) {
                const dist = b.position.distanceTo(this.player.position);
                if (dist < playerHitR) {
                    this.player.takeDamage(ud.damage);
                    this.spawnExplosion(b.position.clone(), 0.25);
                    dead = true;
                } else {
                    // 擦彈：未命中但貼身掠過 → 強烈 Camera Shake
                    const camCfg = this.config.hud?.camera ?? {};
                    const grazeR = camCfg.graze_radius ?? 9;
                    if (dist < grazeR && this._grazeCd <= 0) {
                        const gShake = camCfg.graze_shake ?? 0.68;
                        this.cameraRig.addShake(gShake * (1 - dist / grazeR));
                        this._grazeCd = camCfg.graze_cooldown ?? 0.28;
                    }
                }
            }

            // 曳光彈／砲彈撞地形
            if (!dead && this.terrain.collides(b.position, 1.5)) {
                dead = true;
            }

            if (dead) this.bulletPool.release(b);
        }
    }

    _updateMissiles(dt) {
        const blastR = this.config.weapons.missile.blast_radius;
        const samDmg = this.config.ground_defense?.sam?.damage ?? 28;
        const playerHitR = this.config.player.hit_radius;

        for (let i = this.missilePool.active.length - 1; i >= 0; i--) {
            const m = this.missilePool.active[i];
            const ud = m.userData;
            ud.life -= dt;
            ud.smokeT -= dt;
            if (ud.confused > 0) ud.confused -= dt;
            if (ud.smokeT <= 0) {
                this.addContrail(m.position, true);
                ud.smokeT = this._missileSmokeInterval ?? 0.08;
            }

            let spd = ud.velocity.length();
            if (spd > 0.001) {
                ud.velocity.multiplyScalar(Math.min(ud.maxSpeed, spd + ud.accel * dt) / spd);
                spd = ud.velocity.length();
            }

            // 熱焰彈干擾：靠近時有機率失鎖
            if (ud.guided && ud.confused <= 0) {
                for (const p of this.explosionPool.active) {
                    if (p.userData.type !== 'flare' || !p.userData.alive) continue;
                    if (m.position.distanceTo(p.position) < 42 && Math.random() < 0.12) {
                        ud.guided = false;
                        ud.target = null;
                        ud.confused = 0.8;
                        break;
                    }
                }
            }

            // 地形 LOS：導引彈失去視線則失鎖（SAM→玩家、玩家→敵機）
            if (ud.guided && ud.target) {
                const targetPos = ud.target.position ?? ud.target;
                if (targetPos && !this.terrain.hasLineOfSight(m.position, targetPos)) {
                    ud.guided = false;
                    ud.target = null;
                }
            }

            const turnRate = ud.confused > 0 ? ud.maxTurn * 0.35 : ud.maxTurn;
            if (ud.guided && ud.target?.alive !== false && ud.target?.position) {
                this._mslSteer.copy(ud.target.position).sub(m.position);
                const toLen = this._mslSteer.length();
                if (toLen > 0.01) {
                    this._mslSteer.multiplyScalar(1 / toLen);
                    const velDir = this._tmp.copy(ud.velocity).normalize();
                    const dot = MathUtils.clamp(velDir.dot(this._mslSteer), -1, 1);
                    const ang = Math.acos(dot);
                    if (ang > 1e-4) {
                        velDir.lerp(this._mslSteer, Math.min(1, (turnRate * dt) / ang)).normalize();
                        ud.velocity.copy(velDir).multiplyScalar(spd);
                    }
                }
                m.lookAt(this._tmp2.copy(m.position).add(ud.velocity));
            } else if (ud.guided) {
                ud.guided = false;
                ud.target = null;
            }

            m.position.addScaledVector(ud.velocity, dt);

            let hit = false;

            // SAM／敵方飛彈打玩家（玩家以 alive getter 判斷）
            if (!hit && (ud.owner === 'sam' || ud.owner === 'enemy') && this.player.alive) {
                if (m.position.distanceTo(this.player.position) < blastR + playerHitR * 0.35) {
                    const dmg = ud.damage ?? (ud.owner === 'sam' ? samDmg : samDmg * 0.85);
                    this.player.takeDamage(ud.owner === 'sam' ? samDmg : dmg);
                    this.spawnExplosion(m.position.clone(), 1.1);
                    hit = true;
                }
            }

            // 玩家飛彈打敵機／Boss 部位
            if (!hit && (ud.owner === 'player' || !ud.owner)) {
                const mslDmg = ud.damage ?? this.config.weapons.missile.damage ?? 1;
                for (const enemy of this.waves.enemies) {
                    if (!enemy.alive) continue;
                    if (m.position.distanceTo(enemy.position) >= blastR + enemy.hitRadius * 0.35) continue;
                    enemy.takeDamage(mslDmg);
                    this.spawnExplosion(m.position.clone(), 1.15);
                    hit = true;
                    if (enemy.hp <= 0) {
                        this.destroyEnemy(enemy, this.config.scoring.enemy_missile_kill);
                    }
                    break;
                }
                if (!hit && this.boss?.alive) {
                    const result = this.boss.applyDamageAt(m.position, mslDmg, blastR);
                    if (result.hit) {
                        this.spawnExplosion(m.position.clone(), result.shieldBlocked ? 0.9 : 1.3);
                        if (result.shieldBlocked) this.cameraRig.addShake(0.15);
                        hit = true;
                    }
                }
            }

            // 撞地形
            if (!hit && this.terrain.collides(m.position, 2)) {
                this.spawnExplosion(m.position.clone(), 0.45);
                hit = true;
            }

            if (hit || ud.life <= 0) {
                if (!hit) this.spawnExplosion(m.position.clone(), 0.4);
                this.missilePool.release(m);
            }
        }
    }

    _updateGroundDefense(dt) {
        const losFn = (from, to) => this.terrain.hasLineOfSight(from, to);
        const threat = this.groundDefense.getThreatLock?.() ?? { progress: 0, locked: false };
        this.audio.setThreatLock(threat.progress, threat.locked);

        const { missiles, bullets } = this.groundDefense.update({
            dt,
            player: this.player,
            losFn,
        });

        const mCfg = this.config.weapons.missile;
        for (const req of missiles) {
            this.audio.missile({ foxTwo: false });
            this.missilePool.spawn(req.origin, req.quat, req.velocity, {
                target: req.target,
                guided: req.guided,
                life: req.life ?? mCfg.guided_life,
                accel: req.accel ?? mCfg.acceleration,
                maxSpeed: req.maxSpeed ?? mCfg.max_speed,
                maxTurn: req.maxTurn ?? mCfg.max_turn_rate,
                owner: req.owner || 'sam',
            });
        }

        for (const req of bullets) {
            this.bulletPool.spawn(req.origin, req.quat, req.velocity, {
                team: req.team || 'aaa',
                life: req.life,
                damage: req.damage,
                color: req.color ?? 0xffee44,
            });
        }
    }

    _updateGpws(dt) {
        const gpws = this.config.gpws ?? {};
        const threshold = gpws.altitude_threshold ?? 50;
        const diveSpeed = gpws.dive_speed ?? 18;
        const interval = gpws.alert_interval ?? 0.55;

        // 複用本幀已採樣的 radarAlt，避免重複 heightmap 雙線性
        const diving = this.player.velocity.y < -diveSpeed
            || this.player.getForward().y < -0.35;

        const warn = this.radarAlt < threshold && diving && this.radarAlt > 0;
        this.gpwsActive = warn;
        this.hud.setGpws(warn);

        if (warn) {
            this.gpwsAcc += dt;
            if (this.gpwsAcc >= interval) {
                this.gpwsAcc = 0;
                this.audio.pullUp();
            }
        } else {
            this.gpwsAcc = 0;
        }
    }

    _activateCombatBuff() {
        const pk = this.config.pickups;
        this.combatBuffT = pk.combat_buff_duration ?? 8;
        this._applyCombatFireRate();
        const secs = Math.round(this.combatBuffT);
        const dmg = pk.combat_buff_damage_mul ?? 2;
        const rate = pk.combat_buff_fire_rate_mul ?? 1.55;
        this.hud.setWeaponLabel(`BUFF ${secs}s · ×${rate} RATE / ×${dmg} DMG`);
    }

    _combatDamageMul() {
        if (this.combatBuffT <= 0) return 1;
        return this.config.pickups.combat_buff_damage_mul ?? 2;
    }

    _applyCombatFireRate() {
        const base = this.weapons.gunCfg.fire_interval;
        if (this.combatBuffT > 0) {
            const mul = this.config.pickups.combat_buff_fire_rate_mul ?? 1.55;
            this.weapons.gunFireInterval = base / mul;
        } else {
            this.weapons.gunFireInterval = base;
        }
    }

    _updateCombatBuff(dt) {
        if (this.combatBuffT <= 0) return;
        this.combatBuffT = Math.max(0, this.combatBuffT - dt);
        if (this.combatBuffT <= 0) {
            this._applyCombatFireRate();
            this.hud.setWeaponLabel(
                this.weaponPower > 1
                    ? 'HEAVY CANNON · SPACE / MISSILE · F'
                    : 'CANNON · SPACE / MISSILE · F'
            );
        }
    }

    _updatePickups(dt, time) {
        const pk = this.config.pickups;
        const scrapCfg = this.config.meta?.scrap ?? {};
        const magnetRange = scrapCfg.magnet_range ?? 55;
        const collectR = scrapCfg.collect_radius ?? 14;
        const magnetSpeed = scrapCfg.magnet_speed ?? 95;
        const collisionR = this.config.player.collision_radius;
        const pp = this.player.position;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.update(dt, time);

            let dist = pp.distanceTo(item.position);
            if (item.type === 'scrap' && dist < magnetRange) {
                item.pullToward(pp, magnetSpeed, dt);
                dist = pp.distanceTo(item.position);
            }

            const reach = item.type === 'scrap' ? collectR : collisionR;
            if (dist >= reach) continue;

            if (item.type === 'supply') {
                this.player.heal(pk.hp_refill ?? 35);
                this._activateCombatBuff();
                this.audio.pickup();
                this.addScore(this.config.scoring.pickup);
                this.hud.showWaveToast('SUPPLY · HP + FIREPOWER');
            } else if (item.type === 'weapon') {
                this.weaponPower = pk.weapon_power;
                this.weapons.addMissiles(pk.missile_refill);
                this.hud.setWeapons(this.weapons);
                this.hud.setWeaponLabel('HEAVY CANNON · SPACE / MISSILE · F');
                this.audio.pickup();
                this.addScore(this.config.scoring.pickup);
            } else if (item.type === 'scrap') {
                this.metaStore.addScrap(item.amount);
                this.hud.setScrap(this.metaStore.scrap);
                this.achievements.noteScrapLifetime();
                this.audio.scrap();
            }

            this.spawnExplosion(item.position.clone(), 0.3);
            item.dispose();
            this.items.splice(i, 1);
        }
    }

    _updateRoute() {
        const cleared = this.route.tryAdvance(this.player.position);
        if (!cleared) {
            this.hud.setDistance(this.route.distanceToNext(this.player.position));
            return;
        }

        this.spawnExplosion(cleared, 0.8);
        this.hud.renderRoute(this.route.cleared, this.route.total, !this.route.complete);
        this.audio.waypoint();
        this.addScore(this.config.scoring.waypoint);

        if (this.waves.enemies.length < 3 && this.waves.cooldown <= 0) {
            this.waves.spawnWave(this.player, 'waypoint');
        } else if (this.route.cleared % 2 === 0) {
            this.waves.queueWave(1.5);
        }

        if (this.route.complete) this.endGame(Outcome.MISSION_COMPLETE);
    }

    updateCompass() {
        const wp = this.route.next;
        // Boss 期間羅盤可指向要塞
        if (this.boss?.alive && !wp) {
            const bearing = Math.atan2(
                this.boss.position.x - this.player.position.x,
                -(this.boss.position.z - this.player.position.z)
            );
            this._euler.setFromQuaternion(this.player.quaternion, 'YXZ');
            this.hud.setCompass(MathUtils.radToDeg(bearing - this._euler.y));
            return;
        }
        if (!wp) {
            this.hud.setCompass(0);
            return;
        }
        const bearing = Math.atan2(wp.x - this.player.position.x, -(wp.z - this.player.position.z));
        this._euler.setFromQuaternion(this.player.quaternion, 'YXZ');
        this.hud.setCompass(MathUtils.radToDeg(bearing - this._euler.y));
    }

    // ── 主迴圈 ───────────────────────────

    update(dt, time) {
        const perf = this.config.performance ?? {};
        this._perfAcc.frame += 1;
        this._activeBoomBudget = 0;
        const flying = this.state === GameState.PLAYING;

        this.water.update(time, this.camera.position, this.sceneBuilder.sunDirection);

        // 飛行中高度霧降頻；雲 billboard 由 cloudUpdateStride 控制
        let updateFog = true;
        if (flying) {
            this._perfAcc.fog += dt;
            const fogPeriod = 1 / Math.max(1, perf.flight_fog_hz ?? 6);
            if (this._perfAcc.fog < fogPeriod) updateFog = false;
            else this._perfAcc.fog = 0;
        }
        this.sceneBuilder.update(dt, time, this.camera, { updateFog });

        const dive = flying
            ? Math.max(0, -this.player.getForward().y - 0.55) * 1.4
            : 0;

        // 穿雲密度降頻：飛行中不必每幀掃全部雲團
        if (flying) {
            this._perfAcc.cloudDens += dt;
            const densPeriod = 1 / Math.max(1, perf.flight_cloud_density_hz ?? 8);
            if (this._perfAcc.cloudDens >= densPeriod) {
                this._perfAcc.cloudDens = 0;
                this._cloudDensCache = this.sceneBuilder.sampleCloudDensity(this.camera.position);
            }
        } else {
            this._cloudDensCache = 0;
        }
        const cloudWet = flying ? (this._cloudDensCache ?? 0) : 0;
        this.postFx.update(
            time,
            flying ? this.player.airspeedNorm : 0.2,
            {
                dive,
                damage: flying && this.player.hp < this.lastHp ? 0.55 : 0,
                boosting: flying && this.player.boosting,
                cloudWet,
            }
        );

        if (this.state === GameState.MENU || this.state === GameState.HANGAR) {
            this.cameraRig.showcase(this.player.position);
            this._render();
            return;
        }
        if (
            this.state === GameState.PAUSED
            || this.state === GameState.GAMEOVER
            || this.state === GameState.LEVEL_UP
        ) {
            this._render();
            return;
        }

        this.elapsed += dt;
        this.achievements.update(dt, true);

        this.missionTime -= dt;
        this.hud.setTimer(Math.max(0, this.missionTime));
        if (this.missionTime <= 0) {
            this.endGame(Outcome.TIME_UP);
            return;
        }

        if (this.boostCd > 0) {
            this.boostCd = Math.max(0, this.boostCd - dt);
            this.hud.setBoost(this.boostCd);
        }

        this.weapons.update(dt);
        if (this.weapons.updateGun(dt, !!this.keys.Space)) this.shootGun();
        this.hud.setWeapons(this.weapons);

        this.player.updateControls(dt, this.keys);
        this.player.updateAttitude(dt);
        const phys = this.player.updatePhysics(dt);

        if (phys.waterCrash) {
            this._recordCrashDebug(Outcome.WATER_IMPACT, phys);
            this.spawnExplosion(this.player.position.clone(), 2.8);
            this.player.mesh.visible = false;
            this.endGame(Outcome.WATER_IMPACT);
            return;
        }

        // 地形撞擊：機腹接觸抬升地形（近海面交由水面判定）
        if (this.terrain.collidesPlayer(this.player.position, {
            keelOffset: this.player.keelOffset,
        })) {
            this._recordCrashDebug(Outcome.TERRAIN_CRASH, phys);
            this.spawnExplosion(this.player.position.clone(), 2.6);
            this.player.mesh.visible = false;
            this.endGame(Outcome.TERRAIN_CRASH);
            return;
        }

        if (phys.lowAlt) {
            this.foamAcc += dt;
            if (this.foamAcc > 0.05) {
                this.foamAcc = 0;
                const splash = this._tmp3.copy(this.player.position);
                splash.y = 0.5;
                this.explosionPool.spawnSplash(splash, phys.foam);
            }
        } else {
            this.foamAcc = 0;
        }

        // 天氣／特技／無線電（天氣 Sky 更新降頻）
        this.radio?.update(dt);
        this.radio?.noteTime(this.missionTime);
        this._perfAcc.weather += dt;
        const weatherPeriod = 1 / Math.max(1, perf.weather_hz ?? 5);
        let wx = this._lastWx ?? { rainIntensity: 0, radarGlitch: false, phaseChanged: false, phase: 'clear' };
        if (this._perfAcc.weather >= weatherPeriod || !this._lastWx) {
            this._perfAcc.weather = 0;
            wx = this.weather?.update(
                weatherPeriod,
                this.elapsed,
                this.config.mission.time_limit,
                this.camera
            ) ?? wx;
            this._lastWx = wx;
            if (wx.phase === 'rain' && wx.phaseChanged) this.radio?.noteRainStart();
            this.hud.setRainOverlay?.(wx.rainIntensity ?? 0);
            this.hud.setRadarGlitch?.(!!wx.radarGlitch);
        } else if (this.weather?.enabled && (wx.rainIntensity ?? 0) > 0.05) {
            // 雨滴粒子仍需跟相機；僅跳過 Sky／fog 重算
            this.weather._updateRain?.(dt, this.camera, wx.rainIntensity);
        }

        this.radarAlt = this.terrain.radarAltitude(this.player.position);
        const stunt = this.stunts?.update(dt, {
            agl: this.radarAlt,
            playerPos: this.player.position,
            enemies: this.waves.enemies,
        }) ?? { scoreDelta: 0, lowAltActive: false, closeCall: false, windBoost: 0, foamBoost: 1, multiplier: 1 };
        if (stunt.scoreDelta > 0) this.addScore(stunt.scoreDelta);
        if (stunt.lowAltActive) this.radio?.noteLowAlt();
        if (stunt.closeCall) {
            this.radio?.trigger('close_call');
            const ccShake = this.config.hud?.camera?.close_call_shake ?? 0.42;
            this.cameraRig.addShake(ccShake);
        }
        this.hud.setStuntBanner?.(stunt.lowAltActive, stunt.multiplier ?? 2);
        if (stunt.lowAltActive && stunt.foamBoost > 1) {
            this.foamAcc += dt * (stunt.foamBoost - 1);
        }

        this.audio.setEngine(this.player.throttle, this.player.airspeedNorm, {
            gLoad: this.player.telemetry?.gApprox ?? 1,
            turnRate: Math.abs(this.player.rollRate) + Math.abs(this.player.yawRate) * 1.4,
            boosting: this.player.boosting,
            windBoost: stunt.windBoost ?? 0,
            dt,
        });
        this.player.updateExhaust(this.sceneBuilder.exhaustLight, time);
        this.player.updateSurfaces(dt, time, { cloudDensity: this._cloudDensCache ?? 0 });
        this.contrails.update(dt, this.player, this.camera.position);

        const thr = this.player.throttle;
        this.trailAcc += dt;
        const trailMul = perf.flight_trail_interval_mul ?? 1.45;
        const trailInterval = (thr > 0.8 || this.player.boosting ? 0.14 : 0.22) * trailMul;
        if (this.trailAcc > trailInterval && thr > 0.48) {
            this.trailAcc = 0;
            this.addContrail(
                this._tmp.set(0.48, -0.18, 4.8).applyMatrix4(this.player.mesh.matrixWorld)
            );
            this.addContrail(
                this._tmp2.set(-0.48, -0.18, 4.8).applyMatrix4(this.player.mesh.matrixWorld)
            );
        }

        const spdRatio = this.player.airspeedNorm;
        this.hud.setSpeedFx(spdRatio, this.player.boosting);

        // 穿雲：複用已採樣密度
        const cloudDens = this._cloudDensCache ?? 0;
        this.hud.setCloudFx(cloudDens);
        if (cloudDens > 0.25) {
            const shakeAmt = (this.config.environment?.cloud_shake ?? 0.055) * cloudDens;
            this.cameraRig.addShake(shakeAmt);
        }

        this._updateGpws(dt);
        this.hud.setTelemetry(
            this.player.airspeed,
            this.player.position.y,
            spdRatio > 0.7 || thr > 0.85 || this.player.boosting,
            this.radarAlt
        );

        this.cameraRig.update(dt, this.player.root, {
            airspeedNorm: spdRatio,
            throttle: thr,
            boosting: this.player.boosting,
            rollAmt: this.player.getRollAmount(),
            pitchRate: this.player.pitchRate,
            rollRate: this.player.rollRate,
            gLoad: this.player.telemetry.gApprox,
            altitude: this.player.position.y,
            cloudDensity: cloudDens,
            time,
        });

        // 盤旋：相機高速轉向時加粗雲 billboard／遠距編隊更新
        if (flying) {
            const orbitRate = Math.abs(this.player.yawRate) + Math.abs(this.player.rollRate);
            const orbitTh = perf.flight_orbit_yaw_threshold ?? 0.55;
            const boost = orbitRate >= orbitTh
                ? Math.max(1, perf.flight_orbit_cloud_stride_boost ?? 2)
                : 1;
            this.sceneBuilder.orbitStrideBoost = boost;
        }

        this._perfAcc.lock += dt;
        const lockPeriod = flying
            ? 1 / Math.max(1, perf.flight_lock_hz ?? 18)
            : 0;
        if (!flying || lockPeriod <= 0 || this._perfAcc.lock >= lockPeriod) {
            const lockDt = this._perfAcc.lock > 0 ? this._perfAcc.lock : dt;
            this._perfAcc.lock = 0;
            this.lockSnap = this.lockOn.update(lockDt, this._collectLockTargets(), this.player.position);
        }
        this.hud.setLock(this.lockSnap);

        this._missileSmokeInterval = perf.flight_missile_smoke_interval ?? 0.14;
        this._updateGroundDefense(dt);
        this._updateBullets(dt);
        this._updateMissiles(dt);
        this.explosionPool.update(dt, this.camera.position, this.player.position);

        this._perfAcc.spatial += dt;
        const spatialPeriod = 1 / Math.max(1, perf.spatial_audio_hz ?? 20);
        if (this._perfAcc.spatial >= spatialPeriod) {
            this._perfAcc.spatial = 0;
            this.audio.updateSpatial(spatialPeriod, {
                camera: this.camera,
                missiles: this.missilePool.active,
                enemies: this.waves.enemies,
            });
        }

        // Boss 入場／更新
        if (this.bossPendingSpawn) {
            this.bossWarningT -= dt;
            if (this.bossWarningT <= 0) {
                this.bossPendingSpawn = false;
                this.hud.hideBossWarning();
                this._spawnBoss();
            }
        }
        if (this.boss?.alive) {
            this.boss.update({
                dt,
                player: this.player,
                bulletPool: this.bulletPool,
                missilePool: this.missilePool,
                missileCfg: this.config.weapons.missile,
            });
        }

        const aiFarDist = perf.ai_far_distance ?? 420;
        const aiSkip = Math.max(
            0,
            flying
                ? (perf.flight_ai_far_skip_frames ?? perf.ai_far_skip_frames ?? 2)
                : (perf.ai_far_skip_frames ?? 1)
        );
        const aiCtx = {
            dt,
            player: this.player,
            lockSnap: this.lockSnap,
            missiles: this.missilePool.active,
            bulletPool: this.bulletPool,
            explosionPool: this.explosionPool,
        };
        const frame = this._perfAcc.frame;
        for (const enemy of this.waves.enemies) {
            const distSq = this.player.position.distanceToSquared(enemy.position);
            const far = distSq > aiFarDist * aiFarDist;
            if (far && aiSkip > 0 && (frame + (enemy.mesh?.id ?? 0)) % (aiSkip + 1) !== 0) {
                // 遠距敵機隔幀略過完整 AI，沿上一幀速度滑行
                const vel = enemy.ai?.velocity;
                if (vel) enemy.mesh.position.addScaledVector(vel, dt);
            } else {
                enemy.update(aiCtx);
            }
            if (this.player.position.distanceTo(enemy.position) < this.config.player.collision_radius) {
                if (this.runMods.collisionImmune) continue;
                const ram = enemy.tryRamDamage?.(dt) ?? 0;
                if (ram > 0) {
                    this.player.takeDamage(ram);
                    if (enemy.classType === 'drone') {
                        this.spawnExplosion(enemy.position.clone(), 0.7);
                    }
                } else if (enemy.collisionDamage > 0) {
                    this.player.takeDamage(enemy.collisionDamage * dt);
                } else {
                    this.player.takeDamage(this.config.player.collision_dps * dt);
                }
            }
        }

        if (this.player.hp < this.lastHp - 1) {
            this.hud.flashDamage();
            this.audio.hit();
            this.cameraRig.addShake(0.45);
            this.postFx.pulseChromatic(0.75);
            this.radio?.trigger('damage');
        }
        this.lastHp = this.player.hp;

        this.waves.update(dt, this.player);
        this._updatePickups(dt, time);
        this.route.update(dt);
        this._updateRoute();

        if (perf.ambient_boom_enabled === true) {
            this.ambientBoomT -= dt;
            if (this.ambientBoomT <= 0) {
                this.ambientBoomT = 10 + Math.random() * 14;
                this.spawnExplosion(
                    this._tmp.copy(this.player.position).add(
                        this._tmp2.set(
                            (Math.random() - 0.5) * 600,
                            40 + Math.random() * 80,
                            -200 - Math.random() * 400
                        )
                    ),
                    0.55 + Math.random() * 0.4
                );
            }
        }

        this._updateCombatBuff(dt);

        this._perfAcc.hudBars += dt;
        const barsPeriod = 1 / Math.max(1, perf.hud_bars_hz ?? 15);
        if (this._perfAcc.hudBars >= barsPeriod) {
            this._perfAcc.hudBars = 0;
            const metaShieldCap = Math.max(
                1,
                (this.config.meta?.upgrades?.shield?.shield_per_level ?? 18)
                    * (this.config.meta?.upgrades?.shield?.max_level ?? 5)
            );
            const shieldPct = (this.player.shield / metaShieldCap) * 100;
            this.hud.setBars(
                (this.player.hp / this.player.maxHp) * 100,
                shieldPct,
                { combatBuff: this.combatBuffT > 0 }
            );
        }

        if (this.player.hp <= 0) {
            this.spawnExplosion(this.player.position.clone(), 2.2);
            this.player.mesh.visible = false;
            this.endGame(Outcome.SHOT_DOWN);
            return;
        }

        this._perfAcc.radar += dt;
        const radarPeriod = 1 / Math.max(1, perf.radar_hz ?? 8);
        if (this._perfAcc.radar >= radarPeriod) {
            this._perfAcc.radar = 0;
            const radarContacts = this._radarContacts;
            radarContacts.length = 0;
            for (const e of this.waves.enemies) radarContacts.push(e);
            if (this.boss?.alive) radarContacts.push(this.boss);
            this.radar.update(radarPeriod, this.player.root, radarContacts, this.route.waypoints, this.items);
        }
        this.updateCompass();

        this._perfAcc.worldHud += dt;
        const whPeriod = 1 / Math.max(1, perf.world_hud_hz ?? 20);
        if (this._perfAcc.worldHud >= whPeriod) {
            this._perfAcc.worldHud = 0;
            const bossHud = this.boss?.alive ? this.boss.getHudTargets() : [];
            this.worldHud.update(
                this.waves.enemies,
                this.route.waypoints,
                this.player.position,
                this.lockSnap,
                bossHud
            );
        }

        this._render();
    }

    /**
     * DoF 對焦玩家＋熱氣來源投影（噴口／飛彈尾）。
     * 在相機更新之後、composer.render 之前呼叫。
     * @param {number} [time=0]
     */
    _updatePostFxOptics(time = 0) {
        if (!this.postFx) return;

        const flying = this.state === GameState.PLAYING;
        const focusDist = this.camera.position.distanceTo(this.player.position);
        const closeness = Math.max(0, Math.min(1, (12 - focusDist) / 8));
        const boosting = flying && !!this.player?.boosting;
        // 對焦鎖玩家機距離；加力時 boostClarity→1 關閉／大幅減弱 DoF
        this.postFx.setFocusDistance(
            focusDist,
            flying ? closeness : Math.min(0.25, closeness),
            { boostClarity: boosting ? 1 : 0 }
        );
        if (this.postFx.heatPass && boosting) {
            // 加力時略降熱氣折射，避免噴口扭曲蓋過機體輪廓
            const base = this.postFx.flags?.heatIntensity ?? 1;
            this.postFx.heatPass.uniforms.uScale.value = base * 0.55;
        } else if (this.postFx.heatPass && this.postFx.flags?.heat) {
            this.postFx.heatPass.uniforms.uScale.value = this.postFx.flags.heatIntensity;
        }

        if (!this.postFx.flags?.heat) {
            return;
        }

        clearHeatSlots(this._heatSlots);
        let n = 0;
        if (this.player?.mesh) {
            n = projectHeatSources(
                this.player.mesh,
                this.camera,
                this._heatSlots,
                this.config.visual?.heat_haze_intensity ?? 1
            );
        }
        const missiles = this.missilePool?.active;
        if (missiles) {
            for (let i = 0; i < missiles.length && n < this._heatSlots.length; i++) {
                const m = missiles[i];
                const anchor = m.userData?.heatAnchor;
                if (!anchor || !m.userData?.alive) continue;
                anchor.userData._heatIntensity = 0.85 + Math.sin(time * 18 + i) * 0.08;
                // slice 分享同一組 Vector4，寫入 [0] 即 heatSlots[n]
                n += projectHeatSources(m, this.camera, this._heatSlots.slice(n), 1);
            }
        }
        this.postFx.setHeatSlots(this._heatSlots);
    }

    _render() {
        this._updatePostFxOptics(this.elapsed ?? 0);
        this.water.renderReflection(this.renderer, this.camera);
        this.postFx.render();
    }

    run() {
        this.hud.applyState(this.state);
        this.loop.start();
    }

    /**
     * 釋放 WebGL／迴圈（HMR 或重新 boot 前呼叫），避免 context 累積。
     */
    dispose() {
        try {
            this.loop?.stop?.();
        } catch {
            // ignore
        }
        try {
            this.water?.dispose?.();
        } catch {
            // ignore
        }
        try {
            this.postFx?.composer?.dispose?.();
            if (this.postFx) this.postFx.composer = null;
        } catch {
            // ignore
        }
        try {
            const canvas = this.renderer?.domElement;
            this.renderer?.dispose?.();
            const gl = this.renderer?.getContext?.();
            gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
            canvas?.remove?.();
        } catch {
            // ignore
        }
        this.renderer = null;
        try {
            disposeContainerCanvases(this.container);
        } catch {
            // ignore
        }
    }
}
