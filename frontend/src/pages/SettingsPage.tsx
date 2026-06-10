import { KeyRound, Save, Server, ShieldCheck, Smartphone } from "lucide-react";
import { FormEvent, useState } from "react";

import { AppShell } from "../components/AppShell";
import { isNativeApp } from "../services/mobileHttp";
import { loadSettings, saveSettings } from "../storage/localStore";

export function SettingsPage() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    saveSettings(settings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  const localMode = import.meta.env.VITE_DATA_MODE === "local" || isNativeApp();

  return (
    <AppShell active="settings">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-normal">设置</h1>
        <p className="mt-1 text-sm text-slate-400">管理移动端本地数据源和外部接口密钥。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0d7ff2] text-white shadow-lg shadow-blue-500/20">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Finnhub API Key</h2>
              <p className="mt-1 text-sm text-slate-400">用于补充美股重仓股票的 PS、PEG、利润率等指标。</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-300">API Key</span>
              <input
                type="password"
                value={settings.finnhubApiKey}
                onChange={(event) => setSettings({ ...settings, finnhubApiKey: event.target.value.trim() })}
                className="input"
                placeholder="粘贴你的 Finnhub key"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#0d7ff2] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              保存设置
            </button>
            {saved ? <span className="ml-3 text-sm text-[#5fb0ff]">已保存</span> : null}
          </form>
        </section>

        <aside className="space-y-4">
          <InfoCard icon={localMode ? Smartphone : Server} label="数据模式" value={localMode ? "App 本地服务" : "FastAPI 后端"} />
          <InfoCard icon={ShieldCheck} label="隐私" value="设置和交易流水保存在本机，不会提交到 Git 或云端。" />
        </aside>
      </div>
    </AppShell>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Smartphone; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10 backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
        <Icon className="h-4 w-4 text-[#5fb0ff]" aria-hidden="true" />
        {label}
      </div>
      <p className="text-sm leading-6 text-slate-400">{value}</p>
    </div>
  );
}
