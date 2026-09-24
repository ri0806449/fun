<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Score;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Score>
 */
class ScoreFactory extends Factory
{
    protected $model = Score::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => null,
            'pilot_name' => strtoupper($this->faker->lexify('????')),
            'score' => $this->faker->numberBetween(0, 50000),
            'kills' => $this->faker->numberBetween(0, 40),
            'waypoints_cleared' => $this->faker->numberBetween(0, 10),
            'wave_reached' => $this->faker->numberBetween(1, 12),
            'duration_seconds' => $this->faker->numberBetween(10, 300),
            'outcome' => $this->faker->randomElement([
                'mission_complete',
                'time_up',
                'shot_down',
                'water_impact',
                'terrain_crash',
                'boss_defeated',
            ]),
        ];
    }

    public function missionComplete(): self
    {
        return $this->state(fn (): array => ['outcome' => 'mission_complete']);
    }
}
