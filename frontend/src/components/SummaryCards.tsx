import { Activity, BarChart3, Clock, Wallet } from "lucide-react";

import type { PortfolioSummary } from "../types";
import { money, percent, tone } from "../lib/format";

type Props = {
  summary: PortfolioSummary;
};

export function SummaryCards({ summary }: Props) {
  const cards = [
    { label: "持仓市值", value: money(summary.market_value), detail: "按最新单位净值计算", icon: Wallet, className: "text-ink" },
    { label: "今日收益", value: money(summary.daily_profit), detail: percent(summary.daily_profit_rate), icon: Activity, className: tone(summary.daily_profit) },
    { label: "持有收益", value: money(summary.holding_profit), detail: percent(summary.holding_profit_rate), icon: BarChart3, className: tone(summary.holding_profit) },
    { label: "更新时间", value: summary.updated_at.replace("T", " "), detail: "实时估值定时刷新", icon: Clock, className: "text-ink" }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.label} className="rounded-lg border border-line bg-panel p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">{card.label}</span>
              <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <div className={`numeric mt-3 text-2xl font-semibold ${card.className}`}>{card.value}</div>
            <p className="mt-2 text-sm text-gray-500">{card.detail}</p>
          </article>
        );
      })}
    </section>
  );
}
