pub mod commands;
pub mod db;
pub mod process_monitor;

use commands::AppState;
use tauri::Manager;

#[tauri::command]
fn ping() -> String {
    "Backend connected (Tauri v2 + Rust)".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to determine app data directory");

            std::fs::create_dir_all(&app_data_dir)
                .expect("failed to create app data directory");

            let db_path = app_data_dir.join("focusguard.db");
            let conn = rusqlite::Connection::open(&db_path)
                .expect("failed to open SQLite database");

            db::init_db(&conn).expect("failed to initialize SQLite schema");

            let app_state = AppState::new(conn);

            // Spawn background process monitor loop (polls every 1500ms when a session is active)
            let monitor_state = app_state.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                process_monitor::start_polling(app_handle, monitor_state, 1500).await;
            });

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            commands::start_session,
            commands::end_session,
            commands::get_active_session,
            commands::get_history,
            commands::get_session_distractions,
            commands::get_blacklist,
            commands::add_blacklist_item,
            commands::remove_blacklist_item,
            commands::hide_overlay,
            commands::show_main_window,
            commands::list_running_processes,
            commands::get_latest_distraction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running FocusGuard application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ping_command() {
        let result = ping();
        assert!(result.contains("Tauri v2"));
    }
}
