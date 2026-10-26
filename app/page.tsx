"use client";

import { useEffect, useRef, useState } from "react";

interface CheckResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  weight: number;
  description: string;
  fix: string;
}

interface BrokenLink {
  page: string;
  target: string;
  status: number | null;
}

interface PageScan {
  url: string;
  score: number;
  checks: CheckResult[];
  ttfbMs: number | null;
  htmlBytes: number;
  renderBlocking: number;
  images: number;
  linksFound: number;
  brokenLinks: BrokenLink[];
}

interface ScanResult {
  url: string;
  score: number;
  checks: CheckResult[];
  pages: PageScan[];
  crawledAt: string;
  pageTitle?: string;
  finalUrl?: string;
  ogImage?: string;
  twitterCard?: string;
  metaDesc?: string;
}

interface HistoryEntry {
  url: string;
  host: string;
  score: number;
  crawledAt: string;
}

const HISTORY_KEY = "openengine:score-history";

function readBrowserHistory(host: string): HistoryEntry[] {
  try {
    const entries = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryEntry[];
    return entries
      .filter((entry) => entry.host === host)
      .sort((a, b) => new Date(a.crawledAt).getTime() - new Date(b.crawledAt).getTime());
  } catch {
    return [];
  }
}

function saveBrowserHistory(result: ScanResult) {
  try {
    const host = new URL(result.url).host;
    const current = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as HistoryEntry[];
    current.push({ url: result.url, host, score: result.score, crawledAt: result.crawledAt });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(current.slice(-500)));
  } catch {
    return;
  }
}

const CATEGORY_ORDER = [
  "Security",
  "Meta Tags",
  "Structure",
  "Mobile",
  "Accessibility",
  "Social",
  "Schema",
  "AI Mode",
  "Generative UI",
  "Trust",
  "Agent Ecosystem",
  "Information Agent",
  "International",
  "Performance",
  "Links",
  "Sitemap",
  "Errors",
];

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function ScoreRing({ score }: { score: number }) {
  const animated = useCountUp(score);
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedPct(score * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const r = 52;
  const circ = 2 * Math.PI * r;

  return (
    <div className="relative h-36 w-36 shrink-0">
      <div
        className="absolute inset-0 rounded-full opacity-30 blur-2xl"
        style={{
          background: `conic-gradient(from 0deg, ${
            score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171"
          }, transparent 70%)`,
          animation: "spin 6s linear infinite",
        }}
      />
      <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-zinc-800" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - animatedPct / 100)}
          className={`${
            score >= 80 ? "stroke-emerald-400" : score >= 50 ? "stroke-amber-400" : "stroke-red-400"
          } transition-colors duration-500`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tabular-nums ${scoreColor(score)}`}>
          {animated}
        </span>
        <span className="text-xs text-zinc-500">/ 100</span>
      </div>
    </div>
  );
}

function ScanningFeed({
  checks,
  revealedCount,
  done,
  pagesScanned,
  pagesTotal,
}: {
  checks: CheckResult[];
  revealedCount: number;
  done: boolean;
  pagesScanned: number;
  pagesTotal: number;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const visible = checks.slice(0, revealedCount);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [revealedCount]);

  return (
    <div className="mx-auto mb-12 max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 font-mono text-xs text-zinc-500">
          aeo-scan — {pagesTotal > 1 ? `page ${pagesScanned}/${pagesTotal}` : "live"}
        </span>
      </div>
      <div ref={feedRef} className="h-48 overflow-y-auto p-4 font-mono text-xs">
        {visible.map((c) => (
          <div key={c.id} className="mb-1.5 flex items-center gap-2 animate-[slideIn_0.3s_ease-out]">
            <span className={c.passed ? "text-emerald-400" : "text-red-400"}>
              {c.passed ? "✓" : "✕"}
            </span>
            <span className="text-zinc-400">{c.name}</span>
            <span className="text-zinc-600">— {c.category}</span>
          </div>
        ))}
        {!done && (
          <div className="mt-1 flex items-center gap-2 text-zinc-500">
            <span className="inline-block h-3.5 w-2 animate-pulse bg-zinc-500" />
            <span className="animate-pulse">scanning…</span>
          </div>
        )}
        {done && (
          <div className="mt-2 text-emerald-400 animate-[slideIn_0.3s_ease-out]">
            ✓ Scan complete
          </div>
        )}
      </div>
    </div>
  );
}

function GooglePreview({ result }: { result: ScanResult }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-white p-4 text-zinc-900">
      <p className="mb-1 truncate text-sm text-zinc-600">{result.url}</p>
      <p className="mb-1 text-lg text-[#1a0dab] hover:underline cursor-pointer">
        {result.pageTitle || result.url}
      </p>
      <p className="text-sm text-zinc-600 line-clamp-2">
        {result.metaDesc || "No meta description found. Add one to control how your page appears in search results."}
      </p>
    </div>
  );
}

function OgPreview({ result }: { result: ScanResult }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700 bg-[#18191a]">
      {result.ogImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.ogImage} alt="OG preview" className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center bg-zinc-800 text-xs text-zinc-500">
          No og:image — add one for a rich preview
        </div>
      )}
      <div className="p-3">
        <p className="text-xs text-zinc-400">{new URL(result.url).hostname}</p>
        <p className="truncate text-sm font-semibold text-zinc-100">
          {result.pageTitle || result.url}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
          {result.metaDesc || "No description"}
        </p>
      </div>
    </div>
  );
}

function TwitterPreview({ result }: { result: ScanResult }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-700 bg-black">
      <div className="flex gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-zinc-200">
          {new URL(result.url).hostname.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">
            {result.pageTitle || new URL(result.url).hostname}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {new URL(result.url).hostname}
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-zinc-700">
            {result.ogImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.ogImage} alt="Twitter card" className="h-28 w-full object-cover" />
            ) : (
              <div className="flex h-28 items-center justify-center bg-zinc-800 text-xs text-zinc-500">
                {result.twitterCard ? `Card type: ${result.twitterCard}` : "No twitter:card set"}
              </div>
            )}
            <div className="p-2">
              <p className="line-clamp-2 text-xs text-zinc-300">{result.metaDesc}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryChart({ host, currentScore }: { host: string; currentScore: number }) {
  const [entries] = useState<HistoryEntry[]>(() => readBrowserHistory(host));

  if (entries.length < 2) return null;

  const W = 560;
  const H = 120;
  const PAD = 8;
  const scores = entries.map((e) => e.score);
  const min = Math.min(...scores, currentScore);
  const max = Math.max(...scores, currentScore);
  const range = max - min || 1;
  const points = entries.map((e, i) => {
    const x = PAD + (i / (entries.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((e.score - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const allPoints = [...points, `${W - PAD},${H - PAD - ((currentScore - min) / range) * (H - PAD * 2)}`];

  return (
    <div className="animate-[fadeUp_0.5s_ease-out]">
      <p className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">
        Score History
      </p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`${PAD},${H - PAD} ${allPoints.join(" ")} ${W - PAD},${H - PAD}`}
            fill="url(#chartFill)"
          />
          <polyline
            points={allPoints.join(" ")}
            fill="none"
            stroke="#818cf8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {entries.map((e, i) => {
            const [x, y] = allPoints[i].split(",").map(Number);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="4" fill="#09090b" stroke="#818cf8" strokeWidth="2" />
                <title>{`${new Date(e.crawledAt).toLocaleDateString()}: ${e.score}/100`}</title>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 flex justify-between text-xs text-zinc-500">
          <span>{new Date(entries[0].crawledAt).toLocaleDateString()}</span>
          <span>
            Trend: {currentScore > entries[0].score ? "↑" : currentScore < entries[0].score ? "↓" : "→"}{" "}
            {currentScore - entries[0].score > 0 ? "+" : ""}
            {currentScore - entries[0].score} pts
          </span>
          <span>{new Date(entries[entries.length - 1].crawledAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function MiniResult({ label, r }: { label: string; r: ScanResult }) {
  const wins = r.score;
  return (
    <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mb-3 truncate text-sm font-medium text-zinc-300">{r.url}</p>
      <p className={`text-5xl font-bold ${scoreColor(wins)}`}>{r.score}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {r.checks.filter((c) => c.passed).length}/{r.checks.length} checks
      </p>
      <div className="mt-4 space-y-1">
        {(["Schema", "AI Mode", "Agent Ecosystem", "Performance", "Links"] as const).map((cat) => {
          const checks = r.checks.filter((c) => c.category === cat);
          if (!checks.length) return null;
          const pct = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
          return (
            <div key={cat} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 text-zinc-500">{cat}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums text-zinc-400">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparePanel() {
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ a: ScanResult; b: ScanResult } | null>(null);

  async function runCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!urlA.trim() || !urlB.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(
        `/api/compare?a=${encodeURIComponent(urlA.trim())}&b=${encodeURIComponent(urlB.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) setError(data.error || "Compare failed");
      else setResults({ a: data.a, b: data.b });
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <h2 className="mb-1 text-lg font-semibold">Competitor Comparison</h2>
      <p className="mb-5 text-sm text-zinc-400">Scan two domains side by side.</p>
      <form onSubmit={runCompare} className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={urlA}
          onChange={(e) => setUrlA(e.target.value)}
          placeholder="yoursite.com"
          className="h-11 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
          disabled={loading}
        />
        <span className="self-center text-zinc-600">vs</span>
        <input
          type="text"
          value={urlB}
          onChange={(e) => setUrlB(e.target.value)}
          placeholder="competitor.com"
          className="h-11 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 placeholder-zinc-500 outline-none focus:border-indigo-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !urlA.trim() || !urlB.trim()}
          className="h-11 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 font-semibold text-white transition-all hover:shadow-[0_0_24px_rgba(99,102,241,0.45)] disabled:opacity-40"
        >
          {loading ? "Scanning…" : "Compare"}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {results && (
        <div className="flex flex-col gap-4 animate-[fadeUp_0.5s_ease-out] sm:flex-row">
          <MiniResult label="Site A" r={results.a} />
          <MiniResult label="Site B" r={results.b} />
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [crawl, setCrawl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [pagesScanned, setPagesScanned] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    timers.current.forEach(clearTimeout);
    setLoading(true);
    setError(null);
    setResult(null);
    setRevealed(0);
    setPhase("scanning");
    setPagesScanned(1);
    try {
      const res = await fetch(`/api/scan?url=${encodeURIComponent(url.trim())}&crawl=${crawl}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scan failed. Please try again.");
        setLoading(false);
        setPhase("idle");
        return;
      }
      setResult(data);
      saveBrowserHistory(data);
      setLoading(false);
      setPagesScanned(data.pages.length);
      data.checks.forEach((_c: CheckResult, i: number) => {
        timers.current.push(setTimeout(() => setRevealed(i + 1), 60 * (i + 1)));
      });
      timers.current.push(
        setTimeout(() => setPhase("done"), 60 * (data.checks.length + 1) + 300),
      );
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
      setPhase("idle");
    }
  }

  function downloadReport() {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`AEO Scan Report — ${result.url}`);
    lines.push(`Score: ${result.score}/100`);
    lines.push(`Pages scanned: ${result.pages.length}`);
    lines.push(`Crawled: ${result.crawledAt}`);
    lines.push("");
    for (const cat of CATEGORY_ORDER) {
      const checks = result.checks.filter((c) => c.category === cat);
      if (checks.length === 0) continue;
      lines.push(`## ${cat}`);
      for (const c of checks) {
        lines.push(`- [${c.passed ? "PASS" : "FAIL"}] ${c.name}: ${c.description}`);
        if (!c.passed) lines.push(`  Fix: ${c.fix}`);
      }
      lines.push("");
    }
    for (const p of result.pages) {
      if (p.brokenLinks.length === 0) continue;
      lines.push(`## Broken Links — ${p.url}`);
      for (const b of p.brokenLinks) {
        lines.push(`- ${b.target} → ${b.status ?? "unreachable"}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aeo-report.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const allBroken = result?.pages.flatMap((p) => p.brokenLinks) ?? [];

  return (
    <main className="relative mx-auto w-full max-w-5xl px-6 py-16">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(ellipse, rgba(99,102,241,0.4), transparent 65%)",
          animation: "breathe 8s ease-in-out infinite",
        }}
      />

      <header className="relative mb-16 text-center">
        <div className="mb-4 inline-block animate-[fadeUp_0.6s_ease-out] rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Free AEO Scan
        </div>
        <h1 className="mb-4 animate-[fadeUp_0.6s_ease-out_0.1s_both] text-4xl font-bold tracking-tight sm:text-5xl">
          Is Your Site Visible to{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            AI?
          </span>
        </h1>
        <p className="mx-auto max-w-2xl animate-[fadeUp_0.6s_ease-out_0.2s_both] text-lg text-zinc-400">
          26-point AEO scan with multi-page crawl, speed audit, broken-link checker, and social previews.
        </p>
      </header>

      <form
        onSubmit={handleScan}
        className="relative mx-auto mb-4 flex max-w-2xl animate-[fadeUp_0.6s_ease-out_0.3s_both] flex-col gap-3"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourwebsite.com"
            className="h-12 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-zinc-100 placeholder-zinc-500 outline-none transition-all focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="group relative h-12 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 font-semibold text-white transition-all hover:shadow-[0_0_24px_rgba(99,102,241,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
          >
            <span className="relative z-10">{loading ? "Scanning…" : "Scan My Site"}</span>
            {loading && (
              <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            )}
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400 select-none">
          <input
            type="checkbox"
            checked={crawl}
            onChange={(e) => setCrawl(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-indigo-500"
            disabled={loading}
          />
          Deep crawl — follow internal links and scan up to 8 pages
        </label>
      </form>

      {error && (
        <div className="relative mx-auto mb-16 max-w-2xl animate-[fadeUp_0.4s_ease-out] rounded-2xl border border-red-900/50 bg-red-950/30 p-6 text-center text-red-300">
          {error}
        </div>
      )}

      {result && phase !== "idle" && (
        <section className="relative mx-auto max-w-4xl">
          <div className="mb-10 animate-[fadeUp_0.5s_ease-out]">
            <div className="flex flex-col items-center gap-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur sm:flex-row">
              <ScoreRing score={result.score} />
              <div className="text-center sm:text-left">
                <p className="mb-1 text-sm text-zinc-500">AEO Score{result.pages.length > 1 ? ` (avg of ${result.pages.length} pages)` : ""}</p>
                <h2 className="mb-2 break-all text-xl font-semibold">{result.url}</h2>
                {result.pageTitle && <p className="mb-3 text-sm text-zinc-400">{result.pageTitle}</p>}
                <div className="mb-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {result.pages[0].ttfbMs !== null && (
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                      TTFB {result.pages[0].ttfbMs}ms
                    </span>
                  )}
                  <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                    {result.pages.reduce((s, p) => s + p.htmlBytes, 0) / 1024 | 0} KB total HTML
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs ${allBroken.length === 0 ? "border-emerald-800 text-emerald-400" : "border-red-800 text-red-400"}`}>
                    {allBroken.length === 0 ? "No broken links" : `${allBroken.length} broken link${allBroken.length > 1 ? "s" : ""}`}
                  </span>
                </div>
                <p className="text-sm text-zinc-500">
                  {result.checks.filter((c) => c.passed).length} of {result.checks.length} checks passed
                </p>
                {phase === "done" && (
                  <div className="mt-4 flex animate-[fadeUp_0.4s_ease-out] justify-center gap-3 sm:justify-start no-print">
                    <button
                      onClick={downloadReport}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                    >
                      Download Report
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                    >
                      Print / PDF
                    </button>
                    <button
                      onClick={() => {
                        setResult(null);
                        setUrl("");
                        setPhase("idle");
                        setRevealed(0);
                      }}
                      className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
                    >
                      Scan Another Site
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {phase === "scanning" && (
            <ScanningFeed
              checks={result.checks}
              revealedCount={revealed}
              done={false}
              pagesScanned={pagesScanned}
              pagesTotal={result.pages.length}
            />
          )}

          {phase === "done" && (
            <>
              <div className="mb-10 grid gap-4 sm:grid-cols-3">
                <div className="animate-[fadeUp_0.5s_ease-out]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Google</p>
                  <GooglePreview result={result} />
                </div>
                <div className="animate-[fadeUp_0.5s_ease-out_0.1s_both]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Facebook / LinkedIn</p>
                  <OgPreview result={result} />
                </div>
                <div className="animate-[fadeUp_0.5s_ease-out_0.2s_both]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">X / Twitter</p>
                  <TwitterPreview result={result} />
                </div>
              </div>

              {allBroken.length > 0 && (
                <div className="mb-10 animate-[fadeUp_0.5s_ease-out]">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    Broken Links ({allBroken.length})
                  </p>
                  <div className="space-y-2">
                    {allBroken.slice(0, 12).map((b, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm">
                        <span className="rounded bg-red-500/20 px-2 py-0.5 font-mono text-xs text-red-400">
                          {b.status ?? "ERR"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-zinc-300">{b.target}</span>
                        <span className="shrink-0 text-xs text-zinc-500">on {new URL(b.page).pathname}</span>
                      </div>
                    ))}
                    {allBroken.length > 12 && (
                      <p className="text-xs text-zinc-500">+ {allBroken.length - 12} more — see full report</p>
                    )}
                  </div>
                </div>
              )}

              <div className="mb-10">
                <HistoryChart key={new URL(result.url).host} host={new URL(result.url).host} currentScore={result.score} />
              </div>

              <div className="space-y-8">
                {CATEGORY_ORDER.map((cat, ci) => {
                  const checks = result.checks.filter((c) => c.category === cat);
                  if (checks.length === 0) return null;
                  const passed = checks.filter((c) => c.passed).length;
                  return (
                    <div key={cat} className="animate-[fadeUp_0.5s_ease-out_both]" style={{ animationDelay: `${ci * 70}ms` }}>
                      <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{cat}</h3>
                        <span className="text-xs text-zinc-500">{passed}/{checks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {checks.map((c, i) => (
                          <div
                            key={c.id}
                            className="group animate-[fadeUp_0.4s_ease-out_both] rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all hover:border-zinc-600 hover:bg-zinc-900"
                            style={{ animationDelay: `${ci * 70 + i * 40}ms` }}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs transition-transform group-hover:scale-110 ${
                                  c.passed ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {c.passed ? "✓" : "✕"}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-4">
                                  <p className="font-medium text-zinc-200">{c.name}</p>
                                  <span className="shrink-0 text-xs text-zinc-500">{c.passed ? "Pass" : "Fail"}</span>
                                </div>
                                <p className="mt-1 text-sm text-zinc-400">{c.description}</p>
                                {!c.passed && (
                                  <p className="mt-2 text-sm text-amber-400/80">Fix: {c.fix}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <ComparePanel />
            </>
          )}
        </section>
      )}

      {phase === "idle" && <ComparePanel />}

      <footer className="relative mt-24 border-t border-zinc-800 pt-8 text-center text-sm text-zinc-600">
        OpenEngine AEO Scanner — Scores reflect publicly detectable signals
      </footer>
    </main>
  );
}
