/**
 * 遊戲設定：預設值（前端唯一真相的 fallback）與後端 config/game.php 合併。
 * 各模組只讀這份合併結果，不自行硬編碼平衡數值。
 */

export const DEFAULTS = Object.freeze({
    mission: {
        time_limit: 300,
        waypoint_count: 10,
        /** 通過半徑（相對舊值 24 放大 3 倍） */
        waypoint_radius: 72,
        waypoint_spacing: 320,
        waypoint_spread: 480,
        /** 第一航點相對起飛點的最小前方距離（世界 Z 約 -800） */
        waypoint_first_z: -800,
        /** 相鄰航點水平轉向角上限（度） */
        waypoint_max_turn_deg: 30,
        /** 航點離地安全高度範圍 [min, max] */
        waypoint_clearance_min: 38,
        waypoint_clearance_max: 78,
        /** 引導光環相對主環的半徑倍率 */
        waypoint_guide_ring_scale: 2.4,
    },
    player: {
        max_hp: 100,
        start_missiles: 6,
        max_missiles: 12,
        start_altitude: 145,
        start_speed: 48,
        collision_radius: 11,
        collision_dps: 22,
        hit_radius: 5.2,
    },
    pickups: {
        /** 補給箱回復 HP */
        hp_refill: 35,
        missile_refill: 3,
        /** 舊武器箱永久傷害倍率（仍保留） */
        weapon_power: 3,
        /** elite 掉落補給箱（回血＋限時火力）機率；其餘為武器箱 */
        supply_drop_chance: 0.55,
        /** 限時火力 Buff：持續秒數、射速倍率、傷害倍率 */
        combat_buff_duration: 8,
        combat_buff_fire_rate_mul: 1.55,
        combat_buff_damage_mul: 2.0,
    },
    flight: {
        stall_speed: 22,
        cruise_speed: 80,
        max_speed: 165,
        min_speed: 8,
        thrust: 78,
        boost_thrust: 140,
        boost_duration: 1.8,
        boost_cooldown: 8,
        boost_speed_kick: 22,
        drag_coefficient: 0.0026,
        gravity: 28,
        lift_coefficient: 3.4,
        aoa_lift_gain: 0.85,
        velocity_align: 3.2,
    },
    weapons: {
        gun: {
            fire_interval: 0.085,
            damage: 1,
            overheat_seconds: 3,
            cooldown_seconds: 2.4,
            idle_cool_rate: 0.42,
            projectile_speed: 420,
            projectile_life: 2,
            hit_radius: 5.5,
        },
        missile: {
            lock_seconds: 1.5,
            lock_radius_ndc: 0.28,
            lock_grace_seconds: 0.75,
            lock_max_range: 520,
            initial_speed: 55,
            acceleration: 95,
            max_speed: 210,
            max_turn_rate: 1.55,
            guided_life: 4.5,
            dumb_life: 3.2,
            cooldown: 2.5,
            blast_radius: 7,
            damage: 1,
        },
    },
    enemy: {
        hp: 3,
        elite_hp: 8,
        speed: 62,
        attack_range: 260,
        disengage_range: 420,
        gun_range: 175,
        gun_interval: 0.11,
        gun_damage: 5,
        gun_projectile_speed: 160,
        gun_projectile_life: 1.6,
        flare_cooldown: 5,
        flare_break_chance: 0.58,
        elite_drop_chance: 0.85,
        evade_seconds: 2.6,
        hit_radius: 5.5,
        min_altitude: 18,
        max_altitude: 160,
    },
    enemies: {
        classes: {
            interceptor: {
                hp: 1,
                speed_mul: 1.55,
                scale: 0.72,
                attack_range: 300,
                gun_interval: 0.09,
                gun_damage: 4,
                gun_range: 160,
                collision_damage: 10,
                score_mul: 1.25,
                weight: 0.34,
                elite_hp: 2,
            },
            bomber: {
                hp: 3,
                speed_mul: 0.52,
                scale: 1.45,
                attack_range: 320,
                gun_interval: 0.22,
                gun_damage: 6,
                gun_range: 140,
                turret_interval: 0.38,
                turret_damage: 3.5,
                turret_range: 240,
                turret_projectile_speed: 150,
                collision_damage: 14,
                score_mul: 1.85,
                weight: 0.24,
                elite_hp: 5,
            },
            drone: {
                hp: 1,
                speed_mul: 1.4,
                scale: 0.42,
                attack_range: 500,
                no_weapons: true,
                swarm_extra: 2,
                ram_damage: 32,
                ram_cooldown: 1.2,
                collision_damage: 0,
                score_mul: 0.55,
                weight: 0.42,
                elite_hp: 2,
            },
        },
        mix: {
            wave_bias: {
                interceptor: 0.018,
                bomber: 0.012,
                drone: 0.022,
            },
        },
    },
    boss: {
        kills_to_trigger: 30,
        scale: 20,
        spawn_distance: 780,
        cruise_speed: 26,
        min_altitude: 70,
        max_altitude: 150,
        engine_hp: 2,
        turret_hp: 2,
        bridge_hp: 4,
        engine_hit_radius: 28,
        turret_hit_radius: 22,
        bridge_hit_radius: 32,
        hull_hit_radius: 110,
        shield_damage_mul: 0,
        part_score: 180,
        defeat_score: 5000,
        end_on_defeat: true,
        warning_seconds: 3.8,
        turret_gun_interval: 0.42,
        turret_gun_damage: 4,
        turret_gun_range: 360,
        turret_projectile_speed: 170,
        turret_missile_interval: 7.5,
        turret_missile_damage: 18,
        pause_waves: true,
    },
    waves: {
        min_size: 2,
        max_size: 6,
        spawn_distance: 520,
        elite_from_wave: 2,
        size_growth_per_wave: 0.5,
        cooldown_after_spawn: 4,
        cooldown_after_clear: 2.2,
    },
    environment: {
        sea_spray_altitude: 15,
        crash_altitude: 2,
        island_count: 4,
        cloud_count: 28,
        cloud_quality: 1,
        mountain_count: 8,
        buoy_count: 6,
        fog_density: 0.00068,
        fog_height: 220,
        sky_turbidity: 14.0,
        sky_rayleigh: 0.72,
        sky_mie_coefficient: 0.0032,
        sky_mie_directional_g: 0.48,
        sky_elevation: 8.0,
        sky_azimuth: 185,
        sky_scale: 4500,
        sky_sun_disc: 0.06,
        lensflare_enabled: false,
        lensflare_scale: 0.25,
        sun_intensity: 0.38,
        ambient_intensity: 0.28,
        hemisphere_intensity: 0.42,
        fill_intensity: 0.26,
        rim_intensity: 0.18,
        water_level: 0,
        water_size: 10000,
        water_segments: 32,
        water_reflection_size: 256,
        water_distortion: 3.7,
        water_normal_scale: 4,
        water_wave_speed: 1,
        water_flow_speed: 0.035,
        water_wind_deg: 35,
        water_color: 0x001418,
        water_sun_color: 0x8a6a48,
        water_alpha: 1,
        cloud_shake: 0.055,
    },
    terrain: {
        size: 3200,
        segments: 128,
        max_height: 190,
        min_height: 2,
        seed: 4242,
        collision_clearance: 3.2,
        collision_damage: 100,
        los_samples: 24,
        los_clearance: 6,
    },
    ground_defense: {
        sam_count: 8,
        aaa_count: 12,
        sam: {
            lock_range: 380,
            lock_seconds: 2.2,
            fire_interval: 4.5,
            missile_speed: 95,
            missile_accel: 70,
            missile_max_speed: 175,
            missile_turn: 1.25,
            missile_life: 5.5,
            damage: 28,
        },
        aaa: {
            range: 220,
            trigger_altitude: 55,
            burst_interval: 0.85,
            burst_count: 5,
            projectile_speed: 280,
            projectile_life: 1.4,
            damage: 4,
        },
    },
    gpws: {
        altitude_threshold: 50,
        dive_speed: 18,
        alert_interval: 0.55,
    },
    audio: {
        master_volume: 0.62,
        sfx_volume: 1.45,
        voice_volume: 1.4,
        engine_volume: 0.36,
        wind_volume: 0.3,
        music_volume: 0.5,
        doppler_factor: 0.85,
        max_distance: 480,
        ref_distance: 28,
        rolloff: 1.15,
        max_positional: 18,
        positional_cull_distance: 520,
        engine_throttle_exp: 1.55,
        engine_speed_exp: 1.35,
        engine_pitch_min: 0.72,
        engine_pitch_max: 1.55,
        wind_pitch_min: 0.7,
        wind_pitch_max: 1.85,
        afterburner_volume: 0.44,
        threat_beep_min_interval: 0.55,
        threat_beep_max_interval: 0.09,
        pull_up_voice_cooldown: 2.4,
        fox_two_cooldown: 0.35,
        gun_volume: 0.82,
        missile_volume: 0.92,
        missile_whoosh_volume: 0.55,
        boom_volume: 1.05,
        hit_volume: 0.78,
        lock_tick_volume: 0.45,
        lock_tone_volume: 0.72,
        lock_acquired_volume: 0.58,
        fox_two_volume: 1.1,
        radar_beep_volume: 0.58,
        radar_solid_volume: 0.7,
        sfx_compress: true,
        sfx_makeup_gain: 1.28,
    },
    visual: {
        tone_mapping_exposure: 0.85,
        env_intensity: 0.45,
        bloom_enabled: true,
        bloom_strength: 0.22,
        bloom_radius: 0.38,
        bloom_threshold: 0.94,
        // ShaderPass grade 在部分 WebGL（UnsignedByte composer）會整屏黑；預設關閉
        grade_enabled: false,
        grade_exposure: 0.95,
        film_enabled: false,
        film_intensity: 0.12,
        ca_max: 1.0,
        boost_blur: 1.0,
        motion_blur: 0.55,
        radial_blur: 0.75,
        // 預設 LDR composer（僅 RenderPass）；force_hdr 才開 bloom／OutputPass
        force_hdr: false,
        composer_enabled: true,
        contrail_capacity: 64,
        contrail_g_threshold: 2.2,
        contrail_interval: 0.045,
    },
    pools: {
        bullets: 220,
        missiles: 42,
        explosions: 96,
        max_trail_particles: 90,
    },
    scoring: {
        waypoint: 200,
        enemy_gun_kill: 100,
        enemy_missile_kill: 150,
        elite_bonus: 250,
        pickup: 25,
        boss_part: 180,
        boss_defeat: 5000,
    },
    hud: {
        radar_range: 450,
        base_fov: 55,
        max_fov: 78,
        crosshair_center_y: 0.42,
    },
    perks: {
        choices: 3,
        skip_on_boss: true,
        pool: {
            spread_gun: {
                name: 'Spread Gun',
                name_zh: '散彈機砲',
                desc: '機砲一次發射 3 發扇形彈幕',
                spread_count: 3,
                spread_angle: 0.12,
            },
            missile_plus: {
                name: 'Hardpoint +2',
                name_zh: '飛彈掛架 +2',
                desc: '最大飛彈與當前彈藥各 +2',
                missiles: 2,
            },
            lifesteal: {
                name: 'Vampire Coat',
                name_zh: '吸血塗層',
                desc: '擊殺敵機回復 HP',
                heal: 8,
            },
            radar_boost: {
                name: 'Wideband Radar',
                name_zh: '雷達範圍擴張',
                desc: '雷達偵測距離大幅提升',
                range_mul: 1.55,
            },
            high_g_armor: {
                name: 'High-G Armor',
                name_zh: '高 G 迴轉裝甲',
                desc: '免疫與敵機機體／沖撞碰撞傷害（砲彈與飛彈仍有效）',
                collision_immune: true,
            },
            rapid_cannon: {
                name: 'Rapid Cannon',
                name_zh: '連射機砲',
                desc: '機砲射速提升',
                fire_interval_mul: 0.65,
            },
            afterburner: {
                name: 'Extended Afterburner',
                name_zh: '加力延時',
                desc: '加力持續時間延長',
                boost_duration_mul: 1.6,
            },
            hull_patch: {
                name: 'Combat Patch',
                name_zh: '戰傷修補',
                desc: '最大 HP +20 並立刻回滿差額',
                max_hp_bonus: 20,
            },
            seeker_head: {
                name: 'Seeker Head',
                name_zh: '追蹤導引頭',
                desc: '飛彈鎖定更快、轉彎更銳',
                lock_seconds_mul: 0.7,
                missile_turn_mul: 1.35,
            },
        },
    },
    meta: {
        storage_key: 'skyfighter.meta.v1',
        storage_version: 1,
        scrap: {
            drop_chance: 0.72,
            amount_min: 2,
            amount_max: 6,
            elite_bonus: 4,
            magnet_range: 55,
            collect_radius: 14,
            magnet_speed: 95,
        },
        upgrades: {
            engine: {
                name: 'Engine Thrust',
                name_zh: '基礎引擎推力',
                max_level: 5,
                cost_base: 40,
                cost_growth: 1.55,
                thrust_per_level: 0.08,
            },
            armor: {
                name: 'Hull Armor',
                name_zh: '機體裝甲',
                max_level: 5,
                cost_base: 45,
                cost_growth: 1.55,
                hp_per_level: 12,
            },
            missile_cd: {
                name: 'Missile Coolant',
                name_zh: '飛彈冷卻縮短',
                max_level: 5,
                cost_base: 50,
                cost_growth: 1.6,
                cooldown_mul_per_level: 0.08,
            },
            shield: {
                name: 'Startup Shield',
                name_zh: '開局護盾',
                max_level: 3,
                cost_base: 70,
                cost_growth: 1.7,
                shield_per_level: 18,
            },
        },
    },
    achievements: {
        pacifist: {
            name: 'Pacifist',
            name_zh: '和平主義',
            desc: '3 分鐘內不開火存活',
            seconds: 180,
            reward_scrap: 120,
        },
        ace: {
            name: 'ACE',
            name_zh: '王牌',
            desc: '一局擊落 50 架',
            kills: 50,
            reward_scrap: 150,
        },
        close_call: {
            name: 'Close Call',
            name_zh: '死裡逃生',
            desc: 'HP < 5 狀態下通關一波',
            hp_threshold: 5,
            reward_scrap: 100,
        },
        scrap_hoarder: {
            name: 'Scavenger',
            name_zh: '拾荒者',
            desc: '累積拾取 200 零件',
            scrap_total: 200,
            reward_scrap: 80,
        },
        wave_rider: {
            name: 'Wave Rider',
            name_zh: '破浪者',
            desc: '單局通關第 8 波',
            wave: 8,
            reward_scrap: 110,
        },
        fortress_breaker: {
            name: 'Fortress Breaker',
            name_zh: '要塞剋星',
            desc: '擊毀 Flying Fortress',
            reward_scrap: 200,
        },
    },
});

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 深層合併：後端值覆寫預設值，型別不同時以覆寫值為準。 */
export function mergeConfig(base, override) {
    if (!isPlainObject(override)) return base;
    const out = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (value === null || value === undefined) continue;
        out[key] = isPlainObject(base[key]) ? mergeConfig(base[key], value) : value;
    }
    return out;
}

/**
 * 從 DOM 讀取後端注入的 JSON 設定；缺少或解析失敗時退回預設值。
 * @param {string} elementId
 */
export function loadConfig(elementId = 'game-config') {
    let injected = null;
    const el = document.getElementById(elementId);
    if (el?.textContent) {
        try {
            injected = JSON.parse(el.textContent);
        } catch {
            injected = null;
        }
    }

    return mergeConfig(DEFAULTS, injected);
}

/** 讀取任意注入的 JSON 區塊（排行榜等）。 */
export function readJsonScript(elementId, fallback = null) {
    const el = document.getElementById(elementId);
    if (!el?.textContent) return fallback;
    try {
        return JSON.parse(el.textContent);
    } catch {
        return fallback;
    }
}
