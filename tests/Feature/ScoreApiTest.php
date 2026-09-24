<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Score;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScoreApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'pilot_name' => 'MAVERICK',
            'score' => 4200,
            'kills' => 12,
            'waypoints_cleared' => 6,
            'wave_reached' => 3,
            'duration_seconds' => 184,
            'outcome' => 'mission_complete',
        ], $overrides);
    }

    public function test_it_stores_a_score_and_returns_rank(): void
    {
        Score::factory()->create(['score' => 9000]);

        $response = $this->postJson('/api/scores', $this->validPayload());

        $response->assertCreated()
            ->assertJsonPath('data.pilot_name', 'MAVERICK')
            ->assertJsonPath('data.score', 4200)
            ->assertJsonPath('rank', 2);

        $this->assertDatabaseHas('scores', [
            'pilot_name' => 'MAVERICK',
            'score' => 4200,
            'outcome' => 'mission_complete',
        ]);
    }

    public function test_it_accepts_terrain_crash_outcome(): void
    {
        $this->postJson('/api/scores', $this->validPayload(['outcome' => 'terrain_crash']))
            ->assertCreated()
            ->assertJsonPath('data.outcome', 'terrain_crash');
    }

    public function test_it_accepts_boss_defeated_outcome(): void
    {
        $this->postJson('/api/scores', $this->validPayload(['outcome' => 'boss_defeated']))
            ->assertCreated()
            ->assertJsonPath('data.outcome', 'boss_defeated');
    }

    public function test_it_rejects_fuel_empty_outcome(): void
    {
        $this->postJson('/api/scores', $this->validPayload(['outcome' => 'fuel_empty']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('outcome');
    }

    public function test_it_rejects_an_unknown_outcome(): void
    {
        $this->postJson('/api/scores', $this->validPayload(['outcome' => 'abducted']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('outcome');
    }

    public function test_it_rejects_a_negative_score(): void
    {
        $this->postJson('/api/scores', $this->validPayload(['score' => -1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('score');
    }

    public function test_it_falls_back_to_a_default_pilot_name(): void
    {
        $this->postJson('/api/scores', $this->validPayload(['pilot_name' => '   ']))
            ->assertCreated()
            ->assertJsonPath('data.pilot_name', 'PILOT');
    }

    public function test_leaderboard_is_ordered_by_score_desc(): void
    {
        Score::factory()->create(['pilot_name' => 'LOW', 'score' => 100]);
        Score::factory()->create(['pilot_name' => 'HIGH', 'score' => 9000]);
        Score::factory()->create(['pilot_name' => 'MID', 'score' => 5000]);

        $response = $this->getJson('/api/scores?limit=3');

        $response->assertOk()
            ->assertJsonPath('data.0.pilot_name', 'HIGH')
            ->assertJsonPath('data.1.pilot_name', 'MID')
            ->assertJsonPath('data.2.pilot_name', 'LOW');
    }

    public function test_leaderboard_limit_is_clamped(): void
    {
        Score::factory()->count(5)->create();

        $this->getJson('/api/scores?limit=99999')
            ->assertOk()
            ->assertJsonCount(5, 'data');
    }
}
