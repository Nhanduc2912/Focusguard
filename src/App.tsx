import { useState, useEffect } from "react";
import { Shield, Sparkles, Clock, History } from "lucide-react";
import { ping, Session, getActiveSession } from "./lib/api";
import { SessionSetup } from "./components/SessionSetup";

export function App() {
  const [activeTab, setActiveTab] = useState<"setup" | "timer" | "dashboard">("setup");
  const [backendStatus, setBackendStatus] = useState<string>("Checking backend...");
  const [isTauriReady, setIsTauriReady] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  useEffect(() => {
    ping()
      .then((res) => {
        setBackendStatus(res);
        setIsTauriReady(true);
      })
      .catch((err) => {
        // In plain browser without Tauri context
        setBackendStatus("Running in web preview mode");
        console.info("Tauri invoke info:", err);
      });

    // Check if there is an active session on startup
    getActiveSession()
      .then((session) => {
        if (session) {
          setActiveSession(session);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[128px]" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-surface/60 backdrop-blur-md sticky top-0 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/20 text-white">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                FocusGuard
              </h1>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                MVP Phase 1
              </span>
            </div>
            <p className="text-xs text-slate-400">Desktop distraction blocker & focus tracker</p>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/50 text-xs">
          {isTauriReady ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">{backendStatus}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-400">{backendStatus}</span>
            </>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2 border-b border-slate-800/80 pb-3" aria-label="Session Navigation">
          <button
            id="tab-setup"
            onClick={() => setActiveTab("setup")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "setup"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Session Setup
          </button>
          <button
            id="tab-timer"
            onClick={() => setActiveTab("timer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "timer"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Clock className="w-4 h-4" />
            Active Session
          </button>
          <button
            id="tab-dashboard"
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "dashboard"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <History className="w-4 h-4" />
            Past History
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === "setup" && (
            <SessionSetup
              onSessionStarted={(session) => {
                setActiveSession(session);
                setActiveTab("timer");
              }}
              onNavigateToTimer={() => setActiveTab("timer")}
            />
          )}

          {activeTab === "timer" && (
            <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-12 shadow-xl flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
                <Clock className="w-8 h-8" />
              </div>
              {activeSession ? (
                <div className="space-y-3 max-w-md">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Phiên tập trung đang hoạt động
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    "{activeSession.goal}"
                  </h3>
                  <p className="text-sm text-slate-400">
                    Thời lượng đã lên lịch: <strong className="text-indigo-400">{activeSession.plannedMinutes} phút</strong>.
                  </p>
                  <p className="text-xs text-slate-500">
                    (Màn hình đồng hồ đếm ngược chi tiết sẽ có trong Task 1.8)
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-white">Chưa có phiên hoạt động</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Khởi tạo phiên mới từ thẻ Thiết lập (Session Setup) để bắt đầu đếm giờ và giám sát xao nhãng.
                  </p>
                </>
              )}
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-12 shadow-xl flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center text-slate-400 mb-4">
                <History className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-white">No Past Sessions Yet</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Completed sessions and distraction statistics will appear here.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        FocusGuard Desktop v0.1.0 • Privacy-first • 100% Local SQLite Storage
      </footer>
    </div>
  );
}

export default App;
