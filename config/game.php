<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Sky Fighter 遊戲平衡設定
|--------------------------------------------------------------------------
|
| 這份設定會序列化後注入前端（見 resources/views/game/play.blade.php），
| 前端 resources/js/game/config.js 會與此合併。調整數值不需改動 JS。
|
*/

return [
    'mission' => [
        'time_limit' => (int) env('GAME_TIME_LIMIT', 300),
        'waypoint_count' => (int) env('GAME_WAYPOINT_COUNT', 10),
        'waypoint_radius' => 72.0,
        'waypoint_spacing' => 320.0,
        'waypoint_spread' => 480.0,
        'waypoint_first_z' => -800.0,
        'waypoint_max_turn_deg' => 30.0,
        'waypoint_clearance_min' => 38.0,
        'waypoint_clearance_max' => 78.0,
        'waypoint_guide_ring_scale' => 2.4,
    ],

    'player' => [
        'max_hp' => 100.0,
        'start_missiles' => 6,
        'max_missiles' => 12,
        'start_altitude' => 145.0,
    ],

    'flight' => [
        'stall_speed' => 22.0,
        'cruise_speed' => 80.0,
        'max_speed' => 165.0,
        'thrust' => 78.0,
        'boost_thrust' => 140.0,
        'boost_duration' => 3.0,
        'boost_cooldown' => 8.0,
        'drag_coefficient' => 0.0026,
        'gravity' => 28.0,
        'lift_coefficient' => 3.4,
    ],

    'weapons' => [
        'gun' => [
            'fire_interval' => 0.085,
            'damage' => 1.0,
            'overheat_seconds' => 3.0,
            'cooldown_seconds' => 2.4,
            'projectile_speed' => 420.0,
            'projectile_life' => 2.0,
        ],
        'missile' => [
            'lock_seconds' => 1.5,
            'lock_radius_ndc' => 0.28,
            'lock_grace_seconds' => 0.75,
            'acceleration' => 95.0,
            'max_speed' => 210.0,
            'max_turn_rate' => 1.55,
            'guided_life' => 4.5,
            'dumb_life' => 3.2,
            'cooldown' => 2.5,
            'blast_radius' => 7.0,
            'damage' => 1.0,
        ],
    ],

    'enemy' => [
        'hp' => 3,
        'elite_hp' => 8,
        'speed' => 62.0,
        'attack_range' => 260.0,
        'disengage_range' => 420.0,
        'gun_interval' => 0.11,
        'gun_damage' => 5.0,
        'flare_cooldown' => 5.0,
        'flare_break_chance' => 0.58,
        'elite_drop_chance' => 0.85,
    ],

    /*
    | 敵機類型細分：波次依 weight 混編；wave_bias 隨波次疊加權重。
    | HP 以飛彈傷害為基準（預設 1 發 = 1 HP）。
    */
    'enemies' => [
        'classes' => [
            'interceptor' => [
                'hp' => 1,
                'speed_mul' => 1.55,
                'scale' => 0.72,
                'attack_range' => 300.0,
                'gun_interval' => 0.09,
                'gun_damage' => 4.0,
                'gun_range' => 160.0,
                'collision_damage' => 10.0,
                'score_mul' => 1.25,
                'weight' => 0.34,
                'elite_hp' => 2,
            ],
            'bomber' => [
                'hp' => 3,
                'speed_mul' => 0.52,
                'scale' => 1.45,
                'attack_range' => 320.0,
                'gun_interval' => 0.22,
                'gun_damage' => 6.0,
                'gun_range' => 140.0,
                'turret_interval' => 0.38,
                'turret_damage' => 3.5,
                'turret_range' => 240.0,
                'turret_projectile_speed' => 150.0,
                'collision_damage' => 14.0,
                'score_mul' => 1.85,
                'weight' => 0.24,
                'elite_hp' => 5,
            ],
            'drone' => [
                'hp' => 1,
                'speed_mul' => 1.4,
                'scale' => 0.42,
                'attack_range' => 500.0,
                'no_weapons' => true,
                'swarm_extra' => 2,
                'ram_damage' => 32.0,
                'ram_cooldown' => 1.2,
                'collision_damage' => 0.0,
                'score_mul' => 0.55,
                'weight' => 0.42,
                'elite_hp' => 2,
            ],
        ],
        'mix' => [
            'wave_bias' => [
                'interceptor' => 0.018,
                'bomber' => 0.012,
                'drone' => 0.022,
            ],
        ],
    ],

    'boss' => [
        'kills_to_trigger' => 30,
        'scale' => 20.0,
        'spawn_distance' => 780.0,
        'cruise_speed' => 26.0,
        'min_altitude' => 70.0,
        'max_altitude' => 150.0,
        'engine_hp' => 2,
        'turret_hp' => 2,
        'bridge_hp' => 4,
        'engine_hit_radius' => 28.0,
        'turret_hit_radius' => 22.0,
        'bridge_hit_radius' => 32.0,
        'hull_hit_radius' => 110.0,
        'shield_damage_mul' => 0.0,
        'part_score' => 180,
        'defeat_score' => 5000,
        'end_on_defeat' => true,
        'warning_seconds' => 3.8,
        'turret_gun_interval' => 0.42,
        'turret_gun_damage' => 4.0,
        'turret_gun_range' => 360.0,
        'turret_projectile_speed' => 170.0,
        'turret_missile_interval' => 7.5,
        'turret_missile_damage' => 18.0,
        'pause_waves' => true,
    ],

    'waves' => [
        'min_size' => 2,
        'max_size' => 6,
        'spawn_distance' => 520.0,
        'elite_from_wave' => 2,
        'size_growth_per_wave' => 0.5,
    ],

    'environment' => [
        'sea_spray_altitude' => 15.0,
        'crash_altitude' => 2.0,
        'island_count' => 4,
        'cloud_count' => 28,
        'cloud_quality' => 1, // 0=低 1=中 2=高（雲解析度／塊數倍率）
        'fog_density' => 0.00068,
        'fog_height' => 220.0,
        // Sky.js 大氣（低仰角＋厚霾；太陽盤另以 sky_sun_disc 壓亮度）
        'sky_turbidity' => 14.0,
        'sky_rayleigh' => 0.72,
        // mie 再壓低＋g 下降 → 太陽周圍暈光更柔、更散
        'sky_mie_coefficient' => 0.0032,
        'sky_mie_directional_g' => 0.48,
        'sky_elevation' => 8.0,
        'sky_azimuth' => 185.0,
        'sky_scale' => 4500.0,
        // Sky.js showSunDisc 倍率（0=無太陽盤，1=預設刺眼；再大幅下修）
        'sky_sun_disc' => 0.06,
        'lensflare_enabled' => false,
        'lensflare_scale' => 0.25,
        // 燈光強度（配合低曝光；機體仍靠 ambient／hemi 可辨）
        'sun_intensity' => 0.38,
        'ambient_intensity' => 0.28,
        'hemisphere_intensity' => 0.42,
        'fill_intensity' => 0.26,
        'rim_intensity' => 0.18,
        // Water.js 海面
        'water_level' => 0.0,
        'water_size' => 10000.0,
        'water_segments' => 32,
        'water_reflection_size' => 256,
        'water_distortion' => 3.7,
        'water_normal_scale' => 4.0,
        'water_wave_speed' => 1.0,
        'water_flow_speed' => 0.035,
        'water_wind_deg' => 35.0,
        'water_color' => 0x001418,
        'water_sun_color' => 0x8a6a48,
        'water_alpha' => 1.0,
        // 穿雲
        'cloud_shake' => 0.055,
    ],

    'terrain' => [
        'size' => 3200.0,
        'segments' => 128,
        'max_height' => 190.0,
        'min_height' => 2.0,
        'seed' => 4242,
        'collision_clearance' => 3.2,
        'collision_damage' => 100.0,
        'los_samples' => 24,
        'los_clearance' => 6.0,
    ],

    'ground_defense' => [
        'sam_count' => 8,
        'aaa_count' => 12,
        'sam' => [
            'lock_range' => 380.0,
            'lock_seconds' => 2.2,
            'fire_interval' => 4.5,
            'missile_speed' => 95.0,
            'missile_accel' => 70.0,
            'missile_max_speed' => 175.0,
            'missile_turn' => 1.25,
            'missile_life' => 5.5,
            'damage' => 28.0,
        ],
        'aaa' => [
            'range' => 220.0,
            'trigger_altitude' => 55.0,
            'burst_interval' => 0.85,
            'burst_count' => 5,
            'projectile_speed' => 280.0,
            'projectile_life' => 1.4,
            'damage' => 4.0,
        ],
    ],

    'gpws' => [
        'altitude_threshold' => 50.0,
        'dive_speed' => 18.0,
        'alert_interval' => 0.55,
    ],

    /*
    | 音效：真實音檔 + THREE PositionalAudio。
    | 前端 AudioManager 讀取；缺檔時程序化 fallback。
    */
    'audio' => [
        'master_volume' => 0.62,
        'sfx_volume' => 1.45,
        'voice_volume' => 1.4,
        'engine_volume' => 0.36,
        'wind_volume' => 0.3,
        'music_volume' => 0.5,
        'doppler_factor' => 0.85,
        'max_distance' => 480.0,
        'ref_distance' => 28.0,
        'rolloff' => 1.15,
        'max_positional' => 18,
        'positional_cull_distance' => 520.0,
        'engine_throttle_exp' => 1.55,
        'engine_speed_exp' => 1.35,
        'engine_pitch_min' => 0.72,
        'engine_pitch_max' => 1.55,
        'wind_pitch_min' => 0.7,
        'wind_pitch_max' => 1.85,
        'afterburner_volume' => 0.44,
        'threat_beep_min_interval' => 0.55,
        'threat_beep_max_interval' => 0.09,
        'pull_up_voice_cooldown' => 2.4,
        'fox_two_cooldown' => 0.35,
        // 攻擊／鎖定 one-shot 相對倍率（再乘 sfx／voice bus）
        'gun_volume' => 0.82,
        'missile_volume' => 0.92,
        'missile_whoosh_volume' => 0.55,
        'boom_volume' => 1.05,
        'hit_volume' => 0.78,
        'lock_tick_volume' => 0.45,
        'lock_tone_volume' => 0.72,
        'lock_acquired_volume' => 0.58,
        'fox_two_volume' => 1.1,
        'radar_beep_volume' => 0.58,
        'radar_solid_volume' => 0.7,
        // 壓縮器 makeup（防削波、抬攻擊可讀性）
        'sfx_compress' => true,
        'sfx_makeup_gain' => 1.28,
    ],

    'visual' => [
        'tone_mapping_exposure' => 0.85,
        'env_intensity' => 0.45,
        'bloom_enabled' => true,
        'bloom_strength' => 0.22,
        'bloom_radius' => 0.38,
        'bloom_threshold' => 0.94,
        'grade_enabled' => false,
        'grade_exposure' => 0.95,
        'film_enabled' => false,
        'film_intensity' => 0.12,
        'ca_max' => 1.0,
        'boost_blur' => 1.0,
        'motion_blur' => 0.55,
        'radial_blur' => 0.75,
        'force_hdr' => false,
        'composer_enabled' => true,
        'contrail_capacity' => 64,
        'contrail_g_threshold' => 2.2,
        'contrail_interval' => 0.045,
    ],

    'pools' => [
        'bullets' => 220,
        'missiles' => 42,
        'explosions' => 96,
        'max_trail_particles' => 90,
    ],

    'pickups' => [
        'hp_refill' => 35,
        'missile_refill' => 3,
        'weapon_power' => 3,
        'supply_drop_chance' => 0.55,
        'combat_buff_duration' => 8.0,
        'combat_buff_fire_rate_mul' => 1.55,
        'combat_buff_damage_mul' => 2.0,
    ],

    'hud' => [
        'radar_range' => 450,
        'base_fov' => 55,
        'max_fov' => 78,
        'crosshair_center_y' => 0.42,
    ],

    'scoring' => [
        'waypoint' => 200,
        'enemy_gun_kill' => 100,
        'enemy_missile_kill' => 150,
        'elite_bonus' => 250,
        'pickup' => 25,
        'boss_part' => 180,
        'boss_defeat' => 5000,
    ],

    /*
    | 局內 Roguelite 升級（每擊退一波 → LEVEL_UP 三選一；僅當局有效）。
    | Boss 觸發／進行中跳過一般 level-up。
    */
    'perks' => [
        'choices' => 3,
        'skip_on_boss' => true,
        'pool' => [
            'spread_gun' => [
                'name' => 'Spread Gun',
                'name_zh' => '散彈機砲',
                'desc' => '機砲一次發射 3 發扇形彈幕',
                'spread_count' => 3,
                'spread_angle' => 0.12,
            ],
            'missile_plus' => [
                'name' => 'Hardpoint +2',
                'name_zh' => '飛彈掛架 +2',
                'desc' => '最大飛彈與當前彈藥各 +2',
                'missiles' => 2,
            ],
            'lifesteal' => [
                'name' => 'Vampire Coat',
                'name_zh' => '吸血塗層',
                'desc' => '擊殺敵機回復 HP',
                'heal' => 8.0,
            ],
            'radar_boost' => [
                'name' => 'Wideband Radar',
                'name_zh' => '雷達範圍擴張',
                'desc' => '雷達偵測距離大幅提升',
                'range_mul' => 1.55,
            ],
            'high_g_armor' => [
                'name' => 'High-G Armor',
                'name_zh' => '高 G 迴轉裝甲',
                'desc' => '免疫與敵機機體／沖撞碰撞傷害（砲彈與飛彈仍有效）',
                'collision_immune' => true,
            ],
            'rapid_cannon' => [
                'name' => 'Rapid Cannon',
                'name_zh' => '連射機砲',
                'desc' => '機砲射速提升',
                'fire_interval_mul' => 0.65,
            ],
            'afterburner' => [
                'name' => 'Extended Afterburner',
                'name_zh' => '加力延時',
                'desc' => '加力持續時間延長',
                'boost_duration_mul' => 1.6,
            ],
            'hull_patch' => [
                'name' => 'Combat Patch',
                'name_zh' => '戰傷修補',
                'desc' => '最大 HP +20 並立刻回滿差額',
                'max_hp_bonus' => 20.0,
            ],
            'seeker_head' => [
                'name' => 'Seeker Head',
                'name_zh' => '追蹤導引頭',
                'desc' => '飛彈鎖定更快、轉彎更銳',
                'lock_seconds_mul' => 0.7,
                'missile_turn_mul' => 1.35,
            ],
        ],
    ],

    /*
    | 局外機庫永久養成（localStorage；零件 Scrap）。
    */
    'meta' => [
        'storage_key' => 'skyfighter.meta.v1',
        'storage_version' => 1,
        'scrap' => [
            'drop_chance' => 0.72,
            'amount_min' => 2,
            'amount_max' => 6,
            'elite_bonus' => 4,
            'magnet_range' => 55.0,
            'collect_radius' => 14.0,
            'magnet_speed' => 95.0,
        ],
        'upgrades' => [
            'engine' => [
                'name' => 'Engine Thrust',
                'name_zh' => '基礎引擎推力',
                'max_level' => 5,
                'cost_base' => 40,
                'cost_growth' => 1.55,
                'thrust_per_level' => 0.08,
            ],
            'armor' => [
                'name' => 'Hull Armor',
                'name_zh' => '機體裝甲',
                'max_level' => 5,
                'cost_base' => 45,
                'cost_growth' => 1.55,
                'hp_per_level' => 12.0,
            ],
            'missile_cd' => [
                'name' => 'Missile Coolant',
                'name_zh' => '飛彈冷卻縮短',
                'max_level' => 5,
                'cost_base' => 50,
                'cost_growth' => 1.6,
                'cooldown_mul_per_level' => 0.08,
            ],
            'shield' => [
                'name' => 'Startup Shield',
                'name_zh' => '開局護盾',
                'max_level' => 3,
                'cost_base' => 70,
                'cost_growth' => 1.7,
                'shield_per_level' => 18.0,
            ],
        ],
    ],

    /*
    | 成就牆：解鎖後發放零件，狀態存 localStorage。
    */
    'achievements' => [
        'pacifist' => [
            'name' => 'Pacifist',
            'name_zh' => '和平主義',
            'desc' => '3 分鐘內不開火存活',
            'seconds' => 180,
            'reward_scrap' => 120,
        ],
        'ace' => [
            'name' => 'ACE',
            'name_zh' => '王牌',
            'desc' => '一局擊落 50 架',
            'kills' => 50,
            'reward_scrap' => 150,
        ],
        'close_call' => [
            'name' => 'Close Call',
            'name_zh' => '死裡逃生',
            'desc' => 'HP < 5 狀態下通關一波',
            'hp_threshold' => 5.0,
            'reward_scrap' => 100,
        ],
        'scrap_hoarder' => [
            'name' => 'Scavenger',
            'name_zh' => '拾荒者',
            'desc' => '累積拾取 200 零件',
            'scrap_total' => 200,
            'reward_scrap' => 80,
        ],
        'wave_rider' => [
            'name' => 'Wave Rider',
            'name_zh' => '破浪者',
            'desc' => '單局通關第 8 波',
            'wave' => 8,
            'reward_scrap' => 110,
        ],
        'fortress_breaker' => [
            'name' => 'Fortress Breaker',
            'name_zh' => '要塞剋星',
            'desc' => '擊毀 Flying Fortress',
            'reward_scrap' => 200,
        ],
    ],
];
