<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Score;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Score
 */
class ScoreResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'pilot_name' => $this->pilot_name,
            'score' => $this->score,
            'kills' => $this->kills,
            'waypoints_cleared' => $this->waypoints_cleared,
            'wave_reached' => $this->wave_reached,
            'duration_seconds' => $this->duration_seconds,
            'outcome' => $this->outcome,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
