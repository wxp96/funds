import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "../lib/api";

export function HistorySummary() {
  const [data, setData] = useState<{ date: string; market_value: number; daily_profit: number; holding_profit: number }[]>([]);

  useEffect(() => {
    api.summaryHistory().then(setData).catch(() => setData([]));
  }, []);

  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-soft">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-ink">每日与历史收益总结</h2>
        <p className="mt-1 text-sm text-gray-500">当前版本展示今日组合快照，后续可扩展为每日自动落库。</p>
      </div>
      <div className="h-52">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={60} />
            <Tooltip />
            <Bar dataKey="daily_profit" name="今日收益" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="holding_profit" name="持有收益" fill="#64748b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
