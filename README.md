# 📊 ABD Project — Web Analytics Dashboard

> **Mata Kuliah**: Analisis Big Data (ABD)
> **Tipe Aplikasi**: Single Page Application (SPA) — 1 Halaman Dashboard
> **Status**: 🚧 In Development

---

## 📌 Deskripsi Singkat

Dashboard analitik web yang memvisualisasikan data dari file **Nginx/Apache access log** dan database **GeoIP MaxMind**. Aplikasi ini menampilkan:

- 🌍 **World Scatter Map** — distribusi request per negara (klik untuk filter)
- 📈 **Metric Cards** — Total Requests, Bot Proportion, Peak RPS
- 🏆 **Top 5 URLs** — Bar chart horizontal URL paling sering diakses
- 📅 **Daily Traffic** — Line chart tren traffic harian

> ⚠️ **Dokumentasi arsitektur lengkap ada di [`ARCH_PLAN.md`](./ARCH_PLAN.md)**. Baca file tersebut sebelum mulai coding.

---

## 🛠️ Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| **Data Engine** | Python 3.10+ | Parsing log (regex), GeoIP lookup (`geoip2`), aggregasi (`pandas`), bot detection (`user-agents`) |
| **Backend** | Laravel 11 (PHP 8.2+) | Controller, routing, caching, eksekusi script Python via `Symfony\Process` |
| **Bridge** | Inertia.js | Penghubung Laravel ↔ React (server-side props, tanpa API terpisah) |
| **Frontend** | React 18 + TypeScript | Komponen UI, state management via Inertia props |
| **Styling** | Tailwind CSS 4.x | Utility-first CSS framework |
| **Charts** | Apache ECharts 5.x | World map, bar chart, line chart (via `echarts-for-react`) |

---

## 📁 Struktur Direktori (Target)

```
abd-project/
├── app/
│   ├── Http/Controllers/
│   │   └── DashboardController.php       ← Controller utama
│   └── Services/Python/
│       └── parse_log.py                  ← Script Python parser
├── resources/
│   ├── js/
│   │   ├── Pages/
│   │   │   └── Dashboard.tsx             ← Halaman utama (Inertia page)
│   │   ├── Components/Dashboard/
│   │   │   ├── Header.tsx
│   │   │   ├── WorldMap.tsx
│   │   │   ├── QuickFilterBar.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── MetricCardsRow.tsx
│   │   │   ├── TopUrlsChart.tsx
│   │   │   └── DailyTrafficChart.tsx
│   │   ├── types/
│   │   │   └── dashboard.ts              ← TypeScript interfaces
│   │   ├── utils/
│   │   │   └── registerWorldMap.ts
│   │   └── assets/
│   │       └── world.json                ← ECharts GeoJSON (download)
│   └── views/
│       └── app.blade.php                 ← Inertia root template
├── storage/
│   ├── app/GeoLite2-Country.mmdb         ← MaxMind DB (TIDAK di-commit)
│   └── logs/access.log                   ← File log untuk diproses
├── routes/web.php
├── ARCH_PLAN.md                          ← 📖 Dokumentasi arsitektur lengkap
└── README.md                             ← 📖 File ini
```

---

## 🚀 Cara Setup & Menjalankan

### Prasyarat

- PHP 8.2+ & Composer
- Node.js 18+ & npm
- Python 3.10+ & pip

### 1. Clone & Install Dependencies

```bash
git clone <repo-url> abd-project
cd abd-project

# PHP
composer install

# Node
npm install

# Python
python3 -m venv .venv
source .venv/bin/activate
pip install geoip2 pandas user-agents
```

### 2. Siapkan File Data

| File | Lokasi | Cara Dapat |
|---|---|---|
| `access.log` | `storage/logs/access.log` | Copy dari server / gunakan sample |
| `GeoLite2-Country.mmdb` | `storage/app/GeoLite2-Country.mmdb` | Download dari [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data) |
| `world.json` | `resources/js/assets/world.json` | `curl -o resources/js/assets/world.json https://cdn.jsdelivr.net/npm/echarts@5/map/json/world.json` |

### 3. Konfigurasi Environment

```bash
cp .env.example .env
php artisan key:generate
```

Tambahkan di `.env`:

```env
ANALYTICS_LOG_PATH=/path/ke/access.log
ANALYTICS_MMDB_PATH=/path/ke/GeoLite2-Country.mmdb
ANALYTICS_CACHE_TTL=300
```

### 4. Jalankan

```bash
# Terminal 1 — Laravel
php artisan serve

# Terminal 2 — Vite dev server
npm run dev
```

Buka: **http://localhost:8000/dashboard**

---

## 🔄 Alur Data (Ringkas)

```
access.log + GeoLite2.mmdb
        │
        ▼
   Python parse_log.py  ──→  JSON stdout
        │
        ▼
   Laravel Controller   ──→  Cache + json_decode
        │
        ▼
   Inertia::render()    ──→  Props ke React
        │
        ▼
   Dashboard.tsx        ──→  ECharts (Map, Bar, Line) + Metric Cards
```

---

## 👥 Pembagian Kerja (Referensi)

Untuk menghindari miskomunikasi, berikut pembagian area kerja yang disarankan:

| Area | File Utama | Deskripsi |
|---|---|---|
| **Python / Data** | `app/Services/Python/parse_log.py` | Parsing regex log, GeoIP lookup, bot detection, aggregasi Pandas, output JSON |
| **Laravel / Backend** | `DashboardController.php`, `routes/web.php`, `config/services.php` | Route, controller, eksekusi Python, caching |
| **React / Frontend** | `Dashboard.tsx`, semua file di `Components/Dashboard/` | Layout, komponen chart ECharts, filter interaktif |
| **Setup / Config** | `vite.config.ts`, `app.blade.php`, `app.tsx`, `.env` | Konfigurasi Inertia, Vite, Tailwind |

> 💡 **Tips**: Sebelum mengerjakan bagian masing-masing, baca section yang relevan di [`ARCH_PLAN.md`](./ARCH_PLAN.md). Di sana ada **code skeleton** yang bisa langsung dipakai.

---

## 📖 Referensi Penting

- [`ARCH_PLAN.md`](./ARCH_PLAN.md) — **WAJIB BACA** — Arsitektur lengkap, schema, skeleton code, checklist
- [Laravel 11 Docs](https://laravel.com/docs/11.x)
- [Inertia.js Docs](https://inertiajs.com/)
- [ECharts Examples](https://echarts.apache.org/examples/)
- [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data)

---

## ⚠️ Catatan Penting

1. **JANGAN commit** file `GeoLite2-Country.mmdb` dan `access.log` ke Git (tambahkan ke `.gitignore`).
2. Semua path file data **dikonfigurasi via `.env`**, jangan hardcode.
3. Dashboard ini adalah **1 halaman saja** (Single Page App). Tidak ada halaman lain.
4. Filter negara menggunakan **Inertia partial reload** (bukan full page refresh).
5. Ikuti execution checklist di `ARCH_PLAN.md` **Phase 1–6** secara berurutan.
