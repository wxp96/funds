export type FundQuote = {
  code: string;
  name: string;
  nav_date: string | null;
  nav: number | null;
  estimate: number | null;
  change_rate: number;
  update_time: string | null;
  has_settled_nav: boolean;
  shares: number;
  cost: number;
  market_value: number;
  daily_profit: number;
  holding_profit: number;
  holding_profit_rate: number;
};

export type PortfolioSummary = {
  market_value: number;
  daily_profit: number;
  daily_profit_rate: number;
  holding_profit: number;
  holding_profit_rate: number;
  updated_at: string;
};

export type Portfolio = {
  summary: PortfolioSummary;
  funds: FundQuote[];
};

export type FundSearchItem = {
  code: string;
  name: string;
  type?: string | null;
};

export type HistoryPoint = {
  date: string;
  nav?: number | null;
  accumulative_nav?: number | null;
  growth_rate?: number | null;
  yield_rate?: number | null;
  benchmark_yield?: number | null;
};

export type Transaction = {
  id: string;
  date: string;
  code: string;
  type: "buy" | "sell";
  amount: number;
  shares: number;
  nav: number;
  fee: number;
  note: string;
};

export type TransactionInput = Omit<Transaction, "id">;
