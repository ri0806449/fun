<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreScoreRequest;
use App\Http\Resources\ScoreResource;
use App\Services\LeaderboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ScoreController extends Controller
{
    public function __construct(private readonly LeaderboardService $leaderboard) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $limit = (int) $request->integer('limit', 10);

        return ScoreResource::collection($this->leaderboard->top($limit));
    }

    public function store(StoreScoreRequest $request): JsonResponse
    {
        $score = $this->leaderboard->record([
            ...$request->validated(),
            'user_id' => $request->user()?->id,
        ]);

        return ScoreResource::make($score)
            ->additional(['rank' => $this->leaderboard->rankOf($score)])
            ->response()
            ->setStatusCode(201);
    }
}
