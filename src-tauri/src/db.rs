use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: i64,
    pub goal: String,
    pub planned_minutes: i64,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionWithStats {
    pub id: i64,
    pub goal: String,
    pub planned_minutes: i64,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub distraction_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DistractionRecord {
    pub id: i64,
    pub session_id: i64,
    pub process_name: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlacklistRecord {
    pub id: i64,
    pub name: String,
    pub item_type: String,
}

/// Initialize SQLite schema and default blacklist presets
pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal TEXT NOT NULL,
            planned_minutes INTEGER NOT NULL,
            started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            ended_at TEXT
        );

        CREATE TABLE IF NOT EXISTS distractions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            process_name TEXT NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            type TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS monitored_browsers (
            browser_name TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_distractions_session_id ON distractions(session_id);
        CREATE INDEX IF NOT EXISTS idx_blacklist_name ON blacklist(name);",
    )?;

    // Seed default presets if blacklist is empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM blacklist;", [], |row| row.get(0))?;
    if count == 0 {
        let default_presets = [
            // Coarse website blocks (Phase 1 heuristic)
            ("facebook.com", "domain"),
            ("tiktok.com", "domain"),
            ("youtube.com", "domain"),
            // Common game launchers / games
            ("Steam.exe", "app"),
            ("EpicGamesLauncher.exe", "app"),
            ("LeagueClient.exe", "app"),
            ("RobloxPlayerBeta.exe", "app"),
        ];

        let mut stmt = conn.prepare("INSERT OR IGNORE INTO blacklist (name, type) VALUES (?1, ?2);")?;
        for (name, item_type) in default_presets {
            stmt.execute(params![name, item_type])?;
        }
    }

    // Seed default monitored browsers if empty
    let browser_count: i64 = conn.query_row("SELECT COUNT(*) FROM monitored_browsers;", [], |row| row.get(0))?;
    if browser_count == 0 {
        let default_browsers = ["chrome", "brave", "edge"];
        let mut b_stmt = conn.prepare("INSERT OR IGNORE INTO monitored_browsers (browser_name, enabled) VALUES (?1, 1);")?;
        for b in default_browsers {
            b_stmt.execute(params![b])?;
        }
    }

    Ok(())
}

/// Create and start a new focus session
pub fn create_session(conn: &Connection, goal: &str, planned_minutes: i64) -> Result<SessionRecord> {
    conn.execute(
        "INSERT INTO sessions (goal, planned_minutes, started_at, ended_at) 
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL);",
        params![goal, planned_minutes],
    )?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, goal, planned_minutes, started_at, ended_at FROM sessions WHERE id = ?1;",
        params![id],
        |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                goal: row.get(1)?,
                planned_minutes: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
            })
        },
    )
}

/// End the specified session with the current timestamp
pub fn end_session(conn: &Connection, session_id: i64) -> Result<SessionRecord> {
    conn.execute(
        "UPDATE sessions SET ended_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') 
         WHERE id = ?1 AND ended_at IS NULL;",
        params![session_id],
    )?;

    conn.query_row(
        "SELECT id, goal, planned_minutes, started_at, ended_at FROM sessions WHERE id = ?1;",
        params![session_id],
        |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                goal: row.get(1)?,
                planned_minutes: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
            })
        },
    )
}

/// Get currently active (unended) session, if one exists
pub fn get_active_session(conn: &Connection) -> Result<Option<SessionRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, goal, planned_minutes, started_at, ended_at FROM sessions 
         WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1;",
    )?;

    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        Ok(Some(SessionRecord {
            id: row.get(0)?,
            goal: row.get(1)?,
            planned_minutes: row.get(2)?,
            started_at: row.get(3)?,
            ended_at: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

/// Get past session history along with total distraction count per session
pub fn get_session_history(conn: &Connection) -> Result<Vec<SessionWithStats>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.goal, s.planned_minutes, s.started_at, s.ended_at, COUNT(d.id) AS distraction_count
         FROM sessions s
         LEFT JOIN distractions d ON s.id = d.session_id
         GROUP BY s.id
         ORDER BY s.id DESC;",
    )?;

    let iter = stmt.query_map([], |row| {
        Ok(SessionWithStats {
            id: row.get(0)?,
            goal: row.get(1)?,
            planned_minutes: row.get(2)?,
            started_at: row.get(3)?,
            ended_at: row.get(4)?,
            distraction_count: row.get(5)?,
        })
    })?;

    let mut result = Vec::new();
    for item in iter {
        result.push(item?);
    }
    Ok(result)
}

/// Log a distraction event during an active session
pub fn log_distraction(conn: &Connection, session_id: i64, process_name: &str) -> Result<DistractionRecord> {
    conn.execute(
        "INSERT INTO distractions (session_id, process_name, timestamp) 
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));",
        params![session_id, process_name],
    )?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, session_id, process_name, timestamp FROM distractions WHERE id = ?1;",
        params![id],
        |row| {
            Ok(DistractionRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                process_name: row.get(2)?,
                timestamp: row.get(3)?,
            })
        },
    )
}

/// Get distraction count for a specific session
pub fn get_distraction_count(conn: &Connection, session_id: i64) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM distractions WHERE session_id = ?1;",
        params![session_id],
        |row| row.get(0),
    )
}

/// Get all distractions for a specific session ordered by timestamp ascending
pub fn get_session_distractions(conn: &Connection, session_id: i64) -> Result<Vec<DistractionRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, process_name, timestamp 
         FROM distractions 
         WHERE session_id = ?1 
         ORDER BY timestamp ASC, id ASC;",
    )?;
    let iter = stmt.query_map(params![session_id], |row| {
        Ok(DistractionRecord {
            id: row.get(0)?,
            session_id: row.get(1)?,
            process_name: row.get(2)?,
            timestamp: row.get(3)?,
        })
    })?;

    let mut result = Vec::new();
    for item in iter {
        result.push(item?);
    }
    Ok(result)
}

/// Get all blacklist items
pub fn get_blacklist(conn: &Connection) -> Result<Vec<BlacklistRecord>> {
    let mut stmt = conn.prepare("SELECT id, name, type FROM blacklist ORDER BY id ASC;")?;
    let iter = stmt.query_map([], |row| {
        Ok(BlacklistRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            item_type: row.get(2)?,
        })
    })?;

    let mut items = Vec::new();
    for item in iter {
        items.push(item?);
    }
    Ok(items)
}

/// Add an item to the blacklist
pub fn add_blacklist_item(conn: &Connection, name: &str, item_type: &str) -> Result<BlacklistRecord> {
    conn.execute(
        "INSERT INTO blacklist (name, type) VALUES (?1, ?2);",
        params![name, item_type],
    )?;
    let id = conn.last_insert_rowid();
    Ok(BlacklistRecord {
        id,
        name: name.to_string(),
        item_type: item_type.to_string(),
    })
}

/// Remove an item from the blacklist by ID
pub fn remove_blacklist_item(conn: &Connection, id: i64) -> Result<bool> {
    let affected = conn.execute("DELETE FROM blacklist WHERE id = ?1;", params![id])?;
    Ok(affected > 0)
}

/// Get all monitored browsers preferences from SQLite
pub fn get_monitored_browsers(conn: &Connection) -> Result<std::collections::HashMap<String, bool>> {
    let mut stmt = conn.prepare("SELECT browser_name, enabled FROM monitored_browsers;")?;
    let rows = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let enabled_int: i64 = row.get(1)?;
        Ok((name, enabled_int != 0))
    })?;

    let mut map = std::collections::HashMap::new();
    for item in rows {
        let (name, enabled) = item?;
        map.insert(name, enabled);
    }
    Ok(map)
}

/// Set monitored status for a specific browser
pub fn set_browser_monitored(conn: &Connection, browser_name: &str, enabled: bool) -> Result<()> {
    conn.execute(
        "INSERT INTO monitored_browsers (browser_name, enabled) VALUES (?1, ?2)
         ON CONFLICT(browser_name) DO UPDATE SET enabled = excluded.enabled;",
        params![browser_name, if enabled { 1 } else { 0 }],
    )?;
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("failed to open in-memory sqlite db");
        init_db(&conn).expect("failed to init db schema");
        conn
    }

    #[test]
    fn test_init_db_and_defaults() {
        let conn = setup_test_db();
        let blacklist = get_blacklist(&conn).expect("failed to get blacklist");
        assert!(blacklist.len() >= 5);
        assert!(blacklist.iter().any(|b| b.name.eq_ignore_ascii_case("facebook.com")));
        assert!(blacklist.iter().any(|b| b.name.eq_ignore_ascii_case("Steam.exe")));
    }

    #[test]
    fn test_session_lifecycle() {
        let conn = setup_test_db();

        assert!(get_active_session(&conn).expect("query error").is_none());

        let session = create_session(&conn, "Deep Rust Study", 45).expect("failed to create session");
        assert_eq!(session.goal, "Deep Rust Study");
        assert_eq!(session.planned_minutes, 45);
        assert!(!session.started_at.is_empty());
        assert!(session.ended_at.is_none());

        let active = get_active_session(&conn).expect("query error").expect("no active session");
        assert_eq!(active.id, session.id);

        let ended = end_session(&conn, session.id).expect("failed to end session");
        assert!(ended.ended_at.is_some());
        assert!(get_active_session(&conn).expect("query error").is_none());
    }

    #[test]
    fn test_distractions_and_history() {
        let conn = setup_test_db();
        let session = create_session(&conn, "Coding Focus", 60).expect("failed to create session");

        let d1 = log_distraction(&conn, session.id, "Steam.exe").expect("failed to log distraction 1");
        let d2 = log_distraction(&conn, session.id, "tiktok.com").expect("failed to log distraction 2");
        assert_eq!(d1.process_name, "Steam.exe");
        assert_eq!(d2.process_name, "tiktok.com");
        assert!(!d1.timestamp.is_empty());

        let count = get_distraction_count(&conn, session.id).expect("failed count");
        assert_eq!(count, 2);

        end_session(&conn, session.id).expect("end session failed");

        let history = get_session_history(&conn).expect("failed to get history");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].goal, "Coding Focus");
        assert_eq!(history[0].distraction_count, 2);
    }

    #[test]
    fn test_blacklist_crud() {
        let conn = setup_test_db();

        let added = add_blacklist_item(&conn, "notepad.exe", "app").expect("failed to add");
        assert_eq!(added.name, "notepad.exe");
        assert_eq!(added.item_type, "app");

        // Duplicate test (unique case-insensitive constraint)
        let dup = add_blacklist_item(&conn, "NOTEPAD.EXE", "app");
        assert!(dup.is_err());

        let removed = remove_blacklist_item(&conn, added.id).expect("failed remove");
        assert!(removed);

        let removed_again = remove_blacklist_item(&conn, added.id).expect("failed remove");
        assert!(!removed_again);
    }

    #[test]
    fn test_cascade_delete_distractions() {
        let conn = setup_test_db();
        let session = create_session(&conn, "Delete Test", 30).expect("session create");
        log_distraction(&conn, session.id, "LeagueClient.exe").expect("log distraction");
        assert_eq!(get_distraction_count(&conn, session.id).expect("count"), 1);

        conn.execute("DELETE FROM sessions WHERE id = ?1;", params![session.id]).expect("delete session");
        let total_distractions: i64 = conn.query_row("SELECT COUNT(*) FROM distractions;", [], |r| r.get(0)).unwrap();
        assert_eq!(total_distractions, 0);
    }

    #[test]
    fn test_get_session_distractions() {
        let conn = setup_test_db();
        let session = create_session(&conn, "Focus Test", 30).expect("session create");

        let empty = get_session_distractions(&conn, session.id).expect("query empty");
        assert!(empty.is_empty());

        let d1 = log_distraction(&conn, session.id, "Steam.exe").expect("d1");
        let d2 = log_distraction(&conn, session.id, "notepad.exe").expect("d2");

        let list = get_session_distractions(&conn, session.id).expect("query list");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, d1.id);
        assert_eq!(list[0].process_name, "Steam.exe");
        assert_eq!(list[1].id, d2.id);
        assert_eq!(list[1].process_name, "notepad.exe");
    }

    #[test]
    fn test_monitored_browsers_crud() {
        let conn = setup_test_db();
        let map = get_monitored_browsers(&conn).expect("get browsers");
        // Defaults seeded
        assert_eq!(map.get("chrome"), Some(&true));
        assert_eq!(map.get("brave"), Some(&true));
        assert_eq!(map.get("edge"), Some(&true));

        // Toggle brave off
        set_browser_monitored(&conn, "brave", false).expect("disable brave");
        let updated = get_monitored_browsers(&conn).expect("get updated");
        assert_eq!(updated.get("brave"), Some(&false));
        assert_eq!(updated.get("chrome"), Some(&true));

        // Toggle brave back on
        set_browser_monitored(&conn, "brave", true).expect("enable brave");
        let updated2 = get_monitored_browsers(&conn).expect("get updated2");
        assert_eq!(updated2.get("brave"), Some(&true));
    }
}

