import type { FundSearchItem, HistoryPoint } from "../types";
import { loadSettings } from "../storage/localStore";
import { getJson, getText } from "./mobileHttp";

const baseMobile = "https://fundmobapi.eastmoney.com";
const baseSearch = "https://fundsuggest.eastmoney.com";
const baseLegacyGz = "https://fundgz.1234567.com.cn";
const baseFinnhub = "https://finnhub.io/api/v1";
const basePush = "https://push2.eastmoney.com";
const basePushDelay = "https://push2delay.eastmoney.com";
const baseDatacenter = "https://datacenter-web.eastmoney.com";

type RawRecord = Record<string, unknown>;

function numberValue(value: unknown, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === "" || value === "--") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value.toFixed(2));
}

function nonZeroNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = numberValue(value);
    if (numeric !== null && numeric !== 0) return numeric;
  }
  return null;
}

function rawList(payload: RawRecord) {
  return Array.isArray(payload.Datas) ? (payload.Datas as RawRecord[]) : [];
}

async function fetchDatacenter(reportName: string, filter: string, pageSize = 20) {
  const payload = await getJson<RawRecord>(`${baseDatacenter}/api/data/v1/get`, {
    reportName,
    columns: "ALL",
    source: "WEB",
    pageNumber: 1,
    pageSize,
    filter
  });
  const result = (payload.result as RawRecord | undefined) ?? {};
  return Array.isArray(result.data) ? (result.data as RawRecord[]) : [];
}

async function fetchLegacyEstimate(code: string): Promise<RawRecord | null> {
  try {
    const text = await getText(`${baseLegacyGz}/js/${code}.js`, { rt: Date.now() });
    const match = text.trim().match(/^jsonpgz\((.*)\);?$/);
    return match ? (JSON.parse(match[1]) as RawRecord) : null;
  } catch {
    return null;
  }
}

async function fetchFinnhubMetrics(symbol: string) {
  const token = loadSettings().finnhubApiKey.trim();
  if (!token || !symbol || !/^[A-Z.]+$/i.test(symbol)) return {};
  try {
    const payload = await getJson<RawRecord>(`${baseFinnhub}/stock/metric`, {
      symbol: symbol.toUpperCase(),
      metric: "all",
      token
    });
    const metric = (payload.metric as RawRecord | undefined) ?? {};
    const peTtm = round(numberValue(metric.peTTM));
    return {
      pe_ttm: peTtm,
      pe_dynamic: peTtm,
      pb: round(numberValue(metric.pbAnnual)),
      ps: round(numberValue(metric.psTTM)),
      peg: round(numberValue(metric.pegTTM)),
      roe: round(numberValue(metric.roeTTM)),
      gross_margin: round(numberValue(metric.grossMarginTTM)),
      net_margin: round(numberValue(metric.netProfitMarginTTM)),
      total_market_cap: round(numberValue(metric.marketCapitalization))
    };
  } catch {
    return {};
  }
}

async function fetchFirstPushJson(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  for (const baseUrl of [basePush, basePushDelay]) {
    try {
      const payload = await getJson<RawRecord>(`${baseUrl}${path}`, params);
      const data = payload.data as RawRecord | undefined;
      if (data) return data;
    } catch {
      // Try the delayed quote endpoint next.
    }
  }
  return {};
}

async function fetchStockBasic(market: string | number | null | undefined, stockCode: string) {
  if (market === null || market === undefined || !stockCode) return {};
  const data = await fetchFirstPushJson("/api/qt/stock/get", {
    secid: `${market}.${stockCode}`,
    fltt: 2,
    fields: "f57,f58,f116,f117,f127,f162,f164,f167,f173,f186,f187"
  });
  return data;
}

async function fetchStockForecast(stockCode: string) {
  if (!/^\d{6}$/.test(stockCode)) return {};
  try {
    const rows = await fetchDatacenter("RPT_WEB_RESPREDICT", `(SECURITY_CODE="${stockCode}")`, 5);
    const row = rows[0];
    if (!row) return {};
    const slots = [1, 2, 3, 4].map((index) => ({
      year: numberValue(row[`YEAR${index}`]),
      mark: row[`YEAR_MARK${index}`],
      eps: numberValue(row[`EPS${index}`])
    }));
    const actual = slots.find((item) => item.mark === "A" && item.eps && item.eps > 0);
    const forecast = slots.find((item) => item.mark === "E" && item.eps && item.eps > 0 && (!actual || (item.year && actual.year && item.year > actual.year)));
    if (!actual?.eps || !forecast?.eps) return {};
    const yearGap = Math.max(1, Math.trunc((forecast.year ?? 0) - (actual.year ?? 0)));
    const expectedGrowthRate = (Math.pow(forecast.eps / actual.eps, 1 / yearGap) - 1) * 100;
    return { expected_growth_rate: round(expectedGrowthRate) };
  } catch {
    return {};
  }
}

async function fetchStockSales(stockCode: string) {
  if (!/^\d{6}$/.test(stockCode)) return {};
  try {
    const rows = await fetchDatacenter("RPT_LICO_FN_CPD", `(SECURITY_CODE="${stockCode}")`, 80);
    const datedRows = rows
      .filter((row) => row.REPORTDATE && numberValue(row.TOTAL_OPERATE_INCOME) !== null)
      .sort((a, b) => String(b.REPORTDATE).localeCompare(String(a.REPORTDATE)));
    const latest = datedRows[0];
    if (!latest) return {};
    const latestDate = String(latest.REPORTDATE).slice(0, 10);
    const latestRevenue = numberValue(latest.TOTAL_OPERATE_INCOME);
    if (latestRevenue === null) return {};
    if (latestDate.endsWith("12-31")) return { sales_ttm: latestRevenue };
    const latestYear = Number(latestDate.slice(0, 4));
    const annualDate = `${latestYear - 1}-12-31`;
    const previousPeriodDate = `${latestYear - 1}-${latestDate.slice(5)}`;
    const annual = datedRows.find((row) => String(row.REPORTDATE).startsWith(annualDate));
    const previousPeriod = datedRows.find((row) => String(row.REPORTDATE).startsWith(previousPeriodDate));
    const annualRevenue = numberValue(annual?.TOTAL_OPERATE_INCOME);
    const previousRevenue = numberValue(previousPeriod?.TOTAL_OPERATE_INCOME);
    if (annualRevenue === null || previousRevenue === null) return { sales_ttm: latestRevenue };
    return { sales_ttm: annualRevenue + latestRevenue - previousRevenue };
  } catch {
    return {};
  }
}

export async function searchFunds(keyword: string): Promise<FundSearchItem[]> {
  const query = keyword.trim();
  if (query.length < 2) return [];

  async function exactCodeFallback() {
    if (!/^\d{6}$/.test(query)) return [];
    const [quote] = await fetchQuotes([query]);
    return quote?.code
      ? [
          {
            code: quote.code,
            name: quote.name,
            type: null
          }
        ]
      : [];
  }

  try {
    const payload = await getJson<RawRecord>(`${baseSearch}/FundSearch/api/FundSearchAPI.ashx`, {
      m: 9,
      key: query,
      _: Date.now()
    });
    const rows = Array.isArray(payload.Datas) ? (payload.Datas as RawRecord[]) : [];
    const results = rows
      .filter((item) => item.CODE && item.NAME)
      .map((item) => ({
        code: String(item.CODE),
        name: String(item.NAME),
        type: item.FundBaseType ? String(item.FundBaseType) : null
      }));
    return results.length ? results : exactCodeFallback();
  } catch {
    return exactCodeFallback();
  }
}

export async function fetchQuotes(codes: string[]) {
  if (!codes.length) return [];
  const payload = await getJson<RawRecord>(`${baseMobile}/FundMNewApi/FundMNFInfo`, {
    pageIndex: 1,
    pageSize: 200,
    plat: "Android",
    appType: "ttjj",
    product: "EFund",
    Version: 1,
    deviceid: "funds-mobile",
    Fcodes: codes.join(",")
  });
  const expansion = (payload.Expansion as RawRecord | undefined) ?? {};
  const expansionDate = expansion.FSRQ ?? expansion.GZTIME;
  const rows = rawList(payload);
  const legacyEntries = await Promise.all(
    rows
      .filter((item) => item.FCODE && numberValue(item.GSZ) === null)
      .map(async (item) => [String(item.FCODE), await fetchLegacyEstimate(String(item.FCODE))] as const)
  );
  const legacyByCode = new Map(legacyEntries);

  return rows.map((item) => {
    const code = String(item.FCODE ?? "");
    const nav = numberValue(item.NAV);
    let estimate = numberValue(item.GSZ);
    const navChangeRate = numberValue(item.NAVCHGRT);
    let changeRate = numberValue(item.GSZZL);
    const navDate = item.PDATE ? String(item.PDATE) : null;
    let updateTime = item.GZTIME ? String(item.GZTIME) : expansionDate ? String(expansionDate) : null;
    const legacy = legacyByCode.get(code);
    if (legacy) {
      const legacyEstimate = numberValue(legacy.gsz);
      const legacyNavDate = legacy.jzrq ? String(legacy.jzrq) : null;
      const legacyIsCurrent = !navDate || !legacyNavDate || legacyNavDate >= navDate;
      if (legacyEstimate !== null && legacyIsCurrent) {
        estimate = legacyEstimate;
        changeRate = numberValue(legacy.gszzl, changeRate);
        updateTime = legacy.gztime ? String(legacy.gztime) : updateTime;
      }
    }
    const hasLiveEstimate = Boolean(estimate !== null && navDate && updateTime && !updateTime.startsWith(navDate));
    const hasSettledNav = Boolean(
      navDate &&
        !hasLiveEstimate &&
        ((updateTime && updateTime.startsWith(navDate)) || (expansionDate && String(expansionDate).startsWith(navDate)))
    );
    if (hasSettledNav && !hasLiveEstimate) {
      estimate = nav;
      changeRate = navChangeRate;
    }
    return {
      code,
      name: item.SHORTNAME ? String(item.SHORTNAME) : code,
      nav_date: navDate,
      nav,
      estimate,
      change_rate: changeRate ?? navChangeRate ?? 0,
      update_time: updateTime,
      has_settled_nav: hasSettledNav
    };
  });
}

export async function fetchFundInfo(code: string) {
  const payload = await getJson<RawRecord>(`${baseMobile}/FundMApi/FundBaseTypeInformation.ashx`, {
    FCODE: code,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0",
    Uid: "",
    _: Date.now()
  });
  return (payload.Datas as RawRecord | undefined) ?? {};
}

export async function fetchPositions(code: string) {
  const payload = await getJson<RawRecord>(`${baseMobile}/FundMNewApi/FundMNInverstPosition`, {
    FCODE: code,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0",
    Uid: "",
    _: Date.now()
  });
  const datas = (payload.Datas as RawRecord | undefined) ?? {};
  const stocks = Array.isArray(datas.fundStocks) ? (datas.fundStocks as RawRecord[]) : [];
  const secids = [
    ...new Set(
      stocks.flatMap((item) => {
        const market = item.NEWTEXCH;
        const symbol = item.GPDM;
        if (!market || !symbol) return [];
        const values = [`${market}.${symbol}`];
        if ((String(market) === "105" || String(market) === "106") && /^[A-Za-z.]+$/.test(String(symbol))) {
          values.push(`${String(market) === "105" ? "106" : "105"}.${symbol}`);
        }
        return values;
      })
    )
  ];
  let quoteRows: RawRecord[] = [];
  if (secids.length) {
    const quoteData = await fetchFirstPushJson("/api/qt/ulist.np/get", {
      fields: "f1,f2,f3,f4,f8,f9,f10,f12,f13,f14,f20,f21,f23,f100,f115,f292",
      fltt: 2,
      secids: secids.join(","),
      deviceid: "Wap",
      plat: "Wap",
      product: "EFund",
      version: "2.0.0",
      Uid: ""
    });
    quoteRows = Array.isArray(quoteData.diff) ? (quoteData.diff as RawRecord[]) : [];
  }
  const quoteByCode = new Map(quoteRows.map((quote) => [String(quote.f12), quote]));
  const basicEntries = await Promise.all(
    quoteRows.map(async (quote) => [String(quote.f12 ?? ""), await fetchStockBasic(quote.f13 as string | number | undefined, String(quote.f12 ?? ""))] as const)
  );
  const basicByCode = new Map(basicEntries.filter(([stockCode]) => stockCode));
  const metricEntries = await Promise.all(
    [...new Set(stocks.map((item) => String(item.GPDM ?? "")).filter(Boolean))].map(async (stockCode) => {
      const [forecast, sales, finnhub] = await Promise.all([fetchStockForecast(stockCode), fetchStockSales(stockCode), fetchFinnhubMetrics(stockCode)]);
      return [stockCode, { forecast, sales, finnhub }] as const;
    })
  );
  const metricsByCode = new Map(metricEntries);
  const enriched = await Promise.all(
    stocks.map(async (item) => {
      const stockCode = String(item.GPDM ?? "");
      const quote = quoteByCode.get(stockCode) ?? {};
      const basic = basicByCode.get(stockCode) ?? {};
      const metrics = metricsByCode.get(stockCode);
      const forecast = metrics?.forecast ?? {};
      const sales = metrics?.sales ?? {};
      const finnhub = metrics?.finnhub ?? {};
      const peTtm = nonZeroNumber(finnhub.pe_ttm, basic.f164, quote.f115, quote.f9);
      const totalMarketCap = nonZeroNumber(basic.f116, quote.f20, finnhub.total_market_cap);
      const salesTtm = numberValue(sales.sales_ttm);
      const expectedGrowthRate = numberValue(forecast.expected_growth_rate);
      let ps = numberValue(finnhub.ps);
      if (ps === null && totalMarketCap && salesTtm && salesTtm > 0) {
        ps = totalMarketCap / salesTtm;
      }
      let peg = numberValue(finnhub.peg);
      if (peg === null && peTtm && expectedGrowthRate && expectedGrowthRate > 0) {
        peg = peTtm / expectedGrowthRate;
      }
      return {
        code: stockCode,
        name: String(item.GPJC ?? item.JC ?? stockCode),
        price: numberValue(quote.f2 ?? item.ZXJ ?? item.NewPrice),
        change_rate: numberValue(quote.f3 ?? item.ZDF ?? item.ChangeRate),
        turnover_rate: numberValue(quote.f8),
        volume_ratio: numberValue(quote.f10),
        weight: numberValue(item.JZBL, 0),
        change_from_last: item.PCTNVCHGTYPE ?? numberValue(item.PCTNVCHG, 0),
        industry: basic.f127 ? String(basic.f127) : quote.f100 ? String(quote.f100) : item.HYMC ? String(item.HYMC) : null,
        pe_dynamic: nonZeroNumber(finnhub.pe_dynamic, basic.f162, quote.f9),
        pe_ttm: peTtm,
        pb: nonZeroNumber(finnhub.pb, basic.f167, quote.f23),
        ps: round(ps),
        peg: round(peg),
        expected_growth_rate: expectedGrowthRate,
        sales_ttm: round(salesTtm),
        roe: nonZeroNumber(basic.f173, finnhub.roe),
        gross_margin: nonZeroNumber(basic.f186, finnhub.gross_margin),
        net_margin: nonZeroNumber(basic.f187, finnhub.net_margin),
        total_market_cap: totalMarketCap,
        float_market_cap: nonZeroNumber(basic.f117, quote.f21)
      };
    })
  );
  return {
    date: payload.Expansion ? String(payload.Expansion) : null,
    stocks: enriched
  };
}

export async function fetchNavHistory(code: string, range = "y"): Promise<HistoryPoint[]> {
  const payload = await getJson<RawRecord>(`${baseMobile}/FundMApi/FundNetDiagram.ashx`, {
    FCODE: code,
    RANGE: range,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0",
    _: Date.now()
  });
  return rawList(payload).map((item) => ({
    date: String(item.FSRQ ?? ""),
    nav: numberValue(item.DWJZ),
    accumulative_nav: numberValue(item.LJJZ),
    growth_rate: numberValue(item.JZZZL)
  }));
}

export async function fetchYieldHistory(code: string, range = "y"): Promise<HistoryPoint[]> {
  const payload = await getJson<RawRecord>(`${baseMobile}/FundMApi/FundYieldDiagramNew.ashx`, {
    FCODE: code,
    RANGE: range,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0",
    _: Date.now()
  });
  return rawList(payload).map((item) => ({
    date: String(item.PDATE ?? ""),
    yield_rate: numberValue(item.YIELD),
    benchmark_yield: numberValue(item.INDEXYIED)
  }));
}
