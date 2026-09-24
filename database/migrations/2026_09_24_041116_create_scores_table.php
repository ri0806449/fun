<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scores', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('pilot_name', 32);
            $table->unsignedInteger('score')->default(0);
            $table->unsignedSmallInteger('kills')->default(0);
            $table->unsignedSmallInteger('waypoints_cleared')->default(0);
            $table->unsignedSmallInteger('wave_reached')->default(1);
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->string('outcome', 24);
            $table->timestamps();

            $table->index(['score', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scores');
    }
};
