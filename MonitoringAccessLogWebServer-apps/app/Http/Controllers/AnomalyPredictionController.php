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
        $validated = $request->validate([
            'ip'            => ['nullable', 'string', 'max:45'],
            'url'           => ['nullable', 'string', 'max:500'],
            'method'        => ['nullable', 'string', 'max:10'],
            'status_code'   => ['nullable', 'integer', 'min:100', 'max:599'],
            'status'        => ['nullable', 'integer', 'min:100', 'max:599'],
            'request_rate'  => ['nullable', 'numeric', 'min:0'],
            'rate'          => ['nullable', 'numeric', 'min:0'],
            'payload_bytes' => ['nullable', 'integer', 'min:0'],
            'bytes'         => ['nullable', 'integer', 'min:0'],
            'user_agent'    => ['nullable', 'string', 'max:500'],
        ]);

        $payload = [
            'ip'            => $validated['ip'] ?? '127.0.0.1',
            'url'           => $validated['url'] ?? '/',
            'method'        => strtoupper($validated['method'] ?? 'GET'),
            'status_code'   => (int) ($validated['status_code'] ?? ($validated['status'] ?? 200)),
            'request_rate'  => (float) ($validated['request_rate'] ?? ($validated['rate'] ?? 10.0)),
            'payload_bytes' => (int) ($validated['payload_bytes'] ?? ($validated['bytes'] ?? 1500)),
            'user_agent'    => $validated['user_agent'] ?? '',
        ];

        if (! is_file(app_path('Services/Python/model/anomaly_model.pkl'))) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Model belum tersedia. Jalankan train_anomaly_model.py terlebih dahulu.',
            ], 503);
        }

        try {
            $result = $this->python->predictAnomaly($payload);
        } catch (Throwable $e) {
            Log::error('Anomaly: predict_anomaly.py gagal', ['error' => $e->getMessage()]);

            return response()->json([
                'status'  => 'error',
                'message' => 'Prediksi gagal diproses: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json($result);
    }
}
