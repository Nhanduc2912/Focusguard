use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use focusguard_lib::commands::AppState;
use focusguard_lib::db;
use focusguard_lib::process_monitor::{self, DistractionDebouncer, DistractionEventPayload};
use rusqlite::Connection;

#[tokio::test]
async fn test_end_to_end_lifecycle_with_notepad_blacklist() {
    println!("\n==========================================================================");
    println!("  FOCUSGUARD E2E VERIFICATION TEST (Target: notepad.exe)");
    println!("==========================================================================\n");

    // 1. Initialize Real AppData SQLite Database
    let app_data = std::env::var("APPDATA")
        .unwrap_or_else(|_| "C:\\Users\\ADMIN\\AppData\\Roaming".to_string());
    let db_dir = std::path::PathBuf::from(app_data).join("com.focusguard.app");
    std::fs::create_dir_all(&db_dir).expect("Failed to create app data directory");
    let db_path = db_dir.join("focusguard.db");
    println!("[E2E STEP 1] Database file: {:?}", db_path);

    let conn = Connection::open(&db_path).expect("Failed to open focusguard.db");
    db::init_db(&conn).expect("Failed to initialize DB schema");

    // Clean any prior dangling unended sessions
    let _ = conn.execute(
        "UPDATE sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ended_at IS NULL;",
        [],
    );

    // 2. Blacklist Setup: Ensure notepad.exe is blacklisted
    let _ = db::add_blacklist_item(&conn, "notepad.exe", "app");
    let blacklist = db::get_blacklist(&conn).expect("Failed to query blacklist");
    let has_notepad = blacklist.iter().any(|b| b.name.eq_ignore_ascii_case("notepad.exe"));
    assert!(has_notepad, "notepad.exe must be present in blacklist");
    println!("[E2E STEP 2] Verified 'notepad.exe' blacklisted in SQLite");

    // 3. Session Setup: Start a new focus session
    let goal = "Hoàn thành bài tập kiến trúc phần mềm";
    let planned_minutes = 25;
    let session = db::create_session(&conn, goal, planned_minutes)
        .expect("Failed to create focus session");
    let session_id = session.id;
    println!(
        "[E2E STEP 3] Created focus session #{}: Goal='{}', Planned={}m",
        session_id, session.goal, session.planned_minutes
    );

    // Verify it is recognized as active
    let active = db::get_active_session(&conn).expect("Failed to get active session");
    assert!(active.is_some(), "Active session must exist");
    assert_eq!(active.as_ref().unwrap().id, session_id);
    assert_eq!(active.as_ref().unwrap().goal, goal);
    println!("[E2E STEP 3] Confirmed session #{} is ACTIVE in SQLite", session_id);

    // 4. Background Monitoring & Distraction Intervention
    let app_state = AppState::new(conn);
    let overlay_events: Arc<std::sync::Mutex<Vec<DistractionEventPayload>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));
    let overlay_counter = Arc::new(AtomicUsize::new(0));

    let overlay_events_clone = overlay_events.clone();
    let overlay_counter_clone = overlay_counter.clone();

    // Run polling cycles while user triggers "notepad.exe"
    let mut debouncer = DistractionDebouncer::new(Duration::from_secs(5));

    // Tick 1: Distraction detected -> logs distraction and triggers overlay event
    let tick1_res = process_monitor::poll_cycle(
        &app_state,
        &mut debouncer,
        || Some("notepad.exe".to_string()),
        {
            let events = overlay_events_clone.clone();
            let counter = overlay_counter_clone.clone();
            move |payload| {
                counter.fetch_add(1, Ordering::SeqCst);
                let mut guard = events.lock().unwrap();
                guard.push(payload.clone());
            }
        },
    )
    .await;

    assert!(tick1_res.is_some(), "Tick 1 must detect and log distraction");
    assert_eq!(tick1_res.unwrap().process_name, "notepad.exe");
    println!("[E2E STEP 4] Tick 1: Distraction detected for 'notepad.exe' -> Logged & Overlay Event Emitted");

    // Tick 2: 500ms later with same notepad.exe -> DEBOUNCED (no duplicate log, no duplicate overlay)
    tokio::time::sleep(Duration::from_millis(500)).await;
    let tick2_res = process_monitor::poll_cycle(
        &app_state,
        &mut debouncer,
        || Some("notepad.exe".to_string()),
        {
            let events = overlay_events_clone.clone();
            let counter = overlay_counter_clone.clone();
            move |payload| {
                counter.fetch_add(1, Ordering::SeqCst);
                let mut guard = events.lock().unwrap();
                guard.push(payload.clone());
            }
        },
    )
    .await;

    assert!(tick2_res.is_none(), "Tick 2 must be suppressed by 5s debounce");
    println!("[E2E STEP 4] Tick 2: Subsequent distraction suppressed by 5s debounce window");

    // Check overlay event contents
    {
        let guard = overlay_events.lock().unwrap();
        assert_eq!(guard.len(), 1, "Exactly 1 overlay event should have been emitted");
        assert_eq!(guard[0].session_id, session_id);
        assert_eq!(guard[0].process_name, "notepad.exe");
        assert_eq!(guard[0].session_goal, goal);
    }
    println!("[E2E STEP 4] Overlay event payload matches session #{} goal and process", session_id);

    // 5. Query Real SQLite DB for Distraction Record
    let verify_conn = Connection::open(&db_path).expect("Failed to reopen DB for verification");
    let distraction_count = db::get_distraction_count(&verify_conn, session_id)
        .expect("Failed to count distractions");
    assert_eq!(distraction_count, 1, "SQLite must contain exactly 1 distraction for session");
    println!("[E2E STEP 5] SQLite Query: Verified COUNT(distractions) = 1 for session #{}", session_id);

    // 6. Session Termination
    let ended_session = db::end_session(&verify_conn, session_id)
        .expect("Failed to end session");
    assert!(ended_session.ended_at.is_some(), "Session ended_at must be populated");
    println!("[E2E STEP 6] Ended session #{}: ended_at = {:?}", session_id, ended_session.ended_at);

    // 7. Verify Inactive State & History Record
    let active_after_end = db::get_active_session(&verify_conn)
        .expect("Failed to query active session");
    assert!(active_after_end.is_none(), "No active session should remain");

    let history = db::get_session_history(&verify_conn)
        .expect("Failed to fetch session history");
    let history_entry = history.iter().find(|h| h.id == session_id);
    assert!(history_entry.is_some(), "History must contain completed session");
    let h = history_entry.unwrap();
    assert_eq!(h.goal, goal);
    assert_eq!(h.planned_minutes, 25);
    assert_eq!(h.distraction_count, 1);
    assert!(h.ended_at.is_some());
    println!(
        "[E2E STEP 7] History verification: Session #{} | Goal='{}' | Planned={}m | Distractions={} | Ended={:?}",
        h.id, h.goal, h.planned_minutes, h.distraction_count, h.ended_at
    );

    // 8. Confirm No Distractions Logged After Session End
    let post_end_res = process_monitor::poll_cycle(
        &app_state,
        &mut debouncer,
        || Some("notepad.exe".to_string()),
        |_payload| {},
    )
    .await;
    assert!(
        post_end_res.is_none(),
        "No distraction should be logged when session is inactive"
    );
    println!("[E2E STEP 8] Confirmed poller does not log distractions when session is inactive");

    println!("\n==========================================================================");
    println!("  ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY!");
    println!("==========================================================================\n");
}
