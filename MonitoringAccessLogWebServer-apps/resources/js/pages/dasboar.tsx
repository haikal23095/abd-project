
import { router } from '@inertiajs/react';
 
type Metrics = { total_requests: number; bot_proportion: number; peak_rps: number };
type Country = { code: string; name: string; value: number };
type UrlRow = { url: string; count: number };
type DayRow = { date: string; count: number };
 
type Props = {
    selectedCountry: string | null;
    worldMap: Country[];
    metrics: Metrics;
    topUrls: UrlRow[];
    dailyTraffic: DayRow[];
    error: string | null;
};
 
const only = ['selectedCountry', 'metrics', 'topUrls', 'dailyTraffic', 'error'];
 
export default function Dashboard({
    selectedCountry,
    worldMap,
    metrics,
    topUrls,
    dailyTraffic,
    error,
}: Props) {
    const filter = (country: string | null) =>
        router.get('/dashboard', country ? { country } : {}, {
            only,
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
 
    const cards = [
        { label: 'Total Requests', value: metrics.total_requests.toLocaleString() },
        { label: 'Bot Proportion', value: String(metrics.bot_proportion) },
        { label: 'Peak RPS', value: String(metrics.peak_rps) },
    ];
 
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Web Analytics Dashboard</h1>
                {selectedCountry && (
                    <button
                        onClick={() => filter(null)}
                        className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
                    >
                        Filter: {selectedCountry} ✕
                    </button>
                )}
            </div>
 
            {error && (
                <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
                    {error}
                </div>
            )}
 
            <div className="grid gap-4 sm:grid-cols-3">
                {cards.map((c) => (
                    <div key={c.label} className="rounded-lg border p-4">
                        <div className="text-sm text-gray-500">{c.label}</div>
                        <div className="text-2xl font-bold">{c.value}</div>
                    </div>
                ))}
            </div>
 
            <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-lg border p-4">
                    <h2 className="mb-2 font-semibold">Request per Negara (klik untuk filter)</h2>
                    <ul className="max-h-72 divide-y overflow-auto">
                        {worldMap.map((c) => (
                            <li key={c.code}>
                                <button
                                    onClick={() => filter(c.code)}
                                    className={`flex w-full justify-between px-2 py-1 text-left hover:bg-gray-100 ${
                                        selectedCountry === c.code ? 'bg-gray-100 font-semibold' : ''
                                    }`}
                                >
                                    <span>{c.name} ({c.code})</span>
                                    <span>{c.value.toLocaleString()}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
 
                <section className="rounded-lg border p-4">
                    <h2 className="mb-2 font-semibold">Top URLs</h2>
                    <table className="w-full text-sm">
                        <tbody>
                            {topUrls.map((u) => (
                                <tr key={u.url} className="border-b">
                                    <td className="py-1 pr-2 break-all">{u.url}</td>
                                    <td className="py-1 text-right">{u.count.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>
 
            <section className="rounded-lg border p-4">
                <h2 className="mb-2 font-semibold">Daily Traffic</h2>
                <table className="w-full text-sm">
                    <tbody>
                        {dailyTraffic.map((d) => (
                            <tr key={d.date} className="border-b">
                                <td className="py-1">{d.date}</td>
                                <td className="py-1 text-right">{d.count.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
 