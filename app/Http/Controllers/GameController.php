<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\LeaderboardService;
use Illuminate\Contracts\View\View;

class GameController extends Controller
{
    public function __invoke(LeaderboardService $leaderboard): View
    {
        return view('game.play', [
            'leaderboard' => $leaderboard->top(10),
            'config' => config('game'),
        ]);
    }
}
