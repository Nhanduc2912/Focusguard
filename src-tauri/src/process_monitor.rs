use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::commands::AppState;
use crate::db;

/// Debounces distraction logging to avoid recording duplicate events for ongoing distractions
#[derive(Debug)]
pub struct DistractionDebouncer {
    last_triggered: HashMap<String, Instant>,
    debounce_duration: Duration,
}

impl DistractionDebouncer {
    pub fn new(debounce_duration: Duration) -> Self {
        Self {
            last_triggered: HashMap::new(),
            debounce_duration,
        }
    }

    /// Returns `true` if this distraction should be logged, or `false` if debounced
    pub fn should_log(&mut self, process_name: &str, now: Instant) -> bool {
        let key = process_name.to_ascii_lowercase();
        if let Some(&last) = self.last_triggered.get(&key) {
            if now.duration_since(last) < self.debounce_duration {
                return false;
            }
        }
        self.last_triggered.insert(key, now);
        true
    }
}

/// Checks if a foreground process name matches any blacklist entry
pub fn matches_blacklist(process_name: &str, blacklist: &[db::BlacklistRecord]) -> bool {
    let lower_proc = process_name.to_ascii_lowercase();
    let lower_proc_stem = lower_proc.strip_suffix(".exe").unwrap_or(&lower_proc);

    blacklist.iter().any(|item| {
        if item.item_type == "app" {
            let lower_item = item.name.to_ascii_lowercase();
            let lower_item_stem = lower_item.strip_suffix(".exe").unwrap_or(&lower_item);

            lower_item == lower_proc
                || lower_item_stem == lower_proc_stem
                || (lower_item_stem == "steam" && lower_proc_stem == "steamwebhelper")
                || (lower_item_stem == "steamwebhelper" && lower_proc_stem == "steam")
        } else {
            false
        }
    })
}

/// Get the active foreground window executable name (Windows only)
#[cfg(windows)]
pub fn get_foreground_process_name() -> Option<String> {
    use std::path::Path;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::GetModuleBaseNameW;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }

        // Try with PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, fallback to PROCESS_QUERY_LIMITED_INFORMATION
        let handle = match OpenProcess(
            windows::Win32::System::Threading::PROCESS_QUERY_INFORMATION
                | windows::Win32::System::Threading::PROCESS_VM_READ,
            false,
            pid,
        ) {
            Ok(h) => h,
            Err(_) => match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(_) => return None,
            },
        };

        // First attempt: GetModuleBaseNameW
        let mut base_buf = [0u16; 260];
        let base_len = GetModuleBaseNameW(handle, None, &mut base_buf);
        if base_len > 0 {
            let _ = CloseHandle(handle);
            let name = String::from_utf16_lossy(&base_buf[..base_len as usize]);
            return Some(name);
        }

        // Fallback attempt: QueryFullProcessImageNameW
        let mut full_buf = [0u16; 1024];
        let mut full_len = full_buf.len() as u32;
        let success = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(full_buf.as_mut_ptr()),
            &mut full_len,
        )
        .is_ok();
        let _ = CloseHandle(handle);

        if success && full_len > 0 {
            let full_path = String::from_utf16_lossy(&full_buf[..full_len as usize]);
            if let Some(file_name) = Path::new(&full_path).file_name() {
                return Some(file_name.to_string_lossy().to_string());
            }
        }

        None
    }
}

/// Payload emitted via Tauri event "distraction-detected"
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DistractionEventPayload {
    pub session_id: i64,
    pub process_name: String,
    pub session_goal: String,
}

/// Fallback for non-Windows targets
#[cfg(not(windows))]
pub fn get_foreground_process_name() -> Option<String> {
    None
}

/// Executes a single polling cycle: queries active session, checks foreground process,
/// applies debouncing, logs distractions to the database, and invokes the distraction callback.
pub async fn poll_cycle<F, E>(
    app_state: &AppState,
    debouncer: &mut DistractionDebouncer,
    mut get_fg: F,
    mut on_distraction: E,
) -> Option<db::DistractionRecord>
where
    F: FnMut() -> Option<String>,
    E: FnMut(&DistractionEventPayload),
{
    // Query active session and blacklist from database
    let active_info = {
        let conn = match app_state.db.lock() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[process_monitor] Database lock error: {}", e);
                return None;
            }
        };

        let active_session = match db::get_active_session(&conn) {
            Ok(Some(s)) => s,
            Ok(None) => return None, // No active session running, skip polling
            Err(e) => {
                eprintln!("[process_monitor] Query active session error: {}", e);
                return None;
            }
        };

        let blacklist = match db::get_blacklist(&conn) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[process_monitor] Query blacklist error: {}", e);
                return None;
            }
        };

        (active_session.id, active_session.goal, blacklist)
    };

    // Determine currently active foreground process
    if let Some(fg_process) = get_fg() {
        let (session_id, session_goal, blacklist) = active_info;
        if matches_blacklist(&fg_process, &blacklist)
            && debouncer.should_log(&fg_process, Instant::now())
        {
            let conn = match app_state.db.lock() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[process_monitor] Database lock error on logging: {}", e);
                    return None;
                }
            };

            match db::log_distraction(&conn, session_id, &fg_process) {
                Ok(record) => {
                    println!(
                        "[process_monitor] Logged distraction: {} (session_id: {}, timestamp: {})",
                        record.process_name, record.session_id, record.timestamp
                    );

                    let payload = DistractionEventPayload {
                        session_id,
                        process_name: fg_process.clone(),
                        session_goal,
                    };
                    on_distraction(&payload);

                    return Some(record);
                }
                Err(e) => {
                    eprintln!("[process_monitor] Failed to log distraction: {}", e);
                }
            }
        }
    }
    None
}

/// Generic polling loop supporting custom process resolvers and distraction callbacks
pub async fn run_polling_loop<F, E>(
    app_state: AppState,
    interval_ms: u64,
    mut get_fg: F,
    mut on_distraction: E,
) where
    F: FnMut() -> Option<String> + Send + 'static,
    E: FnMut(&DistractionEventPayload) + Send + 'static,
{
    let mut interval = tokio::time::interval(Duration::from_millis(interval_ms));
    let mut debouncer = DistractionDebouncer::new(Duration::from_secs(5));

    loop {
        interval.tick().await;
        let _ = poll_cycle(&app_state, &mut debouncer, &mut get_fg, &mut on_distraction).await;
    }
}

/// Background polling loop running on a tokio interval with default OS foreground process resolver
/// and Tauri AppHandle integration (emits "distraction-detected" and shows overlay window).
pub async fn start_polling(app_handle: tauri::AppHandle, app_state: AppState, interval_ms: u64) {
    start_polling_with(app_handle, app_state, interval_ms, get_foreground_process_name).await;
}

/// Background polling loop with custom process resolver and Tauri AppHandle integration
pub async fn start_polling_with<F>(
    app_handle: tauri::AppHandle,
    app_state: AppState,
    interval_ms: u64,
    get_fg: F,
) where
    F: FnMut() -> Option<String> + Send + 'static,
{
    use tauri::{Emitter, Manager};
    run_polling_loop(app_state, interval_ms, get_fg, move |payload| {
        if let Some(overlay) = app_handle.get_webview_window("overlay") {
            let _ = overlay.unminimize();
            let _ = overlay.show();
            let _ = overlay.set_focus();
            let _ = overlay.set_always_on_top(true);
            let _ = overlay.emit("distraction-detected", payload);
        }
        let _ = app_handle.emit("distraction-detected", payload);
    })
    .await;
}

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn test_debouncer_logic() {
        let mut debouncer = DistractionDebouncer::new(Duration::from_secs(5));
        let start = Instant::now();

        // First trigger should be allowed
        assert!(debouncer.should_log("notepad.exe", start));

        // Immediate subsequent triggers within 5s should be suppressed
        assert!(!debouncer.should_log("notepad.exe", start + Duration::from_secs(1)));
        assert!(!debouncer.should_log("NOTEPAD.EXE", start + Duration::from_secs(3)));
        assert!(!debouncer.should_log("notepad.exe", start + Duration::from_secs(4)));

        // Trigger after 5s should be allowed
        assert!(debouncer.should_log("notepad.exe", start + Duration::from_secs(6)));

        // Subsequent trigger within new 5s window should be suppressed
        assert!(!debouncer.should_log("notepad.exe", start + Duration::from_secs(8)));
    }

    #[test]
    fn test_debouncer_independent_processes() {
        let mut debouncer = DistractionDebouncer::new(Duration::from_secs(5));
        let now = Instant::now();

        assert!(debouncer.should_log("notepad.exe", now));
        // Different process is allowed immediately
        assert!(debouncer.should_log("Steam.exe", now + Duration::from_secs(1)));
        // Same process is still suppressed
        assert!(!debouncer.should_log("notepad.exe", now + Duration::from_secs(2)));
        assert!(!debouncer.should_log("steam.exe", now + Duration::from_secs(2)));
    }

    #[test]
    fn test_blacklist_process_matching() {
        let blacklist = vec![
            db::BlacklistRecord {
                id: 1,
                name: "notepad.exe".to_string(),
                item_type: "app".to_string(),
            },
            db::BlacklistRecord {
                id: 2,
                name: "facebook.com".to_string(),
                item_type: "domain".to_string(),
            },
            db::BlacklistRecord {
                id: 3,
                name: "steam.exe".to_string(),
                item_type: "app".to_string(),
            },
        ];

        assert!(matches_blacklist("notepad.exe", &blacklist));
        assert!(matches_blacklist("notepad", &blacklist));
        assert!(matches_blacklist("NOTEPAD.EXE", &blacklist));
        assert!(matches_blacklist("Notepad.exe", &blacklist));
        assert!(matches_blacklist("steam.exe", &blacklist));
        assert!(matches_blacklist("steamwebhelper.exe", &blacklist));
        assert!(matches_blacklist("steamwebhelper", &blacklist));
        assert!(!matches_blacklist("code.exe", &blacklist));
        assert!(!matches_blacklist("facebook.com", &blacklist)); // Domain type not matched as process name
    }

    #[tokio::test]
    async fn test_poll_cycle_distraction_event_and_debounce() {
        use rusqlite::Connection;

        let conn = Connection::open_in_memory().unwrap();
        db::init_db(&conn).unwrap();
        db::add_blacklist_item(&conn, "notepad.exe", "app").unwrap();
        let session = db::create_session(&conn, "Study Rust Concurrency", 60).unwrap();

        let app_state = AppState::new(conn);
        let mut debouncer = DistractionDebouncer::new(Duration::from_secs(5));

        // 1. First distraction: should log and trigger event callback
        let mut emitted_events = Vec::new();
        let log_res = poll_cycle(
            &app_state,
            &mut debouncer,
            || Some("notepad.exe".to_string()),
            |payload| emitted_events.push(payload.clone()),
        )
        .await;

        assert!(log_res.is_some());
        assert_eq!(emitted_events.len(), 1);
        assert_eq!(emitted_events[0].process_name, "notepad.exe");
        assert_eq!(emitted_events[0].session_goal, "Study Rust Concurrency");
        assert_eq!(emitted_events[0].session_id, session.id);

        // 2. Immediate second distraction (within 5s): should be debounced
        let log_res2 = poll_cycle(
            &app_state,
            &mut debouncer,
            || Some("notepad.exe".to_string()),
            |payload| emitted_events.push(payload.clone()),
        )
        .await;

        assert!(log_res2.is_none());
        assert_eq!(emitted_events.len(), 1); // Still 1, no duplicate event

        // 3. Different blacklisted app (e.g. discord.exe): should trigger immediately
        {
            let conn = app_state.db.lock().unwrap();
            db::add_blacklist_item(&conn, "discord.exe", "app").unwrap();
        }
        let log_res3 = poll_cycle(
            &app_state,
            &mut debouncer,
            || Some("discord.exe".to_string()),
            |payload| emitted_events.push(payload.clone()),
        )
        .await;

        assert!(log_res3.is_some());
        assert_eq!(emitted_events.len(), 2);
        assert_eq!(emitted_events[1].process_name, "discord.exe");

        // 4. Session ended: should not trigger
        {
            let conn = app_state.db.lock().unwrap();
            db::end_session(&conn, session.id).unwrap();
        }
        let log_res4 = poll_cycle(
            &app_state,
            &mut debouncer,
            || Some("notepad.exe".to_string()),
            |payload| emitted_events.push(payload.clone()),
        )
        .await;

        assert!(log_res4.is_none());
        assert_eq!(emitted_events.len(), 2); // No new events
    }
}
