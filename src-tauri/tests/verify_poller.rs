use std::time::Duration;
use focusguard_lib::commands::AppState;
use focusguard_lib::db;
use focusguard_lib::process_monitor;
use rusqlite::Connection;

#[tokio::test]
async fn test_real_db_poller_and_distraction_logging() {
    // 1. Target the real AppData SQLite database file
    let app_data = std::env::var("APPDATA")
        .unwrap_or_else(|_| "C:\\Users\\ADMIN\\AppData\\Roaming".to_string());
    let db_dir = std::path::PathBuf::from(app_data).join("com.focusguard.app");
    std::fs::create_dir_all(&db_dir).expect("Failed to create app data directory");
    let db_path = db_dir.join("focusguard.db");
    println!("\n[POLLER VERIFICATION] Target Database: {:?}", db_path);

    let conn = Connection::open(&db_path).expect("Failed to open real focusguard.db");
    db::init_db(&conn).expect("Failed to initialize DB schema");

    // Clean up any stale active sessions for clean state
    let _ = conn.execute(
        "UPDATE sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ended_at IS NULL;",
        [],
    );

    // 2. Add "notepad.exe" to blacklist in real DB
    let _ = db::add_blacklist_item(&conn, "notepad.exe", "app");
    let blacklist = db::get_blacklist(&conn).expect("Failed to get blacklist");
    assert!(
        blacklist.iter().any(|b| b.name.eq_ignore_ascii_case("notepad.exe")),
        "notepad.exe should be in blacklist"
    );
    println!("[POLLER VERIFICATION] Confirmed 'notepad.exe' present in blacklist table");

    // 3. Create active session in real DB
    let session = db::create_session(&conn, "Verify Background Poller Session", 45)
        .expect("Failed to create session");
    println!(
        "[POLLER VERIFICATION] Created active session: ID={}, Goal='{}'",
        session.id, session.goal
    );

    // 4. Test OS API call get_foreground_process_name()
    let detected_os_fg = process_monitor::get_foreground_process_name();
    println!(
        "[POLLER VERIFICATION] Real OS get_foreground_process_name(): {:?}",
        detected_os_fg
    );
    if detected_os_fg.is_none() {
        println!(
            "[SANDBOX NOTE] GetForegroundWindow returned NULL (running in background/sandbox session without interactive desktop focus)"
        );
    }

    // 5. Start background polling loop with real AppState connected to real SQLite DB
    let app_state = AppState::new(conn);
    let monitor_state = app_state.clone();

    // The poller runs every 500ms, detecting "notepad.exe"
    let poller_handle = tokio::spawn(async move {
        process_monitor::run_polling_loop(
            monitor_state,
            500,
            || Some("notepad.exe".to_string()),
            |_payload| {},
        )
        .await;
    });

    // Wait 3.2 seconds for multiple ticks (each 500ms)
    println!("[POLLER VERIFICATION] Poller active for 3.2s (6+ ticks, 5s debounce window)...");
    tokio::time::sleep(Duration::from_millis(3200)).await;

    // Abort background poller task
    poller_handle.abort();
    println!("[POLLER VERIFICATION] Poller terminated");

    // 6. Query REAL SQLite DB file directly to verify recorded distraction
    let verify_conn = Connection::open(&db_path).expect("Failed to reopen DB");
    let mut stmt = verify_conn
        .prepare(
            "SELECT id, session_id, process_name, timestamp FROM distractions WHERE session_id = ?1 ORDER BY id ASC;",
        )
        .expect("Failed to prepare query");

    let rows = stmt
        .query_map([session.id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .expect("Query failed");

    let mut distractions = Vec::new();
    for row in rows {
        distractions.push(row.expect("row read error"));
    }

    // Print formatted table of results
    println!("\n==========================================================================");
    println!(" REAL SQLITE DB QUERY: SELECT * FROM distractions WHERE session_id = {}", session.id);
    println!("--------------------------------------------------------------------------");
    println!("{:<6} | {:<12} | {:<18} | {:<26}", "ID", "SESSION_ID", "PROCESS_NAME", "TIMESTAMP");
    println!("--------------------------------------------------------------------------");
    for (id, s_id, proc_name, ts) in &distractions {
        println!("{:<6} | {:<12} | {:<18} | {:<26}", id, s_id, proc_name, ts);
    }
    println!("==========================================================================\n");

    // 7. Verify correctness:
    // Exactly 1 distraction should be logged despite >6 polling ticks due to the 5s debounce window
    assert_eq!(
        distractions.len(),
        1,
        "Expected exactly 1 distraction logged due to 5-second debounce, found {}",
        distractions.len()
    );
    assert_eq!(
        distractions[0].2, "notepad.exe",
        "Logged process_name should match blacklisted target"
    );

    // 8. End session and verify no further distractions logged when inactive
    let _ = db::end_session(&verify_conn, session.id);
    let mut debouncer = process_monitor::DistractionDebouncer::new(Duration::from_secs(5));
    let after_end_log = process_monitor::poll_cycle(
        &app_state,
        &mut debouncer,
        || Some("notepad.exe".to_string()),
        |_payload| {},
    )
    .await;
    assert!(
        after_end_log.is_none(),
        "No distraction should be logged after session has ended"
    );

    println!("[POLLER VERIFICATION] SUCCESS: Verified against real SQLite DB (focusguard.db) with 5s debounce and active session check!");
}
