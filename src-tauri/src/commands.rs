use std::sync::{Arc, Mutex};
use tauri::State;

use crate::db::{self, BlacklistRecord, DistractionRecord, SessionRecord, SessionWithStats};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
}

impl AppState {
    pub fn new(conn: rusqlite::Connection) -> Self {
        Self {
            db: Arc::new(Mutex::new(conn)),
        }
    }
}

/// Tauri command: Start a new focus session
#[tauri::command]
pub fn start_session(
    state: State<'_, AppState>,
    goal: String,
    minutes: i64,
) -> Result<SessionRecord, String> {
    let trimmed_goal = goal.trim();
    if trimmed_goal.is_empty() {
        return Err("Session goal cannot be empty".to_string());
    }
    if minutes <= 0 {
        return Err("Planned minutes must be greater than 0".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Check if there is already an active session
    if let Some(active) = db::get_active_session(&conn).map_err(|e| e.to_string())? {
        return Err(format!(
            "A session is already active (id: {}, goal: '{}')",
            active.id, active.goal
        ));
    }

    db::create_session(&conn, trimmed_goal, minutes).map_err(|e| e.to_string())
}

/// Tauri command: End the current active session
#[tauri::command]
pub fn end_session(state: State<'_, AppState>) -> Result<Option<SessionRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let active = db::get_active_session(&conn).map_err(|e| e.to_string())?;
    match active {
        Some(session) => {
            let ended = db::end_session(&conn, session.id).map_err(|e| e.to_string())?;
            Ok(Some(ended))
        }
        None => Ok(None),
    }
}

/// Tauri command: Get current active session
#[tauri::command]
pub fn get_active_session(state: State<'_, AppState>) -> Result<Option<SessionRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_active_session(&conn).map_err(|e| e.to_string())
}

/// Tauri command: Get past session history with distraction stats
#[tauri::command]
pub fn get_history(state: State<'_, AppState>) -> Result<Vec<SessionWithStats>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_session_history(&conn).map_err(|e| e.to_string())
}

/// Tauri command: Get all distractions for a specific session ordered by timestamp
#[tauri::command]
pub fn get_session_distractions(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Vec<DistractionRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_session_distractions(&conn, session_id).map_err(|e| e.to_string())
}

/// Tauri command: Get all blacklist items
#[tauri::command]
pub fn get_blacklist(state: State<'_, AppState>) -> Result<Vec<BlacklistRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_blacklist(&conn).map_err(|e| e.to_string())
}

/// Tauri command: Add an item to the blacklist
#[tauri::command]
pub fn add_blacklist_item(
    state: State<'_, AppState>,
    name: String,
    item_type: String,
) -> Result<BlacklistRecord, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Blacklist name cannot be empty".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::add_blacklist_item(&conn, trimmed_name, &item_type).map_err(|e| e.to_string())
}

/// Tauri command: Remove an item from the blacklist
#[tauri::command]
pub fn remove_blacklist_item(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::remove_blacklist_item(&conn, id).map_err(|e| e.to_string())
}

/// Tauri command: Hide the distraction warning overlay window
#[tauri::command]
pub fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tauri command: Bring the main application window to the foreground and focus it
#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.unminimize();
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.hide();
    }
    Ok(())
}

/// Tauri command: Get latest distraction and active session info for the overlay window
#[tauri::command]
pub fn get_latest_distraction(
    app_state: tauri::State<'_, AppState>,
) -> Result<Option<crate::process_monitor::DistractionEventPayload>, String> {
    let conn = app_state.db.lock().map_err(|e| e.to_string())?;
    let active = db::get_active_session(&conn).map_err(|e| e.to_string())?;
    if let Some(session) = active {
        let mut stmt = conn
            .prepare(
                "SELECT process_name, timestamp FROM distractions 
                 WHERE session_id = ?1 ORDER BY id DESC LIMIT 1;",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(rusqlite::params![session.id]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let process_name: String = row.get(0).map_err(|e| e.to_string())?;
            let timestamp: String = row.get(1).map_err(|e| e.to_string())?;
            return Ok(Some(crate::process_monitor::DistractionEventPayload {
                session_id: session.id,
                process_name,
                session_goal: session.goal,
                timestamp,
            }));
        }
    }
    Ok(None)
}

/// Helper to list running user desktop processes (with UI windows, filtering system daemons)
#[cfg(windows)]
fn get_running_desktop_processes() -> Vec<String> {
    use std::collections::HashSet;
    use sysinfo::{ProcessesToUpdate, System};
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
    };

    let mut visible_pids: HashSet<u32> = HashSet::new();

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let pids_ptr = lparam.0 as *mut HashSet<u32>;
        if IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                (*pids_ptr).insert(pid);
            }
        }
        BOOL(1)
    }

    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut visible_pids as *mut _ as isize));
    }

    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let system_blacklist = [
        "svchost.exe", "system", "registry", "smss.exe", "csrss.exe", "wininit.exe",
        "services.exe", "lsass.exe", "dwm.exe", "fontdrvhost.exe", "runtimebroker.exe",
        "shellexperiencehost.exe", "searchhost.exe", "startmenuexperiencehost.exe",
        "applicationframehost.exe", "textinputhost.exe", "conhost.exe", "taskhostw.exe",
        "sihost.exe", "ctfmon.exe", "dllhost.exe", "spoolsv.exe",
    ];

    let mut result_set = HashSet::new();

    // 1. Add processes that have a visible window
    for (pid, process) in system.processes() {
        let pid_u32 = pid.as_u32();
        let name = process.name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();

        if system_blacklist.contains(&lower.as_str()) {
            continue;
        }

        if visible_pids.contains(&pid_u32) {
            result_set.insert(name);
        }
    }

    // 2. Also ensure popular game/desktop apps are captured if running even if minimized
    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();

        if system_blacklist.contains(&lower.as_str()) {
            continue;
        }

        if lower.contains("steam") || lower.contains("discord") || lower.contains("spotify") || lower.contains("epic") {
            result_set.insert(name);
        }
    }

    let mut list: Vec<String> = result_set.into_iter().collect();
    list.sort_by_key(|a| a.to_ascii_lowercase());
    list
}

#[cfg(not(windows))]
fn get_running_desktop_processes() -> Vec<String> {
    use sysinfo::{ProcessesToUpdate, System};
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let mut list = Vec::new();
    for process in system.processes().values() {
        list.push(process.name().to_string_lossy().to_string());
    }
    list.sort();
    list.dedup();
    list
}

/// Tauri command: List currently running user applications for blacklist selection
#[tauri::command]
pub fn list_running_processes() -> Result<Vec<String>, String> {
    Ok(get_running_desktop_processes())
}

/// Tauri command: Detect installed browsers (Chrome, Brave, Edge) and load monitoring preferences
#[tauri::command]
pub fn detect_installed_browsers(
    state: State<'_, AppState>,
) -> Result<Vec<crate::browser_detection::BrowserInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let prefs = db::get_monitored_browsers(&conn).map_err(|e| e.to_string())?;
    Ok(crate::browser_detection::detect_all_browsers(&prefs))
}

/// Tauri command: Set monitoring enabled/disabled for a specific browser
#[tauri::command]
pub fn set_browser_monitored(
    state: State<'_, AppState>,
    browser_id: String,
    enabled: bool,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::set_browser_monitored(&conn, &browser_id, enabled).map_err(|e| e.to_string())
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_state() -> AppState {
        let conn = Connection::open_in_memory().expect("in-memory db");
        db::init_db(&conn).expect("init db");
        AppState::new(conn)
    }

    #[test]
    fn test_commands_session_lifecycle() {
        let app_state = setup_test_state();
        let conn = app_state.db.lock().unwrap();

        // 1. Initially no active session
        let active = db::get_active_session(&conn).unwrap();
        assert!(active.is_none());

        // 2. Start session
        let session = db::create_session(&conn, "Focus Time", 45).unwrap();
        assert_eq!(session.goal, "Focus Time");
        assert_eq!(session.planned_minutes, 45);

        // 3. Confirm active
        let active = db::get_active_session(&conn).unwrap().unwrap();
        assert_eq!(active.id, session.id);

        // 4. End session
        let ended = db::end_session(&conn, active.id).unwrap();
        assert!(ended.ended_at.is_some());

        // 5. Confirm no active session now
        assert!(db::get_active_session(&conn).unwrap().is_none());

        // 6. History has 1 record
        let history = db::get_session_history(&conn).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, session.id);
        assert_eq!(history[0].distraction_count, 0);
    }

    #[test]
    fn test_commands_blacklist() {
        let app_state = setup_test_state();
        let conn = app_state.db.lock().unwrap();

        let initial_items = db::get_blacklist(&conn).unwrap();
        assert!(initial_items.len() >= 5);

        let item = db::add_blacklist_item(&conn, "Discord.exe", "app").unwrap();
        assert_eq!(item.name, "Discord.exe");

        let updated = db::get_blacklist(&conn).unwrap();
        assert_eq!(updated.len(), initial_items.len() + 1);

        let removed = db::remove_blacklist_item(&conn, item.id).unwrap();
        assert!(removed);

        let final_items = db::get_blacklist(&conn).unwrap();
        assert_eq!(final_items.len(), initial_items.len());
    }

    #[test]
    fn test_commands_get_session_distractions() {
        let app_state = setup_test_state();
        let conn = app_state.db.lock().unwrap();

        let session = db::create_session(&conn, "Coding Task", 25).unwrap();
        db::log_distraction(&conn, session.id, "Steam.exe").unwrap();
        db::log_distraction(&conn, session.id, "notepad.exe").unwrap();

        let distractions = db::get_session_distractions(&conn, session.id).unwrap();
        assert_eq!(distractions.len(), 2);
        assert_eq!(distractions[0].process_name, "Steam.exe");
        assert_eq!(distractions[1].process_name, "notepad.exe");
    }

    #[test]
    fn test_commands_list_running_processes() {
        let list = list_running_processes().unwrap();
        // Running environment should return a list without error
        assert!(list.iter().all(|name| !name.is_empty()));
    }

    #[test]
    fn test_commands_get_latest_distraction() {
        let app_state = setup_test_state();
        let conn = app_state.db.lock().unwrap();

        // 1. When no active session, returns None
        let session = db::create_session(&conn, "Deep Focus", 30).unwrap();
        db::log_distraction(&conn, session.id, "notepad.exe").unwrap();
        db::log_distraction(&conn, session.id, "steam.exe").unwrap();

        // Query latest distraction
        let mut stmt = conn
            .prepare("SELECT process_name, timestamp FROM distractions WHERE session_id = ?1 ORDER BY id DESC LIMIT 1;")
            .unwrap();
        let mut rows = stmt.query(rusqlite::params![session.id]).unwrap();
        let row = rows.next().unwrap().unwrap();
        let proc: String = row.get(0).unwrap();
        assert_eq!(proc, "steam.exe");
    }

    #[test]
    fn test_commands_detect_installed_browsers_and_toggle() {
        let app_state = setup_test_state();
        let conn = app_state.db.lock().unwrap();
        let prefs = db::get_monitored_browsers(&conn).unwrap();
        let list = crate::browser_detection::detect_all_browsers(&prefs);
        assert_eq!(list.len(), 3);
        assert!(list.iter().any(|b| b.id == "chrome"));
        assert!(list.iter().any(|b| b.id == "brave"));
        assert!(list.iter().any(|b| b.id == "edge"));

        // Toggle monitored status
        db::set_browser_monitored(&conn, "chrome", false).unwrap();
        let updated_prefs = db::get_monitored_browsers(&conn).unwrap();
        assert_eq!(updated_prefs.get("chrome"), Some(&false));
    }
}

