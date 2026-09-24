<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Score;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class LeaderboardService
{
    private const CACHE_KEY = 'leaderboard.top';

    /**
     * @return Collection<int, Score>
     */
    public function top(int $limit = 10): Collection
    {
        $limit = max(1, min($limit, 100));

        // 不快取 Eloquent Collection：檔案／序列化 driver 還原時 class 對不上會變成
        // __PHP_Incomplete_Class，觸發 return type 錯誤。排行榜查詢本身很輕。
        return Score::query()->leaderboard()->limit($limit)->get();
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function record(array $attributes): Score
    {
        $score = Score::create($attributes);

        $this->flush();

        return $score;
    }

    /**
     * 名次以「分數較高者在前」計算，回傳 1-based 排名。
     */
    public function rankOf(Score $score): int
    {
        return Score::query()
            ->where('score', '>', $score->score)
            ->count() + 1;
    }

    public function flush(): void
    {
        // 清掉舊版可能留下的排行榜快取 key，避免誤傷其他應用快取
        for ($limit = 1; $limit <= 100; $limit++) {
            Cache::forget(self::CACHE_KEY.":{$limit}");
        }
    }
}
