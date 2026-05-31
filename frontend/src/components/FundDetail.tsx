import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";
import { percent, tone } from "../lib/format";
import type { FundQuote, HistoryPoint } from "../types";

type Props = {
  fund: FundQuote | null;
};

const ranges = [
  ["y", "近1月"],
  ["3y", "近3月"],
  ["6y", "近6月"],
  ["n", "近1年"],
  ["3n", "近3年"],
  ["5n", "近5年"]
];

export function FundDetail({ fund }: Props) {
  const [range, setRange] = useState("y");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [positions, setPositions] = useState<{ date: string | null; stocks: Record<string, unknown>[] } | null>(null);
  const [history, setHistory] = useState<{ nav: HistoryPoint[]; yield: HistoryPoint[] }>({ nav: [], yield: [] });

  useEffect(() => {
    if (!fund) return;
    api.detail(fund.code).then(setDetail).catch(() => setDetail(null));
    api.positions(fund.code).then(setPositions).catch(() => setPositions(null));
  }, [fund]);

  useEffect(() => {
    if (!fund) return;
    api.history(fund.code, range).then((data) => setHistory(data as { nav: HistoryPoint[]; yield: HistoryPoint[] })).catch(() => setHistory({ nav: [], yield: [] }));
  }, [fund, range]);

  if (!fund) {
    return (
      <aside className="rounded-lg border border-dashed border-line bg-panel p-6 text-sm text-gray-500">
        选择一只基金查看净值曲线、股票持仓与基金概况。
      </aside>
    );
  }

  return (
    <aside className="space-y-4 rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{fund.name}</h2>
            <p className="numeric text-sm text-gray-500">{fund.code}</p>
          </div>
          <span className={`numeric rounded-md bg-gray-50 px-2 py-1 text-sm font-medium ${tone(fund.change_rate)}`}>{percent(fund.change_rate)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="单位净值" value={fund.nav ?? "--"} />
        <Metric label="估算净值" value={fund.estimate ?? "--"} />
        <Metric label="净值日期" value={fund.nav_date || "--"} />
        <Metric label="更新时间" value={fund.update_time || "--"} />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {ranges.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-100 ${range === value ? "border-accent bg-blue-50 text-accent" : "border-line text-gray-600 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <LineChart data={history.yield}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}%`} width={42} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, "收益率"]} />
              <Line type="monotone" dataKey="yield_rate" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="benchmark_yield" stroke="#64748b" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">基金概况</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Info label="基金类型" value={detail?.FTYPE} />
          <Info label="基金公司" value={detail?.JJGS} />
          <Info label="基金经理" value={detail?.JJJL} />
          <Info label="基金规模" value={detail?.ENDNAV} />
        </dl>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">股票持仓</h3>
          <span className="text-xs text-gray-500">{positions?.date || ""}</span>
        </div>
        <div className="max-h-64 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {(positions?.stocks || []).slice(0, 10).map((stock) => (
                <tr key={String(stock.code)}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{String(stock.name || "--")}</div>
                    <div className="numeric text-xs text-gray-500">{String(stock.code || "--")}</div>
                  </td>
                  <td className="numeric px-3 py-2 text-right">{Number(stock.weight || 0).toFixed(2)}%</td>
                  <td className={`numeric px-3 py-2 text-right ${tone(Number(stock.change_rate || 0))}`}>{percent(Number(stock.change_rate || 0))}</td>
                </tr>
              ))}
              {positions?.stocks?.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-500" colSpan={3}>暂无持仓数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="numeric mt-1 font-medium text-ink">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="numeric truncate text-right text-ink">{String(value || "--")}</dd>
    </>
  );
}
