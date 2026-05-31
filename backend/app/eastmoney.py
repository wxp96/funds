from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx

BASE_MOBILE = "https://fundmobapi.eastmoney.com"
BASE_SEARCH = "https://fundsuggest.eastmoney.com"
BASE_PUSH = "https://push2.eastmoney.com"
BASE_PUSH_DELAY = "https://push2delay.eastmoney.com"
BASE_LEGACY_GZ = "https://fundgz.1234567.com.cn"
BASE_DATACENTER = "https://datacenter-web.eastmoney.com"
BASE_FINNHUB = "https://finnhub.io/api/v1"
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 FundsWeb/1.0",
    "Referer": "https://fund.eastmoney.com/",
}


def _load_dotenv() -> None:
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _number(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in (None, "", "--"):
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _round(value: float | int | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


def _nonzero_number(*values: Any) -> float | None:
    for value in values:
        number = _number(value)
        if number not in (None, 0):
            return number
    return None


async def _get_json(url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=12, headers=DEFAULT_HEADERS, trust_env=False) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


async def _fetch_datacenter(report_name: str, filter_value: str, page_size: int = 20) -> list[dict[str, Any]]:
    payload = await _get_json(
        f"{BASE_DATACENTER}/api/data/v1/get",
        {
            "reportName": report_name,
            "columns": "ALL",
            "source": "WEB",
            "pageNumber": 1,
            "pageSize": page_size,
            "filter": filter_value,
        },
    )
    result = payload.get("result") or {}
    return result.get("data") or []


async def _fetch_finnhub(path: str, params: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        return {}
    query = {**params, "token": api_key}
    async with httpx.AsyncClient(timeout=12, trust_env=False) as client:
        response = await client.get(f"{BASE_FINNHUB}{path}", params=query)
        response.raise_for_status()
        return response.json()


async def _fetch_legacy_estimates(codes: list[str]) -> dict[str, dict[str, Any]]:
    if not codes:
        return {}

    async def fetch_one(client: httpx.AsyncClient, code: str) -> tuple[str, dict[str, Any] | None]:
        response = await client.get(
            f"{BASE_LEGACY_GZ}/js/{code}.js",
            params={"rt": int(time.time() * 1000)},
        )
        if response.status_code != 200:
            return code, None
        match = re.search(r"jsonpgz\((.*)\);?", response.text.strip())
        if not match:
            return code, None
        try:
            return code, json.loads(match.group(1))
        except json.JSONDecodeError:
            return code, None

    async with httpx.AsyncClient(timeout=12, headers=DEFAULT_HEADERS, trust_env=False) as client:
        results = await asyncio.gather(*(fetch_one(client, code) for code in codes), return_exceptions=True)

    estimates: dict[str, dict[str, Any]] = {}
    for result in results:
        if isinstance(result, Exception):
            continue
        code, payload = result
        if payload:
            estimates[code] = payload
    return estimates


async def search_funds(keyword: str) -> list[dict[str, Any]]:
    payload = await _get_json(
        f"{BASE_SEARCH}/FundSearch/api/FundSearchAPI.ashx",
        {"m": 9, "key": keyword, "_": int(time.time() * 1000)},
    )
    return [
        {"code": item.get("CODE"), "name": item.get("NAME"), "type": item.get("FundBaseType")}
        for item in payload.get("Datas", [])
        if item.get("CODE") and item.get("NAME")
    ]


async def fetch_quotes(codes: list[str], device_id: str = "funds-web") -> list[dict[str, Any]]:
    if not codes:
        return []
    payload = await _get_json(
        f"{BASE_MOBILE}/FundMNewApi/FundMNFInfo",
        {
            "pageIndex": 1,
            "pageSize": 200,
            "plat": "Android",
            "appType": "ttjj",
            "product": "EFund",
            "Version": 1,
            "deviceid": device_id,
            "Fcodes": ",".join(codes),
        },
    )
    quotes = []
    expansion = payload.get("Expansion") or {}
    expansion_date = expansion.get("FSRQ") or expansion.get("GZTIME")
    rows = payload.get("Datas", []) or []
    missing_estimate_codes = [
        item.get("FCODE")
        for item in rows
        if item.get("FCODE")
        and _number(item.get("GSZ")) is None
        and item.get("PDATE") != expansion_date
    ]
    legacy_estimates = await _fetch_legacy_estimates(missing_estimate_codes)

    for item in rows:
        nav = _number(item.get("NAV"))
        estimate = _number(item.get("GSZ"))
        nav_change_rate = _number(item.get("NAVCHGRT"))
        change_rate = _number(item.get("GSZZL"))
        nav_date = item.get("PDATE")
        update_time = item.get("GZTIME") or expansion_date
        legacy = legacy_estimates.get(str(item.get("FCODE")))
        if legacy:
            legacy_estimate = _number(legacy.get("gsz"))
            if legacy_estimate is not None:
                estimate = legacy_estimate
                change_rate = _number(legacy.get("gszzl"), change_rate)
                update_time = legacy.get("gztime") or update_time
        has_settled_nav = bool(
            nav_date
            and nav_date != "--"
            and (
                (update_time and str(update_time).startswith(str(nav_date)))
                or (expansion_date and str(expansion_date).startswith(str(nav_date)))
            )
        )
        if has_settled_nav and not legacy:
            estimate = nav
            change_rate = nav_change_rate
        if change_rate is None:
            change_rate = nav_change_rate if nav_change_rate is not None else 0
        quotes.append(
            {
                "code": item.get("FCODE"),
                "name": item.get("SHORTNAME"),
                "nav_date": nav_date,
                "nav": nav,
                "estimate": estimate,
                "change_rate": change_rate,
                "update_time": update_time,
                "has_settled_nav": has_settled_nav,
            }
        )
    return quotes


async def fetch_fund_info(code: str) -> dict[str, Any]:
    payload = await _get_json(
        f"{BASE_MOBILE}/FundMApi/FundBaseTypeInformation.ashx",
        {
            "FCODE": code,
            "deviceid": "Wap",
            "plat": "Wap",
            "product": "EFund",
            "version": "2.0.0",
            "Uid": "",
            "_": int(time.time() * 1000),
        },
    )
    return payload.get("Datas") or {}


async def fetch_positions(code: str) -> dict[str, Any]:
    payload = await _get_json(
        f"{BASE_MOBILE}/FundMNewApi/FundMNInverstPosition",
        {
            "FCODE": code,
            "deviceid": "Wap",
            "plat": "Wap",
            "product": "EFund",
            "version": "2.0.0",
            "Uid": "",
            "_": int(time.time() * 1000),
        },
    )
    stocks = payload.get("Datas", {}).get("fundStocks") or []
    if not stocks:
        return {"date": payload.get("Expansion"), "stocks": []}

    secid_list: list[str] = []
    for item in stocks:
        market = item.get("NEWTEXCH")
        symbol = item.get("GPDM")
        if not market or not symbol:
            continue
        secid_list.append(f"{market}.{symbol}")
        if str(market) in {"105", "106"} and str(symbol).isalpha():
            alternate_market = "106" if str(market) == "105" else "105"
            secid_list.append(f"{alternate_market}.{symbol}")
    secids = ",".join(dict.fromkeys(secid_list))
    stock_quotes: dict[str, dict[str, Any]] = {}
    if secids:
        quote_params = {
            "fields": "f1,f2,f3,f4,f8,f9,f10,f12,f13,f14,f20,f21,f23,f100,f115,f292",
            "fltt": 2,
            "secids": secids,
            "deviceid": "Wap",
            "plat": "Wap",
            "product": "EFund",
            "version": "2.0.0",
            "Uid": "",
        }
        for base_url in (BASE_PUSH, BASE_PUSH_DELAY):
            try:
                quote_payload = await _get_json(f"{base_url}/api/qt/ulist.np/get", quote_params)
                for quote in quote_payload.get("data", {}).get("diff", []) or []:
                    stock_quotes[str(quote.get("f12"))] = quote
                if stock_quotes:
                    break
            except httpx.HTTPError:
                continue

    async def fetch_stock_basic(client: httpx.AsyncClient, quote: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        stock_code = str(quote.get("f12") or "")
        market = quote.get("f13")
        if not stock_code or market is None:
            return stock_code, {}
        fields = "f57,f58,f116,f117,f127,f162,f164,f167,f173,f186,f187"
        for base_url in (BASE_PUSH, BASE_PUSH_DELAY):
            try:
                response = await client.get(
                    f"{base_url}/api/qt/stock/get",
                    params={"secid": f"{market}.{stock_code}", "fltt": 2, "fields": fields},
                )
                response.raise_for_status()
                payload = response.json().get("data") or {}
                if payload:
                    return stock_code, payload
            except (httpx.HTTPError, ValueError):
                continue
        return stock_code, {}

    stock_basics: dict[str, dict[str, Any]] = {}
    if stock_quotes:
        async with httpx.AsyncClient(timeout=12, headers=DEFAULT_HEADERS, trust_env=False) as client:
            basic_results = await asyncio.gather(*(fetch_stock_basic(client, quote) for quote in stock_quotes.values()), return_exceptions=True)
        for result in basic_results:
            if isinstance(result, Exception):
                continue
            stock_code, payload = result
            if stock_code and payload:
                stock_basics[stock_code] = payload

    async def fetch_stock_forecast(stock_code: str) -> tuple[str, dict[str, float | None]]:
        if not re.fullmatch(r"\d{6}", stock_code):
            return stock_code, {"expected_growth_rate": None, "peg": None}
        try:
            rows = await _fetch_datacenter("RPT_WEB_RESPREDICT", f'(SECURITY_CODE="{stock_code}")', 5)
        except httpx.HTTPError:
            return stock_code, {"expected_growth_rate": None, "peg": None}
        if not rows:
            return stock_code, {"expected_growth_rate": None, "peg": None}
        row = rows[0]
        year_slots = [
            {
                "year": _number(row.get(f"YEAR{index}")),
                "mark": row.get(f"YEAR_MARK{index}"),
                "eps": _number(row.get(f"EPS{index}")),
            }
            for index in range(1, 5)
        ]
        actual = next((item for item in year_slots if item["mark"] == "A" and item["eps"] and item["eps"] > 0), None)
        forecast = next((item for item in year_slots if item["mark"] == "E" and item["eps"] and item["eps"] > 0 and (not actual or item["year"] and actual["year"] and item["year"] > actual["year"])), None)
        if not actual or not forecast:
            return stock_code, {"expected_growth_rate": None, "peg": None}
        year_gap = max(1, int(float(forecast["year"] or 0) - float(actual["year"] or 0)))
        growth_rate = ((float(forecast["eps"] or 0) / float(actual["eps"] or 1)) ** (1 / year_gap) - 1) * 100
        return stock_code, {"expected_growth_rate": _round(growth_rate), "peg": None}

    async def fetch_stock_sales(stock_code: str) -> tuple[str, dict[str, float | None]]:
        if not re.fullmatch(r"\d{6}", stock_code):
            return stock_code, {"sales_ttm": None, "ps": None}
        try:
            rows = await _fetch_datacenter("RPT_LICO_FN_CPD", f'(SECURITY_CODE="{stock_code}")', 80)
        except httpx.HTTPError:
            return stock_code, {"sales_ttm": None, "ps": None}
        dated_rows = [row for row in rows if row.get("REPORTDATE") and _number(row.get("TOTAL_OPERATE_INCOME")) is not None]
        if not dated_rows:
            return stock_code, {"sales_ttm": None, "ps": None}
        dated_rows.sort(key=lambda row: str(row.get("REPORTDATE")), reverse=True)
        latest = dated_rows[0]
        latest_date = str(latest.get("REPORTDATE"))[:10]
        latest_revenue = _number(latest.get("TOTAL_OPERATE_INCOME"))
        if latest_revenue is None:
            return stock_code, {"sales_ttm": None, "ps": None}
        if latest_date.endswith("12-31"):
            return stock_code, {"sales_ttm": latest_revenue, "ps": None}
        latest_year = int(latest_date[:4])
        annual_date = f"{latest_year - 1}-12-31"
        previous_period_date = f"{latest_year - 1}-{latest_date[5:]}"
        annual = next((row for row in dated_rows if str(row.get("REPORTDATE")).startswith(annual_date)), None)
        previous_period = next((row for row in dated_rows if str(row.get("REPORTDATE")).startswith(previous_period_date)), None)
        annual_revenue = _number(annual.get("TOTAL_OPERATE_INCOME") if annual else None)
        previous_revenue = _number(previous_period.get("TOTAL_OPERATE_INCOME") if previous_period else None)
        if annual_revenue is None or previous_revenue is None:
            return stock_code, {"sales_ttm": latest_revenue, "ps": None}
        return stock_code, {"sales_ttm": annual_revenue + latest_revenue - previous_revenue, "ps": None}

    def estimate_growth_from_finnhub(data: list[dict[str, Any]]) -> float | None:
        points = []
        for item in data:
            period = str(item.get("period") or item.get("date") or "")
            year_match = re.search(r"\d{4}", period)
            eps = _number(item.get("epsAvg") or item.get("epsAverage") or item.get("eps"))
            if year_match and eps and eps > 0:
                points.append((int(year_match.group(0)), eps))
        points = sorted(dict(points).items())
        if len(points) < 2:
            return None
        current_year, current_eps = points[0]
        next_year, next_eps = points[1]
        year_gap = max(1, next_year - current_year)
        return ((next_eps / current_eps) ** (1 / year_gap) - 1) * 100

    async def fetch_finnhub_metrics(stock_code: str) -> tuple[str, dict[str, float | None]]:
        if not re.fullmatch(r"[A-Za-z.]+", stock_code):
            return stock_code, {}
        try:
            metrics_payload, estimates_payload = await asyncio.gather(
                _fetch_finnhub("/stock/metric", {"symbol": stock_code.upper(), "metric": "all"}),
                _fetch_finnhub("/stock/eps-estimate", {"symbol": stock_code.upper(), "freq": "annual"}),
                return_exceptions=True,
            )
        except httpx.HTTPError:
            return stock_code, {}

        metrics = {}
        if not isinstance(metrics_payload, Exception):
            metrics = (metrics_payload or {}).get("metric") or {}
        estimates = []
        if not isinstance(estimates_payload, Exception):
            estimates = (estimates_payload or {}).get("data") or []

        pe_ttm = _number(metrics.get("peTTM") or metrics.get("peNormalizedAnnual"))
        expected_growth_rate = estimate_growth_from_finnhub(estimates)
        peg = _number(metrics.get("pegTTM") or metrics.get("pegAnnual"))
        if peg is None and pe_ttm and expected_growth_rate and expected_growth_rate > 0:
            peg = pe_ttm / expected_growth_rate

        return (
            stock_code,
            {
                "pe_ttm": pe_ttm,
                "pe_dynamic": pe_ttm,
                "pb": _number(metrics.get("pbQuarterly") or metrics.get("pbAnnual")),
                "ps": _number(metrics.get("psTTM") or metrics.get("psAnnual")),
                "peg": _round(peg),
                "expected_growth_rate": _round(expected_growth_rate),
                "roe": _number(metrics.get("roeTTM") or metrics.get("roeAnnual")),
                "gross_margin": _number(metrics.get("grossMarginTTM") or metrics.get("grossMarginAnnual")),
                "net_margin": _number(metrics.get("netProfitMarginTTM") or metrics.get("netProfitMarginAnnual")),
                "sales_ttm": _number(metrics.get("revenueTTM")),
                "total_market_cap": _number(metrics.get("marketCapitalization")),
            },
        )

    forecasts: dict[str, dict[str, float | None]] = {}
    sales: dict[str, dict[str, float | None]] = {}
    finnhub_metrics: dict[str, dict[str, float | None]] = {}
    stock_codes = list(stock_quotes)
    if stock_codes:
        forecast_results = await asyncio.gather(*(fetch_stock_forecast(stock_code) for stock_code in stock_codes), return_exceptions=True)
        sales_results = await asyncio.gather(*(fetch_stock_sales(stock_code) for stock_code in stock_codes), return_exceptions=True)
        finnhub_results = await asyncio.gather(*(fetch_finnhub_metrics(stock_code) for stock_code in stock_codes), return_exceptions=True)
        for result in forecast_results:
            if isinstance(result, Exception):
                continue
            stock_code, payload = result
            forecasts[stock_code] = payload
        for result in sales_results:
            if isinstance(result, Exception):
                continue
            stock_code, payload = result
            sales[stock_code] = payload
        for result in finnhub_results:
            if isinstance(result, Exception):
                continue
            stock_code, payload = result
            if payload:
                finnhub_metrics[stock_code] = payload

    rows = []
    for stock in stocks:
        quote = stock_quotes.get(str(stock.get("GPDM")), {})
        basic = stock_basics.get(str(stock.get("GPDM")), {})
        stock_code = str(stock.get("GPDM"))
        forecast = forecasts.get(stock_code, {})
        sale = sales.get(stock_code, {})
        finnhub = finnhub_metrics.get(stock_code, {})
        pe_ttm = _nonzero_number(finnhub.get("pe_ttm"), basic.get("f164"), quote.get("f115"), quote.get("f9"))
        total_market_cap = _nonzero_number(basic.get("f116"), quote.get("f20"), finnhub.get("total_market_cap"))
        sales_ttm = _number(sale.get("sales_ttm"))
        expected_growth_rate = _number(forecast.get("expected_growth_rate"), _number(finnhub.get("expected_growth_rate")))
        ps = _number(finnhub.get("ps"))
        if ps is None and total_market_cap and sales_ttm and sales_ttm > 0:
            ps = total_market_cap / sales_ttm
        peg = _number(finnhub.get("peg"))
        if peg is None and pe_ttm and expected_growth_rate and expected_growth_rate > 0:
            peg = pe_ttm / expected_growth_rate
        rows.append(
            {
                "name": stock.get("GPJC"),
                "code": stock.get("GPDM"),
                "price": _number(quote.get("f2")),
                "change_rate": _number(quote.get("f3")),
                "turnover_rate": _number(quote.get("f8")),
                "volume_ratio": _number(quote.get("f10")),
                "weight": _number(stock.get("JZBL"), 0),
                "change_from_last": stock.get("PCTNVCHGTYPE") or _number(stock.get("PCTNVCHG"), 0),
                "industry": basic.get("f127") or quote.get("f100"),
                "pe_dynamic": _nonzero_number(finnhub.get("pe_dynamic"), basic.get("f162"), quote.get("f9")),
                "pe_ttm": pe_ttm,
                "pb": _nonzero_number(finnhub.get("pb"), basic.get("f167"), quote.get("f23")),
                "ps": _round(ps),
                "peg": _round(peg),
                "expected_growth_rate": expected_growth_rate,
                "sales_ttm": _round(sales_ttm or _number(finnhub.get("sales_ttm"))),
                "roe": _nonzero_number(basic.get("f173"), finnhub.get("roe")),
                "gross_margin": _nonzero_number(basic.get("f186"), finnhub.get("gross_margin")),
                "net_margin": _nonzero_number(basic.get("f187"), finnhub.get("net_margin")),
                "total_market_cap": total_market_cap,
                "float_market_cap": _nonzero_number(basic.get("f117"), quote.get("f21")),
            }
        )
    return {"date": payload.get("Expansion"), "stocks": rows}


async def fetch_nav_history(code: str, range_code: str = "y") -> list[dict[str, Any]]:
    payload = await _get_json(
        f"{BASE_MOBILE}/FundMApi/FundNetDiagram.ashx",
        {
            "FCODE": code,
            "RANGE": range_code,
            "deviceid": "Wap",
            "plat": "Wap",
            "product": "EFund",
            "version": "2.0.0",
            "_": int(time.time() * 1000),
        },
    )
    return [
        {
            "date": item.get("FSRQ"),
            "nav": _number(item.get("DWJZ")),
            "accumulative_nav": _number(item.get("LJJZ")),
            "growth_rate": _number(item.get("JZZZL")),
        }
        for item in payload.get("Datas", []) or []
    ]


async def fetch_yield_history(code: str, range_code: str = "y") -> list[dict[str, Any]]:
    payload = await _get_json(
        f"{BASE_MOBILE}/FundMApi/FundYieldDiagramNew.ashx",
        {
            "FCODE": code,
            "RANGE": range_code,
            "deviceid": "Wap",
            "plat": "Wap",
            "product": "EFund",
            "version": "2.0.0",
            "_": int(time.time() * 1000),
        },
    )
    return [
        {
            "date": item.get("PDATE"),
            "yield_rate": _number(item.get("YIELD")),
            "benchmark_yield": _number(item.get("INDEXYIED")),
        }
        for item in payload.get("Datas", []) or []
    ]
