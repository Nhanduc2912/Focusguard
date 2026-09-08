import { useState, useEffect, useCallback } from "react";
import { History, Clock, Trophy, ShieldAlert, Sparkles, RefreshCw, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { getHistory, SessionWithStats } from "../lib/api";

interface DashboardProps {
  onStartNewSession?: () => void;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatTotalFocusTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} giờ ${minutes} phút`;
  }
  return `${minutes} phút`;
}

export function Dashboard({ onStartNewSession }: DashboardProps) {
  const [history, setHistory] = useState<SessionWithStats[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchHistory = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const data = await getHistory();
      setHistory(data);
    } catch {
      // In web preview mode outside Tauri, mock 2 representative sessions if empty
      setHistory((prev) => {
        if (prev.length > 0) return prev;
        return [
          {
            id: 1,
            goal: "Học lập trình hệ thống với Rust và Tauri v2",
            plannedMinutes: 25,
            startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            endedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            distractionCount: 0,
          },
          {
            id: 2,
            goal: "Thiết kế kiến trúc cơ sở dữ liệu SQLite",
            plannedMinutes: 45,
            startedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
            endedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
            distractionCount: 2,
          },
        ];
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Aggregate metrics calculation
  const totalSessions = history.length;
  const totalActualSeconds = history.reduce((acc, s) => {
    const start = new Date(s.startedAt).getTime() || 0;
    const end = s.endedAt ? new Date(s.endedAt).getTime() : start;
    return acc + Math.max(0, Math.floor((end - start) / 1000));
  }, 0);

  const cleanSessions = history.filter((s) => s.distractionCount === 0).length;
  const cleanRate = totalSessions > 0 ? Math.round((cleanSessions / totalSessions) * 100) : 100;
  const totalDistractions = history.reduce((acc, s) => acc + s.distractionCount, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Dashboard Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Lịch sử phiên tập trung
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Theo dõi tiến độ, thời lượng thực tế và kiểm soát xao nhãng theo thời gian.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-refresh-history"
            onClick={() => fetchHistory(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-medium border border-slate-700/60 transition-all disabled:opacity-50"
            title="Làm mới dữ liệu lịch sử"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`} />
            <span>Làm mới</span>
          </button>

          <button
            id="btn-new-session"
            onClick={onStartNewSession}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-medium shadow-md shadow-indigo-500/20 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Phiên mới</span>
          </button>
        </div>
      </div>

      {/* Aggregate Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="p-5 rounded-2xl bg-surface-card/60 backdrop-blur-md border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Tổng số phiên</span>
            <History className="w-4 h-4 text-indigo-400" />
          </div>
          <div id="stat-total-sessions" className="text-2xl md:text-3xl font-bold font-mono text-white">
            {totalSessions}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Đã lưu trữ trong SQLite</p>
        </div>

        {/* Total Focus Time */}
        <div className="p-5 rounded-2xl bg-surface-card/60 backdrop-blur-md border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Thời gian tập trung</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div id="stat-total-time" className="text-2xl md:text-3xl font-bold font-mono text-emerald-400">
            {formatTotalFocusTime(totalActualSeconds)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Thời lượng tích lũy</p>
        </div>

        {/* Clean Focus Rate */}
        <div className="p-5 rounded-2xl bg-surface-card/60 backdrop-blur-md border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Tỷ lệ tập trung</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div id="stat-clean-rate" className="text-2xl md:text-3xl font-bold font-mono text-amber-400">
            {cleanRate}%
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Phiên sạch 0 xao nhãng</p>
        </div>

        {/* Total Distractions */}
        <div className="p-5 rounded-2xl bg-surface-card/60 backdrop-blur-md border border-slate-800/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Xao nhãng bị chặn</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div id="stat-total-distractions" className="text-2xl md:text-3xl font-bold font-mono text-rose-400">
            {totalDistractions}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Lần cảnh báo kích hoạt</p>
        </div>
      </div>

      {/* History List Table / Cards */}
      <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>Danh sách phiên gần đây</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {history.length} mục
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            Đang tải dữ liệu từ SQLite...
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-center text-slate-400 mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white">Chưa có phiên nào</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Bắt đầu phiên tập trung đầu tiên của bạn để lịch sử và chỉ số xao nhãng xuất hiện tại đây.
            </p>
            <button
              onClick={onStartNewSession}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Khởi tạo phiên mới
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {history.map((s) => {
              const start = new Date(s.startedAt).getTime() || 0;
              const end = s.endedAt ? new Date(s.endedAt).getTime() : start;
              const actualSeconds = Math.max(0, Math.floor((end - start) / 1000));
              const isClean = s.distractionCount === 0;
              const isRunning = !s.endedAt;

              return (
                <div
                  key={s.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/20 px-3 rounded-xl transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/50 text-slate-400">
                        #{s.id}
                      </span>
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Đang hoạt động
                        </span>
                      ) : isClean ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          100% Focus
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px] font-medium border border-slate-700/50">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã hoàn tất
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(s.startedAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-white truncate">
                      {s.goal}
                    </h4>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 text-xs">
                    {/* Duration Info */}
                    <div className="text-right">
                      <div className="font-mono text-slate-200 font-medium">
                        {formatDuration(actualSeconds)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        kế hoạch {s.plannedMinutes}m
                      </div>
                    </div>

                    {/* Distraction Count Badge */}
                    <div className="min-w-[90px] text-right">
                      {isClean ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          0 xao nhãng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {s.distractionCount} xao nhãng
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
