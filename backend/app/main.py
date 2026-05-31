from __future__ import annotations

import asyncio
from datetime import datetime
from collections import defaultdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import eastmoney
from .models import DailySummaryPoint, FundSearchItem, Holding, HoldingIn, HoldingUpdate, PortfolioResponse, PortfolioSummary, Transaction, TransactionIn
from .storage import load_holdings, load_transactions, new_transaction_id, normalize_order, save_holdings, save_transactions

app = FastAPI(title="Funds Web API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _round(value: float | int | None) -> float:
    return round(float(value or 0), 2)


async def _holding_values_from_amount(code: str, amount: float, profit: float | None) -> tuple[float, float]:
    if amount <= 0:
        return 0, 0
    quotes = await eastmoney.fetch_quotes([code])
    quote = quotes[0] if quotes else {}
    nav = quote.get("nav") or quote.get("estimate") or 0
    if nav <= 0:
        raise HTTPException(status_code=422, detail="暂时无法获取该基金净值，不能按持仓金额换算")
    shares = amount / nav
    cost_amount = amount - float(profit or 0)
    cost = cost_amount / shares if shares else 0
    return shares, max(cost, 0)


def _positions_from_transactions(transactions: list[Transaction], through_date: str | None = None) -> dict[str, dict[str, float]]:
    positions: dict[str, dict[str, float]] = defaultdict(lambda: {"shares": 0.0, "cost_amount": 0.0})
    for transaction in sorted(transactions, key=lambda item: (item.date, item.id)):
        if through_date and transaction.date > through_date:
            continue
        position = positions[transaction.code]
        if transaction.type == "buy":
            position["shares"] += transaction.shares
            position["cost_amount"] += transaction.amount + transaction.fee
            continue
        if position["shares"] <= 0 or transaction.shares <= 0:
            continue
        sold_shares = min(transaction.shares, position["shares"])
        average_cost = position["cost_amount"] / position["shares"] if position["shares"] else 0
        position["shares"] -= sold_shares
        position["cost_amount"] = max(0, position["cost_amount"] - average_cost * sold_shares)
    return {code: values for code, values in positions.items() if values["shares"] > 0.000001}


def _holdings_from_transactions(transactions: list[Transaction]) -> list[Holding]:
    positions = _positions_from_transactions(transactions)
    holdings = []
    for index, code in enumerate(positions):
        values = positions[code]
        cost = values["cost_amount"] / values["shares"] if values["shares"] else 0
        holdings.append(Holding(code=code, shares=values["shares"], cost=cost, order=index))
    return holdings


async def _transaction_from_amount(code: str, amount: float, profit: float | None, note: str = "") -> Transaction:
    shares, cost = await _holding_values_from_amount(code, amount, profit)
    return Transaction(
        id=new_transaction_id(),
        date=datetime.now().date().isoformat(),
        code=code,
        type="buy",
        amount=_round(shares * cost),
        shares=shares,
        nav=cost,
        fee=0,
        note=note,
    )


def _enrich_quotes(holdings: list[Holding], quotes: list[dict]) -> PortfolioResponse:
    quote_map = {quote["code"]: quote for quote in quotes if quote.get("code")}
    funds = []
    for holding in holdings:
        quote = {
            "code": holding.code,
            "name": holding.code,
            "nav_date": None,
            "nav": None,
            "estimate": None,
            "change_rate": 0,
            "update_time": None,
            "has_settled_nav": False,
            **quote_map.get(holding.code, {}),
        }
        nav = quote.get("nav") or 0
        estimate = quote.get("estimate")
        change_rate = quote.get("change_rate") or 0
        market_value = nav * holding.shares
        if quote.get("has_settled_nav"):
            previous_nav = nav / (1 + change_rate * 0.01) if change_rate != -100 else nav
            daily_profit = (nav - previous_nav) * holding.shares
        else:
            daily_profit = ((estimate or nav) - nav) * holding.shares if estimate else 0
        holding_profit = (nav - holding.cost) * holding.shares if holding.cost else 0
        holding_profit_rate = ((nav - holding.cost) / holding.cost * 100) if holding.cost else 0
        funds.append(
            {
                **quote,
                "shares": holding.shares,
                "cost": holding.cost,
                "market_value": _round(market_value),
                "daily_profit": _round(daily_profit),
                "holding_profit": _round(holding_profit),
                "holding_profit_rate": _round(holding_profit_rate),
            }
        )

    market_value = sum(item["market_value"] for item in funds)
    daily_profit = sum(item["daily_profit"] for item in funds)
    holding_profit = sum(item["holding_profit"] for item in funds)
    summary = PortfolioSummary(
        market_value=_round(market_value),
        daily_profit=_round(daily_profit),
        daily_profit_rate=_round((daily_profit * 100 / market_value) if market_value else 0),
        holding_profit=_round(holding_profit),
        holding_profit_rate=_round((holding_profit * 100 / (market_value - holding_profit)) if market_value != holding_profit else 0),
        updated_at=datetime.now().isoformat(timespec="seconds"),
    )
    return PortfolioResponse(summary=summary, funds=funds)


async def _portfolio_from_transactions() -> PortfolioResponse:
    holdings = _holdings_from_transactions(load_transactions())
    quotes = await eastmoney.fetch_quotes([holding.code for holding in holdings])
    return _enrich_quotes(holdings, quotes)


def _date_from_point(point: dict) -> datetime | None:
    raw_date = point.get("date")
    if not raw_date:
        return None
    try:
        return datetime.fromisoformat(str(raw_date))
    except ValueError:
        return None


def _yield_history_matches_nav(nav: list[dict], yield_history: list[dict]) -> bool:
    nav_dates = [_date_from_point(point) for point in nav]
    yield_dates = [_date_from_point(point) for point in yield_history]
    nav_dates = [item for item in nav_dates if item]
    yield_dates = [item for item in yield_dates if item]
    if not nav_dates or not yield_dates:
        return False
    return abs((max(nav_dates) - max(yield_dates)).days) <= 7


def _yield_history_from_nav(nav: list[dict]) -> list[dict]:
    usable = [point for point in nav if point.get("date") and point.get("accumulative_nav")]
    if not usable:
        return []
    base_nav = float(usable[0]["accumulative_nav"])
    if base_nav <= 0:
        return []
    return [
        {
            "date": point["date"],
            "yield_rate": _round((float(point["accumulative_nav"]) - base_nav) * 100 / base_nav),
            "benchmark_yield": None,
        }
        for point in usable
    ]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search", response_model=list[FundSearchItem])
async def search(keyword: str) -> list[dict]:
    if len(keyword.strip()) < 2:
        return []
    return await eastmoney.search_funds(keyword.strip())


@app.get("/api/holdings", response_model=list[Holding])
def get_holdings() -> list[Holding]:
    return _holdings_from_transactions(load_transactions())


@app.post("/api/holdings", response_model=list[Holding])
async def add_holding(payload: HoldingIn) -> list[Holding]:
    transactions = load_transactions()
    holdings = _holdings_from_transactions(transactions)
    if any(item.code == payload.code for item in holdings):
        raise HTTPException(status_code=409, detail="基金已在持仓中")
    if payload.amount is not None:
        transactions.append(await _transaction_from_amount(payload.code, payload.amount, payload.profit, "从持仓金额添加"))
    else:
        transactions.append(
            Transaction(
                id=new_transaction_id(),
                date=datetime.now().date().isoformat(),
                code=payload.code,
                type="buy",
                amount=_round(payload.shares * payload.cost),
                shares=payload.shares,
                nav=payload.cost,
                fee=0,
                note="从份额和成本添加",
            )
        )
    save_transactions(transactions)
    return _holdings_from_transactions(transactions)


@app.patch("/api/holdings/{code}", response_model=list[Holding])
async def update_holding(code: str, payload: HoldingUpdate) -> list[Holding]:
    transactions = load_transactions()
    holdings = _holdings_from_transactions(transactions)
    if not any(item.code == code for item in holdings):
        raise HTTPException(status_code=404, detail="基金不存在")
    transactions = [transaction for transaction in transactions if transaction.code != code]
    if payload.amount is not None:
        transactions.append(await _transaction_from_amount(code, payload.amount, payload.profit, "从持仓编辑重置"))
    else:
        current = next(item for item in holdings if item.code == code)
        shares = payload.shares if payload.shares is not None else current.shares
        cost = payload.cost if payload.cost is not None else current.cost
        transactions.append(
            Transaction(
                id=new_transaction_id(),
                date=datetime.now().date().isoformat(),
                code=code,
                type="buy",
                amount=_round(shares * cost),
                shares=shares,
                nav=cost,
                fee=0,
                note="从持仓编辑重置",
            )
        )
    save_transactions(transactions)
    return _holdings_from_transactions(transactions)


@app.delete("/api/holdings/{code}", response_model=list[Holding])
def delete_holding(code: str) -> list[Holding]:
    transactions = [transaction for transaction in load_transactions() if transaction.code != code]
    save_transactions(transactions)
    return _holdings_from_transactions(transactions)


@app.get("/api/portfolio", response_model=PortfolioResponse)
async def portfolio() -> PortfolioResponse:
    return await _portfolio_from_transactions()


@app.get("/api/transactions", response_model=list[Transaction])
def get_transactions() -> list[Transaction]:
    return sorted(load_transactions(), key=lambda item: (item.date, item.code, item.id))


@app.post("/api/transactions", response_model=list[Transaction])
def add_transaction(payload: TransactionIn) -> list[Transaction]:
    transactions = load_transactions()
    transactions.append(Transaction(id=new_transaction_id(), **payload.model_dump()))
    save_transactions(transactions)
    return sorted(transactions, key=lambda item: (item.date, item.code, item.id))


@app.delete("/api/transactions/{transaction_id}", response_model=list[Transaction])
def delete_transaction(transaction_id: str) -> list[Transaction]:
    transactions = [transaction for transaction in load_transactions() if transaction.id != transaction_id]
    save_transactions(transactions)
    return sorted(transactions, key=lambda item: (item.date, item.code, item.id))


@app.get("/api/funds/{code}/detail")
async def fund_detail(code: str) -> dict:
    return await eastmoney.fetch_fund_info(code)


@app.get("/api/funds/{code}/positions")
async def fund_positions(code: str) -> dict:
    return await eastmoney.fetch_positions(code)


@app.get("/api/funds/{code}/history")
async def fund_history(code: str, range: str = "y") -> dict[str, list[dict]]:
    nav_result, yield_result = await asyncio.gather(
        eastmoney.fetch_nav_history(code, range),
        eastmoney.fetch_yield_history(code, range),
        return_exceptions=True,
    )
    nav = [] if isinstance(nav_result, Exception) else nav_result
    yield_history = [] if isinstance(yield_result, Exception) else yield_result
    if not _yield_history_matches_nav(nav, yield_history):
        yield_history = _yield_history_from_nav(nav)
    return {"nav": nav, "yield": yield_history}


@app.get("/api/summary/history", response_model=list[DailySummaryPoint])
async def summary_history() -> list[DailySummaryPoint]:
    transactions = load_transactions()
    if not transactions:
        return []
    codes = sorted({transaction.code for transaction in transactions})
    nav_results = await asyncio.gather(*(eastmoney.fetch_nav_history(code, "5n") for code in codes), return_exceptions=True)
    nav_by_code: dict[str, dict[str, float]] = {}
    all_dates: set[str] = set()
    for code, result in zip(codes, nav_results):
        if isinstance(result, Exception):
            nav_by_code[code] = {}
            continue
        by_date = {str(point["date"]): float(point["nav"]) for point in result if point.get("date") and point.get("nav")}
        nav_by_code[code] = by_date
        all_dates.update(by_date)

    min_transaction_date = min(transaction.date for transaction in transactions)
    dates = sorted(date for date in all_dates if date >= min_transaction_date)
    today = datetime.now().date().isoformat()
    if today not in dates:
        dates.append(today)

    portfolio_today = await _portfolio_from_transactions()
    today_nav = {fund.code: fund.nav for fund in portfolio_today.funds if fund.nav}

    points: list[DailySummaryPoint] = []
    previous_market_value = 0.0
    for point_date in dates:
        positions = _positions_from_transactions(transactions, point_date)
        market_value = 0.0
        cost_amount = 0.0
        for code, position in positions.items():
            nav = today_nav.get(code) if point_date == today else nav_by_code.get(code, {}).get(point_date)
            if nav is None:
                available_dates = [date for date in nav_by_code.get(code, {}) if date <= point_date]
                if available_dates:
                    nav = nav_by_code[code][max(available_dates)]
            if nav is None:
                continue
            market_value += position["shares"] * nav
            cost_amount += position["cost_amount"]
        buy_flow = sum(transaction.amount + transaction.fee for transaction in transactions if transaction.date == point_date and transaction.type == "buy")
        sell_flow = sum(transaction.amount for transaction in transactions if transaction.date == point_date and transaction.type == "sell")
        daily_profit = market_value - previous_market_value - buy_flow + sell_flow
        if point_date == today:
            daily_profit = portfolio_today.summary.daily_profit
        points.append(
            DailySummaryPoint(
                date=point_date,
                market_value=_round(market_value),
                daily_profit=_round(daily_profit),
                holding_profit=_round(market_value - cost_amount),
            )
        )
        previous_market_value = market_value
    return points
