import { useState, useEffect } from "react";
import { Shield, Sparkles, Clock, History } from "lucide-react";
import { ping, Session, SessionWithStats, getActiveSession, getHistory } from "./lib/api";
import { SessionSetup } from "./components/SessionSetup";
import { SessionTimer } from "./components/SessionTimer";
import { SessionSummary } from "./components/SessionSummary";
import { Dashboard } from "./components/Dashboard";

export function App() {
  const [activeTab, setActiveTab] = useState<"setup" | "timer" | "dashboard">("setup");
  const [backendStatus, setBackendStatus] = useState<string>("Checking backend...");
  const [isTauriReady, setIsTauriReady] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [lastEndedSession, setLastEndedSession] = useState<SessionWithStats | null>(null);

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
                setLastEndedSession(null);
                setActiveTab("timer");
              }}
              onNavigateToTimer={() => setActiveTab("timer")}
            />
          )}

          {activeTab === "timer" && (
            activeSession ? (
              <SessionTimer
                session={activeSession}
                onSessionEnded={async (ended) => {
                  setActiveSession(null);
                  try {
                    const history = await getHistory();
                    const stats = history.find((h) => h.id === ended.id);
                    if (stats) {
                      setLastEndedSession(stats);
                    } else {
                      setLastEndedSession({
                        ...ended,
                        distractionCount: 0,
                      });
                    }
                  } catch {
                    setLastEndedSession({
                      ...ended,
                      distractionCount: 0,
                    });
                  }
                }}
                onNavigateToSetup={() => setActiveTab("setup")}
              />
            ) : lastEndedSession ? (
              <SessionSummary
                session={lastEndedSession}
                onStartNewSession={() => {
                  setLastEndedSession(null);
                  setActiveTab("setup");
                }}
                onViewHistory={() => {
                  setActiveTab("dashboard");
                }}
              />
            ) : (
              <SessionTimer
                session={null}
                onNavigateToSetup={() => setActiveTab("setup")}
              />
            )
          )}

          {activeTab === "dashboard" && (
            <Dashboard onStartNewSession={() => setActiveTab("setup")} />
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
