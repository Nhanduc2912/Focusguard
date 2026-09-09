import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Clock,
  Shield,
  Plus,
  Trash2,
  AlertCircle,
  Play,
  ArrowRight,
  Globe,
  AppWindow,
  Search,
  RefreshCw,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Session,
  BlacklistItem,
  getBlacklist,
  addBlacklistItem,
  removeBlacklistItem,
  startSession,
  getActiveSession,
  listRunningProcesses,
} from "../lib/api";

interface SessionSetupProps {
  onSessionStarted?: (session: Session) => void;
  onNavigateToTimer?: () => void;
}

const DURATION_PRESETS = [15, 25, 45, 60, 90];

export function SessionSetup({ onSessionStarted, onNavigateToTimer }: SessionSetupProps) {
  const [goal, setGoal] = useState<string>("");
  const [plannedMinutes, setPlannedMinutes] = useState<number>(25);
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [newTargetName, setNewTargetName] = useState<string>("");
  const [newTargetType, setNewTargetType] = useState<"app" | "domain">("app");
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAddingBlacklist, setIsAddingBlacklist] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Running processes picker state
  const [showProcessPicker, setShowProcessPicker] = useState<boolean>(false);
  const [runningProcesses, setRunningProcesses] = useState<string[]>([]);
  const [isLoadingProcesses, setIsLoadingProcesses] = useState<boolean>(false);
  const [processFilter, setProcessFilter] = useState<string>("");

  // Load active session and blacklist on mount
  const loadInitialData = useCallback(async () => {
    try {
      const active = await getActiveSession();
      setActiveSession(active);
    } catch {
      // In web preview mode
    }

    try {
      const items = await getBlacklist();
      setBlacklist(items);
    } catch {
      // Fallback default mock items for preview
      setBlacklist([
        { id: 1, name: "facebook.com", itemType: "domain" },
        { id: 2, name: "tiktok.com", itemType: "domain" },
        { id: 3, name: "youtube.com", itemType: "domain" },
        { id: 4, name: "Steam.exe", itemType: "app" },
        { id: 5, name: "LeagueClient.exe", itemType: "app" },
      ]);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle adding new blacklist item
  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTargetName.trim();
    if (!trimmed) return;

    setIsAddingBlacklist(true);
    setErrorMessage(null);

    try {
      const newItem = await addBlacklistItem(trimmed, newTargetType);
      setBlacklist((prev) => [...prev, newItem]);
      setNewTargetName("");
    } catch (err) {
      // If error (e.g. duplicate or preview mode)
      if (typeof err === "string" && err.includes("UNIQUE")) {
        setErrorMessage(`"${trimmed}" đã có trong danh sách đen.`);
      } else {
        // Fallback for preview mode testing
        const fallbackItem: BlacklistItem = {
          id: Date.now(),
          name: trimmed,
          itemType: newTargetType,
        };
        setBlacklist((prev) => [...prev, fallbackItem]);
        setNewTargetName("");
      }
    } finally {
      setIsAddingBlacklist(false);
    }
  };

  // Handle removing blacklist item
  const handleRemoveBlacklist = async (id: number) => {
    try {
      await removeBlacklistItem(id);
      setBlacklist((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // Preview fallback
      setBlacklist((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // Fetch running processes from system
  const handleLoadRunningProcesses = async () => {
    setIsLoadingProcesses(true);
    try {
      const procs = await listRunningProcesses();
      setRunningProcesses(procs);
    } catch {
      // Fallback
      setRunningProcesses(["steam.exe", "notepad.exe", "Discord.exe", "chrome.exe", "Code.exe", "Spotify.exe"]);
    } finally {
      setIsLoadingProcesses(false);
    }
  };

  const handleToggleProcessPicker = () => {
    const next = !showProcessPicker;
    setShowProcessPicker(next);
    if (next && runningProcesses.length === 0) {
      handleLoadRunningProcesses();
    }
  };

  const handleSelectProcess = (procName: string) => {
    setNewTargetName(procName);
    setNewTargetType("app");
    setShowProcessPicker(false);
  };

  const filteredProcesses = runningProcesses.filter((p) =>
    p.toLowerCase().includes(processFilter.toLowerCase().trim())
  );

  // Handle start session form submit
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) {
      setErrorMessage("Vui lòng nhập mục tiêu cho phiên tập trung này.");
      return;
    }

    if (plannedMinutes < 1 || plannedMinutes > 480) {
      setErrorMessage("Thời lượng phải từ 1 đến 480 phút.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const session = await startSession(trimmedGoal, plannedMinutes);
      setActiveSession(session);
      if (onSessionStarted) {
        onSessionStarted(session);
      }
    } catch (err) {
      // If running in browser preview mode outside Tauri
      const hasTauri = typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
      if (!hasTauri) {
        const mockSession: Session = {
          id: 1,
          goal: trimmedGoal,
          plannedMinutes,
          startedAt: new Date().toISOString(),
        };
        setActiveSession(mockSession);
        if (onSessionStarted) {
          onSessionStarted(mockSession);
        }
        return;
      }
      const msg = typeof err === "string" ? err : "Không thể bắt đầu phiên tập trung.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-surface-card/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-6 sm:p-8 shadow-xl max-w-4xl mx-auto space-y-8">
      {/* If there is already an active session */}
      {activeSession && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4 text-amber-300 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <span>
              Đang có phiên tập trung hoạt động:{" "}
              <strong className="text-white font-semibold">"{activeSession.goal}"</strong>
            </span>
          </div>
          {onNavigateToTimer && (
            <button
              onClick={onNavigateToTimer}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition-colors cursor-pointer"
            >
              <span>Xem đồng hồ</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-800/60 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2.5">
          <Sparkles className="w-3.5 h-3.5" /> Khởi tạo phiên tập trung
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Thiết lập phiên làm việc
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Đặt mục tiêu, chọn thời lượng và danh sách ứng dụng cần chặn để duy trì trạng thái tập trung cao độ.
        </p>
      </div>

      {/* Main Setup Form */}
      <form onSubmit={handleStartSession} className="space-y-8">
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Section 1: Goal Input */}
        <div className="space-y-2">
          <label htmlFor="input-goal" className="block text-sm font-semibold text-slate-200">
            Mục tiêu phiên tập trung <span className="text-rose-400">*</span>
          </label>
          <input
            id="input-goal"
            type="text"
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Ví dụ: Hoàn thành bài giảng thuật toán 45 phút, Viết tài liệu dự án..."
            className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700/80 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-100 placeholder-slate-500 text-sm transition-all outline-none"
            autoFocus
          />
        </div>

        {/* Section 2: Duration Picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Thời lượng phiên</span>
            </label>
            <span className="text-xs text-indigo-400 font-medium">
              Đã chọn: <strong className="text-white text-sm font-bold">{plannedMinutes}</strong> phút
            </span>
          </div>

          {/* Quick preset chips */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {DURATION_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                id={`preset-${minutes}m`}
                onClick={() => setPlannedMinutes(minutes)}
                className={`py-2.5 px-2 rounded-xl text-sm font-semibold transition-all border cursor-pointer text-center ${
                  plannedMinutes === minutes
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/20"
                    : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-800/40"
                }`}
              >
                {minutes}m
              </button>
            ))}
          </div>

          {/* Custom Stepper */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-slate-400">Tùy chỉnh:</span>
            <div className="inline-flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1">
              <button
                type="button"
                id="btn-duration-minus"
                onClick={() => setPlannedMinutes((prev) => Math.max(5, prev - 5))}
                className="px-3 py-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-sm font-bold cursor-pointer transition-colors"
                title="Giảm 5 phút"
              >
                -5m
              </button>
              <input
                id="input-custom-minutes"
                type="number"
                min="1"
                max="480"
                value={plannedMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setPlannedMinutes(val);
                }}
                className="w-14 text-center bg-transparent text-white font-bold text-sm outline-none"
              />
              <button
                type="button"
                id="btn-duration-plus"
                onClick={() => setPlannedMinutes((prev) => Math.min(480, prev + 5))}
                className="px-3 py-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-sm font-bold cursor-pointer transition-colors"
                title="Tăng 5 phút"
              >
                +5m
              </button>
            </div>
            <span className="text-xs text-slate-500">(1 - 480 phút)</span>
          </div>
        </div>

        {/* Section 3: Blacklist Management */}
        <div className="space-y-4 pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-rose-400" />
                <span>Danh sách ứng dụng & web bị chặn</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Các mục này sẽ tự động kích hoạt màn hình cảnh báo khi bạn chuyển sang trong lúc phiên đang chạy.
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-800/80 px-2.5 py-1 rounded-full text-slate-300 border border-slate-700/60">
              {blacklist.length} mục
            </span>
          </div>

          {/* Blacklist Chips */}
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1 scrollbar-thin">
            {blacklist.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/60 text-xs text-slate-200 shadow-sm group hover:border-slate-600 transition-all"
              >
                {item.itemType === "app" ? (
                  <AppWindow className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span className="font-mono font-medium">{item.name}</span>
                <span className="text-[10px] text-slate-500 uppercase">({item.itemType})</span>
                <button
                  type="button"
                  onClick={() => handleRemoveBlacklist(item.id)}
                  className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                  title={`Xóa ${item.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>

          {/* Add New Blacklist Item Inline */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <div className="flex-1 relative">
              <input
                id="input-new-blacklist"
                type="text"
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                placeholder="Thêm tiến trình (ví dụ: notepad.exe) hoặc domain (facebook.com)..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-slate-600 text-xs text-slate-200 placeholder-slate-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                id="select-blacklist-type"
                value={newTargetType}
                onChange={(e) => setNewTargetType(e.target.value as "app" | "domain")}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 outline-none cursor-pointer"
              >
                <option value="app">App (.exe)</option>
                <option value="domain">Domain (web)</option>
              </select>
              <button
                type="button"
                id="btn-add-blacklist"
                disabled={isAddingBlacklist || !newTargetName.trim()}
                onClick={handleAddBlacklist}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>
          </div>

          {/* Running Process Picker Button */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              id="btn-pick-running-app"
              onClick={handleToggleProcessPicker}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors cursor-pointer font-medium"
            >
              <AppWindow className="w-3.5 h-3.5 text-indigo-400" />
              <span>Chọn từ ứng dụng đang mở</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showProcessPicker ? "rotate-180" : ""}`} />
            </button>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Lọc danh sách cửa sổ đang chạy để chọn chính xác tên file .exe
            </span>
          </div>

          {/* Dropdown / Popover panel for running processes */}
          {showProcessPicker && (
            <div
              id="panel-running-processes"
              className="p-3 bg-slate-900/95 border border-indigo-500/30 rounded-xl space-y-2.5 shadow-2xl animate-fadeIn"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <AppWindow className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Ứng dụng đang mở trên máy ({runningProcesses.length})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    id="btn-refresh-running-procs"
                    onClick={handleLoadRunningProcesses}
                    disabled={isLoadingProcesses}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Làm mới danh sách"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProcesses ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    id="btn-close-running-procs"
                    onClick={() => setShowProcessPicker(false)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Đóng"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Search in running apps */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  id="input-search-running-proc"
                  type="text"
                  value={processFilter}
                  onChange={(e) => setProcessFilter(e.target.value)}
                  placeholder="Tìm kiếm ứng dụng (vd: steam, discord, chrome)..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
                />
              </div>

              {/* List */}
              <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                {isLoadingProcesses ? (
                  <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Đang quét các ứng dụng đang chạy...</span>
                  </div>
                ) : filteredProcesses.length === 0 ? (
                  <div className="py-3 text-center text-xs text-slate-500">
                    Không tìm thấy ứng dụng nào khớp với "{processFilter}"
                  </div>
                ) : (
                  filteredProcesses.map((proc) => (
                    <button
                      key={proc}
                      type="button"
                      onClick={() => handleSelectProcess(proc)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-indigo-600/20 hover:text-indigo-200 border border-transparent hover:border-indigo-500/30 text-xs text-slate-300 font-mono flex items-center justify-between group transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <AppWindow className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{proc}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 group-hover:text-indigo-300 flex-shrink-0 font-sans">
                        Chọn ↵
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            id="btn-start-session"
            disabled={isLoading || !goal.trim()}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-base shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Bắt đầu phiên tập trung</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SessionSetup;
