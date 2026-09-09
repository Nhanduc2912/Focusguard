import { useState, useEffect, useCallback } from "react";
import { AlertOctagon, ArrowLeft, Target, ShieldAlert } from "lucide-react";
import { hideOverlay, DistractionEventPayload } from "../lib/api";

interface OverlayWarningProps {
  initialProcess?: string;
  initialGoal?: string;
  onDismiss?: () => void;
}

export function OverlayWarning({
  initialProcess = "notepad.exe",
  initialGoal = "Tập trung hoàn thành bài học",
  onDismiss,
}: OverlayWarningProps) {
  const [processName, setProcessName] = useState<string>(initialProcess);
  const [sessionGoal, setSessionGoal] = useState<string>(initialGoal);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  // Handle return to focus action
  const handleReturnToFocus = useCallback(async () => {
    setIsClosing(true);
    if (onDismiss) {
      onDismiss();
    }
    try {
      await hideOverlay();
    } catch {
      // In web preview mode or when Tauri window is not available
      console.info("Overlay hidden in web preview mode");
    } finally {
      // Critical fix: ensure isClosing is reset so subsequent triggers render immediately
      setIsClosing(false);
    }
  }, [onDismiss]);

  // Listen for distraction-detected and focus events
  useEffect(() => {
    let unlistenDistraction: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;

    // Reset closing state when window gains focus or visibility
    const handleFocus = () => {
      setIsClosing(false);
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handleFocus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsClosing(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Dynamically import Tauri event listener if in Tauri runtime
    import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        unlistenDistraction = await listen<DistractionEventPayload>(
          "distraction-detected",
          (event) => {
            if (event.payload) {
              setProcessName(event.payload.processName);
              setSessionGoal(event.payload.sessionGoal);
            }
            setIsClosing(false);
          }
        );

        unlistenFocus = await listen("tauri://focus", () => {
          setIsClosing(false);
        });
      })
      .catch((err) => {
        console.debug("Tauri event listener not available in preview:", err);
      });

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (unlistenDistraction) {
        unlistenDistraction();
      }
      if (unlistenFocus) {
        unlistenFocus();
      }
    };
  }, []);

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

        {/* Blocked process badge */}
        <div className="px-5 py-2.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 font-mono font-bold text-lg flex items-center gap-2.5 shadow-inner">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" />
          <span id="overlay-process-name">{processName}</span>
        </div>

        {/* Goal reminder card */}
        <div className="w-full rounded-2xl bg-slate-950/60 border border-slate-800 p-4 text-left space-y-1.5">
          <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Target className="w-3.5 h-3.5" /> Mục tiêu phiên hiện tại
          </div>
          <p id="overlay-session-goal" className="text-slate-200 font-medium text-base line-clamp-2">
            {sessionGoal}
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
