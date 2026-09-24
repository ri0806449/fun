<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreScoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'pilot_name' => ['required', 'string', 'min:1', 'max:32'],
            'score' => ['required', 'integer', 'min:0', 'max:9999999'],
            'kills' => ['required', 'integer', 'min:0', 'max:9999'],
            'waypoints_cleared' => ['required', 'integer', 'min:0', 'max:999'],
            'wave_reached' => ['required', 'integer', 'min:1', 'max:999'],
            'duration_seconds' => ['required', 'integer', 'min:0', 'max:86400'],
            'outcome' => ['required', Rule::in([
                'mission_complete',
                'time_up',
                'shot_down',
                'water_impact',
                'terrain_crash',
                'boss_defeated',
            ])],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'pilot_name' => trim((string) $this->input('pilot_name', 'PILOT')) ?: 'PILOT',
        ]);
    }
}
