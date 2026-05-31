import { CalendarRange, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";
import { money, percent, tone } from "../lib/format";
import type { Portfolio, Transaction, TransactionInput } from "../types";

const chartTick = { fontSize: 12, fill: "#94a3b8" };
const chartLine = { stroke: "rgba(148, 163, 184, .35)" };
const tooltipStyle = { background: "#162332", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, color: "#e2e8f0" };

const emptyDraft: TransactionInput = {
  date: new Date().toISOString().slice(0, 10),
  code: "",
  type: "buy",
  amount: 0,
  shares: 0,
  nav: 0,
  fee: 0,
  note: ""
};

export function IncomesPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<{ date: string; market_value: number; daily_profit: number; holding_profit: number }[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [draft, setDraft] = useState<TransactionInput>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const transactionsRef = useRef<HTMLElement | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [portfolioData, historyData, transactionData] = await Promise.all([api.portfolio(), api.summaryHistory(), api.transactions()]);
      setPortfolio(portfolioData);
      setHistory(historyData);
      setTransactions(transactionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (window.location.hash === "#transactions") {
      window.setTimeout(() => transactionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }, []);

  const monthly = useMemo(() => {
    const byMonth = new Map<string, number>();
    history.forEach((point) => {
      const month = point.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + point.daily_profit);
    });
    return Array.from(byMonth.entries()).map(([month, value]) => ({ month, value: Number(value.toFixed(2)) }));
  }, [history]);

  async function submitTransaction(event: FormEvent) {
    event.preventDefault();
    if (!draft.code.trim()) {
      setError("请输入基金代码");
      return;
    }
    setError("");
    await api.addTransaction({ ...draft, code: draft.code.trim() });
    setDraft({ ...emptyDraft, date: draft.date });
    await refresh();
  }

  async function removeTransaction(id: string) {
    await api.deleteTransaction(id);
    await refresh();
  }

  function scrollToTransactions() {
    window.history.replaceState(null, "", `${window.location.pathname}#transactions`);
    transactionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AppShell active="incomes" loading={loading} onRefresh={refresh}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">收益分析</h1>
          <p className="mt-1 text-sm text-slate-400">基于交易流水和基金历史净值回算组合收益。</p>
        </div>
        <button
          type="button"
          onClick={scrollToTransactions}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
        >
          <CalendarRange className="h-4 w-4 text-[#5fb0ff]" aria-hidden="true" />
          交易流水账本
        </button>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        <IncomeCard title="总收益" value={money(portfolio?.summary.holding_profit)} sub={percent(portfolio?.summary.holding_profit_rate)} positive={(portfolio?.summary.holding_profit ?? 0) >= 0} />
        <IncomeCard title="今日收益" value={money(portfolio?.summary.daily_profit)} sub={percent(portfolio?.summary.daily_profit_rate)} positive={(portfolio?.summary.daily_profit ?? 0) >= 0} />
        <IncomeCard title="当前市值" value={money(portfolio?.summary.market_value)} sub={`${portfolio?.funds.length ?? 0} 只基金`} positive />
      </section>

      <section className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">总收益趋势</h2>
            <p className="mt-1 text-sm text-slate-400">累计收益和每日收益来自交易流水回算。</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#2f7df6]" />累计收益</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />每日收益</span>
          </div>
        </div>
        {history.length === 0 ? (
          <EmptyChart text="暂无交易流水，补录买入记录后显示收益趋势" />
        ) : (
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid stroke="rgba(148, 163, 184, .18)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={chartTick} axisLine={chartLine} tickLine={chartLine} minTickGap={24} />
                <YAxis tick={chartTick} axisLine={chartLine} tickLine={chartLine} width={70} />
                <Tooltip formatter={(value) => money(Number(value))} contentStyle={tooltipStyle} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
                <Line type="monotone" dataKey="holding_profit" name="累计收益" stroke="#2f7df6" strokeWidth={2.6} dot={false} />
                <Line type="monotone" dataKey="daily_profit" name="每日收益" stroke="#94a3b8" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
          <h2 className="mb-4 text-base font-semibold text-white">每日收益</h2>
          {history.length === 0 ? (
            <EmptyChart text="暂无每日收益数据" compact />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={history}>
                  <CartesianGrid stroke="rgba(148, 163, 184, .18)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={chartTick} axisLine={chartLine} tickLine={chartLine} minTickGap={24} />
                  <YAxis tick={chartTick} axisLine={chartLine} tickLine={chartLine} width={60} />
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={tooltipStyle} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
                  <Bar dataKey="daily_profit" name="每日收益" fill="#2f7df6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
          <h2 className="mb-4 text-base font-semibold text-white">月度收益</h2>
          {monthly.length === 0 ? (
            <EmptyChart text="暂无月度收益数据" compact />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {monthly.slice(-12).map((item) => (
                <div key={item.month} className={`rounded-lg border p-3 ${item.value >= 0 ? "border-red-400/20 bg-red-500/10 text-gain" : "border-green-400/20 bg-green-500/10 text-loss"}`}>
                  <div className="text-xs opacity-75">{item.month}</div>
                  <div className="numeric mt-1 text-lg font-semibold">{money(item.value)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section id="transactions" ref={transactionsRef} className="mt-4 scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/10 backdrop-blur">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">基金收益明细</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/[0.04] text-xs font-medium text-slate-400">
              <tr>
                <th className="px-5 py-3 text-left">基金</th>
                <th className="px-5 py-3 text-right">持仓市值</th>
                <th className="px-5 py-3 text-right">今日收益</th>
                <th className="px-5 py-3 text-right">持有收益</th>
                <th className="px-5 py-3 text-right">持有收益率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(portfolio?.funds ?? []).map((fund) => (
                <tr key={fund.code} className="hover:bg-white/[0.04]">
                  <td className="px-5 py-3">
                    <div className="font-medium text-white">{fund.name}</div>
                    <div className="numeric text-xs text-slate-400">{fund.code}</div>
                  </td>
                  <td className="numeric px-5 py-3 text-right">{money(fund.market_value)}</td>
                  <td className={`numeric px-5 py-3 text-right ${tone(fund.daily_profit)}`}>{money(fund.daily_profit)}</td>
                  <td className={`numeric px-5 py-3 text-right ${tone(fund.holding_profit)}`}>{money(fund.holding_profit)}</td>
                  <td className={`numeric px-5 py-3 text-right ${tone(fund.holding_profit_rate)}`}>{percent(fund.holding_profit_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/10 backdrop-blur">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-white">交易流水</h2>
        </div>
        <form onSubmit={submitTransaction} className="grid gap-3 border-b border-white/10 p-4 lg:grid-cols-[130px_100px_120px_repeat(4,110px)_minmax(160px,1fr)_auto]">
          <Field label="日期">
            <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="input" />
          </Field>
          <Field label="类型">
            <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as "buy" | "sell" })} className="input">
              <option value="buy">买入</option>
              <option value="sell">卖出</option>
            </select>
          </Field>
          <Field label="基金代码">
            <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} className="input numeric" placeholder="000218" />
          </Field>
          <Field label="金额">
            <NumberInput value={draft.amount} onChange={(value) => setDraft({ ...draft, amount: value })} />
          </Field>
          <Field label="份额">
            <NumberInput value={draft.shares} onChange={(value) => setDraft({ ...draft, shares: value })} />
          </Field>
          <Field label="净值">
            <NumberInput value={draft.nav} onChange={(value) => setDraft({ ...draft, nav: value })} />
          </Field>
          <Field label="手续费">
            <NumberInput value={draft.fee} onChange={(value) => setDraft({ ...draft, fee: value })} />
          </Field>
          <Field label="备注">
            <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="input" />
          </Field>
          <button type="submit" className="mt-6 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#0d7ff2] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/30">
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-white/[0.04] text-xs font-medium text-slate-400">
              <tr>
                <th className="px-5 py-3 text-left">日期</th>
                <th className="px-5 py-3 text-left">类型</th>
                <th className="px-5 py-3 text-left">基金</th>
                <th className="px-5 py-3 text-right">金额</th>
                <th className="px-5 py-3 text-right">份额</th>
                <th className="px-5 py-3 text-right">净值</th>
                <th className="px-5 py-3 text-right">手续费</th>
                <th className="px-5 py-3 text-left">备注</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">暂无交易流水</td>
                </tr>
              ) : null}
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-white/[0.04]">
                  <td className="numeric px-5 py-3">{transaction.date}</td>
                  <td className={`px-5 py-3 ${transaction.type === "buy" ? "text-gain" : "text-loss"}`}>{transaction.type === "buy" ? "买入" : "卖出"}</td>
                  <td className="numeric px-5 py-3">{transaction.code}</td>
                  <td className="numeric px-5 py-3 text-right">{money(transaction.amount)}</td>
                  <td className="numeric px-5 py-3 text-right">{transaction.shares.toFixed(4)}</td>
                  <td className="numeric px-5 py-3 text-right">{transaction.nav.toFixed(4)}</td>
                  <td className="numeric px-5 py-3 text-right">{money(transaction.fee)}</td>
                  <td className="px-5 py-3 text-slate-400">{transaction.note || "--"}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" title="删除" onClick={() => removeTransaction(transaction.id)} className="inline-flex cursor-pointer rounded-lg border border-white/10 p-2 text-red-400 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/20">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function IncomeCard({ title, value, sub, positive }: { title: string; value: string; sub: string; positive: boolean }) {
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{title}</span>
        <Icon className={`h-5 w-5 ${positive ? "text-gain" : "text-loss"}`} aria-hidden="true" />
      </div>
      <div className={`numeric mt-3 text-3xl font-semibold ${positive ? "text-gain" : "text-loss"}`}>{value}</div>
      <div className={`numeric mt-1 text-sm ${positive ? "text-gain" : "text-loss"}`}>{sub}</div>
    </div>
  );
}

function EmptyChart({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`flex items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-500 ${compact ? "h-72" : "h-80"}`}>{text}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" min="0" step="0.0001" value={value} onChange={(event) => onChange(Number(event.target.value || 0))} className="input numeric" />;
}
