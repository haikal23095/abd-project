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
    
            // Props berbentuk closure -> baru dievaluasi kalau diminta.
            // Saat filter negara (partial reload, only: [...]) peta TIDAK dihitung ulang.
            return Inertia::render('Dashboard', [
                'selectedCountry' => $country,
                'worldMap'        => fn () => $this->analytics(null)['countries'],
                'metrics'         => fn () => $this->analytics($country)['metrics'],
                'topUrls'         => fn () => $this->analytics($country)['top_urls'],
                'dailyTraffic'    => fn () => $this->analytics($country)['daily_traffic'],
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
    
        private function load(?string $country): array
        {
            $cfg = config('services.analytics');
    
            if (! is_file($cfg['log_path']) || ! is_file($cfg['mmdb_path'])) {
                Log::warning('Analytics: file data tidak ditemukan', [
                    'log'  => $cfg['log_path'],
                    'mmdb' => $cfg['mmdb_path'],
                ]);
    
                return $this->failure('File access.log atau GeoLite2-Country.mmdb tidak ditemukan. Cek konfigurasi .env.');
            }
    
            // mtime masuk key -> log berubah, cache otomatis tidak dipakai lagi
            $key = sprintf('analytics:%s:%s', md5($cfg['log_path']) . filemtime($cfg['log_path']), $country ?? 'ALL');
    
            if (($cached = Cache::get($key)) !== null) {
                return $cached;
            }
    
            try {
                $data = $this->normalize(
                    $this->python->parseLog($cfg['log_path'], $cfg['mmdb_path'], $country ?? 'ALL')
                );
            } catch (Throwable $e) {
                Log::error('Analytics: parse_log.py gagal', ['error' => $e->getMessage()]);
    
                return $this->failure('Gagal memproses log. Lihat storage/logs/laravel.log.');
            }
    
            // Hanya hasil sukses yang di-cache
            Cache::put($key, $data, $cfg['cache_ttl']);
    
            return $data;
        }
    
        private function normalize(array $data): array
        {
            return [
                'metrics'       => ($data['metrics'] ?? []) + $this->emptyMetrics(),
                'countries'     => $data['countries'] ?? [],
                'top_urls'      => $data['top_urls'] ?? [],
                'daily_traffic' => $data['daily_traffic'] ?? [],
            ];
        }
    
        private function emptyMetrics(): array
        {
            return ['total_requests' => 0, 'bot_proportion' => 0.0, 'peak_rps' => 0.0];
        }
    
        private function failure(string $message): array
        {
            return [
                'metrics'       => $this->emptyMetrics(),
                'countries'     => [],
                'top_urls'      => [],
                'daily_traffic' => [],
                'error'         => $message,
            ];
        }
    }
    