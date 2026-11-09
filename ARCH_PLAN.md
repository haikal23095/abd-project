# ARCH_PLAN.md — Web Analytics Dashboard (Single Page App)

> **Version**: 1.0.0
> **Author**: Principal Software Architect
> **Created**: 2026-11-09
> **Status**: Ready for Implementation

---

## Table of Contents

1. [System Overview & Architecture Diagram](#1-system-overview--architecture-diagram)
2. [Data Model & Schema Spec](#2-data-model--schema-spec)
3. [Backend & Integration Logic (Laravel & Python)](#3-backend--integration-logic-laravel--python)
4. [Frontend UI Component Specification](#4-frontend-ui-component-specification)
5. [Step-by-Step Task Checklist (Execution Plan)](#5-step-by-step-task-checklist-execution-plan)

---

## 1. System Overview & Architecture Diagram

### 1.1 Project Summary

Sebuah **Single Page Application (SPA)** dashboard analitik web yang memproses file Nginx/Apache `access.log` dan database GeoIP MaxMind (`.mmdb`) untuk menghasilkan visualisasi interaktif: world scatter map, metric cards, bar chart top URLs, dan line chart daily traffic.

### 1.2 Technology Stack

| Layer               | Technology                                                        |
| ------------------- | ----------------------------------------------------------------- |
| **Data Engine**      | Python 3.10+ (Pandas/Polars, GeoIP2, `user-agents`, regex parser) |
| **Backend Gateway**  | Laravel 11 (PHP 8.2+) + Inertia.js Server-Side Adapter            |
| **Frontend**         | React 18 (TypeScript) + Tailwind CSS 3.x + Apache ECharts 5.x     |
| **Communication**    | Inertia.js Protocol (Server → Client Props hydration)              |
| **Process Bridge**   | `Symfony\Component\Process\Process` (PHP → Python IPC)             |

### 1.3 End-to-End Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW ARCHITECTURE                                │
│                                                                                 │
│  ┌──────────────┐   ┌──────────────────┐                                        │
│  │ access.log   │   │ GeoLite2-Country │                                        │
│  │ (Nginx/      │   │ .mmdb            │                                        │
│  │  Apache)     │   │ (MaxMind DB)     │                                        │
│  └──────┬───────┘   └────────┬─────────┘                                        │
│         │                    │                                                  │
│         ▼                    ▼                                                  │
│  ┌─────────────────────────────────────┐                                        │
│  │     Python Script                   │                                        │
│  │     parse_log.py                    │                                        │
│  │                                     │                                        │
│  │  1. Regex parse each log line       │                                        │
│  │  2. GeoIP lookup → country_code     │                                        │
│  │  3. Bot detection (user-agent)      │                                        │
│  │  4. Aggregations (Pandas/Polars):   │                                        │
│  │     - Total requests                │                                        │
│  │     - Requests per country (lat/lng)│                                        │
│  │     - Top 5 URLs                    │                                        │
│  │     - Daily traffic                 │                                        │
│  │     - Bot ratio                     │                                        │
│  │     - Peak RPS                      │                                        │
│  │  5. Output: JSON to stdout          │                                        │
│  └──────────────┬──────────────────────┘                                        │
│                 │  stdout (JSON string)                                          │
│                 ▼                                                                │
│  ┌─────────────────────────────────────┐                                        │
│  │     Laravel 11 Controller           │                                        │
│  │     DashboardController.php         │                                        │
│  │                                     │                                        │
│  │  1. Receive HTTP request            │                                        │
│  │     (with optional ?country_code=)  │                                        │
│  │  2. Execute Python via Process      │                                        │
│  │     OR read cached JSON / DB        │                                        │
│  │  3. json_decode() Python output     │                                        │
│  │  4. Inertia::render('Dashboard',    │                                        │
│  │        $dashboardData)              │                                        │
│  └──────────────┬──────────────────────┘                                        │
│                 │  Inertia Page Props                                            │
│                 ▼                                                                │
│  ┌─────────────────────────────────────┐                                        │
│  │     React SPA (Dashboard.tsx)       │                                        │
│  │                                     │                                        │
│  │  ┌───────────────────────────────┐  │                                        │
│  │  │ Header + Filter Badge        │  │                                        │
│  │  ├───────────────────────────────┤  │                                        │
│  │  │ World Scatter Map (ECharts)  │  │                                        │
│  │  │ [clickable → filter country] │  │                                        │
│  │  ├───────────────────────────────┤  │                                        │
│  │  │ Quick Filter Buttons          │  │                                        │
│  │  │ [ALL|IR|US|FR|DE|RU|CN]      │  │                                        │
│  │  ├───────────────────────────────┤  │                                        │
│  │  │ 3× Metric Cards              │  │                                        │
│  │  │ (Requests | Bot% | Peak RPS) │  │                                        │
│  │  ├──────────────┬────────────────┤  │                                        │
│  │  │ Top URLs     │ Daily Traffic  │  │                                        │
│  │  │ (Bar Chart)  │ (Line Chart)  │  │                                        │
│  │  └──────────────┴────────────────┘  │                                        │
│  └─────────────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Request Lifecycle (Sequence)

```
Browser ──GET /dashboard(?country_code=US)──▶ Laravel Router
                                                  │
                                                  ▼
                                          DashboardController@index
                                                  │
                                    ┌─────────────┴─────────────┐
                                    │  Cache exists & fresh?     │
                                    │  YES → read from cache     │
                                    │  NO  → spawn Python proc   │
                                    └─────────────┬─────────────┘
                                                  │
                              ┌────────────────────┴────────────────────┐
                              │ Python parse_log.py                      │
                              │   --log /path/to/access.log              │
                              │   --mmdb /path/to/GeoLite2-Country.mmdb  │
                              │   --country_code US (optional)           │
                              │                                          │
                              │ → prints JSON to stdout                  │
                              └────────────────────┬────────────────────┘
                                                   │
                                                   ▼
                                          json_decode($output)
                                                   │
                                                   ▼
                                    Inertia::render('Dashboard', $data)
                                                   │
                                                   ▼
                                       React hydrates <Dashboard />
                                       with typed props (DashboardProps)
                                                   │
                                                   ▼
                                         ECharts renders all charts
```

---

## 2. Data Model & Schema Spec

### 2.1 Raw Data: Nginx Combined Log Format

Setiap baris `access.log` mengikuti format **Nginx Combined**:

```
$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
```

**Contoh baris log:**

```
185.220.101.34 - - [07/Nov/2026:03:24:15 +0000] "GET /api/v1/users HTTP/1.1" 200 1542 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
```

**Regex Pattern untuk parsing:**

```python
LOG_PATTERN = re.compile(
    r'(?P<ip>\S+)\s+'             # remote_addr
    r'\S+\s+'                      # remote_user (ident, biasanya "-")
    r'\S+\s+'                      # remote_user (auth, biasanya "-")
    r'\[(?P<datetime>[^\]]+)\]\s+' # time_local
    r'"(?P<method>\S+)\s+'         # request method
    r'(?P<url>\S+)\s+'             # request URL
    r'\S+"\s+'                     # protocol
    r'(?P<status>\d{3})\s+'        # status code
    r'(?P<size>\S+)\s+'            # body_bytes_sent
    r'"(?P<referer>[^"]*)"\s+'     # http_referer
    r'"(?P<user_agent>[^"]*)"'     # http_user_agent
)
```

**Parsed Fields:**

| Field        | Type     | Example                          |
| ------------ | -------- | -------------------------------- |
| `ip`         | `string` | `185.220.101.34`                 |
| `datetime`   | `string` | `07/Nov/2026:03:24:15 +0000`     |
| `method`     | `string` | `GET`                            |
| `url`        | `string` | `/api/v1/users`                  |
| `status`     | `int`    | `200`                            |
| `size`       | `int`    | `1542`                           |
| `referer`    | `string` | `-`                              |
| `user_agent` | `string` | `Mozilla/5.0 (Windows NT 10.0…)` |

### 2.2 GeoIP MaxMind Database

- **File**: `GeoLite2-Country.mmdb` (binary MaxMind DB format)
- **Library**: `geoip2` Python package
- **Lookup**: `reader.country(ip_address)` → `response.country.iso_code` (e.g., `"US"`, `"IR"`, `"DE"`)
- **Fallback**: Jika IP tidak ditemukan (private IP / `AddressNotFoundError`), gunakan `"XX"` (Unknown)
- **Latitude/Longitude**: Karena database level **Country**, gunakan **centroid mapping statis** per country code.

**Country Centroid Mapping (Subset yang Dibutuhkan):**

```python
COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {
    "US": (37.0902, -95.7129),
    "IR": (32.4279, 53.6880),
    "FR": (46.6034, 1.8883),
    "DE": (51.1657, 10.4515),
    "RU": (61.5240, 105.3188),
    "CN": (35.8617, 104.1954),
    "GB": (55.3781, -3.4360),
    "JP": (36.2048, 138.2529),
    "BR": (-14.2350, -51.9253),
    "IN": (20.5937, 78.9629),
    "CA": (56.1304, -106.3468),
    "AU": (-25.2744, 133.7751),
    "NL": (52.1326, 5.2913),
    "KR": (35.9078, 127.7669),
    "SG": (1.3521, 103.8198),
    "ID": (-0.7893, 113.9213),
    "XX": (0.0, 0.0),
    # Tambahkan negara lain sesuai kebutuhan. Jika country_code tidak ada di map,
    # gunakan fallback (0.0, 0.0) dan label "Unknown"
}
```

### 2.3 Python JSON Output Schema

Script Python **HARUS** meng-output JSON berikut ke `stdout` (satu JSON object, bukan multi-line log):

```jsonc
{
  // ─── Metadata ───
  "generated_at": "2026-11-09T20:00:00+07:00",   // ISO 8601
  "log_file": "/var/log/nginx/access.log",
  "filter_country": "ALL",                         // "ALL" | "US" | "IR" | etc.
  "total_lines_parsed": 125000,
  "parse_errors": 42,

  // ─── Aggregate Metrics ───
  "metrics": {
    "total_requests": 124958,
    "bot_requests": 31240,
    "human_requests": 93718,
    "bot_ratio": 0.25,                             // float 0.0–1.0
    "peak_rps": 847.5,                             // float, requests per second (max di 1 window)
    "unique_ips": 8421
  },

  // ─── Geo Scatter Data (untuk World Map) ───
  "geo_scatter": [
    {
      "country_code": "US",
      "country_name": "United States",
      "lat": 37.0902,
      "lng": -95.7129,
      "request_count": 45230
    },
    {
      "country_code": "IR",
      "country_name": "Iran",
      "lat": 32.4279,
      "lng": 53.6880,
      "request_count": 22100
    }
    // ... all countries with request_count > 0
  ],

  // ─── Top 5 URLs (untuk Bar Chart) ───
  "top_urls": [
    { "url": "/api/v1/users",    "count": 15420 },
    { "url": "/",                "count": 12300 },
    { "url": "/login",           "count": 8900  },
    { "url": "/api/v1/products", "count": 7650  },
    { "url": "/assets/logo.png", "count": 5200  }
  ],

  // ─── Daily Traffic (untuk Line Chart) ───
  "daily_traffic": [
    { "date": "2026-11-01", "requests": 4520 },
    { "date": "2026-11-02", "requests": 4890 },
    { "date": "2026-11-03", "requests": 5120 }
    // ... one entry per calendar day found in logs
  ]
}
```

### 2.4 TypeScript Interfaces — Inertia Page Props

File: `resources/js/types/dashboard.ts`

```typescript
// ──────────────────────────────────────────────
// Dashboard Page Props (Inertia)
// ──────────────────────────────────────────────

export interface GeoScatterItem {
  country_code: string;
  country_name: string;
  lat: number;
  lng: number;
  request_count: number;
}

export interface TopUrlItem {
  url: string;
  count: number;
}

export interface DailyTrafficItem {
  date: string;       // "YYYY-MM-DD"
  requests: number;
}

export interface Metrics {
  total_requests: number;
  bot_requests: number;
  human_requests: number;
  bot_ratio: number;       // 0.0 – 1.0
  peak_rps: number;
  unique_ips: number;
}

export interface DashboardData {
  generated_at: string;          // ISO 8601
  log_file: string;
  filter_country: string;        // "ALL" | country_code
  total_lines_parsed: number;
  parse_errors: number;
  metrics: Metrics;
  geo_scatter: GeoScatterItem[];
  top_urls: TopUrlItem[];
  daily_traffic: DailyTrafficItem[];
}

/**
 * Inertia Page Props yang diterima oleh komponen Dashboard.tsx
 * Ini adalah root-level props dari Inertia::render('Dashboard', ...)
 */
export interface DashboardProps {
  dashboardData: DashboardData;
}
```

---

## 3. Backend & Integration Logic (Laravel & Python)

### 3.1 Python Script: `app/Services/Python/parse_log.py`

**Lokasi file**: `app/Services/Python/parse_log.py`

**Execution command**:

```bash
python3 app/Services/Python/parse_log.py \
  --log /path/to/access.log \
  --mmdb /path/to/GeoLite2-Country.mmdb \
  --country_code ALL
```

**Arguments:**

| Argument         | Required | Default  | Description                                      |
| ---------------- | -------- | -------- | ------------------------------------------------ |
| `--log`          | ✅        | —        | Path absolut ke file `access.log`                |
| `--mmdb`         | ✅        | —        | Path absolut ke file `GeoLite2-Country.mmdb`     |
| `--country_code` | ❌        | `"ALL"`  | Filter by ISO country code. `"ALL"` = no filter. |

**Script Skeleton:**

```python
#!/usr/bin/env python3
"""
parse_log.py — Nginx/Apache Access Log Analyzer with GeoIP
Outputs a JSON analytics payload to stdout.
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime

import geoip2.database
import pandas as pd
from user_agents import parse as parse_ua


# ─── Constants ───────────────────────────────────────────────

LOG_PATTERN = re.compile(
    r'(?P<ip>\S+)\s+'
    r'\S+\s+'
    r'\S+\s+'
    r'\[(?P<datetime>[^\]]+)\]\s+'
    r'"(?P<method>\S+)\s+'
    r'(?P<url>\S+)\s+'
    r'\S+"\s+'
    r'(?P<status>\d{3})\s+'
    r'(?P<size>\S+)\s+'
    r'"(?P<referer>[^"]*)"\s+'
    r'"(?P<user_agent>[^"]*)"'
)

COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {
    "US": (37.0902, -95.7129),
    "IR": (32.4279, 53.6880),
    "FR": (46.6034, 1.8883),
    "DE": (51.1657, 10.4515),
    "RU": (61.5240, 105.3188),
    "CN": (35.8617, 104.1954),
    "GB": (55.3781, -3.4360),
    "JP": (36.2048, 138.2529),
    "BR": (-14.2350, -51.9253),
    "IN": (20.5937, 78.9629),
    "CA": (56.1304, -106.3468),
    "AU": (-25.2744, 133.7751),
    "NL": (52.1326, 5.2913),
    "KR": (35.9078, 127.7669),
    "SG": (1.3521, 103.8198),
    "ID": (-0.7893, 113.9213),
    "XX": (0.0, 0.0),
}

COUNTRY_NAMES: dict[str, str] = {
    "US": "United States", "IR": "Iran", "FR": "France",
    "DE": "Germany", "RU": "Russia", "CN": "China",
    "GB": "United Kingdom", "JP": "Japan", "BR": "Brazil",
    "IN": "India", "CA": "Canada", "AU": "Australia",
    "NL": "Netherlands", "KR": "South Korea", "SG": "Singapore",
    "ID": "Indonesia", "XX": "Unknown",
}


# ─── Functions ───────────────────────────────────────────────

def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parse Nginx/Apache access logs with GeoIP")
    parser.add_argument("--log", required=True, help="Path to access.log file")
    parser.add_argument("--mmdb", required=True, help="Path to GeoLite2-Country.mmdb")
    parser.add_argument("--country_code", default="ALL", help="Filter by country code (default: ALL)")
    return parser.parse_args()


def is_bot(user_agent_string: str) -> bool:
    """Detect bots via user-agents library."""
    ua = parse_ua(user_agent_string)
    return ua.is_bot


def lookup_country(reader: geoip2.database.Reader, ip: str) -> str:
    """Lookup country ISO code from IP. Returns 'XX' on failure."""
    try:
        response = reader.country(ip)
        return response.country.iso_code or "XX"
    except Exception:
        return "XX"


def parse_log_datetime(dt_str: str) -> datetime:
    """Parse Nginx datetime string: '07/Nov/2026:03:24:15 +0000'"""
    return datetime.strptime(dt_str, "%d/%b/%Y:%H:%M:%S %z")


def calculate_peak_rps(timestamps: list[datetime]) -> float:
    """
    Calculate peak Requests Per Second.
    Strategy: Bucket timestamps into 1-second windows, return the max count.
    """
    if not timestamps:
        return 0.0
    second_buckets: Counter = Counter()
    for ts in timestamps:
        bucket_key = ts.strftime("%Y-%m-%d %H:%M:%S")
        second_buckets[bucket_key] += 1
    return float(max(second_buckets.values())) if second_buckets else 0.0


def main() -> None:
    args = parse_arguments()

    reader = geoip2.database.Reader(args.mmdb)
    filter_cc = args.country_code.upper()

    records = []
    parse_errors = 0
    total_lines = 0

    with open(args.log, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            total_lines += 1
            match = LOG_PATTERN.match(line.strip())
            if not match:
                parse_errors += 1
                continue

            data = match.groupdict()
            cc = lookup_country(reader, data["ip"])

            # Apply country filter EARLY for efficiency
            if filter_cc != "ALL" and cc != filter_cc:
                continue

            dt = parse_log_datetime(data["datetime"])
            bot = is_bot(data["user_agent"])

            records.append({
                "ip": data["ip"],
                "datetime": dt,
                "method": data["method"],
                "url": data["url"],
                "status": int(data["status"]),
                "size": int(data["size"]) if data["size"] != "-" else 0,
                "user_agent": data["user_agent"],
                "country_code": cc,
                "is_bot": bot,
            })

    reader.close()

    # ─── Aggregation via Pandas ──────────────────────────────
    if not records:
        # Empty result
        result = {
            "generated_at": datetime.now().astimezone().isoformat(),
            "log_file": args.log,
            "filter_country": filter_cc,
            "total_lines_parsed": total_lines,
            "parse_errors": parse_errors,
            "metrics": {
                "total_requests": 0,
                "bot_requests": 0,
                "human_requests": 0,
                "bot_ratio": 0.0,
                "peak_rps": 0.0,
                "unique_ips": 0,
            },
            "geo_scatter": [],
            "top_urls": [],
            "daily_traffic": [],
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    df = pd.DataFrame(records)

    # Metrics
    total_requests = len(df)
    bot_requests = int(df["is_bot"].sum())
    human_requests = total_requests - bot_requests
    bot_ratio = round(bot_requests / total_requests, 4) if total_requests > 0 else 0.0
    unique_ips = df["ip"].nunique()
    peak_rps = calculate_peak_rps(df["datetime"].tolist())

    # Geo Scatter
    geo_grouped = df.groupby("country_code").size().reset_index(name="request_count")
    geo_scatter = []
    for _, row in geo_grouped.iterrows():
        cc = row["country_code"]
        lat, lng = COUNTRY_CENTROIDS.get(cc, (0.0, 0.0))
        geo_scatter.append({
            "country_code": cc,
            "country_name": COUNTRY_NAMES.get(cc, cc),
            "lat": lat,
            "lng": lng,
            "request_count": int(row["request_count"]),
        })
    geo_scatter.sort(key=lambda x: x["request_count"], reverse=True)

    # Top 5 URLs
    url_counts = df["url"].value_counts().head(5)
    top_urls = [{"url": url, "count": int(count)} for url, count in url_counts.items()]

    # Daily Traffic
    df["date"] = df["datetime"].dt.strftime("%Y-%m-%d")
    daily = df.groupby("date").size().reset_index(name="requests")
    daily = daily.sort_values("date")
    daily_traffic = [
        {"date": row["date"], "requests": int(row["requests"])}
        for _, row in daily.iterrows()
    ]

    # ─── Build Output ────────────────────────────────────────
    result = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "log_file": args.log,
        "filter_country": filter_cc,
        "total_lines_parsed": total_lines,
        "parse_errors": parse_errors,
        "metrics": {
            "total_requests": total_requests,
            "bot_requests": bot_requests,
            "human_requests": human_requests,
            "bot_ratio": bot_ratio,
            "peak_rps": peak_rps,
            "unique_ips": unique_ips,
        },
        "geo_scatter": geo_scatter,
        "top_urls": top_urls,
        "daily_traffic": daily_traffic,
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

### 3.2 Laravel Controller: `app/Http/Controllers/DashboardController.php`

**Lokasi file**: `app/Http/Controllers/DashboardController.php`

**Responsibility**:
1. Menerima request HTTP `GET /dashboard` (dengan optional query `?country_code=XX`).
2. Menentukan apakah menggunakan cache atau menjalankan proses Python.
3. Decode JSON output Python.
4. Render Inertia page `Dashboard` dengan props `dashboardData`.

**Controller Skeleton:**

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class DashboardController extends Controller
{
    /**
     * Path konfigurasi — idealnya dari config/services.php atau .env
     */
    private string $logFilePath;
    private string $mmdbFilePath;
    private string $pythonScriptPath;
    private int $cacheTtlSeconds;

    public function __construct()
    {
        $this->logFilePath      = config('services.analytics.log_path', storage_path('logs/access.log'));
        $this->mmdbFilePath     = config('services.analytics.mmdb_path', storage_path('app/GeoLite2-Country.mmdb'));
        $this->pythonScriptPath = base_path('app/Services/Python/parse_log.py');
        $this->cacheTtlSeconds  = (int) config('services.analytics.cache_ttl', 300); // 5 minutes
    }

    /**
     * Dashboard utama — Single Page App entry point.
     */
    public function index(Request $request): InertiaResponse
    {
        $countryCode = strtoupper($request->input('country_code', 'ALL'));

        // Validasi country_code: harus 2-3 huruf atau "ALL"
        if (!preg_match('/^[A-Z]{2,3}$/', $countryCode) && $countryCode !== 'ALL') {
            $countryCode = 'ALL';
        }

        $cacheKey = "dashboard_data_{$countryCode}";

        $dashboardData = Cache::remember($cacheKey, $this->cacheTtlSeconds, function () use ($countryCode) {
            return $this->executePythonScript($countryCode);
        });

        return Inertia::render('Dashboard', [
            'dashboardData' => $dashboardData,
        ]);
    }

    /**
     * Jalankan script Python parse_log.py dan kembalikan array result.
     */
    private function executePythonScript(string $countryCode): array
    {
        $process = new Process([
            'python3',
            $this->pythonScriptPath,
            '--log', $this->logFilePath,
            '--mmdb', $this->mmdbFilePath,
            '--country_code', $countryCode,
        ]);

        $process->setTimeout(120); // 2 menit max
        $process->run();

        if (!$process->isSuccessful()) {
            Log::error('Python parse_log.py failed', [
                'exit_code' => $process->getExitCode(),
                'error'     => $process->getErrorOutput(),
            ]);
            throw new ProcessFailedException($process);
        }

        $output = $process->getOutput();
        $data = json_decode($output, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error('Invalid JSON from Python script', [
                'json_error' => json_last_error_msg(),
                'raw_output' => substr($output, 0, 500),
            ]);
            throw new \RuntimeException('Python script returned invalid JSON: ' . json_last_error_msg());
        }

        return $data;
    }
}
```

### 3.3 Laravel Route

**File**: `routes/web.php`

```php
use App\Http\Controllers\DashboardController;

Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

// Opsional: redirect root ke dashboard
Route::redirect('/', '/dashboard');
```

### 3.4 Laravel Config

**File**: `config/services.php` (append ke array existing)

```php
'analytics' => [
    'log_path'   => env('ANALYTICS_LOG_PATH', storage_path('logs/access.log')),
    'mmdb_path'  => env('ANALYTICS_MMDB_PATH', storage_path('app/GeoLite2-Country.mmdb')),
    'cache_ttl'  => env('ANALYTICS_CACHE_TTL', 300),
],
```

**File**: `.env` (tambahkan)

```env
ANALYTICS_LOG_PATH=/var/log/nginx/access.log
ANALYTICS_MMDB_PATH=/path/to/GeoLite2-Country.mmdb
ANALYTICS_CACHE_TTL=300
```

### 3.5 Filter & Partial Reload Strategy

Ketika user meng-klik negara di World Map atau Quick Filter Button, frontend **TIDAK** me-refresh full page. Gunakan **Inertia `router.get()`** untuk mengirim request baru ke URL yang sama dengan query parameter berbeda:

```typescript
import { router } from '@inertiajs/react';

function handleCountryFilter(countryCode: string) {
  router.get(
    '/dashboard',
    { country_code: countryCode === 'ALL' ? undefined : countryCode },
    {
      preserveState: true,    // preserve komponen React state (scroll, dll)
      preserveScroll: true,   // jangan scroll ke atas
      only: ['dashboardData'], // partial reload — hanya minta prop ini
    }
  );
}
```

> **Catatan**: `only: ['dashboardData']` memastikan Inertia hanya me-reload prop `dashboardData`, bukan seluruh page response. Ini membuat reload terasa seamless.

---

## 4. Frontend UI Component Specification

### 4.1 File Structure

```
resources/js/
├── Pages/
│   └── Dashboard.tsx                 # Main page component (Inertia page)
├── Components/
│   └── Dashboard/
│       ├── Header.tsx                # Title, filter badge, reset button
│       ├── WorldMap.tsx              # ECharts scatter/bubble world map
│       ├── QuickFilterBar.tsx        # Country filter buttons row
│       ├── MetricCard.tsx            # Single metric card
│       ├── MetricCardsRow.tsx        # 3-column metric cards wrapper
│       ├── TopUrlsChart.tsx          # ECharts horizontal bar chart
│       └── DailyTrafficChart.tsx     # ECharts line chart
├── types/
│   └── dashboard.ts                  # TypeScript interfaces (§2.4)
└── utils/
    └── registerWorldMap.ts           # ECharts world map GeoJSON registration
```

### 4.2 Layout Wireframe / Grid Specification

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER                                                          │
│  ┌────────────────────────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ 📊 Web Analytics Dashboard │  │ 🇺🇸 US    │  │ ✕ Reset     │ │
│  │    (Title)                 │  │ (Badge)   │  │ (Button)    │ │
│  └────────────────────────────┘  └──────────┘  └──────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│  WORLD SCATTER MAP                                [full-width]   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                                                              ││
│  │                    🌍 ECharts World Map                       ││
│  │              (Scatter/Bubble overlay on map)                  ││
│  │           Click any bubble → triggers country filter          ││
│  │                                                              ││
│  │                     Height: 400–480px                         ││
│  │                                                              ││
│  └──────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│  QUICK FILTER BUTTONS                             [full-width]   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│  │ ALL  │ │  IR  │ │  US  │ │  FR  │ │  DE  │ │  RU  │ │  CN  ││
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│
│  (Tombol aktif: bg-blue-600 text-white, lainnya: bg-gray-200)   │
├──────────────────────────────────────────────────────────────────┤
│  METRIC CARDS ROW              [3-column grid, gap-6]            │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│  │ 📈 Total      │ │ 🤖 Bot        │ │ ⚡ Peak       │          │
│  │ Requests      │ │ Proportion    │ │ RPS           │          │
│  │               │ │               │ │               │          │
│  │   124,958     │ │     25.0%     │ │    847.5      │          │
│  │               │ │               │ │   req/sec     │          │
│  └───────────────┘ └───────────────┘ └───────────────┘          │
├──────────────────────────────────────────────────────────────────┤
│  BOTTOM CHARTS ROW             [2-column grid, gap-6]            │
│  ┌─────────────────────────┐ ┌─────────────────────────┐        │
│  │ 🏆 Top 5 URLs           │ │ 📅 Daily Traffic        │        │
│  │ (Horizontal Bar Chart) │ │ (Line Chart with area)  │        │
│  │                         │ │                         │        │
│  │ /api/v1/users ████████ │ │     ╱╲    ╱╲            │        │
│  │ /             ██████   │ │   ╱    ╲╱    ╲          │        │
│  │ /login        █████    │ │  ╱              ╲       │        │
│  │ /api/products ████     │ │ ╱                ╲      │        │
│  │ /assets/logo  ███      │ │                         │        │
│  │                         │ │  Nov1  Nov3  Nov5 Nov7 │        │
│  │   Height: 300px         │ │   Height: 300px        │        │
│  └─────────────────────────┘ └─────────────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Component Specifications

#### 4.3.1 `Dashboard.tsx` — Main Page

```typescript
import { Head, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { DashboardProps } from '@/types/dashboard';
import { registerWorldMap } from '@/utils/registerWorldMap';
import Header from '@/Components/Dashboard/Header';
import WorldMap from '@/Components/Dashboard/WorldMap';
import QuickFilterBar from '@/Components/Dashboard/QuickFilterBar';
import MetricCardsRow from '@/Components/Dashboard/MetricCardsRow';
import TopUrlsChart from '@/Components/Dashboard/TopUrlsChart';
import DailyTrafficChart from '@/Components/Dashboard/DailyTrafficChart';

export default function Dashboard({ dashboardData }: DashboardProps) {
  const activeFilter = dashboardData.filter_country;
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    registerWorldMap().then(() => setMapReady(true));
  }, []);

  return (
    <>
      <Head title="Web Analytics Dashboard" />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Header activeFilter={activeFilter} />
          {mapReady && (
            <WorldMap geoScatter={dashboardData.geo_scatter} activeFilter={activeFilter} />
          )}
          <QuickFilterBar activeFilter={activeFilter} />
          <MetricCardsRow metrics={dashboardData.metrics} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopUrlsChart topUrls={dashboardData.top_urls} />
            <DailyTrafficChart dailyTraffic={dashboardData.daily_traffic} />
          </div>
        </div>
      </div>
    </>
  );
}
```

#### 4.3.2 `Header.tsx`

```typescript
import { router } from '@inertiajs/react';

interface HeaderProps {
  activeFilter: string;
}

export default function Header({ activeFilter }: HeaderProps) {
  const handleReset = () => {
    router.get('/dashboard', {}, { preserveScroll: true });
  };

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
        📊 Web Analytics Dashboard
      </h1>
      <div className="flex items-center gap-3">
        {activeFilter !== 'ALL' && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            🌍 {activeFilter}
          </span>
        )}
        {activeFilter !== 'ALL' && (
          <button
            onClick={handleReset}
            className="px-3 py-1 text-sm rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700 transition"
          >
            ✕ Reset
          </button>
        )}
      </div>
    </div>
  );
}
```

#### 4.3.3 `WorldMap.tsx`

```typescript
import ReactECharts from 'echarts-for-react';
import { router } from '@inertiajs/react';
import type { GeoScatterItem } from '@/types/dashboard';

// PENTING: ECharts world map JSON harus di-register sebelum komponen ini digunakan.
// Registrasi dilakukan di Dashboard.tsx via registerWorldMap() utility.

interface WorldMapProps {
  geoScatter: GeoScatterItem[];
  activeFilter: string;
}

export default function WorldMap({ geoScatter, activeFilter }: WorldMapProps) {
  const maxCount = Math.max(...geoScatter.map((g) => g.request_count), 1);

  const handleChartClick = (params: any) => {
    if (params.data && params.data.country_code) {
      const cc = params.data.country_code;
      router.get(
        '/dashboard',
        { country_code: cc },
        { preserveState: true, preserveScroll: true, only: ['dashboardData'] }
      );
    }
  };

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data;
        return `<strong>${d.country_name}</strong> (${d.country_code})<br/>Requests: ${d.request_count.toLocaleString()}`;
      },
    },
    geo: {
      map: 'world',
      roam: true,
      silent: false,
      itemStyle: {
        areaColor: '#e0e7ef',
        borderColor: '#c4cdd5',
      },
      emphasis: {
        itemStyle: {
          areaColor: '#cbd5e1',
        },
      },
    },
    series: [
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        data: geoScatter.map((item) => ({
          name: item.country_name,
          value: [item.lng, item.lat, item.request_count],
          country_code: item.country_code,
          country_name: item.country_name,
          request_count: item.request_count,
          symbolSize: Math.max(8, (item.request_count / maxCount) * 50),
        })),
        itemStyle: {
          color: '#3b82f6',
          opacity: 0.75,
        },
        emphasis: {
          itemStyle: {
            color: '#1d4ed8',
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
          },
        },
      },
    ],
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
      <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">
        🌍 Request Distribution by Country
      </h2>
      <ReactECharts
        option={option}
        style={{ height: '450px', width: '100%' }}
        onEvents={{ click: handleChartClick }}
      />
    </div>
  );
}
```

> **Catatan Penting tentang ECharts World Map**: ECharts membutuhkan file GeoJSON `world.json` yang harus di-register secara manual. Opsi:
>
> 1. Download `world.json` dari [echarts asset repo](https://github.com/apache/echarts/tree/master/test/data/map/json) dan simpan di `resources/js/assets/world.json`.
> 2. Import dan register: `import worldJson from '@/assets/world.json'; echarts.registerMap('world', worldJson);`
> 3. Lakukan registrasi ini di file entry point atau di `WorldMap.tsx` sebelum render.

#### 4.3.4 `QuickFilterBar.tsx`

```typescript
import { router } from '@inertiajs/react';

interface QuickFilterBarProps {
  activeFilter: string;
}

const FILTER_OPTIONS = ['ALL', 'IR', 'US', 'FR', 'DE', 'RU', 'CN'];

export default function QuickFilterBar({ activeFilter }: QuickFilterBarProps) {
  const handleFilter = (code: string) => {
    router.get(
      '/dashboard',
      code === 'ALL' ? {} : { country_code: code },
      { preserveState: true, preserveScroll: true, only: ['dashboardData'] }
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_OPTIONS.map((code) => (
        <button
          key={code}
          onClick={() => handleFilter(code)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeFilter === code
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
```

#### 4.3.5 `MetricCard.tsx` & `MetricCardsRow.tsx`

```typescript
// ─── MetricCard.tsx ───

interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
  colorClass?: string;
}

export default function MetricCard({ icon, label, value, subtitle, colorClass = 'text-blue-600' }: MetricCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
```

```typescript
// ─── MetricCardsRow.tsx ───

import MetricCard from './MetricCard';
import type { Metrics } from '@/types/dashboard';

interface MetricCardsRowProps {
  metrics: Metrics;
}

export default function MetricCardsRow({ metrics }: MetricCardsRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <MetricCard
        icon="📈"
        label="Total Requests"
        value={metrics.total_requests.toLocaleString()}
        subtitle={`${metrics.unique_ips.toLocaleString()} unique IPs`}
        colorClass="text-blue-600"
      />
      <MetricCard
        icon="🤖"
        label="Bot Proportion"
        value={`${(metrics.bot_ratio * 100).toFixed(1)}%`}
        subtitle={`${metrics.bot_requests.toLocaleString()} bot / ${metrics.human_requests.toLocaleString()} human`}
        colorClass="text-amber-600"
      />
      <MetricCard
        icon="⚡"
        label="Peak RPS"
        value={metrics.peak_rps.toFixed(1)}
        subtitle="requests/second (max)"
        colorClass="text-emerald-600"
      />
    </div>
  );
}
```

#### 4.3.6 `TopUrlsChart.tsx`

```typescript
import ReactECharts from 'echarts-for-react';
import type { TopUrlItem } from '@/types/dashboard';

interface TopUrlsChartProps {
  topUrls: TopUrlItem[];
}

export default function TopUrlsChart({ topUrls }: TopUrlsChartProps) {
  // Reverse untuk ECharts horizontal bar (bottom-to-top rendering)
  const reversed = [...topUrls].reverse();

  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: reversed.map((u) => u.url),
      axisLabel: {
        width: 150,
        overflow: 'truncate',
        ellipsis: '...',
      },
    },
    series: [
      {
        type: 'bar',
        data: reversed.map((u) => u.count),
        itemStyle: {
          color: '#6366f1',
          borderRadius: [0, 4, 4, 0],
        },
        label: {
          show: true,
          position: 'right',
          formatter: (params: any) => params.value.toLocaleString(),
        },
      },
    ],
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
      <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">
        🏆 Top 5 URLs
      </h2>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}
```

#### 4.3.7 `DailyTrafficChart.tsx`

```typescript
import ReactECharts from 'echarts-for-react';
import type { DailyTrafficItem } from '@/types/dashboard';

interface DailyTrafficChartProps {
  dailyTraffic: DailyTrafficItem[];
}

export default function DailyTrafficChart({ dailyTraffic }: DailyTrafficChartProps) {
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0];
        return `${p.axisValue}<br/>Requests: <strong>${p.value.toLocaleString()}</strong>`;
      },
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: dailyTraffic.map((d) => d.date),
      boundaryGap: false,
      axisLabel: {
        rotate: 45,
        formatter: (value: string) => {
          const d = new Date(value);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        },
      },
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        data: dailyTraffic.map((d) => d.requests),
        smooth: true,
        lineStyle: { width: 2, color: '#10b981' },
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.02)' },
            ],
          },
        },
      },
    ],
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
      <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">
        📅 Daily Traffic
      </h2>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}
```

### 4.4 ECharts World Map Registration

Buat file helper untuk registrasi map:

**File**: `resources/js/utils/registerWorldMap.ts`

```typescript
import * as echarts from 'echarts/core';

/**
 * Register ECharts world map GeoJSON.
 * File world.json harus di-download dari:
 * https://cdn.jsdelivr.net/npm/echarts@5/map/json/world.json
 * dan disimpan di resources/js/assets/world.json
 */
export async function registerWorldMap(): Promise<void> {
  const worldJson = await import('@/assets/world.json');
  echarts.registerMap('world', worldJson.default as any);
}
```

---

## 5. Step-by-Step Task Checklist (Execution Plan)

### Phase 1: Environment & Dependency Setup

- [ ] **1.1** Buat project Laravel 11 baru (jika belum ada):
  ```bash
  composer create-project laravel/laravel . "11.*"
  ```
- [ ] **1.2** Install Inertia.js server-side adapter:
  ```bash
  composer require inertiajs/inertia-laravel
  ```
- [ ] **1.3** Setup Inertia middleware — publish dan tambahkan `HandleInertiaRequests` middleware ke `bootstrap/app.php` (Laravel 11 style):
  ```bash
  php artisan inertia:middleware
  ```
  Lalu di `bootstrap/app.php`:
  ```php
  ->withMiddleware(function (Middleware $middleware) {
      $middleware->web(append: [
          \App\Http\Middleware\HandleInertiaRequests::class,
      ]);
  })
  ```
- [ ] **1.4** Setup root Blade template `resources/views/app.blade.php`:
  ```blade
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      @viteReactRefresh
      @vite(['resources/js/app.tsx', 'resources/css/app.css'])
      @inertiaHead
  </head>
  <body>
      @inertia
  </body>
  </html>
  ```
- [ ] **1.5** Install Node.js frontend dependencies:
  ```bash
  npm install react react-dom @types/react @types/react-dom
  npm install @inertiajs/react
  npm install echarts echarts-for-react
  npm install tailwindcss @tailwindcss/vite
  npm install -D typescript @vitejs/plugin-react
  ```
- [ ] **1.6** Konfigurasi `vite.config.ts` untuk React + Laravel:
  ```typescript
  import { defineConfig } from 'vite';
  import laravel from 'laravel-vite-plugin';
  import react from '@vitejs/plugin-react';
  import tailwindcss from '@tailwindcss/vite';

  export default defineConfig({
    plugins: [
      laravel({
        input: ['resources/css/app.css', 'resources/js/app.tsx'],
        refresh: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': '/resources/js',
      },
    },
  });
  ```
- [ ] **1.7** Konfigurasi `tsconfig.json` dengan path alias `@/*` → `resources/js/*`.
- [ ] **1.8** Setup Inertia React entry point `resources/js/app.tsx`:
  ```typescript
  import './bootstrap';
  import '../css/app.css';

  import { createRoot } from 'react-dom/client';
  import { createInertiaApp } from '@inertiajs/react';
  import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';

  createInertiaApp({
    title: (title) => `${title} - Analytics Dashboard`,
    resolve: (name) =>
      resolvePageComponent(
        `./Pages/${name}.tsx`,
        import.meta.glob('./Pages/**/*.tsx')
      ),
    setup({ el, App, props }) {
      const root = createRoot(el);
      root.render(<App {...props} />);
    },
  });
  ```
- [ ] **1.9** Setup Tailwind CSS — `resources/css/app.css`:
  ```css
  @import "tailwindcss";
  ```
- [ ] **1.10** Setup Python virtual environment & install dependencies:
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  pip install geoip2 pandas user-agents
  ```
- [ ] **1.11** Download dan tempatkan file `GeoLite2-Country.mmdb` di `storage/app/GeoLite2-Country.mmdb`. (Dapatkan dari [MaxMind](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data).)
- [ ] **1.12** Tempatkan sample `access.log` di `storage/logs/access.log` untuk testing.
- [ ] **1.13** Download `world.json` GeoJSON dan simpan di `resources/js/assets/world.json`:
  ```bash
  mkdir -p resources/js/assets
  curl -o resources/js/assets/world.json https://cdn.jsdelivr.net/npm/echarts@5/map/json/world.json
  ```
- [ ] **1.14** Tambahkan konfigurasi `.env` untuk analytics paths (lihat §3.4).

### Phase 2: Python Data Processing Script

- [ ] **2.1** Buat direktori `app/Services/Python/`.
- [ ] **2.2** Buat file `app/Services/Python/parse_log.py` sesuai skeleton di §3.1.
- [ ] **2.3** Implementasi fungsi `parse_arguments()` — argparse CLI.
- [ ] **2.4** Implementasi regex parser `LOG_PATTERN` dan loop parse per line.
- [ ] **2.5** Implementasi `lookup_country()` — GeoIP2 reader.
- [ ] **2.6** Implementasi `is_bot()` — `user-agents` library.
- [ ] **2.7** Implementasi `calculate_peak_rps()` — bucket 1-second windows.
- [ ] **2.8** Implementasi aggregasi Pandas: metrics, geo_scatter, top_urls, daily_traffic.
- [ ] **2.9** Implementasi filter `--country_code` — filter EARLY sebelum append ke records.
- [ ] **2.10** Implementasi empty data fallback — return valid JSON skeleton jika 0 records.
- [ ] **2.11** Test script secara standalone:
  ```bash
  python3 app/Services/Python/parse_log.py \
    --log storage/logs/access.log \
    --mmdb storage/app/GeoLite2-Country.mmdb \
    --country_code ALL | python3 -m json.tool
  ```
- [ ] **2.12** Test dengan filter negara spesifik (e.g., `--country_code US`).

### Phase 3: Laravel Route & Controller Integration

- [ ] **3.1** Buat `DashboardController.php`:
  ```bash
  php artisan make:controller DashboardController
  ```
- [ ] **3.2** Implementasi method `index()` sesuai skeleton di §3.2.
- [ ] **3.3** Implementasi method `executePythonScript()` — Symfony Process bridge.
- [ ] **3.4** Tambahkan caching layer (`Cache::remember()`) dengan TTL konfigurabel.
- [ ] **3.5** Tambahkan route di `routes/web.php` sesuai §3.3.
- [ ] **3.6** Tambahkan config `services.analytics` sesuai §3.4.
- [ ] **3.7** Test endpoint via browser/curl:
  ```bash
  curl http://localhost:8000/dashboard
  curl "http://localhost:8000/dashboard?country_code=US"
  ```
- [ ] **3.8** Pastikan error handling — log Python errors, return graceful error jika script fail.

### Phase 4: Frontend React TSX Component Development

- [ ] **4.1** Buat file `resources/js/types/dashboard.ts` — TypeScript interfaces sesuai §2.4.
- [ ] **4.2** Buat `resources/js/utils/registerWorldMap.ts` — ECharts world map registration helper.
- [ ] **4.3** Buat `resources/js/Pages/Dashboard.tsx` — main Inertia page sesuai §4.3.1.
- [ ] **4.4** Buat `resources/js/Components/Dashboard/Header.tsx` sesuai §4.3.2.
- [ ] **4.5** Buat `resources/js/Components/Dashboard/WorldMap.tsx` sesuai §4.3.3.
- [ ] **4.6** Buat `resources/js/Components/Dashboard/QuickFilterBar.tsx` sesuai §4.3.4.
- [ ] **4.7** Buat `resources/js/Components/Dashboard/MetricCard.tsx` sesuai §4.3.5.
- [ ] **4.8** Buat `resources/js/Components/Dashboard/MetricCardsRow.tsx` sesuai §4.3.5.
- [ ] **4.9** Buat `resources/js/Components/Dashboard/TopUrlsChart.tsx` sesuai §4.3.6.
- [ ] **4.10** Buat `resources/js/Components/Dashboard/DailyTrafficChart.tsx` sesuai §4.3.7.
- [ ] **4.11** Verifikasi seluruh komponen render tanpa error — `npm run dev` + `php artisan serve`.

### Phase 5: Interactivity, Filter Routing & Edge Case Handling

- [ ] **5.1** Implementasi ECharts `click` event di `WorldMap.tsx` → trigger `router.get()` dengan country filter.
- [ ] **5.2** Implementasi Quick Filter buttons → `router.get()` sesuai §3.5.
- [ ] **5.3** Implementasi Reset button di `Header.tsx` → `router.get('/dashboard', {})`.
- [ ] **5.4** Pastikan `preserveState: true` dan `preserveScroll: true` pada semua filter navigations.
- [ ] **5.5** Implementasi `only: ['dashboardData']` partial reload pada semua filter calls.
- [ ] **5.6** Handle edge case: filter negara yang tidak ada di data → harus return empty metrics (bukan crash).
- [ ] **5.7** Handle edge case: file `access.log` kosong → harus render dashboard kosong (0 di semua metric).
- [ ] **5.8** Handle edge case: file `.mmdb` tidak ditemukan → Python script harus graceful error, Laravel catch dan log.
- [ ] **5.9** Handle edge case: Python script timeout (> 120s) → Laravel catch `ProcessTimedOutException`, return error page.
- [ ] **5.10** Tambahkan loading indicator (opsional) — gunakan Inertia `usePage().props` atau `router.on('start')` / `router.on('finish')` events untuk show/hide loading spinner saat filter sedang diproses.

### Phase 6: Testing & Optimization

- [ ] **6.1** Test full flow end-to-end: load page → lihat semua chart → klik map → filter applied → klik reset → kembali ke ALL.
- [ ] **6.2** Test dengan log file besar (>100K baris) — ukur waktu Python script.
- [ ] **6.3** Jika Python script > 10s, pertimbangkan:
  - [ ] **6.3.1** Pre-process log ke file JSON cache di disk (cronjob/artisan command).
  - [ ] **6.3.2** Gunakan `Polars` sebagai pengganti `Pandas` untuk performa 5-10x lebih cepat.
  - [ ] **6.3.3** Implementasi `Cache::remember()` per country_code dengan TTL 5–15 menit.
- [ ] **6.4** Verifikasi responsive layout — test di viewport mobile (375px), tablet (768px), desktop (1280px+).
- [ ] **6.5** Verifikasi dark mode — pastikan semua komponen memiliki `dark:` Tailwind class.
- [ ] **6.6** Code quality check:
  - [ ] TypeScript: `npx tsc --noEmit` — zero errors.
  - [ ] PHP: `php artisan route:list` — route terdaftar benar.
  - [ ] Python: `python3 -m py_compile app/Services/Python/parse_log.py` — no syntax errors.
- [ ] **6.7** Final review: pastikan tidak ada hardcoded path — semua path configurable via `.env`.

---

## Appendix

### A. Directory Structure (Final)

```
abd-project/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── DashboardController.php
│   │   └── Middleware/
│   │       └── HandleInertiaRequests.php
│   └── Services/
│       └── Python/
│           └── parse_log.py
├── config/
│   └── services.php                          # (append analytics config)
├── resources/
│   ├── css/
│   │   └── app.css                           # Tailwind imports
│   ├── js/
│   │   ├── app.tsx                           # Inertia entry point
│   │   ├── assets/
│   │   │   └── world.json                    # ECharts world GeoJSON
│   │   ├── Components/
│   │   │   └── Dashboard/
│   │   │       ├── Header.tsx
│   │   │       ├── WorldMap.tsx
│   │   │       ├── QuickFilterBar.tsx
│   │   │       ├── MetricCard.tsx
│   │   │       ├── MetricCardsRow.tsx
│   │   │       ├── TopUrlsChart.tsx
│   │   │       └── DailyTrafficChart.tsx
│   │   ├── Pages/
│   │   │   └── Dashboard.tsx
│   │   ├── types/
│   │   │   └── dashboard.ts
│   │   └── utils/
│   │       └── registerWorldMap.ts
│   └── views/
│       └── app.blade.php                     # Inertia root template
├── routes/
│   └── web.php
├── storage/
│   ├── app/
│   │   └── GeoLite2-Country.mmdb
│   └── logs/
│       └── access.log                        # Sample / production log
├── .env
├── ARCH_PLAN.md                              # ← THIS FILE
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### B. Key Dependencies Summary

| Ecosystem | Package               | Version   | Purpose                            |
| --------- | --------------------- | --------- | ---------------------------------- |
| PHP       | `laravel/framework`   | `^11.0`   | Backend framework                  |
| PHP       | `inertiajs/inertia-laravel` | `^1.0` | Server-side Inertia adapter      |
| Node      | `react`               | `^18.0`   | UI library                         |
| Node      | `react-dom`           | `^18.0`   | React DOM renderer                 |
| Node      | `@inertiajs/react`    | `^1.0`    | Client-side Inertia adapter        |
| Node      | `echarts`             | `^5.5`    | Charting library                   |
| Node      | `echarts-for-react`   | `^3.0`    | React wrapper for ECharts          |
| Node      | `tailwindcss`         | `^4.0`    | Utility-first CSS                  |
| Node      | `@tailwindcss/vite`   | `^4.0`    | Tailwind Vite plugin               |
| Node      | `typescript`          | `^5.0`    | Type safety                        |
| Node      | `@vitejs/plugin-react`| `^4.0`    | Vite React plugin (JSX transform)  |
| Python    | `geoip2`              | `^4.0`    | MaxMind GeoIP2 database reader     |
| Python    | `pandas`              | `^2.0`    | Data manipulation & aggregation    |
| Python    | `user-agents`         | `^2.2`    | User-agent string parsing / bot detection |

### C. Environment Variables

| Variable               | Example Value                      | Description                        |
| ---------------------- | ---------------------------------- | ---------------------------------- |
| `ANALYTICS_LOG_PATH`   | `/var/log/nginx/access.log`        | Path ke file access log            |
| `ANALYTICS_MMDB_PATH`  | `/path/to/GeoLite2-Country.mmdb`   | Path ke MaxMind GeoIP database     |
| `ANALYTICS_CACHE_TTL`  | `300`                              | Cache TTL dalam detik (default: 5 menit) |

---

> **Dokumen ini dirancang agar coding executor AI dapat langsung mengimplementasikan seluruh system tanpa ambiguitas.** Setiap section menyediakan spesifikasi lengkap, code skeleton, dan checklist yang actionable.
