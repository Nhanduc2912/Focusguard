use focusguard_lib::db;
use rusqlite::Connection;

#[test]
fn manual_db_persistence_verification() {
    let test_db_path = "manual_test_focusguard.db";
    let _ = std::fs::remove_file(test_db_path);

    let conn = Connection::open(test_db_path).expect("Failed to create disk DB");
    db::init_db(&conn).expect("Failed to initialize database schema");

    // 1. Create a session
    let session = db::create_session(&conn, "Verification Session 60m", 60)
        .expect("Failed to create session");
    println!("\n[DB VERIFICATION] Created session: {:?}", session);
    assert_eq!(session.goal, "Verification Session 60m");
    assert_eq!(session.planned_minutes, 60);

    // 2. Log distraction
    let distraction = db::log_distraction(&conn, session.id, "notepad.exe")
        .expect("Failed to log distraction");
    println!("[DB VERIFICATION] Logged distraction: {:?}", distraction);
    assert_eq!(distraction.process_name, "notepad.exe");

    // 3. End session
    let ended = db::end_session(&conn, session.id).expect("Failed to end session");
    println!("[DB VERIFICATION] Ended session: {:?}", ended);
    assert!(ended.ended_at.is_some());

    // 4. Query history
    let history = db::get_session_history(&conn).expect("Failed to get history");
    println!("[DB VERIFICATION] History records: {:?}", history);
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].goal, "Verification Session 60m");
    assert_eq!(history[0].distraction_count, 1);

    // 5. Query blacklist
    let blacklist = db::get_blacklist(&conn).expect("Failed to get blacklist");
    println!("[DB VERIFICATION] Total blacklist items: {}", blacklist.len());
    assert!(blacklist.len() >= 5);

    drop(conn);
    let _ = std::fs::remove_file(test_db_path);
    println!("[DB VERIFICATION] PASSED - Disk DB verified successfully.\n");
}
