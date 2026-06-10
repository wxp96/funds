import { Home, LineChart, RefreshCw, Settings } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

type Props = {
  children: ReactNode;
  active: "funds" | "detail" | "incomes" | "settings";
  loading?: boolean;
  onRefresh?: () => void;
};

export function AppShell({ children, active, loading, onRefresh }: Props) {
  function navigateHome(event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    event.preventDefault();
    window.history.pushState(null, "", "/funds");
    window.dispatchEvent(new Event("funds:navigate"));
  }

  function navigateSettings(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.history.pushState(null, "", "/settings");
    window.dispatchEvent(new Event("funds:navigate"));
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#101922] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#101922]/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1480px] min-w-0 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/funds" onClick={navigateHome} className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0d7ff2] text-white shadow-lg shadow-blue-500/20">
              <LineChart className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="hidden sm:block">
              <span className="block text-base font-semibold tracking-normal">自选基金</span>
              <span className="block text-xs text-slate-400">Portfolio Console</span>
            </span>
          </a>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/funds"
              onClick={navigateHome}
              title="回到主页"
              className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${
                active === "funds" ? "text-[#5fb0ff]" : "text-slate-200"
              }`}
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">主页</span>
            </a>
            <a
              href="/settings"
              onClick={navigateSettings}
              title="设置"
              className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/30 ${
                active === "settings" ? "text-[#5fb0ff]" : "text-slate-200"
              }`}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">设置</span>
            </a>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              <span className="hidden sm:inline">刷新</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1480px] min-w-0 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}
