import { CheckCircle2, Clock, ShieldCheck, ShieldAlert, Sparkles, History, Trophy, ArrowRight } from "lucide-react";
import { SessionWithStats } from "../lib/api";

interface SessionSummaryProps {
  session: SessionWithStats;
  onStartNewSession: () => void;
  onViewHistory: () => void;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} giờ ${minutes} phút ${seconds} giây`;
  }
  if (minutes > 0) {
    return `${minutes} phút ${seconds} giây`;
  }
  return `${seconds} giây`;
}

export function SessionSummary({
  session,
  onStartNewSession,
  onViewHistory,
}: SessionSummaryProps) {
  const startedMs = new Date(session.startedAt).getTime() || Date.now();
  const endedMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const actualSeconds = Math.max(0, Math.floor((endedMs - startedMs) / 1000));
  const plannedSeconds = Math.max(1, session.plannedMinutes * 60);
  const completionRatio = Math.min(100, Math.round((actualSeconds / plannedSeconds) * 100));

  const isPerfect = session.distractionCount === 0;

  return (
    <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 md:p-10 shadow-xl max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col items-center text-center space-y-3">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
            isPerfect
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-emerald-500/10"
              : "bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shadow-indigo-500/10"
          }`}
        >
          {isPerfect ? <Trophy className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
        </div>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/50 text-xs font-semibold text-slate-300">
            {isPerfect ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-emerald-300">Tuyệt đối tập trung (100% Focus)</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>Phiên đã hoàn tất</span>
              </>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight pt-1">
            Tổng kết phiên làm việc
          </h2>
          <p className="text-sm text-slate-400 max-w-md">
            {isPerfect
              ? "Tuyệt vời! Bạn không để bất kỳ ứng dụng xao nhãng nào ngắt quãng phiên tập trung này."
              : `Bạn đã hoàn thành phiên và vượt qua ${session.distractionCount} lần thử thách xao nhãng.`}
          </p>
        </div>
      </div>

      {/* Goal Box */}
      <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Mục tiêu đã cam kết
        </span>
        <p className="text-lg font-bold text-white leading-snug">
          "{session.goal}"
        </p>
        <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-400">
          <span>
            Bắt đầu:{" "}
            <strong className="text-slate-300 font-mono">
              {new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </strong>
          </span>
          {session.endedAt && (
            <span>
              Kết thúc:{" "}
              <strong className="text-slate-300 font-mono">
                {new Date(session.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Planned Duration */}
        <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-3">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>Kế hoạch</span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">
              {session.plannedMinutes} <span className="text-sm font-normal text-slate-400">phút</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Thời lượng đã định trước
            </p>
          </div>
        </div>

        {/* Actual Duration */}
        <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Thực tế</span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {formatDuration(actualSeconds)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Đạt {completionRatio}% mục tiêu thời gian
            </p>
          </div>
        </div>

        {/* Distraction Count */}
        <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/60 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-3">
            {isPerfect ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            )}
            <span>Xao nhãng</span>
          </div>
          <div>
            <div
              className={`text-2xl font-bold font-mono ${
                isPerfect ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {session.distractionCount} <span className="text-sm font-normal text-slate-400">lần</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {isPerfect ? "Hoàn toàn sạch xao nhãng" : "Đã nhắc nhở kịp thời"}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          id="btn-summary-new-session"
          onClick={onStartNewSession}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          Thiết lập phiên mới
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          id="btn-summary-view-history"
          onClick={onViewHistory}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 hover:border-slate-600 font-medium text-sm transition-all"
        >
          <History className="w-4 h-4" />
          Xem lịch sử phiên
        </button>
      </div>
    </div>
  );
}
