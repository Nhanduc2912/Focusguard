import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderOpen,
  Info,
  ShieldCheck,
  Compass,
} from "lucide-react";
import {
  detectInstalledBrowsers,
  setBrowserMonitored,
  BrowserInfo,
} from "../lib/api";

const BROWSER_METADATA: Record<
  string,
  {
    gradient: string;
    borderActive: string;
    iconBg: string;
    accentColor: string;
    description: string;
  }
> = {
  chrome: {
    gradient: "from-amber-500/20 via-rose-500/15 to-emerald-500/20",
    borderActive: "border-amber-500/40",
    iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    accentColor: "text-amber-400",
    description: "Trình duyệt Google Chrome (Chromium V8 Engine)",
  },
  brave: {
    gradient: "from-orange-500/20 via-amber-600/15 to-rose-500/20",
    borderActive: "border-orange-500/40",
    iconBg: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    accentColor: "text-orange-400",
    description: "Brave Privacy Browser (Bảo vệ quyền riêng tư mặc định)",
  },
  edge: {
    gradient: "from-cyan-500/20 via-blue-600/15 to-indigo-500/20",
    borderActive: "border-cyan-500/40",
    iconBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    accentColor: "text-cyan-400",
    description: "Microsoft Edge (Tích hợp sâu trên hệ thống Windows)",
  },
};

export function BrowserSetup() {
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Fetch installed browsers and preferences
  const loadBrowsers = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await detectInstalledBrowsers();
      setBrowsers(data);
    } catch {
      // Fallback preview mode when run outside Tauri
      setBrowsers([
        {
          id: "chrome",
          name: "Google Chrome",
          installed: true,
          exePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          enabled: true,
        },
        {
          id: "brave",
          name: "Brave Browser",
          installed: true,
          exePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
          enabled: true,
        },
        {
          id: "edge",
          name: "Microsoft Edge",
          installed: true,
          exePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          enabled: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBrowsers();
  }, [loadBrowsers]);

  // Handle toggle switch
  const handleToggle = async (browser: BrowserInfo) => {
    if (!browser.installed) return;

    const newEnabled = !browser.enabled;

    // Optimistic UI update
    setBrowsers((prev) =>
      prev.map((b) => (b.id === browser.id ? { ...b, enabled: newEnabled } : b))
    );

    try {
      await setBrowserMonitored(browser.id, newEnabled);
      setFeedbackMessage(
        `${newEnabled ? "Đã bật" : "Đã tắt"} theo dõi cho ${browser.name}`
      );
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch {
      // In Tauri runtime this persists to SQLite; in preview mode outside Tauri, keep optimistic state
      setFeedbackMessage(
        `${newEnabled ? "Đã bật" : "Đã tắt"} theo dõi cho ${browser.name} (preview)`
      );
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const installedCount = browsers.filter((b) => b.installed).length;
  const monitoredCount = browsers.filter((b) => b.installed && b.enabled).length;

  return (
    <div className="flex flex-col gap-6 animate-fade-in" id="browser-setup-container">
      {/* Header Banner */}
      <div className="bg-surface/80 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm shadow-xl">
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Compass className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Cài đặt theo dõi trình duyệt
                </h2>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Phase 2 Setup
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                Tự động phát hiện các trình duyệt phổ biến và cấu hình phạm vi giám sát xao nhãng.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              id="btn-refresh-browsers"
              onClick={() => loadBrowsers(true)}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-200 text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Quét lại trình duyệt cài trên hệ thống"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`}
              />
              <span>{isRefreshing ? "Đang quét..." : "Quét lại"}</span>
            </button>
          </div>
        </div>

        {/* Aggregate status indicator */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 font-medium">Đã phát hiện trên máy</div>
            <div className="text-lg font-bold text-white mt-0.5 font-mono">
              {installedCount} / {browsers.length} <span className="text-xs font-normal text-slate-400">trình duyệt</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 font-medium">Đang bật giám sát</div>
            <div className="text-lg font-bold text-indigo-400 mt-0.5 font-mono">
              {monitoredCount} <span className="text-xs font-normal text-slate-400">được kích hoạt</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center gap-2 text-slate-300">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-[11px] leading-relaxed">
              Cấu hình lưu cục bộ trong SQLite • Không gửi bất kỳ dữ liệu ra ngoài
            </span>
          </div>
        </div>
      </div>

      {/* Temporary Toast feedback */}
      {feedbackMessage && (
        <div
          id="browser-toast-feedback"
          className="px-4 py-2.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-200 text-xs flex items-center gap-2 shadow-lg animate-fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Info Callout about Phase 2 */}
      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <span className="font-semibold text-white">Lộ trình Phase 2 — Browser precision blocking:</span>{" "}
          Màn hình này chuẩn bị danh sách trình duyệt mà bạn muốn FocusGuard can thiệp. Trong các task tiếp theo của Phase 2, FocusGuard sẽ kết nối extension Manifest V3 để chặn tab theo URL chính xác (Facebook, TikTok, YouTube).
        </div>
      </div>

      {/* Browser Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="browser-cards-grid">
        {isLoading ? (
          // Loading skeleton
          [1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-64 rounded-2xl bg-slate-900/40 border border-slate-800/80 animate-pulse p-5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800" />
                <div className="w-32 h-4 rounded bg-slate-800" />
                <div className="w-48 h-3 rounded bg-slate-800/60" />
              </div>
              <div className="w-full h-10 rounded-xl bg-slate-800" />
            </div>
          ))
        ) : (
          browsers.map((browser) => {
            const meta = BROWSER_METADATA[browser.id] || {
              gradient: "from-slate-700/20 to-slate-800/20",
              borderActive: "border-slate-600",
              iconBg: "bg-slate-800 text-slate-300 border-slate-700",
              accentColor: "text-slate-300",
              description: browser.name,
            };

            const isToggleDisabled = !browser.installed;

            return (
              <div
                key={browser.id}
                id={`browser-card-${browser.id}`}
                className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between p-5 relative overflow-hidden backdrop-blur-sm ${
                  browser.installed
                    ? "bg-surface/70 border-slate-800 hover:border-slate-700/80 shadow-md"
                    : "bg-surface/30 border-slate-800/40 opacity-55"
                }`}
              >
                {/* Top Section */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div
                      className={`p-2.5 rounded-xl border ${meta.iconBg} shadow-sm`}
                    >
                      <Globe className="w-5 h-5" />
                    </div>

                    {/* Installed Status Badge */}
                    {browser.installed ? (
                      <span
                        id={`badge-installed-${browser.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Đã cài đặt
                      </span>
                    ) : (
                      <span
                        id={`badge-uninstalled-${browser.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700/50"
                      >
                        <XCircle className="w-3 h-3 text-slate-500" />
                        Chưa cài đặt
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-white tracking-tight flex items-center gap-1.5">
                      {browser.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      {meta.description}
                    </p>
                  </div>

                  {/* Executable Path Snippet */}
                  {browser.installed && browser.exePath && (
                    <div
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-start gap-1.5 break-all shadow-inner"
                      title={browser.exePath}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{browser.exePath}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Toggle Area */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-semibold ${
                        isToggleDisabled ? "text-slate-500" : "text-slate-200"
                      }`}
                    >
                      Theo dõi trình duyệt này
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isToggleDisabled
                        ? "Không khả dụng do chưa cài đặt"
                        : browser.enabled
                        ? "Đang bật cảnh báo"
                        : "Đã tạm dừng theo dõi"}
                    </span>
                  </div>

                  {/* Accessible Switch Component */}
                  <button
                    id={`switch-browser-${browser.id}`}
                    role="switch"
                    aria-checked={browser.enabled}
                    disabled={isToggleDisabled}
                    onClick={() => handleToggle(browser)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                      isToggleDisabled
                        ? "bg-slate-800 opacity-40 cursor-not-allowed"
                        : browser.enabled
                        ? "bg-indigo-600 shadow-sm shadow-indigo-500/50"
                        : "bg-slate-800 hover:bg-slate-750"
                    }`}
                  >
                    <span className="sr-only">Bật tắt theo dõi {browser.name}</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        browser.enabled && !isToggleDisabled
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
export default BrowserSetup;
