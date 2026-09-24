<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Score extends Model
{
    /** @use HasFactory<\Database\Factories\ScoreFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'pilot_name',
        'score',
        'kills',
        'waypoints_cleared',
        'wave_reached',
        'duration_seconds',
        'outcome',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'integer',
            'kills' => 'integer',
            'waypoints_cleared' => 'integer',
            'wave_reached' => 'integer',
            'duration_seconds' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @param  Builder<Score>  $query
     * @return Builder<Score>
     */
    public function scopeLeaderboard(Builder $query): Builder
    {
        return $query->orderByDesc('score')->orderBy('duration_seconds');
    }
}
