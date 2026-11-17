import { router } from '@inertiajs/react';
import * as echarts from 'echarts';
import ReactECharts from 'echarts-for-react';
import {
    Activity,
    BarChart2,
    Bot,
    ChevronUp,
    ChevronsUpDown,
    Filter,
    Globe,
    RotateCcw,
    Search,
    Zap,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import worldJson from '../assets/world.json';

// Register world map once at module level
echarts.registerMap('world', worldJson as Parameters<typeof echarts.registerMap>[1]);

// ─── Types ───────────────────────────────────────────────────────────────────

type Metrics = {
    total_requests: number;
    bot_percentage: number;
    peak_rps: number;
    unique_ips: number;
    bot_requests: number;
    human_requests: number;
};

type MapPoint = {
    name: string;
    value: [number, number, number]; // [lng, lat, count]
    countryCode: string;
};

type UrlRow = { url: string; count: number };
type DayRow = { date: string; count: number };

type IsolationRow = {
    id: string;
    timestamp: string;
    ip: string;
    countryCode: string;
    method: string;
    url: string;
    statusCode: number;
    requestRate: number;
    bytesSent: number;
    userAgent: string;
    prediction: number; // -1 = anomali, 1 = normal
    anomalyScore: number;
    clusterLabel: string;
};

type Props = {
    selectedCountry: string;
    mapData: MapPoint[];
    metrics: Metrics;
    topUrls: UrlRow[];
    dailyTraffic: DayRow[];
    isolationForest: IsolationRow[];
    error: string | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const QUICK_FILTERS = [
    { code: 'ALL', label: 'ALL' },
    { code: 'IR', label: 'IR · Iran' },
    { code: 'US', label: 'US · United States' },
    { code: 'FR', label: 'FR · France' },
    { code: 'DE', label: 'DE · Germany' },
    { code: 'RU', label: 'RU · Russia' },
    { code: 'CN', label: 'CN · China' },
];

const ONLY_PARTIAL = ['selectedCountry', 'metrics', 'topUrls', 'dailyTraffic', 'isolationForest', 'error'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNumber(n: number | string): string {
    if (typeof n === 'string') return n;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} jt`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)} rb`;
    return n.toLocaleString('id-ID');
}

function fmtPct(n: number | string): string {
    if (typeof n === 'string') return n.endsWith('%') ? n : `${n}%`;
    return `${Number(n.toFixed(1))}%`;
}

function fmtRps(n: number | string): string {
    if (typeof n === 'string') return n.includes('req') ? n : `${n} req/detik`;
    return `${n.toFixed(1)} req/detik`;
}

function fmtBytes(b: number): string {
    if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(2)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
}

function fmtAxisNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('id-ID');
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard({
    selectedCountry,
    mapData,
    metrics,
    topUrls,
    dailyTraffic,
    isolationForest,
    error,
}: Props) {
    const country = (selectedCountry || 'ALL').toUpperCase();
    const isFiltered = country !== 'ALL';

    // Isolation Forest table state
    const [filterLabel, setFilterLabel] = useState<'ALL' | 'ANOMALY' | 'NORMAL'>('ALL');
    const [search, setSearch] = useState('');
    const [sortAsc, setSortAsc] = useState(true);

    // World map is registered at module level via echarts.registerMap above

    // ── Navigation helpers ──────────────────────────────────────────────────
    const navigateTo = useCallback(
        (code: string) => {
            router.get(
                '/dashboard',
                code === 'ALL' ? {} : { country: code },
                {
                    only: ONLY_PARTIAL,
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                },
            );
        },
        [],
    );

    const resetFilter = useCallback(() => navigateTo('ALL'), [navigateTo]);

    // ── Map option ─────────────────────────────────────────────────────────
    const mapOption = useMemo<echarts.EChartsOption>(() => {
        const maxVal = Math.max(...mapData.map((d) => d.value[2] ?? 0), 1);
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(15,23,42,0.96)',
                borderColor: 'rgba(51,65,85,0.8)',
                borderWidth: 1,
                padding: [10, 14],
                textStyle: { color: '#f8fafc', fontSize: 12 },
                formatter: (params: any) => {
                    if (!params.data) return '';
                    const [lng, lat, cnt] = params.data.value ?? [0, 0, 0];
                    const cc = params.data.countryCode ?? '-';
                    return `
                        <div style="min-width:170px">
                          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px">
                            <span style="font-weight:600;font-size:13px;color:#f8fafc">${params.data.name}</span>
                            <span style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#38bdf8">${cc}</span>
                          </div>
                          <div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-bottom:2px">
                            <span>Volume Request</span>
                            <span style="font-family:IBM Plex Mono,monospace;color:#f1f5f9;font-weight:600">${Number(cnt).toLocaleString('id-ID')}</span>
                          </div>
                          <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b">
                            <span>Koordinat</span>
                            <span style="font-family:IBM Plex Mono,monospace">${Number(lat).toFixed(2)}°, ${Number(lng).toFixed(2)}°</span>
                          </div>
                          <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(51,65,85,0.6);font-size:11px;color:#38bdf8">
                            Klik gelembung untuk filter negara ${cc}
                          </div>
                        </div>`;
                },
            },
            geo: {
                map: 'world',
                roam: true,
                zoom: 1.18,
                center: [15, 22],
                scaleLimit: { min: 1, max: 6 },
                silent: false,
                itemStyle: {
                    areaColor: '#1e293b',
                    borderColor: '#334155',
                    borderWidth: 0.8,
                },
                emphasis: {
                    disabled: true,
                    itemStyle: { areaColor: '#1e293b' },
                },
            },
            series: [
                {
                    name: 'Access Volume',
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    data: mapData.map((d) => {
                        const isSelected = country !== 'ALL' && d.countryCode.toUpperCase() === country;
                        return {
                            ...d,
                            itemStyle: {
                                color: isSelected
                                    ? '#38bdf8'
                                    : country === 'ALL'
                                      ? 'rgba(56,189,248,0.72)'
                                      : 'rgba(148,163,184,0.35)',
                                borderColor: isSelected ? '#e0f2fe' : '#38bdf8',
                                borderWidth: isSelected ? 2 : 1.2,
                                shadowBlur: isSelected ? 18 : 8,
                                shadowColor: isSelected
                                    ? 'rgba(56,189,248,0.65)'
                                    : 'rgba(56,189,248,0.25)',
                            },
                        };
                    }),
                    symbolSize: (val: number[]) => {
                        const count = val?.[2] ?? 0;
                        const n = Math.sqrt(count / maxVal);
                        return Math.max(12, Math.min(46, Math.round(10 + n * 36)));
                    },
                    encode: { lng: 0, lat: 1, value: 2 },
                    label: {
                        show: true,
                        formatter: (p: any) => p.data.countryCode,
                        position: 'inside',
                        color: '#0f172a',
                        fontWeight: 700,
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: 10,
                    },
                    emphasis: {
                        scale: 1.2,
                        itemStyle: { color: '#38bdf8', borderColor: '#ffffff', borderWidth: 2 },
                    },
                },
                {
                    name: 'Selected Highlight',
                    type: 'effectScatter',
                    coordinateSystem: 'geo',
                    zlevel: 2,
                    rippleEffect: { brushType: 'stroke', scale: 3.2, period: 4 },
                    symbolSize: (val: number[]) => {
                        const count = val?.[2] ?? 0;
                        const n = Math.sqrt(count / maxVal);
                        return Math.max(14, Math.min(48, Math.round(12 + n * 36)));
                    },
                    itemStyle: { color: '#38bdf8', shadowBlur: 12, shadowColor: 'rgba(56,189,248,0.8)' },
                    data:
                        country === 'ALL'
                            ? mapData.slice(0, 3)
                            : mapData.filter((d) => d.countryCode.toUpperCase() === country),
                },
            ],
        };
    }, [mapData, country]);

    const mapEvents = useMemo(
        () => ({
            click: (params: any) => {
                const cc = params?.data?.countryCode;
                if (cc) navigateTo(cc);
            },
        }),
        [navigateTo],
    );

    // ── Top URLs bar chart ─────────────────────────────────────────────────
    const urlOption = useMemo<echarts.EChartsOption>(() => {
        const sorted = [...(topUrls ?? [])].sort((a, b) => b.count - a.count).slice(0, 5).reverse();
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(15,23,42,0.96)',
                borderColor: 'rgba(51,65,85,0.8)',
                borderWidth: 1,
                textStyle: { color: '#f8fafc', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 },
                formatter: (params: any) => {
                    const p = Array.isArray(params) ? params[0] : params;
                    if (!p) return '';
                    return `
                        <div>
                          <div style="color:#94a3b8;font-size:11px;margin-bottom:4px">Endpoint URL</div>
                          <div style="color:#f8fafc;font-weight:600;margin-bottom:6px">${p.name}</div>
                          <div style="color:#38bdf8;font-weight:600">${Number(p.value).toLocaleString('id-ID')} requests</div>
                        </div>`;
                },
            },
            grid: { top: 12, right: 68, bottom: 24, left: 12, containLabel: true },
            xAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: 'rgba(51,65,85,0.45)', type: 'dashed' } },
                axisLabel: {
                    color: '#94a3b8',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    formatter: fmtAxisNum,
                },
            },
            yAxis: {
                type: 'category',
                data: sorted.map((u) => u.url),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    color: '#e2e8f0',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    width: 175,
                    overflow: 'truncate',
                },
            },
            series: [
                {
                    name: 'Requests',
                    type: 'bar',
                    barWidth: 18,
                    data: sorted.map((u, i) => ({
                        value: u.count,
                        itemStyle: {
                            borderRadius: [0, 4, 4, 0],
                            color: i === sorted.length - 1 ? '#38bdf8' : 'rgba(56,189,248,0.65)',
                        },
                    })),
                    label: {
                        show: true,
                        position: 'right',
                        color: '#cbd5e1',
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: 11,
                        formatter: (p: any) => fmtAxisNum(Number(p.value)),
                    },
                },
            ],
        };
    }, [topUrls]);

    // ── Daily traffic line chart ───────────────────────────────────────────
    const trafficOption = useMemo<echarts.EChartsOption>(() => {
        const data = dailyTraffic ?? [];
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(15,23,42,0.96)',
                borderColor: 'rgba(51,65,85,0.8)',
                borderWidth: 1,
                textStyle: { color: '#f8fafc', fontSize: 12 },
                formatter: (params: any) => {
                    const p = Array.isArray(params) ? params[0] : params;
                    if (!p) return '';
                    return `
                        <div>
                          <div style="color:#94a3b8;font-size:11px;margin-bottom:3px">Tanggal: ${p.axisValue}</div>
                          <div style="font-family:IBM Plex Mono,monospace;color:#38bdf8;font-weight:600;font-size:13px">
                            ${Number(p.value).toLocaleString('id-ID')} req/hari
                          </div>
                        </div>`;
                },
            },
            grid: { top: 20, right: 20, bottom: 28, left: 14, containLabel: true },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: data.map((d) => d.date),
                axisLine: { lineStyle: { color: '#334155' } },
                axisTick: { show: false },
                axisLabel: {
                    color: '#94a3b8',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    margin: 12,
                },
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: 'rgba(51,65,85,0.45)', type: 'dashed' } },
                axisLabel: {
                    color: '#94a3b8',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 11,
                    formatter: fmtAxisNum,
                },
            },
            series: [
                {
                    name: 'Trafik Harian',
                    type: 'line',
                    smooth: 0.3,
                    symbol: 'circle',
                    symbolSize: 7,
                    data: data.map((d) => d.count),
                    lineStyle: { width: 2.5, color: '#38bdf8' },
                    itemStyle: { color: '#0f172a', borderColor: '#38bdf8', borderWidth: 2 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(56,189,248,0.28)' },
                            { offset: 1, color: 'rgba(56,189,248,0.01)' },
                        ]),
                    },
                },
            ],
        };
    }, [dailyTraffic]);

    // ── Isolation Forest table ─────────────────────────────────────────────
    const isoRows = useMemo(() => {
        const base = isolationForest ?? [];
        const countryFiltered = country === 'ALL' ? base : base.filter((r) => r.countryCode.toUpperCase() === country);
        const q = search.trim().toLowerCase();
        return [...countryFiltered]
            .filter((r) => {
                if (filterLabel === 'ANOMALY' && r.prediction !== -1) return false;
                if (filterLabel === 'NORMAL' && r.prediction !== 1) return false;
                if (!q) return true;
                return (
                    r.ip.toLowerCase().includes(q) ||
                    r.url.toLowerCase().includes(q) ||
                    r.clusterLabel.toLowerCase().includes(q) ||
                    r.userAgent.toLowerCase().includes(q) ||
                    r.countryCode.toLowerCase().includes(q) ||
                    r.id.toLowerCase().includes(q)
                );
            })
            .sort((a, b) => (sortAsc ? a.anomalyScore - b.anomalyScore : b.anomalyScore - a.anomalyScore));
    }, [isolationForest, country, filterLabel, search, sortAsc]);

    const isoStats = useMemo(() => {
        const base =
            country === 'ALL'
                ? (isolationForest ?? [])
                : (isolationForest ?? []).filter((r) => r.countryCode.toUpperCase() === country);
        return {
            total: base.length,
            anomalyCount: base.filter((r) => r.prediction === -1).length,
            normalCount: base.filter((r) => r.prediction === 1).length,
        };
    }, [isolationForest, country]);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            {/* ── Header ── */}
            <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-sm">
                <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <Activity className="h-5 w-5 shrink-0 text-sky-400" />
                        <h1 className="truncate text-lg font-bold tracking-tight text-slate-50 sm:text-xl">
                            Web Access Log Analytics
                        </h1>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => navigateTo(country)}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-xs font-medium text-slate-200 tabular-nums transition-colors hover:border-slate-700"
                            title="Status filter negara saat ini"
                        >
                            <Filter className="h-3.5 w-3.5 text-sky-400" />
                            <span>Filter: {country}</span>
                        </button>
                        {isFiltered && (
                            <button
                                type="button"
                                onClick={resetFilter}
                                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Reset Filter</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
                {/* ── Error Banner ── */}
                {error && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                        ⚠️ {error}
                    </div>
                )}

                {/* ── Section 1: World Map ── */}
                <section className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-5 sm:p-6">
                    <div className="flex flex-col justify-between gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center">
                        <div>
                            <h2 className="text-base font-semibold text-slate-100 sm:text-lg">
                                Distribusi Geografis Request Global
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
                                Klik gelembung negara pada peta atau tombol di bawah untuk memfilter metrik dan grafik
                                melalui Inertia router
                                <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-slate-300">
                                    {mapData.length} lokasi terdeteksi
                                </span>
                            </p>
                        </div>
                        <div className="shrink-0 font-mono text-xs tabular-nums text-slate-400">
                            <span>Cakupan: </span>
                            <span className="font-semibold text-sky-400">
                                {country === 'ALL' ? 'Global (Semua Negara)' : `Negara ${country}`}
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 h-[360px] w-full overflow-hidden rounded-lg border border-slate-800/60 bg-slate-950/60 sm:h-[430px]">
                        {mapData.length > 0 ? (
                            <ReactECharts
                                option={mapOption}
                                onEvents={mapEvents}
                                style={{ height: '100%', width: '100%' }}
                                opts={{ renderer: 'canvas' }}
                                notMerge
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">
                                <Globe className="mr-2 h-5 w-5 opacity-50" />
                                Tidak ada data peta. Pastikan access.log terisi.
                            </div>
                        )}
                    </div>

                    {/* Quick Filter Bar */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
                        <span className="text-xs font-medium text-slate-400">Filter Cepat Negara:</span>
                        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filter negara">
                            {QUICK_FILTERS.map((f) => {
                                const active = country === f.code;
                                return (
                                    <button
                                        key={f.code}
                                        type="button"
                                        onClick={() => navigateTo(f.code)}
                                        className={`shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                                            active
                                                ? 'bg-sky-500 font-semibold text-slate-950 shadow-sm'
                                                : 'border border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Section 2: Metric Cards ── */}
                <section
                    aria-label="Ringkasan Metrik Utama"
                    className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3"
                >
                    {/* Total Requests */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/60 p-5">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-400">Total Requests</span>
                            <BarChart2 className="h-4 w-4 shrink-0 text-sky-400" />
                        </div>
                        <div className="mt-3 flex items-baseline justify-between gap-2">
                            <p className="font-mono text-2xl font-bold tracking-tight text-slate-50 tabular-nums sm:text-3xl">
                                {fmtNumber(metrics.total_requests)}
                            </p>
                            <span className="font-mono text-xs tabular-nums text-slate-400">
                                Filter: {country}
                            </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                            Akumulasi seluruh HTTP access log yang tercatat pada periode aktif
                        </p>
                    </div>

                    {/* Proporsi Bot/Crawler */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/60 p-5">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-400">Proporsi Bot/Crawler</span>
                            <Bot className="h-4 w-4 shrink-0 text-amber-400" />
                        </div>
                        <div className="mt-3 flex items-baseline justify-between gap-2">
                            <p className="font-mono text-2xl font-bold tracking-tight text-slate-50 tabular-nums sm:text-3xl">
                                {fmtPct(metrics.bot_percentage)}
                            </p>
                            <span className="font-mono text-xs tabular-nums text-amber-400/90">
                                User-Agent Otomatis
                            </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                            Rasio request dari indeksasi mesin pencari, scraper, dan automated bot
                        </p>
                    </div>

                    {/* Peak RPS */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/60 p-5">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-400">Peak RPS</span>
                            <Zap className="h-4 w-4 shrink-0 text-emerald-400" />
                        </div>
                        <div className="mt-3 flex items-baseline justify-between gap-2">
                            <p className="font-mono text-2xl font-bold tracking-tight text-slate-50 tabular-nums sm:text-3xl">
                                {fmtRps(metrics.peak_rps)}
                            </p>
                            <span className="font-mono text-xs tabular-nums text-emerald-400/90">
                                Beban Puncak
                            </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                            Laju request maksimum per detik yang ditangani web server
                        </p>
                    </div>
                </section>

                {/* ── Section 3: Isolation Forest Table ── */}
                <section
                    aria-label="Hasil Clustering Model Isolation Forest"
                    className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-5 sm:p-6"
                >
                    <div className="flex flex-col justify-between gap-4 border-b border-slate-800/80 pb-4 lg:flex-row lg:items-center">
                        <div>
                            <h2 className="text-base font-semibold text-slate-100 sm:text-lg">
                                Hasil Clustering &amp; Deteksi Anomali Request (Model Isolation Forest)
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-slate-400">
                                <span>Sampel Dievaluasi: {isoStats.total}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-rose-400">Label -1 (Anomali/Outlier): {isoStats.anomalyCount}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-emerald-400">Label +1 (Normal/Inlier): {isoStats.normalCount}</span>
                                <span aria-hidden="true">·</span>
                                <span className="text-sky-400">Negara: {country}</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            {/* Search */}
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Cari IP, URL, atau cluster..."
                                    className="w-52 rounded-lg border border-slate-800 bg-slate-950/90 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none sm:w-60"
                                />
                            </div>
                            {/* Filter tabs */}
                            <div
                                className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/90 p-1"
                                role="group"
                                aria-label="Filter label hasil Isolation Forest"
                            >
                                <button
                                    type="button"
                                    onClick={() => setFilterLabel('ALL')}
                                    className={`shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterLabel === 'ALL' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Semua ({isoStats.total})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterLabel('ANOMALY')}
                                    className={`shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterLabel === 'ANOMALY' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400 hover:text-rose-300'}`}
                                >
                                    Anomali -1 ({isoStats.anomalyCount})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilterLabel('NORMAL')}
                                    className={`shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filterLabel === 'NORMAL' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-emerald-300'}`}
                                >
                                    Normal +1 ({isoStats.normalCount})
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-b border-slate-800 font-mono text-[11px] font-medium text-slate-400">
                                    <th className="whitespace-nowrap py-2.5 pr-4">Waktu &amp; ID</th>
                                    <th className="whitespace-nowrap px-3 py-2.5">IP Address</th>
                                    <th className="whitespace-nowrap px-3 py-2.5">Negara</th>
                                    <th className="whitespace-nowrap px-3 py-2.5">Request Endpoint</th>
                                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Status</th>
                                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Rate (req/mnt)</th>
                                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Payload</th>
                                    <th className="whitespace-nowrap px-3 py-2.5 text-right">
                                        <button
                                            type="button"
                                            onClick={() => setSortAsc((v) => !v)}
                                            className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-slate-300 transition-colors hover:text-sky-400"
                                            title="Urutkan berdasarkan Anomaly Score"
                                        >
                                            <span>Skor IF</span>
                                            {sortAsc ? (
                                                <ChevronUp className="h-3 w-3" />
                                            ) : (
                                                <ChevronsUpDown className="h-3 w-3" />
                                            )}
                                        </button>
                                    </th>
                                    <th className="whitespace-nowrap py-2.5 pl-3">
                                        Hasil Label / Cluster Isolation Forest
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 text-xs">
                                {isoRows.length > 0 ? (
                                    isoRows.map((row) => {
                                        const isAnomaly = row.prediction === -1;
                                        return (
                                            <tr
                                                key={row.id}
                                                className="transition-colors hover:bg-slate-800/35"
                                            >
                                                <td className="whitespace-nowrap py-2.5 pr-4 font-mono tabular-nums">
                                                    <div className="text-slate-200">
                                                        {row.timestamp.split(' ')[1] || row.timestamp}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500">{row.id}</div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-slate-200">
                                                    {row.ip}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigateTo(row.countryCode)}
                                                        className="cursor-pointer font-semibold text-sky-400 hover:underline"
                                                        title={`Filter negara ${row.countryCode}`}
                                                    >
                                                        {row.countryCode}
                                                    </button>
                                                </td>
                                                <td className="max-w-[260px] px-3 py-2.5">
                                                    <div
                                                        className="truncate font-mono text-slate-100"
                                                        title={`${row.method} ${row.url}`}
                                                    >
                                                        <span
                                                            className={`mr-1.5 font-semibold ${
                                                                row.method === 'POST'
                                                                    ? 'text-amber-400'
                                                                    : 'text-sky-400'
                                                            }`}
                                                        >
                                                            {row.method}
                                                        </span>
                                                        <span>{row.url}</span>
                                                    </div>
                                                    <div
                                                        className="mt-0.5 truncate text-[11px] text-slate-500"
                                                        title={row.userAgent}
                                                    >
                                                        {row.userAgent}
                                                    </div>
                                                </td>
                                                <td
                                                    className={`whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium tabular-nums ${
                                                        row.statusCode >= 400
                                                            ? 'text-rose-400'
                                                            : 'text-emerald-400'
                                                    }`}
                                                >
                                                    {row.statusCode}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                                                    {row.requestRate.toLocaleString('id-ID')}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-slate-400">
                                                    {fmtBytes(row.bytesSent)}
                                                </td>
                                                <td
                                                    className={`whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${
                                                        isAnomaly ? 'text-rose-400' : 'text-emerald-400'
                                                    }`}
                                                >
                                                    {row.anomalyScore > 0
                                                        ? `+${row.anomalyScore.toFixed(3)}`
                                                        : row.anomalyScore.toFixed(3)}
                                                </td>
                                                <td className="whitespace-nowrap py-2.5 pl-3">
                                                    <div className="flex items-center gap-2 font-mono text-xs">
                                                        <span
                                                            className={`font-semibold ${isAnomaly ? 'text-rose-400' : 'text-emerald-400'}`}
                                                        >
                                                            {isAnomaly ? 'Label -1 (Anomali)' : 'Label +1 (Normal)'}
                                                        </span>
                                                        <span className="text-slate-600" aria-hidden="true">·</span>
                                                        <span className="font-sans text-slate-300">
                                                            {row.clusterLabel}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={9}
                                            className="py-8 text-center text-sm text-slate-400"
                                        >
                                            Tidak ditemukan data request Isolation Forest yang sesuai dengan filter saat
                                            ini.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── Section 4 & 5: URL Chart + Traffic Chart (side by side) ── */}
                <section className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
                    {/* URL Paling Sering Diminta */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/60 p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
                            <div>
                                <h3 className="text-base font-semibold text-slate-100">
                                    URL Paling Sering Diminta
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-400">
                                    Top 5 endpoint berdasarkan jumlah hit HTTP ({country})
                                </p>
                            </div>
                            <BarChart2 className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                        <div className="mt-4 h-[300px] w-full">
                            {topUrls && topUrls.length > 0 ? (
                                <ReactECharts
                                    option={urlOption}
                                    style={{ height: '100%', width: '100%' }}
                                    opts={{ renderer: 'canvas' }}
                                    notMerge
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                                    Tidak ada data URL untuk filter ini.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Laju Trafik Harian */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/60 p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
                            <div>
                                <h3 className="text-base font-semibold text-slate-100">
                                    Laju Trafik Harian
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-400">
                                    Tren volume request harian sepanjang rentang waktu observasi ({country})
                                </p>
                            </div>
                            <Activity className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                        <div className="mt-4 h-[300px] w-full">
                            {dailyTraffic && dailyTraffic.length > 0 ? (
                                <ReactECharts
                                    option={trafficOption}
                                    style={{ height: '100%', width: '100%' }}
                                    opts={{ renderer: 'canvas' }}
                                    notMerge
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                                    Tidak ada data trafik harian untuk filter ini.
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
