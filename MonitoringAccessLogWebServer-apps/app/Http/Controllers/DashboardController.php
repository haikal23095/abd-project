<?php

namespace App\Http\Controllers;

use App\Services\PythonRunnerService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class DashboardController extends Controller
{
    /** Memo per-request agar closure props tidak membaca cache berulang. */
    private array $memo = [];

    public function __construct(private PythonRunnerService $python)
    {
    }

    public function index(Request $request): Response
    {
        $country = $this->resolveCountry($request);

        return Inertia::render('Dashboard', [
            // Peta dunia selalu ALL (tidak difilter per negara)
            'mapData'         => fn () => $this->analytics(null)['map_data'],
            'selectedCountry' => $country ?? 'ALL',
            // Data yang difilter per negara
            'metrics'         => fn () => $this->analytics($country)['metrics'],
            'topUrls'         => fn () => $this->analytics($country)['top_urls'],
            'dailyTraffic'    => fn () => $this->analytics($country)['daily_traffic'],
            'isolationForest' => fn () => $this->analytics($country)['isolation_forest'],
            'error'           => fn () => $this->analytics($country)['error'] ?? null,
        ]);
    }

    private function resolveCountry(Request $request): ?string
    {
        $code = strtoupper((string) $request->query('country', ''));

        return preg_match('/^[A-Z]{2}$/', $code) ? $code : null;
    }

    private function analytics(?string $country): array
    {
        return $this->memo[$country ?? 'ALL'] ??= $this->load($country);
    }

    private function resolvePath(?string $path): string
    {
        if (empty($path)) {
            return '';
        }

        // Cek apakah absolute path (Windows drive misal F:\ atau Unix /)
        if (preg_match('/^[a-zA-Z]:[\\\\\/]/', $path) || str_starts_with($path, '/')) {
            return $path;
        }

        return base_path($path);
    }

    private function load(?string $country): array
    {
        $cfg = config('services.analytics');
        $logPath = $this->resolvePath($cfg['log_path'] ?? null);
        $mmdbPath = $this->resolvePath($cfg['mmdb_path'] ?? null);

        // Jika mmdb tidak ada, tetap lanjut (parse_log.py ada fallback tanpa GeoIP)
        if (! is_file($logPath)) {
            Log::warning('Analytics: access.log tidak ditemukan', [
                'log' => $logPath,
            ]);

            return $this->failure("File access.log tidak ditemukan di: {$logPath}. Pastikan file ada atau cek konfigurasi ANALYTICS_LOG_PATH di .env.");
        }

        $mmdbValid = is_file($mmdbPath) ? $mmdbPath : '';

        // mtime masuk key → log berubah, cache otomatis stale
        $key = sprintf(
            'analytics:%s:%s',
            md5($logPath) . filemtime($logPath),
            $country ?? 'ALL'
        );

        if (($cached = Cache::get($key)) !== null) {
            return $cached;
        }

        try {
            $raw  = $this->python->parseLog($logPath, $mmdbValid, $country ?? 'ALL');
            $data = $this->normalize($raw);
        } catch (Throwable $e) {
            Log::error('Analytics: parse_log.py gagal', ['error' => $e->getMessage()]);

            return $this->failure('Gagal memproses log. Lihat storage/logs/laravel.log.');
        }

        Cache::put($key, $data, $cfg['cache_ttl'] ?? 300);

        return $data;
    }

    private function normalize(array $raw): array
    {
        $metrics = $raw['metrics'] ?? [];

        // Normalisasi field metrics agar konsisten
        $normalizedMetrics = [
            'total_requests' => $metrics['total_requests'] ?? 0,
            'bot_percentage' => isset($metrics['bot_ratio'])
                ? round(($metrics['bot_ratio'] ?? 0) * 100, 1)
                : ($metrics['bot_percentage'] ?? 0),
            'peak_rps'       => $metrics['peak_rps'] ?? 0.0,
            'unique_ips'     => $metrics['unique_ips'] ?? 0,
            'bot_requests'   => $metrics['bot_requests'] ?? 0,
            'human_requests' => $metrics['human_requests'] ?? 0,
        ];

        // Konversi geo_scatter → map_data format yang dipakai frontend ECharts
        $geoScatter = $raw['geo_scatter'] ?? $raw['countries'] ?? [];
        $mapData = array_map(function ($item) {
            return [
                'name'        => $item['country_name'] ?? $item['name'] ?? $item['country_code'] ?? '',
                'value'       => [
                    $item['lng'] ?? $item['value'][0] ?? 0,
                    $item['lat'] ?? $item['value'][1] ?? 0,
                    $item['request_count'] ?? $item['value'][2] ?? 0,
                ],
                'countryCode' => $item['country_code'] ?? $item['countryCode'] ?? '',
            ];
        }, $geoScatter);

        // Normalisasi daily_traffic field name (date vs date, count vs requests)
        $dailyTraffic = array_map(function ($d) {
            return [
                'date'  => $d['date'] ?? '',
                'count' => $d['count'] ?? $d['requests'] ?? 0,
            ];
        }, $raw['daily_traffic'] ?? []);

        // Normalisasi anomaly_samples → isolation_forest format frontend
        $anomalySamples = $raw['anomaly_samples'] ?? [];
        $isolationForest = array_map(function ($s) {
            return [
                'id'           => $s['id'] ?? '',
                'timestamp'    => $s['timestamp'] ?? '',
                'ip'           => $s['ip'] ?? '',
                'countryCode'  => $s['countryCode'] ?? $s['country_code'] ?? '',
                'method'       => $s['method'] ?? 'GET',
                'url'          => $s['url'] ?? '',
                'statusCode'   => $s['statusCode'] ?? $s['status'] ?? 200,
                'requestRate'  => $s['requestRate'] ?? 1,
                'bytesSent'    => $s['bytesSent'] ?? $s['size'] ?? 0,
                'userAgent'    => $s['userAgent'] ?? $s['user_agent'] ?? '',
                'prediction'   => $s['prediction'] ?? 1,
                'anomalyScore' => $s['anomalyScore'] ?? $s['anomaly_score'] ?? 0.0,
                'clusterLabel' => $s['clusterLabel'] ?? $s['cluster'] ?? 'Cluster 0 · Normal Web Traffic',
            ];
        }, $anomalySamples);

        return [
            'metrics'          => $normalizedMetrics,
            'map_data'         => $mapData,
            'top_urls'         => $raw['top_urls'] ?? [],
            'daily_traffic'    => $dailyTraffic,
            'isolation_forest' => $isolationForest,
        ];
    }

    private function failure(string $message): array
    {
        return [
            'metrics'          => [
                'total_requests' => 0,
                'bot_percentage' => 0.0,
                'peak_rps'       => 0.0,
                'unique_ips'     => 0,
                'bot_requests'   => 0,
                'human_requests' => 0,
            ],
            'map_data'         => [],
            'top_urls'         => [],
            'daily_traffic'    => [],
            'isolation_forest' => [],
            'error'            => $message,
        ];
    }
}
