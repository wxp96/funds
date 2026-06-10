import type { FundQuote, HistoryPoint, Portfolio, Transaction, TransactionInput } from "../types";
import { loadTransactions, newTransactionId, saveTransactions } from "../storage/localStore";
import { fetchFundInfo, fetchNavHistory, fetchPositions, fetchQuotes, fetchYieldHistory, searchFunds } from "./eastmoney";

type Holding = {
  code: string;
  shares: number;
  cost: number;
  order: number;
};

function round(value: number | null | undefined) {
  return Number((value ?? 0).toFixed(2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function positionsFromTransactions(transactions: Transaction[], throughDate?: string) {
  const positions = new Map<string, { shares: number; costAmount: number }>();
  [...transactions]
    .sort((a, b) => `${a.date}-${a.id}`.localeCompare(`${b.date}-${b.id}`))
    .forEach((transaction) => {
      if (throughDate && transaction.date > throughDate) return;
      const position = positions.get(transaction.code) ?? { shares: 0, costAmount: 0 };
      if (transaction.type === "buy") {
        position.shares += transaction.shares;
        position.costAmount += transaction.amount + transaction.fee;
      } else if (position.shares > 0 && transaction.shares > 0) {
        const soldShares = Math.min(transaction.shares, position.shares);
        const averageCost = position.costAmount / position.shares;
        position.shares -= soldShares;
        position.costAmount = Math.max(0, position.costAmount - averageCost * soldShares);
      }
      positions.set(transaction.code, position);
    });
  return new Map([...positions.entries()].filter(([, value]) => value.shares > 0.000001));
}

function holdingsFromTransactions(transactions: Transaction[]): Holding[] {
  return [...positionsFromTransactions(transactions).entries()].map(([code, position], index) => ({
    code,
    shares: position.shares,
    cost: position.shares ? position.costAmount / position.shares : 0,
    order: index
  }));
}

function enrichQuotes(holdings: Holding[], quotes: Awaited<ReturnType<typeof fetchQuotes>>): Portfolio {
  const quoteMap = new Map(quotes.map((quote) => [quote.code, quote]));
  const funds = holdings.map((holding): FundQuote => {
    const quote = {
      code: holding.code,
      name: holding.code,
      nav_date: null,
      nav: null,
      estimate: null,
      change_rate: 0,
      update_time: null,
      has_settled_nav: false,
      ...quoteMap.get(holding.code)
    };
    const nav = quote.nav ?? 0;
    const estimate = quote.estimate;
    const changeRate = quote.change_rate ?? 0;
    const marketValue = nav * holding.shares;
    const previousNav = changeRate !== -100 ? nav / (1 + changeRate * 0.01) : nav;
    const dailyProfit = quote.has_settled_nav ? (nav - previousNav) * holding.shares : estimate ? (estimate - nav) * holding.shares : 0;
    const holdingProfit = holding.cost ? (nav - holding.cost) * holding.shares : 0;
    const holdingProfitRate = holding.cost ? ((nav - holding.cost) / holding.cost) * 100 : 0;
    return {
      ...quote,
      shares: holding.shares,
      cost: holding.cost,
      market_value: round(marketValue),
      daily_profit: round(dailyProfit),
      holding_profit: round(holdingProfit),
      holding_profit_rate: round(holdingProfitRate)
    };
  });
  const marketValue = funds.reduce((sum, fund) => sum + fund.market_value, 0);
  const dailyProfit = funds.reduce((sum, fund) => sum + fund.daily_profit, 0);
  const holdingProfit = funds.reduce((sum, fund) => sum + fund.holding_profit, 0);
  return {
    summary: {
      market_value: round(marketValue),
      daily_profit: round(dailyProfit),
      daily_profit_rate: round(marketValue ? (dailyProfit * 100) / marketValue : 0),
      holding_profit: round(holdingProfit),
      holding_profit_rate: round(marketValue !== holdingProfit ? (holdingProfit * 100) / (marketValue - holdingProfit) : 0),
      updated_at: new Date().toISOString().slice(0, 19)
    },
    funds
  };
}

async function holdingValuesFromAmount(code: string, amount: number, profit?: number | null) {
  if (amount <= 0) return { shares: 0, cost: 0 };
  const [quote] = await fetchQuotes([code]);
  const nav = quote?.nav ?? quote?.estimate ?? 0;
  if (nav <= 0) {
    throw new Error("暂时无法获取该基金净值，不能按持仓金额换算");
  }
  const shares = amount / nav;
  const costAmount = amount - Number(profit ?? 0);
  return { shares, cost: shares ? Math.max(costAmount / shares, 0) : 0 };
}

function yieldHistoryMatchesNav(nav: HistoryPoint[], yieldHistory: HistoryPoint[]) {
  const navDates = nav.map((point) => point.date).filter(Boolean).sort();
  const yieldDates = yieldHistory.map((point) => point.date).filter(Boolean).sort();
  if (!navDates.length || !yieldDates.length) return false;
  const latestNav = new Date(navDates[navDates.length - 1]).getTime();
  const latestYield = new Date(yieldDates[yieldDates.length - 1]).getTime();
  return Math.abs(latestNav - latestYield) <= 7 * 24 * 60 * 60 * 1000;
}

function yieldHistoryFromNav(nav: HistoryPoint[]) {
  const usable = nav.filter((point) => point.date && point.accumulative_nav);
  const baseNav = usable[0]?.accumulative_nav ?? 0;
  if (!baseNav) return [];
  return usable.map((point) => ({
    date: point.date,
    yield_rate: round((((point.accumulative_nav ?? 0) - baseNav) * 100) / baseNav),
    benchmark_yield: null
  }));
}

export const localApi = {
  async portfolio(): Promise<Portfolio> {
    const holdings = holdingsFromTransactions(loadTransactions());
    const quotes = await fetchQuotes(holdings.map((holding) => holding.code));
    return enrichQuotes(holdings, quotes);
  },

  search: searchFunds,

  async addHolding(code: string, amount: number, profit: number) {
    const transactions = loadTransactions();
    if (holdingsFromTransactions(transactions).some((holding) => holding.code === code)) {
      throw new Error("基金已在持仓中");
    }
    const { shares, cost } = await holdingValuesFromAmount(code, amount, profit);
    transactions.push({
      id: newTransactionId(),
      date: today(),
      code,
      type: "buy",
      amount: round(shares * cost),
      shares,
      nav: cost,
      fee: 0,
      note: "从持仓金额添加"
    });
    saveTransactions(transactions);
    return holdingsFromTransactions(transactions);
  },

  async updateHolding(code: string, amount: number, profit: number) {
    const transactions = loadTransactions().filter((transaction) => transaction.code !== code);
    const { shares, cost } = await holdingValuesFromAmount(code, amount, profit);
    transactions.push({
      id: newTransactionId(),
      date: today(),
      code,
      type: "buy",
      amount: round(shares * cost),
      shares,
      nav: cost,
      fee: 0,
      note: "从持仓编辑重置"
    });
    saveTransactions(transactions);
    return holdingsFromTransactions(transactions);
  },

  async deleteHolding(code: string) {
    const transactions = loadTransactions().filter((transaction) => transaction.code !== code);
    saveTransactions(transactions);
    return holdingsFromTransactions(transactions);
  },

  detail: fetchFundInfo,
  positions: fetchPositions,

  async history(code: string, range = "y") {
    const [nav, yieldHistory] = await Promise.all([fetchNavHistory(code, range), fetchYieldHistory(code, range).catch(() => [])]);
    return {
      nav,
      yield: yieldHistoryMatchesNav(nav, yieldHistory) ? yieldHistory : yieldHistoryFromNav(nav)
    };
  },

  async summaryHistory() {
    const transactions = loadTransactions();
    if (!transactions.length) return [];
    const codes = [...new Set(transactions.map((transaction) => transaction.code))].sort();
    const navResults = await Promise.all(codes.map((code) => fetchNavHistory(code, "5n").catch(() => [])));
    const navByCode = new Map<string, Map<string, number>>();
    const dates = new Set<string>();
    codes.forEach((code, index) => {
      const byDate = new Map<string, number>();
      navResults[index].forEach((point) => {
        if (point.date && point.nav) {
          byDate.set(point.date, point.nav);
          dates.add(point.date);
        }
      });
      navByCode.set(code, byDate);
    });

    const minDate = transactions.reduce((min, item) => (item.date < min ? item.date : min), transactions[0].date);
    const todayDate = today();
    dates.add(todayDate);
    const portfolioToday = await localApi.portfolio();
    const todayNav = new Map(portfolioToday.funds.filter((fund) => fund.nav).map((fund) => [fund.code, fund.nav as number]));
    let previousMarketValue = 0;
    return [...dates]
      .filter((date) => date >= minDate)
      .sort()
      .map((date) => {
        const positions = positionsFromTransactions(transactions, date);
        let marketValue = 0;
        let costAmount = 0;
        positions.forEach((position, code) => {
          const navMap = navByCode.get(code) ?? new Map();
          let nav = date === todayDate ? todayNav.get(code) : navMap.get(date);
          if (!nav) {
            const availableDate = [...navMap.keys()].filter((item) => item <= date).sort().pop();
            nav = availableDate ? navMap.get(availableDate) : undefined;
          }
          if (!nav) return;
          marketValue += position.shares * nav;
          costAmount += position.costAmount;
        });
        const buyFlow = transactions.filter((item) => item.date === date && item.type === "buy").reduce((sum, item) => sum + item.amount + item.fee, 0);
        const sellFlow = transactions.filter((item) => item.date === date && item.type === "sell").reduce((sum, item) => sum + item.amount, 0);
        const dailyProfit = date === todayDate ? portfolioToday.summary.daily_profit : marketValue - previousMarketValue - buyFlow + sellFlow;
        previousMarketValue = marketValue;
        return {
          date,
          market_value: round(marketValue),
          daily_profit: round(dailyProfit),
          holding_profit: round(marketValue - costAmount)
        };
      });
  },

  async transactions() {
    return [...loadTransactions()].sort((a, b) => `${a.date}-${a.code}-${a.id}`.localeCompare(`${b.date}-${b.code}-${b.id}`));
  },

  async addTransaction(payload: TransactionInput) {
    const transactions = loadTransactions();
    transactions.push({ id: newTransactionId(), ...payload });
    saveTransactions(transactions);
    return localApi.transactions();
  },

  async deleteTransaction(id: string) {
    const transactions = loadTransactions().filter((transaction) => transaction.id !== id);
    saveTransactions(transactions);
    return localApi.transactions();
  }
};
