import type { Transaction } from "../types";

export type AppSettings = {
  finnhubApiKey: string;
};

const transactionsKey = "funds:local-transactions";
const settingsKey = "funds:settings";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadTransactions(): Transaction[] {
  return readJson<Transaction[]>(transactionsKey, []);
}

export function saveTransactions(transactions: Transaction[]) {
  writeJson(transactionsKey, transactions);
}

export function newTransactionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function loadSettings(): AppSettings {
  return readJson<AppSettings>(settingsKey, { finnhubApiKey: "" });
}

export function saveSettings(settings: AppSettings) {
  writeJson(settingsKey, settings);
}
