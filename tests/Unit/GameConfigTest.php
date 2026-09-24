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

        foreach (['mission', 'player', 'flight', 'weapons', 'enemy', 'enemies', 'boss', 'waves', 'environment', 'terrain', 'ground_defense', 'gpws', 'audio', 'visual', 'pools', 'pickups', 'hud', 'scoring', 'perks', 'meta', 'achievements'] as $section) {
            $this->assertArrayHasKey($section, $config, "缺少設定區塊：{$section}");
        }
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
        $this->assertLessThan(5.0, $env['sky_elevation'], '暮色仰角應偏低以降低過曝');
        $this->assertLessThanOrEqual(0.5, $env['sun_intensity'], '太陽光應下修避免過曝');
        $this->assertArrayHasKey('tone_mapping_exposure', $visual);
        $this->assertArrayHasKey('bloom_strength', $visual);
        $this->assertArrayHasKey('bloom_threshold', $visual);
        $this->assertArrayHasKey('grade_exposure', $visual);
        $this->assertArrayHasKey('boost_blur', $visual);
        $this->assertArrayHasKey('motion_blur', $visual);
        $this->assertArrayHasKey('radial_blur', $visual);
        $this->assertLessThanOrEqual(0.55, $visual['tone_mapping_exposure']);
        $this->assertLessThan(0.35, $visual['bloom_strength']);
        $this->assertGreaterThanOrEqual(0.9, $visual['bloom_threshold']);
    }

    public function test_stall_speed_is_below_cruise_speed(): void
    {
        $flight = $this->config()['flight'];

        $this->assertLessThan($flight['cruise_speed'], $flight['stall_speed']);
        $this->assertLessThan($flight['max_speed'], $flight['cruise_speed']);
    }

    public function test_elite_enemies_are_tougher_than_regulars(): void
    {
        $enemy = $this->config()['enemy'];

        $this->assertGreaterThan($enemy['hp'], $enemy['elite_hp']);
    }
}
