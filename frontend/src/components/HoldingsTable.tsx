import { ArrowDownUp, ChevronDown, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../lib/api";
import { money, percent, tone } from "../lib/format";
import type { FundQuote } from "../types";

type Props = {
  funds: FundQuote[];
  loading?: boolean;
  onChanged: () => void;
};

export function HoldingsTable({ funds, loading = false, onChanged }: Props) {
  const [drafts, setDrafts] = useState<Record<string, { amount: string; profit: string }>>({});
  const [sort, setSort] = useState<{ key: "market_value" | "daily_profit" | "holding_profit" | "holding_profit_rate" | "change_rate"; direction: "asc" | "desc" } | null>(null);

  const sortedFunds = useMemo(() => {
    if (!sort) return funds;
    return [...funds].sort((a, b) => {
      const diff = Number(a[sort.key] || 0) - Number(b[sort.key] || 0);
      return sort.direction === "asc" ? diff : -diff;
    });
  }, [funds, sort]);

  function draftFor(fund: FundQuote) {
    return drafts[fund.code] ?? { amount: String(fund.market_value), profit: String(fund.holding_profit) };
  }

  async function save(fund: FundQuote) {
    const draft = draftFor(fund);
    const amount = Number(draft.amount || 0);
    const profit = Number(draft.profit || 0);
    await api.updateHolding(fund.code, amount, profit);
    onChanged();
  }

  async function remove(code: string) {
    await api.deleteHolding(code);
    onChanged();
  }

  function toggleSort(key: "market_value" | "daily_profit" | "holding_profit" | "holding_profit_rate" | "change_rate") {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "desc" };
      if (current.direction === "desc") return { key, direction: "asc" };
      return null;
    });
  }

  function openFundDetail(code: string) {
    window.history.pushState(null, "", `/fund-detail?code=${code}`);
    window.dispatchEvent(new Event("funds:navigate"));
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/10 backdrop-blur">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-white">基金持仓</h2>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-white/[0.04] text-left text-xs font-medium uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">基金</th>
              <th className="px-4 py-3 text-right">单位净值</th>
              <th className="px-4 py-3 text-right">估算净值</th>
              <SortableTh label="涨跌幅" active={sort?.key === "change_rate"} direction={sort?.direction} onClick={() => toggleSort("change_rate")} />
              <SortableTh label="持仓金额" active={sort?.key === "market_value"} direction={sort?.direction} onClick={() => toggleSort("market_value")} />
              <SortableTh label="今日收益" active={sort?.key === "daily_profit"} direction={sort?.direction} onClick={() => toggleSort("daily_profit")} />
              <SortableTh label="持有收益" active={sort?.key === "holding_profit"} direction={sort?.direction} onClick={() => toggleSort("holding_profit")} />
              <SortableTh label="持有收益率" active={sort?.key === "holding_profit_rate"} direction={sort?.direction} onClick={() => toggleSort("holding_profit_rate")} />
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                  正在加载基金持仓...
                </td>
              </tr>
            ) : null}
            {!loading && sortedFunds.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                  暂无基金持仓
                </td>
              </tr>
            ) : null}
            {!loading && sortedFunds.map((fund) => {
              const draft = draftFor(fund);
              return (
                <tr key={fund.code} className="hover:bg-white/[0.04]">
                  <td className="px-4 py-3">
                    <a
                      href={`/fund-detail?code=${fund.code}`}
                      onClick={(event) => {
                        event.preventDefault();
                        openFundDetail(fund.code);
                      }}
                      className="block cursor-pointer rounded-sm text-left transition hover:text-[#5fb0ff] focus:outline-none focus:ring-2 focus:ring-blue-400/20"
                    >
                      <div className="font-medium text-white">{fund.name}</div>
                      <div className="numeric text-xs text-slate-400">{fund.code} · {fund.update_time || fund.nav_date || "--"}</div>
                    </a>
                  </td>
                  <td className="numeric px-4 py-3 text-right">{fund.nav ?? "--"}</td>
                  <td className="numeric px-4 py-3 text-right">{fund.estimate ?? "--"}</td>
                  <td className={`numeric px-4 py-3 text-right font-medium ${tone(fund.change_rate)}`}>{percent(fund.change_rate)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      aria-label={`${fund.name} 持仓金额`}
                      value={draft.amount}
                      onChange={(event) => setDrafts((old) => ({ ...old, [fund.code]: { ...draft, amount: event.target.value } }))}
                      className="numeric h-8 w-28 rounded-lg border border-white/10 bg-white/5 px-2 text-right text-white outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
                    />
                  </td>
                  <td className={`numeric px-4 py-3 text-right font-medium ${tone(fund.daily_profit)}`}>{money(fund.daily_profit)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      aria-label={`${fund.name} 持有收益`}
                      value={draft.profit}
                      onChange={(event) => setDrafts((old) => ({ ...old, [fund.code]: { ...draft, profit: event.target.value } }))}
                      className={`numeric h-8 w-28 rounded-lg border border-white/10 bg-white/5 px-2 text-right outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 ${tone(Number(draft.profit || 0))}`}
                    />
                  </td>
                  <td className={`numeric px-4 py-3 text-right font-medium ${tone(fund.holding_profit_rate)}`}>{percent(fund.holding_profit_rate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" title="保存" onClick={() => save(fund)} className="cursor-pointer rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/20">
                        <Save className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" title="删除" onClick={() => remove(fund.code)} className="cursor-pointer rounded-lg border border-white/10 p-2 text-red-400 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/20">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableTh({
  label,
  active,
  direction,
  onClick
}: {
  label: string;
  active: boolean;
  direction?: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 text-right">
      <button type="button" onClick={onClick} className={`ml-auto inline-flex cursor-pointer items-center justify-end gap-1 transition ${active ? "text-[#5fb0ff]" : "text-slate-400 hover:text-slate-200"}`}>
        {label}
        {active ? <ChevronDown className={`h-3.5 w-3.5 transition ${direction === "asc" ? "rotate-180" : ""}`} aria-hidden="true" /> : <ArrowDownUp className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />}
      </button>
    </th>
  );
}
