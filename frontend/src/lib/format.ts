export function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function percent(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function tone(value: number | null | undefined) {
  return Number(value || 0) >= 0 ? "text-gain" : "text-loss";
}
