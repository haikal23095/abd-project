<?php

namespace App\Http\Controllers;

use App\Services\PythonRunnerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class AnomalyPredictionController extends Controller
{
    public function __construct(private PythonRunnerService $python)
    {
    }

    public function predict(Request $request): JsonResponse
    {
        // Sesuaikan fitur dengan train_anomaly_model.py / predict_anomaly.py
        $features = $request->validate([
            'total_requests' => ['required', 'numeric', 'min:0'],
            'unique_ips'     => ['required', 'numeric', 'min:0'],
            'error_rate'     => ['required', 'numeric', 'between:0,100'],
            'bot_ratio'      => ['required', 'numeric', 'between:0,100'],
            'avg_bytes'      => ['required', 'numeric', 'min:0'],
        ]);

        $features = array_map('floatval', $features);

        if (! is_file(app_path('Services/Python/model/anomaly_model.pkl'))) {
            return response()->json([
                'message' => 'Model belum tersedia. Jalankan train_anomaly_model.py terlebih dahulu.',
            ], 503);
        }

        try {
            $result = $this->python->predictAnomaly($features);
        } catch (Throwable $e) {
            Log::error('Anomaly: predict_anomaly.py gagal', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Prediksi gagal diproses.'], 500);
        }

        return response()->json([
            'is_anomaly'    => (bool) ($result['is_anomaly'] ?? false),
            'anomaly_score' => (float) ($result['anomaly_score'] ?? 0),
            'label'         => $result['label'] ?? (($result['is_anomaly'] ?? false) ? 'anomaly' : 'normal'),
            'input'         => $features,
        ]);
    }
}