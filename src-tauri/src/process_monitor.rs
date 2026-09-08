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
    blacklist.iter().any(|item| {
        if item.item_type == "app" {
            item.name.eq_ignore_ascii_case(&lower_proc)
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

/// Fallback for non-Windows targets
#[cfg(not(windows))]
pub fn get_foreground_process_name() -> Option<String> {
    None
}

/// Executes a single polling cycle: queries active session, checks foreground process,
/// applies debouncing, and logs distractions to the database.
pub async fn poll_cycle<F>(
    app_state: &AppState,
    debouncer: &mut DistractionDebouncer,
    mut get_fg: F,
) -> Option<db::DistractionRecord>
where
    F: FnMut() -> Option<String>,
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

        (active_session.id, blacklist)
    };

    // Determine currently active foreground process
    if let Some(fg_process) = get_fg() {
        let (session_id, blacklist) = active_info;
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

/// Background polling loop running on a tokio interval with default OS foreground process resolver
pub async fn start_polling(app_state: AppState, interval_ms: u64) {
    start_polling_with(app_state, interval_ms, get_foreground_process_name).await;
}

/// Background polling loop running on a tokio interval with custom process resolver (for tests & extension)
pub async fn start_polling_with<F>(app_state: AppState, interval_ms: u64, mut get_fg: F)
where
    F: FnMut() -> Option<String> + Send + 'static,
{
    let mut interval = tokio::time::interval(Duration::from_millis(interval_ms));
    let mut debouncer = DistractionDebouncer::new(Duration::from_secs(5));

    loop {
        interval.tick().await;
        let _ = poll_cycle(&app_state, &mut debouncer, &mut get_fg).await;
    }
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
        ];

        assert!(matches_blacklist("notepad.exe", &blacklist));
        assert!(matches_blacklist("NOTEPAD.EXE", &blacklist));
        assert!(matches_blacklist("Notepad.exe", &blacklist));
        assert!(!matches_blacklist("code.exe", &blacklist));
        assert!(!matches_blacklist("facebook.com", &blacklist)); // Domain type not matched as process name
    }
}
