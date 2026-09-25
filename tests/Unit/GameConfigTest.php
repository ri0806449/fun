<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class GameConfigTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function config(): array
    {
        return require __DIR__.'/../../config/game.php';
    }

    public function test_it_exposes_every_top_level_section(): void
    {
        $config = $this->config();

        foreach (['mission', 'player', 'flight', 'weapons', 'enemy', 'enemies', 'boss', 'waves', 'environment', 'terrain', 'ground_defense', 'gpws', 'audio', 'radio', 'weather', 'stunts', 'visual', 'pools', 'pickups', 'hud', 'scoring', 'perks', 'meta', 'achievements', 'performance'] as $section) {
            $this->assertArrayHasKey($section, $config, "缺少設定區塊：{$section}");
        }
    }

    public function test_flight_performance_knobs_exist(): void
    {
        $perf = $this->config()['performance'];

        foreach ([
            'max_pixel_ratio', 'flight_max_pixel_ratio', 'flight_water_reflection_interval',
            'flight_cloud_update_stride', 'flight_cloud_density_hz', 'flight_fog_hz',
            'flight_engine_audio_hz', 'flight_engine_audio_epsilon', 'flight_los_samples',
            'flight_missile_smoke_interval', 'flight_ai_far_skip_frames', 'flight_max_delta',
            'flight_lock_hz', 'flight_gun_audio_layers', 'flight_explosion_lights',
            'flight_water_uniform_hz', 'flight_contrail_spawn_mul', 'flight_trail_interval_mul',
            'flight_orbit_yaw_threshold', 'flight_orbit_cloud_stride_boost',
            'flight_distant_craft_stride', 'flight_cloud_far_skip_mul',
            'combat_boom_particle_count', 'combat_max_trail_particles',
        ] as $key) {
            $this->assertArrayHasKey($key, $perf, "缺少 performance.{$key}");
        }

        $this->assertFalse($perf['ambient_boom_enabled']);
        $this->assertFalse($perf['flight_explosion_lights']);
        $this->assertSame(0, (int) $perf['flight_water_reflection_interval']);
        // 飛行 DPR 上限不得高於選單／展示上限
        $this->assertLessThanOrEqual(
            (float) $perf['max_pixel_ratio'],
            (float) $perf['flight_max_pixel_ratio']
        );
        $this->assertLessThanOrEqual(1.25, (float) $perf['flight_max_pixel_ratio']);
        $this->assertGreaterThan(0, $perf['flight_cloud_update_stride']);
        $this->assertGreaterThanOrEqual(5, (int) $perf['flight_cloud_update_stride']);
        $this->assertGreaterThan(0, $perf['flight_engine_audio_hz']);
        $this->assertGreaterThan(0, $perf['flight_los_samples']);
        $this->assertLessThan(24, (int) $perf['flight_los_samples']);
        $this->assertLessThanOrEqual(10, (int) $perf['radar_hz']);
        $this->assertLessThanOrEqual(12, (int) $perf['world_hud_hz']);
        $this->assertSame(1, (int) $perf['flight_gun_audio_layers']);
        $this->assertGreaterThan(0, $perf['flight_lock_hz']);
        $this->assertGreaterThan(0, $perf['combat_boom_particle_count']);
    }

    public function test_perks_meta_and_achievements_are_configured(): void
    {
        $config = $this->config();

        $this->assertSame(3, $config['perks']['choices']);
        $this->assertTrue($config['perks']['skip_on_boss']);
        foreach (['spread_gun', 'missile_plus', 'lifesteal', 'radar_boost', 'high_g_armor'] as $id) {
            $this->assertArrayHasKey($id, $config['perks']['pool']);
        }

        $this->assertSame('skyfighter.meta.v1', $config['meta']['storage_key']);
        $this->assertSame(1, $config['meta']['storage_version']);
        foreach (['engine', 'armor', 'missile_cd', 'shield'] as $id) {
            $this->assertArrayHasKey($id, $config['meta']['upgrades']);
            $this->assertGreaterThan(0, $config['meta']['upgrades'][$id]['max_level']);
        }

        foreach (['pacifist', 'ace', 'close_call'] as $id) {
            $this->assertArrayHasKey($id, $config['achievements']);
            $this->assertGreaterThan(0, $config['achievements'][$id]['reward_scrap']);
        }
    }

    public function test_enemy_classes_and_boss_are_configured(): void
    {
        $config = $this->config();
        $classes = $config['enemies']['classes'];

        foreach (['interceptor', 'bomber', 'drone'] as $class) {
            $this->assertArrayHasKey($class, $classes);
            $this->assertGreaterThan(0, $classes[$class]['hp']);
            $this->assertGreaterThan(0, $classes[$class]['weight']);
        }

        $this->assertSame(1, $classes['interceptor']['hp']);
        $this->assertSame(3, $classes['bomber']['hp']);
        $this->assertTrue($classes['drone']['no_weapons']);

        $boss = $config['boss'];
        $this->assertSame(30, $boss['kills_to_trigger']);
        $this->assertGreaterThan(1, $boss['scale']);
        $this->assertTrue($boss['end_on_defeat']);
        $this->assertArrayHasKey('boss_defeated', array_flip([
            'mission_complete', 'time_up', 'shot_down',
            'water_impact', 'terrain_crash', 'boss_defeated',
        ]));
        $this->assertArrayNotHasKey('fuel_empty', array_flip([
            'mission_complete', 'time_up', 'shot_down',
            'water_impact', 'terrain_crash', 'boss_defeated',
        ]));
        $this->assertSame(72.0, (float) $config['mission']['waypoint_radius']);
        $this->assertLessThanOrEqual(30.0, (float) $config['mission']['waypoint_max_turn_deg']);
        $this->assertArrayNotHasKey('max_fuel', $config['player']);
        $this->assertArrayHasKey('hp_refill', $config['pickups']);
        $this->assertArrayHasKey('combat_buff_duration', $config['pickups']);
        $this->assertArrayNotHasKey('fuel_refill', $config['pickups']);
    }

    public function test_terrain_and_ground_defense_have_positive_scales(): void
    {
        $config = $this->config();
        $terrain = $config['terrain'];
        $gd = $config['ground_defense'];

        $this->assertGreaterThan(0, $terrain['size']);
        $this->assertGreaterThan(8, $terrain['segments']);
        $this->assertGreaterThan(0, $terrain['min_height']);
        $this->assertGreaterThan($terrain['min_height'], $terrain['max_height']);
        $this->assertGreaterThan(0, $gd['sam_count']);
        $this->assertGreaterThan(0, $gd['aaa_count']);
        $this->assertGreaterThan(0, $gd['sam']['lock_range']);
        $this->assertGreaterThan(0, $gd['aaa']['trigger_altitude']);
    }

    public function test_gpws_threshold_is_positive(): void
    {
        $gpws = $this->config()['gpws'];

        $this->assertGreaterThan(0, $gpws['altitude_threshold']);
        $this->assertGreaterThan(0, $gpws['dive_speed']);
    }

    public function test_audio_spatial_and_engine_keys_exist(): void
    {
        $audio = $this->config()['audio'];

        foreach ([
            'master_volume', 'sfx_volume', 'voice_volume', 'doppler_factor', 'max_distance', 'ref_distance',
            'max_positional', 'engine_throttle_exp', 'engine_speed_exp',
            'wind_pitch_min', 'wind_pitch_max', 'afterburner_volume',
            'gun_volume', 'missile_volume', 'boom_volume', 'hit_volume',
            'lock_tick_volume', 'fox_two_volume', 'sfx_makeup_gain',
        ] as $key) {
            $this->assertArrayHasKey($key, $audio, "缺少 audio.{$key}");
        }

        $this->assertGreaterThan(0, $audio['master_volume']);
        $this->assertGreaterThan(0, $audio['sfx_volume']);
        $this->assertGreaterThan(0, $audio['gun_volume']);
        $this->assertGreaterThan(0, $audio['max_positional']);
        $this->assertGreaterThan(0, $audio['ref_distance']);
        $this->assertGreaterThan($audio['ref_distance'], $audio['max_distance']);
    }

    public function test_atmosphere_and_water_visual_keys_exist(): void
    {
        $config = $this->config();
        $env = $config['environment'];
        $visual = $config['visual'];

        foreach ([
            'sky_turbidity', 'sky_rayleigh', 'sky_mie_coefficient', 'sky_elevation', 'sky_azimuth',
            'sun_intensity', 'ambient_intensity', 'hemisphere_intensity',
            'water_level', 'water_wave_speed', 'water_wind_deg', 'cloud_quality', 'cloud_shake',
        ] as $key) {
            $this->assertArrayHasKey($key, $env, "缺少 environment.{$key}");
        }

        $this->assertGreaterThan(0, $env['water_wave_speed']);
        $this->assertFalse($env['lensflare_enabled'], '預設關閉 lensflare 避免直視刺眼');
        $this->assertArrayHasKey('lensflare_scale', $env);
        $this->assertLessThanOrEqual(0.3, $env['lensflare_scale'], '若重開 lensflare，scale 應極低');
        $this->assertArrayHasKey('sky_sun_disc', $env);
        $this->assertLessThanOrEqual(0.1, $env['sky_sun_disc'], 'Sky 太陽盤倍率應大幅下修（可直視）');
        $this->assertLessThanOrEqual(0.55, $env['sky_mie_directional_g'], 'mie g 應偏低以柔化太陽暈光');
        $this->assertLessThanOrEqual(12.0, $env['sky_elevation'], '仰角不宜過高以免正午過曝');
        $this->assertGreaterThan(0.0, $env['sky_elevation'], '晴天仰角應為正值以保證天空可辨');
        $this->assertLessThanOrEqual(0.5, $env['sun_intensity'], '太陽光應下修避免過曝');
        $this->assertArrayHasKey('tone_mapping_exposure', $visual);
        $this->assertArrayHasKey('bloom_strength', $visual);
        $this->assertArrayHasKey('bloom_threshold', $visual);
        $this->assertArrayHasKey('grade_exposure', $visual);
        $this->assertArrayHasKey('boost_blur', $visual);
        $this->assertArrayHasKey('motion_blur', $visual);
        $this->assertArrayHasKey('radial_blur', $visual);
        $this->assertGreaterThan(0.4, $visual['tone_mapping_exposure'], '曝光過低會在部分 GPU 上接近全黑');
        $this->assertGreaterThanOrEqual(0.7, $visual['tone_mapping_exposure'], '預設曝光應足以應付黃昏／雨霧疊加');
        $this->assertLessThanOrEqual(1.2, $visual['tone_mapping_exposure']);
        $this->assertLessThan(0.35, $visual['bloom_strength']);
        $this->assertGreaterThanOrEqual(0.9, $visual['bloom_threshold']);
    }

    public function test_hud_camera_spring_and_fov_contract(): void
    {
        $hud = $this->config()['hud'];

        $this->assertSame(60.0, (float) $hud['base_fov']);
        $this->assertSame(80.0, (float) $hud['max_fov']);
        $this->assertArrayHasKey('camera', $hud);

        $cam = $hud['camera'];
        foreach ([
            'boost_fov', 'stiffness', 'damping', 'look_stiffness', 'look_damping',
            'boost_pull_z', 'boost_pull_y', 'look_ahead_roll', 'look_ahead_pitch',
            'fov_approach', 'shake_decay', 'shake_pos_mul', 'shake_rot_mul',
            'turbulence_low_alt_ceil', 'turbulence_low_alt_amp', 'turbulence_speed_amp',
            'turbulence_cloud_amp', 'turbulence_boost_amp', 'turbulence_freq',
            'aileron_max_rad', 'elevator_max_rad', 'surface_lerp', 'nozzle_boost_scale',
            'body_turbulence_amp', 'body_turbulence_low_alt_ceil', 'body_turbulence_freq',
        ] as $key) {
            $this->assertArrayHasKey($key, $cam, "缺少 hud.camera.{$key}");
        }

        $this->assertSame(80.0, (float) $cam['boost_fov']);
        $this->assertGreaterThan(0, $cam['stiffness']);
        $this->assertGreaterThan(0, $cam['damping']);
        $this->assertGreaterThan($cam['look_damping'], $cam['look_stiffness']);
        $this->assertGreaterThan(0, $cam['aileron_max_rad']);
        $this->assertGreaterThan(0, $cam['elevator_max_rad']);
        $this->assertGreaterThan(1.0, (float) $cam['nozzle_boost_scale']);
    }

    public function test_stall_speed_is_below_cruise_speed(): void
    {
        $flight = $this->config()['flight'];

        $this->assertLessThan($flight['cruise_speed'], $flight['stall_speed']);
        $this->assertLessThan($flight['max_speed'], $flight['cruise_speed']);
    }

    public function test_flight_arcade_assist_contract(): void
    {
        $flight = $this->config()['flight'];

        foreach (['max_pitch', 'max_roll', 'max_yaw', 'input_lerp', 'throttle_lerp', 'bank_turn'] as $key) {
            $this->assertArrayHasKey($key, $flight, "缺少 flight.{$key}");
            $this->assertGreaterThan(0, (float) $flight[$key]);
        }

        $this->assertArrayHasKey('assist', $flight);
        $assist = $flight['assist'];
        foreach ([
            'enabled', 'roll_deadzone', 'pitch_deadzone', 'yaw_deadzone',
            'roll_level_rate', 'roll_level_excess_rad', 'roll_level_excess_mul',
            'roll_level_speed_mul', 'roll_snap_rad', 'pitch_level_rate',
            'pitch_level_cap', 'release_lerp_mul',
        ] as $key) {
            $this->assertArrayHasKey($key, $assist, "缺少 flight.assist.{$key}");
        }

        $this->assertTrue($assist['enabled']);
        $this->assertGreaterThan(0, (float) $assist['roll_level_rate']);
        $this->assertGreaterThan(0, (float) $assist['pitch_level_rate']);
        $this->assertLessThan(1, (float) $assist['pitch_level_cap']);
        $this->assertGreaterThan(1, (float) $assist['release_lerp_mul']);
        $this->assertLessThan((float) $flight['max_roll'], (float) $assist['roll_level_excess_rad']);
    }

    public function test_elite_enemies_are_tougher_than_regulars(): void
    {
        $enemy = $this->config()['enemy'];

        $this->assertGreaterThan($enemy['hp'], $enemy['elite_hp']);
    }

    public function test_weather_radio_stunts_keys_exist(): void
    {
        $config = $this->config();

        $this->assertTrue($config['radio']['enabled']);
        $this->assertGreaterThan(0, $config['radio']['cooldown']);

        $weather = $config['weather'];
        foreach (['dusk_at', 'rain_at', 'fog_mul_rain', 'rain_particles'] as $key) {
            $this->assertArrayHasKey($key, $weather, "缺少 weather.{$key}");
        }
        $this->assertLessThan($weather['rain_at'], $weather['dusk_at']); // dusk_at < rain_at
        // 防洗白亦防過暗：雨天 turbidity／霧倍率不可過高
        $this->assertLessThanOrEqual(14.0, (float) $weather['turbidity_rain']);
        $this->assertLessThanOrEqual(2.0, (float) $weather['fog_mul_rain']);
        $this->assertGreaterThanOrEqual(1.0, (float) $weather['fog_mul_rain']);
        $this->assertGreaterThanOrEqual(0.0, (float) $weather['elevation_rain'], '雨天仰角不宜過負以免天空近黑');
        $this->assertGreaterThanOrEqual(2.0, (float) $weather['elevation_dusk']);

        $stunts = $config['stunts'];
        foreach (['low_alt_agl', 'low_alt_hold', 'close_call_distance', 'close_call_score'] as $key) {
            $this->assertArrayHasKey($key, $stunts, "缺少 stunts.{$key}");
        }
        $this->assertSame(20.0, (float) $stunts['low_alt_agl']);
        $this->assertGreaterThan(0, $stunts['close_call_score']);
    }
}
