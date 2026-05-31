from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from .models import Holding, Transaction

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_FILE = DATA_DIR / "portfolio.json"
TRANSACTIONS_FILE = DATA_DIR / "transactions.json"


def load_holdings() -> list[Holding]:
    if not DATA_FILE.exists():
        return [Holding(code="001618", shares=0, cost=0, order=0)]
    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return [Holding(**item) for item in raw.get("holdings", [])]


def save_holdings(holdings: list[Holding]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"holdings": [holding.model_dump() for holding in holdings]}
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_order(holdings: list[Holding]) -> list[Holding]:
    for index, holding in enumerate(holdings):
        holding.order = index
    return holdings


def _transactions_from_legacy_holdings() -> list[Transaction]:
    holdings = load_holdings()
    transactions = []
    today = datetime.now().date().isoformat()
    for holding in holdings:
        if holding.shares <= 0 or holding.cost <= 0:
            continue
        transactions.append(
            Transaction(
                id=f"legacy-{holding.code}",
                date=today,
                code=holding.code,
                type="buy",
                amount=round(holding.shares * holding.cost, 2),
                shares=holding.shares,
                nav=holding.cost,
                fee=0,
                note="从旧持仓自动迁移",
            )
        )
    return transactions


def load_transactions() -> list[Transaction]:
    if not TRANSACTIONS_FILE.exists():
        transactions = _transactions_from_legacy_holdings()
        save_transactions(transactions)
        return transactions
    raw = json.loads(TRANSACTIONS_FILE.read_text(encoding="utf-8"))
    return [Transaction(**item) for item in raw.get("transactions", [])]


def save_transactions(transactions: list[Transaction]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"transactions": [transaction.model_dump() for transaction in transactions]}
    TRANSACTIONS_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def new_transaction_id() -> str:
    return uuid4().hex
