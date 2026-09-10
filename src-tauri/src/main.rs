// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--native-host" || arg.starts_with("--native-host")) {
        if let Err(e) = focusguard_lib::native_host::run() {
            eprintln!("FocusGuard Native Messaging Host error: {}", e);
            std::process::exit(1);
        }
        return;
    }

    focusguard_lib::run();
}
