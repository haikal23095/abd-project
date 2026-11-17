<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use RuntimeException;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

class PythonRunnerService
{
    private string $pythonBinary;
    private string $scriptsDir;

    public function __construct()
    {
        $this->pythonBinary = $this->resolvePythonBinary();
        $this->scriptsDir = app_path('Services/Python');
    }

    /**
     * Resolves the python executable path with intelligent fallbacks.
     */
    private function resolvePythonBinary(): string
    {
        $configured = config('services.analytics.python_path');
        if ($configured && file_exists($configured)) {
            return $configured;
        }

        // Check virtualenv in base_path or parent workspace root
        $candidatePaths = [
            base_path('.venv/Scripts/python.exe'),
            base_path('../.venv/Scripts/python.exe'),
            base_path('.venv/bin/python'),
            base_path('../.venv/bin/python'),
        ];

        foreach ($candidatePaths as $candidate) {
            if (file_exists($candidate)) {
                return $candidate;
            }
        }

        return $configured ?: (PHP_OS_FAMILY === 'Windows' ? 'python' : 'python3');
    }

    /**
     * Execute a python script and return decoded JSON response.
     *
     * @param string $scriptFileName File name in app/Services/Python
     * @param array $args Command line arguments
     * @param int $timeout Timeout in seconds
     * @return array
     */
    public function executeScript(string $scriptFileName, array $args = [], int $timeout = 120): array
    {
        $scriptPath = $this->scriptsDir . DIRECTORY_SEPARATOR . $scriptFileName;

        if (!file_exists($scriptPath)) {
            throw new RuntimeException("Python script not found: {$scriptPath}");
        }

        $command = array_merge([$this->pythonBinary, $scriptPath], $args);

        $process = new Process($command);
        $process->setTimeout($timeout);

        try {
            $process->run();
        } catch (ProcessTimedOutException $e) {
            Log::error("Python script timed out after {$timeout} seconds", [
                'script' => $scriptFileName,
                'args' => $args,
            ]);
            throw $e;
        }

        if (!$process->isSuccessful()) {
            $errorOutput = $process->getErrorOutput();
            Log::error("Python script execution failed", [
                'script' => $scriptFileName,
                'exit_code' => $process->getExitCode(),
                'error' => $errorOutput,
                'output' => $process->getOutput(),
            ]);

            throw new ProcessFailedException($process);
        }

        $output = trim($process->getOutput());
        $data = json_decode($output, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error("Invalid JSON from Python script", [
                'script' => $scriptFileName,
                'json_error' => json_last_error_msg(),
                'raw_output' => substr($output, 0, 1000),
            ]);

            throw new RuntimeException("Python script [{$scriptFileName}] returned invalid JSON: " . json_last_error_msg());
        }

        return $data;
    }

    /**
     * Execute parse_log.py
     */
    public function parseLog(string $logPath, string $mmdbPath, string $countryCode = 'ALL'): array
    {
        return $this->executeScript('parse_log.py', [
            '--log', $logPath,
            '--mmdb', $mmdbPath,
            '--country_code', $countryCode,
        ]);
    }

    /**
     * Execute predict_anomaly.py
     */
    public function predictAnomaly(array $inputData): array
    {
        $args = [
            '--json', json_encode($inputData, JSON_UNESCAPED_SLASHES),
            '--mmdb', config('services.analytics.mmdb_path', storage_path('app/GeoLite2-Country.mmdb')),
            '--model', $this->scriptsDir . DIRECTORY_SEPARATOR . 'model' . DIRECTORY_SEPARATOR . 'anomaly_model.pkl',
        ];

        return $this->executeScript('predict_anomaly.py', $args, 30);
    }
}
