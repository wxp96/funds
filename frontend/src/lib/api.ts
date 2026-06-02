import type { FundSearchItem, Portfolio, Transaction, TransactionInput } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(error.detail || "请求失败");
  }
  return response.json() as Promise<T>;
}

export const api = {
  portfolio: () => request<Portfolio>("/api/portfolio"),
  search: (keyword: string) => request<FundSearchItem[]>(`/api/search?keyword=${encodeURIComponent(keyword)}`),
  addHolding: (code: string, amount: number, profit: number) =>
    request("/api/holdings", { method: "POST", body: JSON.stringify({ code, amount, profit }) }),
  updateHolding: (code: string, amount: number, profit: number) =>
    request(`/api/holdings/${code}`, { method: "PATCH", body: JSON.stringify({ amount, profit }) }),
  deleteHolding: (code: string) => request(`/api/holdings/${code}`, { method: "DELETE" }),
  detail: (code: string) => request<Record<string, unknown>>(`/api/funds/${code}/detail`),
  positions: (code: string) => request<{ date: string | null; stocks: Record<string, unknown>[] }>(`/api/funds/${code}/positions`),
  history: (code: string, range = "y") => request<{ nav: unknown[]; yield: unknown[] }>(`/api/funds/${code}/history?range=${range}`),
  summaryHistory: () => request<{ date: string; market_value: number; daily_profit: number; holding_profit: number }[]>("/api/summary/history"),
  transactions: () => request<Transaction[]>("/api/transactions"),
  addTransaction: (payload: TransactionInput) => request<Transaction[]>("/api/transactions", { method: "POST", body: JSON.stringify(payload) }),
  deleteTransaction: (id: string) => request<Transaction[]>(`/api/transactions/${id}`, { method: "DELETE" })
};
