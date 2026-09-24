<?php

declare(strict_types=1);

use App\Http\Controllers\GameController;
use Illuminate\Support\Facades\Route;

Route::get('/', GameController::class)->name('game.play');
