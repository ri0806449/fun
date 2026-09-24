<?php

declare(strict_types=1);

use App\Http\Controllers\Api\ScoreController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', fn (Request $request) => $request->user())
    ->middleware('auth:sanctum');

Route::get('/scores', [ScoreController::class, 'index'])->name('api.scores.index');

Route::post('/scores', [ScoreController::class, 'store'])
    ->middleware('throttle:30,1')
    ->name('api.scores.store');
