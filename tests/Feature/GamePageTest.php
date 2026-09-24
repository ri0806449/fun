<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Score;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GamePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_game_page_renders(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertViewIs('game.play')
            ->assertViewHas('config')
            ->assertViewHas('leaderboard');
    }

    public function test_the_game_page_exposes_balance_config(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('game-config');
    }

    public function test_the_game_page_lists_existing_scores(): void
    {
        Score::factory()->create(['pilot_name' => 'ACEPILOT', 'score' => 12345]);

        $this->get('/')
            ->assertOk()
            ->assertSee('ACEPILOT');
    }
}
