use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::PathBuf;

use crate::db;

/// Read a single Native Messaging frame: 4-byte little-endian length + UTF-8 JSON.
/// Returns Ok(None) when EOF is reached (standard Chrome/Edge/Brave port disconnect).
pub fn read_message<R: Read>(mut reader: R) -> std::io::Result<Option<Value>> {
    let len = match reader.read_u32::<LittleEndian>() {
        Ok(l) => l as usize,
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    };

    if len == 0 {
        return Ok(None);
    }

    let mut buffer = vec![0u8; len];
    reader.read_exact(&mut buffer)?;

    let value: Value = serde_json::from_slice(&buffer).map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Invalid JSON payload: {}", e),
        )
    })?;

    Ok(Some(value))
}

/// Write a single Native Messaging frame: 4-byte little-endian length + UTF-8 JSON.
pub fn write_message<W: Write>(mut writer: W, value: &Value) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("JSON serialization error: {}", e),
        )
    })?;

    writer.write_u32::<LittleEndian>(bytes.len() as u32)?;
    writer.write_all(&bytes)?;
    writer.flush()?;

    Ok(())
}

/// Locate the shared FocusGuard SQLite database
pub fn get_app_db_path() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let mut p = PathBuf::from(appdata);
        p.push("com.focusguard.app");
        p.push("focusguard.db");
        return p;
    }

    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        let base = PathBuf::from(home);
        #[cfg(target_os = "macos")]
        {
            return base.join("Library/Application Support/com.focusguard.app/focusguard.db");
        }
        #[cfg(not(target_os = "macos"))]
        {
            return base.join(".config/com.focusguard.app/focusguard.db");
        }
    }

    PathBuf::from("focusguard.db")
}

/// Process a single protocol message and compute response
pub fn process_message(msg: &Value, conn: &Connection) -> Value {
    let msg_type = msg.get("type").and_then(Value::as_str).unwrap_or("unknown");

    match msg_type {
        "ping" => json!({
            "type": "pong",
            "version": "0.1.0"
        }),
        "get_status" => {
            let active_session = db::get_active_session(conn).unwrap_or(None);
            let monitored_browsers = db::get_monitored_browsers(conn).unwrap_or_default();
            json!({
                "type": "status",
                "activeSession": active_session,
                "monitoredBrowsers": monitored_browsers
            })
        }
        "get_blacklist" => {
            let items = db::get_blacklist(conn).unwrap_or_default();
            json!({
                "type": "blacklist",
                "items": items
            })
        }
        "check_url" => {
            let url = msg.get("url").and_then(Value::as_str).unwrap_or("");
            let active_session = db::get_active_session(conn).unwrap_or(None);
            if let Some(session) = active_session {
                let blacklist = db::get_blacklist(conn).unwrap_or_default();
                let lower_url = url.to_lowercase();
                let mut matched_rule = None;

                for item in blacklist {
                    let name = item.name.to_lowercase();
                    if (item.item_type == "domain" || item.item_type == "website")
                        && lower_url.contains(&name)
                    {
                        matched_rule = Some(item.name);
                        break;
                    }
                }

                let blocked = matched_rule.is_some();
                json!({
                    "type": "check_url_result",
                    "blocked": blocked,
                    "matched": matched_rule,
                    "sessionId": session.id,
                    "sessionGoal": session.goal
                })
            } else {
                json!({
                    "type": "check_url_result",
                    "blocked": false,
                    "matched": null,
                    "sessionId": null
                })
            }
        }
        "log_distraction" => {
            let session_id = msg.get("sessionId").and_then(Value::as_i64);
            let process_name = msg
                .get("processName")
                .and_then(Value::as_str)
                .unwrap_or("browser");
            if let Some(sid) = session_id {
                match db::log_distraction(conn, sid, process_name) {
                    Ok(rec) => json!({
                        "type": "distraction_logged",
                        "id": rec.id,
                        "sessionId": rec.session_id,
                        "timestamp": rec.timestamp
                    }),
                    Err(e) => json!({
                        "type": "error",
                        "message": format!("Failed to log distraction: {}", e)
                    }),
                }
            } else {
                json!({
                    "type": "error",
                    "message": "Missing sessionId"
                })
            }
        }
        _ => json!({
            "type": "ack",
            "received": msg
        }),
    }
}

/// Event loop processing Native Messaging frames until standard input reaches EOF
pub fn run_loop<R: Read, W: Write>(
    mut reader: R,
    mut writer: W,
    conn: &Connection,
) -> std::io::Result<()> {
    while let Some(msg) = read_message(&mut reader)? {
        let response = process_message(&msg, conn);
        write_message(&mut writer, &response)?;
    }
    Ok(())
}

/// Standalone runner invoked when --native-host flag is passed
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_app_db_path();
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let conn = Connection::open(&db_path)?;
    db::init_db(&conn)?;

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    run_loop(stdin.lock(), stdout.lock(), &conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_read_write_message_framing() {
        let original = json!({
            "type": "test_ping",
            "data": [1, 2, 3],
            "active": true
        });

        let mut buffer = Vec::new();
        write_message(&mut buffer, &original).expect("write_message failed");

        assert!(buffer.len() > 4);
        let mut cursor = Cursor::new(buffer);
        let decoded = read_message(&mut cursor)
            .expect("read_message failed")
            .expect("expected Some message");

        assert_eq!(decoded, original);
    }

    #[test]
    fn test_read_eof_returns_none() {
        let empty: Vec<u8> = Vec::new();
        let mut cursor = Cursor::new(empty);
        let result = read_message(&mut cursor).expect("read_message failed");
        assert!(result.is_none());
    }

    #[test]
    fn test_process_message_ping() {
        let conn = Connection::open_in_memory().unwrap();
        db::init_db(&conn).unwrap();

        let ping_msg = json!({"type": "ping"});
        let resp = process_message(&ping_msg, &conn);

        assert_eq!(resp.get("type").and_then(Value::as_str), Some("pong"));
        assert_eq!(resp.get("version").and_then(Value::as_str), Some("0.1.0"));
    }

    #[test]
    fn test_process_message_status_and_check_url() {
        let conn = Connection::open_in_memory().unwrap();
        db::init_db(&conn).unwrap();

        // 1. Initial status with no session
        let status_msg = json!({"type": "get_status"});
        let resp = process_message(&status_msg, &conn);
        assert_eq!(resp.get("type").and_then(Value::as_str), Some("status"));
        assert!(resp.get("activeSession").unwrap().is_null());

        // 2. Check URL with no session -> blocked: false
        let check_msg = json!({"type": "check_url", "url": "https://www.facebook.com/feed"});
        let resp = process_message(&check_msg, &conn);
        assert_eq!(resp.get("blocked").and_then(Value::as_bool), Some(false));

        // 3. Create active session
        let session = db::create_session(&conn, "Tập trung học Rust", 60).unwrap();

        // 4. Check URL with active session on blacklisted domain
        let resp = process_message(&check_msg, &conn);
        assert_eq!(resp.get("blocked").and_then(Value::as_bool), Some(true));
        assert_eq!(
            resp.get("matched").and_then(Value::as_str),
            Some("facebook.com")
        );
        assert_eq!(
            resp.get("sessionId").and_then(Value::as_i64),
            Some(session.id)
        );

        // 5. Check allowed URL
        let allowed_msg = json!({"type": "check_url", "url": "https://docs.rs/byteorder"});
        let resp = process_message(&allowed_msg, &conn);
        assert_eq!(resp.get("blocked").and_then(Value::as_bool), Some(false));
    }

    #[test]
    fn test_run_loop_round_trip() {
        let conn = Connection::open_in_memory().unwrap();
        db::init_db(&conn).unwrap();

        let mut input_buffer = Vec::new();
        write_message(&mut input_buffer, &json!({"type": "ping"})).unwrap();
        write_message(&mut input_buffer, &json!({"type": "get_blacklist"})).unwrap();

        let mut output_buffer = Vec::new();
        let input_cursor = Cursor::new(input_buffer);

        run_loop(input_cursor, &mut output_buffer, &conn).expect("run_loop failed");

        let mut out_cursor = Cursor::new(output_buffer);
        let resp1 = read_message(&mut out_cursor).unwrap().unwrap();
        assert_eq!(resp1.get("type").and_then(Value::as_str), Some("pong"));

        let resp2 = read_message(&mut out_cursor).unwrap().unwrap();
        assert_eq!(resp2.get("type").and_then(Value::as_str), Some("blacklist"));
        assert!(resp2.get("items").unwrap().as_array().unwrap().len() >= 3);
    }
}
