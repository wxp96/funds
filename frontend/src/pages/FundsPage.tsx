import { Activity, PieChart as PieChartIcon, Plus, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { AddHolding } from "../components/AddHolding";
import { HoldingsTable } from "../components/HoldingsTable";
import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";
import { money, percent, tone } from "../lib/format";
import type { FundQuote, Portfolio } from "../types";

const emptyPortfolio: Portfolio = {
  summary: { market_value: 0, daily_profit: 0, daily_profit_rate: 0, holding_profit: 0, holding_profit_rate: 0, updated_at: "" },
  funds: []
};

const pieColors = ["#0d7ff2", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#f43f5e", "#94a3b8"];
const portfolioCacheKey = "funds:last-portfolio";

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
    // Cache is only a fast paint optimization; refresh should still succeed without it.
  }
}

export function FundsPage() {
  const [initialPortfolio] = useState(() => {
    const cachedPortfolio = readCachedPortfolio();
    return {
      portfolio: cachedPortfolio ?? emptyPortfolio,
      hasCache: Boolean(cachedPortfolio)
    };
  });
  const [portfolio, setPortfolio] = useState<Portfolio>(initialPortfolio.portfolio);
  const [loading, setLoading] = useState(!initialPortfolio.hasCache);
  const [error, setError] = useState("");
  const [showAddHolding, setShowAddHolding] = useState(false);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError("");
    try {
      const data = await api.portfolio();
      if (requestSeq.current !== seq) return;
      setPortfolio(data);
      writeCachedPortfolio(data);
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (requestSeq.current === seq) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function openIncomes(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.history.pushState(null, "", "/incomes");
    window.dispatchEvent(new Event("funds:navigate"));
  }

  return (
    <AppShell active="funds" loading={loading} onRefresh={refresh}>
      <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-normal">持仓总览</h1>
          <p className="mt-1 text-sm text-slate-400">添加基金持仓，实时查看今日收益、持有收益和仓位明细。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddHolding(true)}
          className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#0d7ff2] px-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/30 md:hidden"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          添加
        </button>
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="mb-4 min-w-0">
        <a
          href="/incomes"
          onClick={openIncomes}
          title="查看持仓收益总结"
          className="block max-w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 backdrop-blur transition hover:border-blue-400/30 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-blue-400/30 sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-400">总持仓市值</p>
              <div className="numeric mt-2 break-words text-4xl font-semibold tracking-normal">{money(portfolio.summary.market_value)}</div>
              <p className="mt-2 text-sm text-slate-400">更新时间 {portfolio.summary.updated_at ? portfolio.summary.updated_at.replace("T", " ") : "--"}</p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:min-w-[420px]">
              <HeroMetric icon={Activity} label="今日收益" value={money(portfolio.summary.daily_profit)} sub={percent(portfolio.summary.daily_profit_rate)} className={tone(portfolio.summary.daily_profit)} />
              <HeroMetric icon={TrendingUp} label="持有收益" value={money(portfolio.summary.holding_profit)} sub={percent(portfolio.summary.holding_profit_rate)} className={tone(portfolio.summary.holding_profit)} />
            </div>
          </div>
        </a>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="hidden md:block">
            <AddHolding onAdded={refresh} />
          </div>
          <HoldingsTable funds={portfolio.funds} loading={loading && portfolio.funds.length === 0} onChanged={refresh} />
        </div>
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">持仓占比</h2>
              <PieChartIcon className="h-4 w-4 text-[#5fb0ff]" aria-hidden="true" />
            </div>
            <AllocationPie funds={portfolio.funds} total={portfolio.summary.market_value} />
          </section>
        </aside>
      </div>

      <MobileAddHoldingSheet
        open={showAddHolding}
        onClose={() => setShowAddHolding(false)}
        onAdded={() => {
          setShowAddHolding(false);
          refresh();
        }}
      />
    </AppShell>
  );
}

function MobileAddHoldingSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-add-holding-title">
      <button type="button" aria-label="关闭添加持仓" onClick={onClose} className="absolute inset-0 cursor-pointer bg-black/55 backdrop-blur-sm" />
      <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-2xl border border-white/10 bg-[#101922] p-4 shadow-2xl shadow-black/50">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="mobile-add-holding-title" className="text-base font-semibold text-white">添加持仓</h2>
            <p className="mt-1 text-sm text-slate-400">选择基金并输入当前持仓金额。</p>
          </div>
          <button type="button" onClick={onClose} title="关闭" className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/30">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <AddHolding surface="plain" onAdded={onAdded} />
      </div>
    </div>
  );
}

function AllocationPie({ funds, total }: { funds: FundQuote[]; total: number }) {
  const topFunds = funds
    .filter((fund) => fund.market_value > 0)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 6);
  const data = topFunds.map((fund) => ({
    name: fund.name,
    value: fund.market_value,
    percent: total ? (fund.market_value / total) * 100 : 0
  }));

  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-500">
        添加持仓金额后显示占比
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-64">
        <ResponsiveContainer>
          <PieChart>
            <defs>
              <filter id="pieGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0d7ff2" floodOpacity="0.18" />
              </filter>
            </defs>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3} stroke="rgba(255,255,255,.10)" strokeWidth={1} filter="url(#pieGlow)">
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => [money(Number(value)), `${item.payload.name} · ${item.payload.percent.toFixed(2)}%`]}
              contentStyle={{ background: "#162332", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, color: "#e2e8f0" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-400">总市值</span>
          <span className="numeric mt-1 text-xl font-semibold">{money(total)}</span>
        </div>
      </div>
      <div className="mt-2 space-y-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />
              <span className="truncate text-slate-300">{item.name}</span>
            </span>
            <span className="numeric shrink-0 text-slate-400">{item.percent.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value, sub, className }: { icon: typeof Activity; label: string; value: string; sub: string; className: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <div className={`numeric mt-2 text-xl font-semibold ${className}`}>{value}</div>
      <div className={`numeric text-sm ${className}`}>{sub}</div>
    </div>
  );
}
