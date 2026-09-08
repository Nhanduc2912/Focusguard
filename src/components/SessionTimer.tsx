import { useState, useEffect, useCallback } from "react";
import { Clock, ShieldAlert, Square, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Session, endSession, getHistory, DistractionEventPayload } from "../lib/api";

interface SessionTimerProps {
  session: Session | null;
  onSessionEnded?: (session: Session) => void;
  onNavigateToSetup?: () => void;
}

function formatRemainingTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function SessionTimer({
  session,
  onSessionEnded,
  onNavigateToSetup,
}: SessionTimerProps) {
  const [now, setNow] = useState<number>(Date.now());
  const [distractionCount, setDistractionCount] = useState<number>(0);
  const [isEnding, setIsEnding] = useState<boolean>(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1-second interval to update current time for countdown
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial distraction count and subscribe to distraction events
  useEffect(() => {
    if (!session) {
      setDistractionCount(0);
      return;
    }

    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    // Load initial distraction count from SQLite history
    getHistory()
      .then((history) => {
        if (!isMounted) return;
        const current = history.find((h) => h.id === session.id);
        if (current) {
          setDistractionCount(current.distractionCount);
        }
      })
      .catch(() => {});

    // Listen for real-time distraction events
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        return listen<DistractionEventPayload>("distraction-detected", (event) => {
          if (!isMounted) return;
          if (event.payload && event.payload.sessionId === session.id) {
            setDistractionCount((prev) => prev + 1);
          }
        });
      })
      .then((unlisten) => {
        unlistenFn = unlisten;
      })
      .catch((err) => {
        console.debug("Tauri event listener not available in preview:", err);
      });

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [session]);

  const handleEndSession = useCallback(async () => {
    if (!session || isEnding) return;
    setIsEnding(true);
    setErrorMsg(null);
    try {
      const ended = await endSession();
      setShowConfirmEnd(false);
      if (onSessionEnded) {
        onSessionEnded(ended || { ...session, endedAt: new Date().toISOString() });
      }
    } catch (err: unknown) {
      console.error("Failed to end session:", err);
      // Fallback for preview mode
      setShowConfirmEnd(false);
      if (onSessionEnded) {
        onSessionEnded({ ...session, endedAt: new Date().toISOString() });
      }
    } finally {
      setIsEnding(false);
    }
  }, [session, isEnding, onSessionEnded]);

  if (!session) {
    return (
      <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-12 shadow-xl flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
          <Clock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Chưa có phiên hoạt động</h3>
        <p className="text-sm text-slate-400 mb-6 max-w-md">
          Bạn chưa có phiên tập trung nào đang chạy. Hãy thiết lập mục tiêu và thời lượng để bắt đầu giám sát bảo vệ.
        </p>
        <button
          onClick={onNavigateToSetup}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          Thiết lập phiên mới
        </button>
      </div>
    );
  }

  // Calculate timing & progress
  const startedAtMs = new Date(session.startedAt).getTime() || now;
  const totalSeconds = Math.max(1, session.plannedMinutes * 60);
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const progressPercent = Math.min(100, (elapsedSeconds / totalSeconds) * 100);
  const isTimeOver = remainingSeconds === 0;

  return (
    <div className="space-y-6">
      {/* Session Header Card */}
      <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Đang bảo vệ
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Phiên #{session.id}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight pt-1">
              {session.goal}
            </h2>
            <p className="text-xs text-slate-400">
              Kế hoạch: <strong className="text-indigo-300">{session.plannedMinutes} phút</strong> • Bắt đầu lúc:{" "}
              <span className="font-mono text-slate-300">
                {new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
          </div>

          {/* End session control */}
          <div>
            {!showConfirmEnd ? (
              <button
                id="btn-end-session"
                onClick={() => setShowConfirmEnd(true)}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/40 text-slate-300 text-xs font-medium transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Kết thúc phiên
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-slate-900/90 border border-rose-500/30 rounded-xl p-2">
                <span className="text-xs text-rose-300 font-medium px-2">Kết thúc sớm?</span>
                <button
                  id="btn-confirm-end"
                  onClick={handleEndSession}
                  disabled={isEnding}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {isEnding ? "Đang dừng..." : "Đồng ý"}
                </button>
                <button
                  id="btn-cancel-end"
                  onClick={() => setShowConfirmEnd(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
                >
                  Huỷ
                </button>
              </div>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Timer Display & Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 items-center">
          {/* Main Countdown Display */}
          <div className="md:col-span-2 flex flex-col items-center justify-center bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 text-center relative overflow-hidden">
            {/* Ambient indicator glow */}
            <div
              className={`absolute inset-0 opacity-10 pointer-events-none transition-all duration-1000 ${
                isTimeOver ? "bg-emerald-500" : "bg-indigo-600"
              }`}
            />

            <span className="text-xs font-semibold tracking-wider uppercase text-slate-400 mb-2">
              {isTimeOver ? "Đã hết thời gian dự kiến" : "Thời gian còn lại"}
            </span>

            <div
              id="timer-display"
              className={`text-6xl md:text-7xl font-mono font-extrabold tracking-tight transition-colors ${
                isTimeOver ? "text-emerald-400" : "text-white"
              }`}
            >
              {formatRemainingTime(remainingSeconds)}
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-md mt-6 space-y-2">
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  id="timer-progress-bar"
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                    isTimeOver
                      ? "bg-emerald-500"
                      : "bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400 px-1">
                <span>Đã qua: {formatRemainingTime(elapsedSeconds)}</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
            </div>

            {isTimeOver && (
              <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Tuyệt vời! Bạn đã hoàn thành mục tiêu thời gian đề ra.
              </div>
            )}
          </div>

          {/* Distraction Counter Card */}
          <div className="flex flex-col items-center justify-center bg-slate-900/40 border border-slate-800/60 rounded-2xl p-8 text-center relative">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
                distractionCount > 0
                  ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                  : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              }`}
            >
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div
              id="distraction-count-display"
              className={`text-4xl font-extrabold font-mono tracking-tight ${
                distractionCount > 0 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {distractionCount}
            </div>

            <span className="text-xs font-medium text-slate-300 mt-1">
              Lần xao nhãng
            </span>

            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              {distractionCount === 0
                ? "Chưa phát hiện xao nhãng nào. Giữ vững phong độ!"
                : "Phát hiện ứng dụng/web trong blacklist và đã nhắc nhở."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
