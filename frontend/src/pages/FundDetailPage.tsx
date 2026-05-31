import { ArrowLeft, Building2, CalendarDays, ChevronDown, Scale, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";
import { money, percent, tone } from "../lib/format";
import type { HistoryPoint, Portfolio } from "../types";

const ranges = [
  ["y", "近1月"],
  ["3y", "近3月"],
  ["6y", "近6月"],
  ["n", "近1年"],
  ["3n", "近3年"],
  ["5n", "近5年"]
];

const chartTick = { fontSize: 12, fill: "#94a3b8" };
const chartLine = { stroke: "rgba(148, 163, 184, .35)" };
const tooltipStyle = { background: "#162332", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, color: "#e2e8f0" };
const portfolioCacheKey = "funds:last-portfolio";

function codeFromLocation() {
  return new URLSearchParams(window.location.search).get("code") ?? "";
}

function readCachedPortfolio(): Portfolio | null {
  try {
    const raw = window.localStorage.getItem(portfolioCacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Portfolio;
    return cached?.summary && Array.isArray(cached.funds) ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedPortfolio(portfolio: Portfolio) {
  try {
    window.localStorage.setItem(portfolioCacheKey, JSON.stringify(portfolio));
  } catch {
    // Cache is only used to make fund switching available before the refresh finishes.
  }
}

export function FundDetailPage() {
  const [initialPortfolio] = useState(() => readCachedPortfolio());
  const [portfolio, setPortfolio] = useState<Portfolio | null>(initialPortfolio);
  const [selectedCode, setSelectedCode] = useState(() => codeFromLocation());
  const [range, setRange] = useState("n");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [positions, setPositions] = useState<{ date: string | null; stocks: Record<string, unknown>[] }>({ date: null, stocks: [] });
  const [history, setHistory] = useState<{ nav: HistoryPoint[]; yield: HistoryPoint[] }>({ nav: [], yield: [] });
  const [loading, setLoading] = useState(() => !initialPortfolio);

  const fund = useMemo(() => portfolio?.funds.find((item) => item.code === selectedCode) ?? portfolio?.funds[0] ?? null, [portfolio, selectedCode]);
  const hasBenchmark = useMemo(() => history.yield.some((point) => point.benchmark_yield !== null && point.benchmark_yield !== undefined), [history.yield]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.portfolio();
      setPortfolio(data);
      writeCachedPortfolio(data);
    } finally {
      setLoading(false);
    }
  }, []);

  function selectFund(code: string) {
    setSelectedCode(code);
    window.history.pushState(null, "", `/fund-detail?code=${code}`);
    window.dispatchEvent(new Event("funds:navigate"));
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function syncSelectedCode() {
      setSelectedCode(codeFromLocation());
    }

    window.addEventListener("popstate", syncSelectedCode);
    window.addEventListener("funds:navigate", syncSelectedCode);
    return () => {
      window.removeEventListener("popstate", syncSelectedCode);
      window.removeEventListener("funds:navigate", syncSelectedCode);
    };
  }, []);

  useEffect(() => {
    if (!fund) return;
    let active = true;
    setDetail(null);
    setPositions({ date: null, stocks: [] });
    api.detail(fund.code).then((data) => active && setDetail(data)).catch(() => active && setDetail(null));
    api.positions(fund.code).then((data) => active && setPositions(data)).catch(() => active && setPositions({ date: null, stocks: [] }));
    return () => {
      active = false;
    };
  }, [fund?.code]);

  useEffect(() => {
    if (!fund) return;
    let active = true;
    setHistory({ nav: [], yield: [] });
    api.history(fund.code, range).then((data) => active && setHistory(data as { nav: HistoryPoint[]; yield: HistoryPoint[] })).catch(() => active && setHistory({ nav: [], yield: [] }));
    return () => {
      active = false;
    };
  }, [fund?.code, range]);

  return (
    <AppShell active="detail" loading={loading} onRefresh={refresh}>
      <div className="mb-5 flex items-center gap-3">
        <a href="/funds" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/30">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </a>
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">基金详情</h1>
          <p className="mt-1 text-sm text-slate-400">查看基金净值、收益曲线、基金概况和重仓股票。</p>
        </div>
      </div>

      {!fund ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.04] p-10 text-center text-sm text-slate-400 shadow-xl shadow-black/10 backdrop-blur">暂无基金，请先添加持仓。</div>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0d7ff2] text-white shadow-lg shadow-blue-500/20">
                      <Scale className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor="fund-detail-switcher">切换基金详情</label>
                      <div className="relative max-w-full sm:min-w-[280px]">
                        <select
                          id="fund-detail-switcher"
                          value={fund.code}
                          onChange={(event) => selectFund(event.target.value)}
                          className="h-9 w-full cursor-pointer appearance-none truncate rounded-lg border border-transparent bg-transparent py-0 pl-0 pr-8 text-xl font-semibold text-white outline-none transition hover:text-[#5fb0ff] focus:border-blue-400/40 focus:bg-white/[0.04] focus:px-3 focus:ring-2 focus:ring-blue-400/20 sm:text-2xl"
                        >
                          {portfolio?.funds.map((item) => (
                            <option key={item.code} value={item.code} className="bg-[#162332] text-slate-100">
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      </div>
                      <p className="numeric text-sm text-slate-400">{fund.code}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="单位净值" value={String(fund.nav ?? "--")} />
                    <Metric label="估算净值" value={String(fund.estimate ?? "--")} />
                    <Metric label="涨跌幅" value={percent(fund.change_rate)} className={tone(fund.change_rate)} />
                    <Metric label="持仓市值" value={money(fund.market_value)} />
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 md:min-w-52">
                  <p className="text-sm text-slate-400">今日收益</p>
                  <p className={`numeric mt-2 text-2xl font-semibold ${tone(fund.daily_profit)}`}>{money(fund.daily_profit)}</p>
                  <p className="mt-2 text-xs text-slate-400">更新时间 {fund.update_time || fund.nav_date || "--"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
              <h3 className="mb-4 text-base font-semibold text-white">基金概况</h3>
              <div className="space-y-3 text-sm">
                <Info icon={ShieldCheck} label="基金类型" value={detail?.FTYPE} />
                <Info icon={Building2} label="基金公司" value={detail?.JJGS} />
                <Info icon={UserRound} label="基金经理" value={detail?.JJJL} />
                <Info icon={CalendarDays} label="净值日期" value={detail?.FSRQ || fund.nav_date} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">历史收益走势</h3>
                <p className="mt-1 text-sm text-slate-400">{hasBenchmark ? "基金收益率与业绩基准对比。" : "基金区间收益率走势。"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ranges.map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setRange(value)} className={`h-8 cursor-pointer rounded-lg px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${range === value ? "bg-[#0d7ff2] text-white shadow-lg shadow-blue-500/20" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer>
                <LineChart data={history.yield}>
                  <CartesianGrid stroke="rgba(148, 163, 184, .18)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" minTickGap={32} tick={chartTick} axisLine={chartLine} tickLine={chartLine} />
                  <YAxis tick={chartTick} axisLine={chartLine} tickLine={chartLine} tickFormatter={(value) => `${value}%`} width={54} />
                  <Tooltip formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]} contentStyle={tooltipStyle} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="yield_rate" name="基金" stroke="#2f7df6" strokeWidth={2.6} dot={false} />
                  {hasBenchmark ? <Line type="monotone" dataKey="benchmark_yield" name="基准" stroke="#94a3b8" strokeWidth={1.8} dot={false} /> : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/10 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="text-base font-semibold text-white">重仓股票</h3>
              <span className="text-sm text-slate-400">{positions.date || ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] text-sm">
                <thead className="bg-white/[0.04] text-xs font-medium text-slate-400">
                  <tr>
                    <th className="px-5 py-3 text-left">股票</th>
                    <th className="px-5 py-3 text-right">价格</th>
                    <th className="px-5 py-3 text-right">涨跌幅</th>
                    <th className="px-5 py-3 text-right">持仓占比</th>
                    <th className="px-5 py-3 text-right">PE(TTM)</th>
                    <th className="px-5 py-3 text-right">PB</th>
                    <th className="px-5 py-3 text-right">PS</th>
                    <th className="px-5 py-3 text-right">PEG</th>
                    <th className="px-5 py-3 text-right">盈利增速</th>
                    <th className="px-5 py-3 text-right">ROE</th>
                    <th className="px-5 py-3 text-right">市值</th>
                    <th className="px-5 py-3 text-left">行业</th>
                    <th className="px-5 py-3 text-right">较上期</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {positions.stocks.slice(0, 10).map((stock) => (
                    <PositionRow key={String(stock.code)} stock={stock} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`numeric mt-1 text-lg font-semibold ${className || "text-white"}`}>{value}</div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: unknown }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="truncate text-right font-medium text-slate-100">{String(value || "--")}</span>
    </div>
  );
}

function PositionRow({ stock }: { stock: Record<string, unknown> }) {
  const changeRate = typeof stock.change_rate === "number" ? stock.change_rate : null;
  return (
    <tr className="hover:bg-white/[0.04]">
      <td className="px-5 py-3">
        <div className="font-medium text-white">{String(stock.name || "--")}</div>
        <div className="numeric text-xs text-slate-400">{String(stock.code || "--")}</div>
      </td>
      <td className="numeric px-5 py-3 text-right">{stock.price === null || stock.price === undefined ? "--" : String(stock.price)}</td>
      <td className={`numeric px-5 py-3 text-right ${changeRate === null ? "text-slate-400" : tone(changeRate)}`}>{changeRate === null ? "--" : percent(changeRate)}</td>
      <td className="numeric px-5 py-3 text-right">{Number(stock.weight || 0).toFixed(2)}%</td>
      <td className="numeric px-5 py-3 text-right">{metric(stock.pe_ttm)}</td>
      <td className="numeric px-5 py-3 text-right">{metric(stock.pb)}</td>
      <td className="numeric px-5 py-3 text-right text-slate-400">{metric(stock.ps)}</td>
      <td className="numeric px-5 py-3 text-right text-slate-400">{metric(stock.peg)}</td>
      <td className={`numeric px-5 py-3 text-right ${typeof stock.expected_growth_rate === "number" ? tone(Number(stock.expected_growth_rate)) : "text-slate-400"}`}>{rateMetric(stock.expected_growth_rate)}</td>
      <td className={`numeric px-5 py-3 text-right ${typeof stock.roe === "number" ? tone(Number(stock.roe)) : "text-slate-400"}`}>{rateMetric(stock.roe)}</td>
      <td className="numeric px-5 py-3 text-right">{marketCap(stock.total_market_cap)}</td>
      <td className="px-5 py-3 text-left text-slate-300">{String(stock.industry || "--")}</td>
      <td className="numeric px-5 py-3 text-right text-slate-400">{String(stock.change_from_last ?? "--")}</td>
    </tr>
  );
}

function metric(value: unknown, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function rateMetric(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return percent(value);
}

function marketCap(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "--";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return value.toFixed(2);
}
