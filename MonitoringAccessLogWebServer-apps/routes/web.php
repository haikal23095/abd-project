<?php

use App\Http\Controllers\AnomalyPredictionController;
use App\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/dashboard');

Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

Route::post('/anomaly/predict', [AnomalyPredictionController::class, 'predict'])
    ->middleware('throttle:30,1')
    ->name('anomaly.predict');

Route::get('/debug-parse', fn (\App\Services\PythonRunnerService $p) =>
    $p->parseLog(config('services.analytics.log_path'), config('services.analytics.mmdb_path')));
