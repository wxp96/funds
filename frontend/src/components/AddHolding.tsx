import { FormEvent, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { api } from "../lib/api";
import type { FundSearchItem } from "../types";

type Props = {
  onAdded: () => void;
  surface?: "card" | "plain";
};

export function AddHolding({ onAdded, surface = "card" }: Props) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<FundSearchItem[]>([]);
  const [selected, setSelected] = useState<FundSearchItem | null>(null);
  const [amount, setAmount] = useState("0");
  const [profit, setProfit] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = keyword.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      api
        .search(query)
        .then((items) => {
          setResults(items);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      setError("请先选择基金");
      return;
    }
    setError("");
    const holdingAmount = Number(amount || 0);
    const holdingProfit = Number(profit || 0);
    await api.addHolding(selected.code, holdingAmount, holdingProfit);
    setKeyword("");
    setResults([]);
    setSelected(null);
    setAmount("0");
    setProfit("0");
    onAdded();
  }

  const surfaceClass =
    surface === "card"
      ? "max-w-full rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 backdrop-blur"
      : "max-w-full";

  return (
    <form onSubmit={submit} className={surfaceClass}>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_auto]">
        <div className="min-w-0">
          <label htmlFor="fund-search" className="mb-1 block text-sm font-medium text-slate-300">
            基金名称或代码
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              id="fund-search"
              value={selected ? `${selected.name} (${selected.code})` : keyword}
              onChange={(event) => {
                setSelected(null);
                setError("");
                setKeyword(event.target.value);
              }}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
              placeholder="输入编码、中文或拼音"
            />
          </div>
          {results.length > 0 && !selected ? (
            <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-[#162332] shadow-xl">
              {results.slice(0, 8).map((item) => (
                <button
                  type="button"
                  key={item.code}
                  onClick={() => setSelected(item)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/5 focus:bg-white/10 focus:outline-none"
                >
                  <span>{item.name}</span>
                  <span className="numeric text-slate-400">{item.code}</span>
                </button>
              ))}
            </div>
          ) : null}
          {loading ? <p className="mt-2 text-sm text-slate-400">正在搜索...</p> : null}
          {!loading && keyword.trim().length >= 2 && results.length === 0 && !selected && !error ? <p className="mt-2 text-sm text-slate-500">未找到匹配基金</p> : null}
        </div>
        <div>
          <label htmlFor="amount" className="mb-1 block text-sm font-medium text-slate-300">
            持仓金额
          </label>
          <input
            id="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
          />
        </div>
        <div>
          <label htmlFor="profit" className="mb-1 block text-sm font-medium text-slate-300">
            持有收益
          </label>
          <input
            id="profit"
            value={profit}
            onChange={(event) => setProfit(event.target.value)}
            type="number"
            inputMode="decimal"
            step="0.01"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#0d7ff2] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60 lg:mt-6 lg:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          添加
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </form>
  );
}
