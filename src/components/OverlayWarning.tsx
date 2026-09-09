import { useState, useEffect, useCallback } from "react";
import { AlertOctagon, ArrowLeft, Target, ShieldAlert, Clock } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { hideOverlay, getLatestDistraction, getActiveSession, DistractionEventPayload } from "../lib/api";

interface OverlayWarningProps {
  initialProcess?: string;
  initialGoal?: string;
  initialTimestamp?: string;
  onDismiss?: () => void;
}

function formatDetectedTime(isoString?: string): string {
  if (!isoString) {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
  try {
    // Ensure ISO string from SQLite (YYYY-MM-DDTHH:MM:SSZ) is properly parsed as UTC
    const dateStr = isoString.endsWith("Z") || isoString.includes("+") ? isoString : `${isoString}Z`;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
}

export function OverlayWarning({
  initialProcess,
  initialGoal,
  initialTimestamp,
  onDismiss,
}: OverlayWarningProps) {
  const [processName, setProcessName] = useState<string>(initialProcess || "");
  const [sessionGoal, setSessionGoal] = useState<string>(initialGoal || "");
  const [detectedTime, setDetectedTime] = useState<string>(
    initialTimestamp ? formatDetectedTime(initialTimestamp) : ""
  );
  const [isClosing, setIsClosing] = useState<boolean>(false);

  // Update component state from a fresh payload
  const updateFromPayload = useCallback((payload: DistractionEventPayload) => {
    if (payload.processName) {
      setProcessName(payload.processName);
    }
    if (payload.sessionGoal) {
      setSessionGoal(payload.sessionGoal);
    }
    if (payload.timestamp) {
      setDetectedTime(formatDetectedTime(payload.timestamp));
    } else {
      setDetectedTime(formatDetectedTime());
    }
    setIsClosing(false);
  }, []);

  // Query backend SQLite to fetch latest distraction and active session info
  const refreshLatest = useCallback(async () => {
    try {
      const latest = await getLatestDistraction();
      if (latest) {
        updateFromPayload(latest);
      } else {
        // If current session has no distraction yet, reset stale distraction process/time
        // while maintaining the current session's goal
        const active = await getActiveSession();
        if (active) {
          setSessionGoal(active.goal);
        }
        setProcessName("");
        setDetectedTime("");
      }
    } catch {
      // In web preview mode outside Tauri
    }
  }, [updateFromPayload]);

  // Handle return to focus action
  const handleReturnToFocus = useCallback(async () => {
    setIsClosing(true);
    if (onDismiss) {
      onDismiss();
    }
    try {
      await hideOverlay();
    } catch {
      console.info("Overlay hidden in web preview mode");
    } finally {
      setIsClosing(false);
    }
  }, [onDismiss]);

  // Listen for distraction-detected and window focus/wakeup events
  useEffect(() => {
    let isMounted = true;
    let unlistenDistraction: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;

    // Fetch initial fresh data from backend immediately
    refreshLatest();

    // Reset closing state and refresh state whenever window gains focus or visibility
    const handleFocus = () => {
      setIsClosing(false);
      refreshLatest();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsClosing(false);
        refreshLatest();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Register Tauri event listeners
    listen<DistractionEventPayload>("distraction-detected", (event) => {
      if (!isMounted) return;
      if (event.payload) {
        updateFromPayload(event.payload);
      }
    })
      .then((unlisten) => {
        unlistenDistraction = unlisten;
      })
      .catch((err) => {
        console.debug("Tauri event listener not available in preview:", err);
      });

    // Web preview & automated browser test fallback
    const handleCustomEvent = (e: Event) => {
      if (!isMounted) return;
      const customEvent = e as CustomEvent<DistractionEventPayload>;
      if (customEvent.detail) {
        updateFromPayload(customEvent.detail);
      }
    };
    window.addEventListener("distraction-detected", handleCustomEvent);

    listen("tauri://focus", () => {
      if (!isMounted) return;
      setIsClosing(false);
      refreshLatest();
    })
      .then((unlisten) => {
        unlistenFocus = unlisten;
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      window.removeEventListener("distraction-detected", handleCustomEvent);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (unlistenDistraction) {
        unlistenDistraction();
      }
      if (unlistenFocus) {
        unlistenFocus();
      }
    };
  }, [refreshLatest, updateFromPayload]);

  // Keyboard shortcut: Esc or Enter to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        handleReturnToFocus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleReturnToFocus]);

  return (
    <div
      id="distraction-overlay"
      className={`fixed inset-0 bg-[#070a13]/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center select-none z-50 transition-opacity duration-200 ${
        isClosing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background ambient warning glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-rose-600/15 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[350px] h-[350px] bg-amber-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Main card */}
      <div className="relative z-10 max-w-lg w-full bg-slate-900/80 border border-rose-500/30 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-rose-950/50 flex flex-col items-center gap-6 backdrop-blur-xl">
        {/* Pulsing warning icon */}
        <div className="relative">
          <div className="absolute -inset-2 bg-gradient-to-r from-rose-500 to-amber-500 rounded-full blur-md opacity-40 animate-ping" />
          <div className="relative p-4 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-500 text-white shadow-xl shadow-rose-600/30">
            <AlertOctagon className="w-12 h-12 stroke-[2.2]" />
          </div>
        </div>

        {/* Header titles */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold tracking-wide uppercase">
            <ShieldAlert className="w-3.5 h-3.5" /> Can thiệp tập trung
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Bạn đang xao nhãng!
          </h1>
          <p className="text-slate-400 text-sm max-w-sm">
            Ứng dụng bị chặn vừa được phát hiện trong lúc phiên tập trung đang hoạt động:
          </p>
        </div>

        {/* Blocked process badge & detection time */}
        <div className="flex flex-col items-center gap-2">
          <div className="px-5 py-2.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 font-mono font-bold text-lg flex items-center gap-2.5 shadow-inner">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" />
            <span id="overlay-process-name">{processName || "Ứng dụng bị chặn"}</span>
          </div>
          {detectedTime && (
            <div id="overlay-detected-time" className="inline-flex items-center gap-1.5 text-xs text-rose-400/90 font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Phát hiện lúc: <strong>{detectedTime}</strong></span>
            </div>
          )}
        </div>

        {/* Goal reminder card */}
        <div className="w-full rounded-2xl bg-slate-950/60 border border-slate-800 p-4 text-left space-y-1.5">
          <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Target className="w-3.5 h-3.5" /> Mục tiêu phiên hiện tại
          </div>
          <p id="overlay-session-goal" className="text-slate-200 font-medium text-base line-clamp-2">
            {sessionGoal || "Tập trung hoàn thành mục tiêu"}
          </p>
        </div>

        {/* Action button */}
        <div className="w-full space-y-2.5 pt-2">
          <button
            id="btn-return-focus"
            onClick={handleReturnToFocus}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white font-bold text-base shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
            <span>Quay lại tập trung</span>
          </button>
          <p className="text-slate-500 text-xs">
            Mẹo: Nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Enter</kbd> hoặc <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">Esc</kbd> để tiếp tục
          </p>
        </div>
      </div>
    </div>
  );
}

export default OverlayWarning;
