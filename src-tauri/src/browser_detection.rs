use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub exe_path: Option<String>,
    pub enabled: bool,
}

#[cfg(windows)]
fn query_registry_app_path(exe_name: &str) -> Option<PathBuf> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
        KEY_READ, REG_SZ,
    };

    let subkey = format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{}", exe_name);
    let subkey_h = HSTRING::from(subkey);

    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let mut hkey = HKEY::default();
        unsafe {
            if RegOpenKeyExW(root, &subkey_h, 0, KEY_READ, &mut hkey).is_ok() {
                let mut buffer = [0u16; 1024];
                let mut size = (buffer.len() * std::mem::size_of::<u16>()) as u32;
                let mut val_type = REG_SZ;

                let res = RegQueryValueExW(
                    hkey,
                    None,
                    None,
                    Some(&mut val_type),
                    Some(buffer.as_mut_ptr() as *mut u8),
                    Some(&mut size),
                );

                let _ = RegCloseKey(hkey);

                if res.is_ok() && size > 0 {
                    let mut len = (size as usize / std::mem::size_of::<u16>()).saturating_sub(1);
                    // Trim null terminators
                    while len > 0 && buffer[len] == 0 {
                        len -= 1;
                    }
                    let path_str = String::from_utf16_lossy(&buffer[..=len]);
                    let clean = path_str.trim().trim_matches('"');
                    let path = PathBuf::from(clean);
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

/// Check filesystem candidate paths for Windows browsers
#[cfg(windows)]
fn check_windows_filesystem_candidates(id: &str) -> Option<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles") {
        roots.push(PathBuf::from(pf));
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        roots.push(PathBuf::from(pf86));
    }
    if let Ok(pf64) = std::env::var("ProgramW6432") {
        roots.push(PathBuf::from(pf64));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(local));
    }

    let rel_paths: &[&str] = match id {
        "chrome" => &[
            "Google\\Chrome\\Application\\chrome.exe",
        ],
        "brave" => &[
            "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        ],
        "edge" => &[
            "Microsoft\\Edge\\Application\\msedge.exe",
        ],
        _ => &[],
    };

    for root in &roots {
        for rel in rel_paths {
            let candidate = root.join(rel);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

/// Fallback for non-Windows platforms
#[cfg(not(windows))]
fn check_unix_browser_paths(id: &str) -> Option<PathBuf> {
    let candidates: &[&str] = match id {
        "chrome" => &[
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
        ],
        "brave" => &[
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/usr/bin/brave-browser",
            "/usr/bin/brave",
        ],
        "edge" => &[
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/usr/bin/microsoft-edge",
            "/usr/bin/microsoft-edge-stable",
        ],
        _ => &[],
    };

    for c in candidates {
        let p = Path::new(c);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    None
}

/// Detect a single browser by ID
pub fn detect_browser(id: &str) -> (bool, Option<String>) {
    #[cfg(windows)]
    {
        let exe_name = match id {
            "chrome" => "chrome.exe",
            "brave" => "brave.exe",
            "edge" => "msedge.exe",
            _ => return (false, None),
        };

        // Layer 1: Query Windows Registry App Paths (HKLM & HKCU)
        if let Some(path) = query_registry_app_path(exe_name) {
            return (true, Some(path.to_string_lossy().to_string()));
        }

        // Layer 2: Check common filesystem locations (%ProgramFiles%, %LocalAppData%)
        if let Some(path) = check_windows_filesystem_candidates(id) {
            return (true, Some(path.to_string_lossy().to_string()));
        }

        (false, None)
    }

    #[cfg(not(windows))]
    {
        if let Some(path) = check_unix_browser_paths(id) {
            (true, Some(path.to_string_lossy().to_string()))
        } else {
            (false, None)
        }
    }
}

/// Detect all supported browsers (Chrome, Brave, Edge) and merge with SQLite preferences
pub fn detect_all_browsers(preferences: &HashMap<String, bool>) -> Vec<BrowserInfo> {
    let supported = [
        ("chrome", "Google Chrome"),
        ("brave", "Brave Browser"),
        ("edge", "Microsoft Edge"),
    ];

    supported
        .into_iter()
        .map(|(id, name)| {
            let (installed, exe_path) = detect_browser(id);
            let enabled = preferences.get(id).copied().unwrap_or(true);
            BrowserInfo {
                id: id.to_string(),
                name: name.to_string(),
                installed,
                exe_path,
                enabled,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_all_browsers_structure() {
        let mut prefs = HashMap::new();
        prefs.insert("chrome".to_string(), true);
        prefs.insert("brave".to_string(), false);

        let list = detect_all_browsers(&prefs);
        assert_eq!(list.len(), 3);

        let chrome = list.iter().find(|b| b.id == "chrome").unwrap();
        assert_eq!(chrome.name, "Google Chrome");
        assert!(chrome.enabled);

        let brave = list.iter().find(|b| b.id == "brave").unwrap();
        assert_eq!(brave.name, "Brave Browser");
        assert!(!brave.enabled);

        let edge = list.iter().find(|b| b.id == "edge").unwrap();
        assert_eq!(edge.name, "Microsoft Edge");
        assert!(edge.enabled); // default true
    }

    #[test]
    fn test_detect_browser_known_target() {
        // On the target Windows test machine, Chrome/Brave/Edge are verified present
        let (installed, path) = detect_browser("edge");
        if cfg!(windows) {
            // Edge is built into Windows 10/11
            assert!(installed);
            assert!(path.is_some());
        } else {
            let _ = (installed, path);
        }
    }
}
