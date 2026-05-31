from pydantic import BaseModel, Field
from typing import Literal


class HoldingIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=12)
    shares: float = Field(0, ge=0)
    cost: float = Field(0, ge=0)
    amount: float | None = Field(None, ge=0)
    profit: float | None = None


class HoldingUpdate(BaseModel):
    shares: float | None = Field(None, ge=0)
    cost: float | None = Field(None, ge=0)
    amount: float | None = Field(None, ge=0)
    profit: float | None = None


class Holding(BaseModel):
    code: str = Field(..., min_length=1, max_length=12)
    shares: float = Field(0, ge=0)
    cost: float = Field(0, ge=0)
    order: int = 0


class Transaction(BaseModel):
    id: str
    date: str = Field(..., min_length=10, max_length=10)
    code: str = Field(..., min_length=1, max_length=12)
    type: Literal["buy", "sell"] = "buy"
    amount: float = Field(..., ge=0)
    shares: float = Field(..., ge=0)
    nav: float = Field(..., ge=0)
    fee: float = Field(0, ge=0)
    note: str = ""


class TransactionIn(BaseModel):
    date: str = Field(..., min_length=10, max_length=10)
    code: str = Field(..., min_length=1, max_length=12)
    type: Literal["buy", "sell"] = "buy"
    amount: float = Field(..., ge=0)
    shares: float = Field(..., ge=0)
    nav: float = Field(..., ge=0)
    fee: float = Field(0, ge=0)
    note: str = ""


class FundQuote(BaseModel):
    code: str
    name: str
    nav_date: str | None = None
    nav: float | None = None
    estimate: float | None = None
    change_rate: float = 0
    update_time: str | None = None
    has_settled_nav: bool = False
    shares: float = 0
    cost: float = 0
    market_value: float = 0
    daily_profit: float = 0
    holding_profit: float = 0
    holding_profit_rate: float = 0


class PortfolioSummary(BaseModel):
    market_value: float = 0
    daily_profit: float = 0
    daily_profit_rate: float = 0
    holding_profit: float = 0
    holding_profit_rate: float = 0
    updated_at: str


class PortfolioResponse(BaseModel):
    summary: PortfolioSummary
    funds: list[FundQuote]


class FundSearchItem(BaseModel):
    code: str
    name: str
    type: str | None = None


class HistoryPoint(BaseModel):
    date: str
    nav: float | None = None
    accumulative_nav: float | None = None
    growth_rate: float | None = None
    yield_rate: float | None = None
    benchmark_yield: float | None = None


class DailySummaryPoint(BaseModel):
    date: str
    market_value: float
    daily_profit: float
    holding_profit: float
