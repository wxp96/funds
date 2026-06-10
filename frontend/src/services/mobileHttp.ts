import { Capacitor, CapacitorHttp } from "@capacitor/core";

type QueryValue = string | number | boolean | null | undefined;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

function queryString(params?: Record<string, QueryValue>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  });
  return search.toString();
}

function parseJsonData<T>(data: unknown): T {
  if (typeof data === "string") {
    return JSON.parse(data) as T;
  }
  return data as T;
}

export async function getJson<T>(url: string, params?: Record<string, QueryValue>): Promise<T> {
  if (isNativeApp()) {
    const response = await CapacitorHttp.get({
      url,
      params: Object.fromEntries(Object.entries(params ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)])),
      headers: {
        "User-Agent": "Mozilla/5.0 FundsMobile/1.0",
        Referer: "https://fund.eastmoney.com/"
      }
    });
    return parseJsonData<T>(response.data);
  }

  const suffix = queryString(params);
  const response = await fetch(`${url}${suffix ? `?${suffix}` : ""}`, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 FundsMobile/1.0",
      Referer: "https://fund.eastmoney.com/"
    }
  });
  if (!response.ok) {
    throw new Error("外部接口请求失败");
  }
  return response.json() as Promise<T>;
}

export async function getText(url: string, params?: Record<string, QueryValue>): Promise<string> {
  if (isNativeApp()) {
    const response = await CapacitorHttp.get({
      url,
      params: Object.fromEntries(Object.entries(params ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)])),
      headers: {
        "User-Agent": "Mozilla/5.0 FundsMobile/1.0",
        Referer: "https://fund.eastmoney.com/"
      },
      responseType: "text"
    });
    return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
  }

  const suffix = queryString(params);
  const response = await fetch(`${url}${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("外部接口请求失败");
  }
  return response.text();
}
