import sys
import os
import struct
import json
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

def send_message(proc, payload):
    data = json.dumps(payload).encode("utf-8")
    length_prefix = struct.pack("<I", len(data))
    proc.stdin.write(length_prefix + data)
    proc.stdin.flush()
    return length_prefix, data

def read_message(proc):
    raw_len = proc.stdout.read(4)
    if len(raw_len) < 4:
        return None, None, None
    msg_len = struct.unpack("<I", raw_len)[0]
    raw_payload = proc.stdout.read(msg_len)
    decoded = json.loads(raw_payload.decode("utf-8"))
    return raw_len, raw_payload, decoded

def run_step(proc, step_num, title, msg):
    prefix, raw_data = send_message(proc, msg)
    print(f"--- [Step {step_num}: {title}] ---")
    print(f">> SEND Framing (4 bytes LE): {list(prefix)} (length = {len(raw_data)})")
    print(f">> SEND Payload JSON:         {json.dumps(msg, ensure_ascii=False)}")
    
    resp_prefix, resp_raw, resp_json = read_message(proc)
    if resp_prefix is None:
        print("<< ERROR: Premature EOF received from host!")
        sys.exit(1)
        
    print(f"<< RECV Framing (4 bytes LE): {list(resp_prefix)} (length = {len(resp_raw)})")
    print(f"<< RECV Payload JSON:         {json.dumps(resp_json, indent=2, ensure_ascii=False)}\n")
    return resp_json

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(repo_root, "src-tauri", "target", "debug", "focusguard.exe"),
        os.path.join(repo_root, "target", "debug", "focusguard.exe"),
    ]
    
    exe_path = None
    for c in candidates:
        if os.path.exists(c):
            exe_path = c
            break
            
    if not exe_path:
        print(f"ERROR: Cannot find focusguard.exe in {candidates}")
        sys.exit(1)
        
    print(f"=== FocusGuard Native Messaging Host Protocol Test ===")
    print(f"Target Binary: {exe_path}")
    print(f"CLI Arguments: ['--native-host']\n")

    proc = subprocess.Popen(
        [exe_path, "--native-host"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    step = 1

    # 1. Ping
    run_step(proc, step, "Handshake Ping", {"type": "ping"})
    step += 1

    # 2. Start session (Requirement 1)
    session_resp = run_step(proc, step, "Start Focus Session", {
        "type": "start_session",
        "goal": "Luyện tập Rust FocusGuard",
        "plannedMinutes": 60
    })
    session_id = session_resp.get("session", {}).get("id")
    step += 1

    # 3. Test check_url with Facebook during active session (Requirement 1)
    run_step(proc, step, "Check Facebook with Active Session (Should Block)", {
        "type": "check_url",
        "url": "https://www.facebook.com/messages"
    })
    step += 1

    # 4. YouTube Case (a): Session has no whitelist, arbitrary YouTube url -> blocked: true (Requirement 2a)
    run_step(proc, step, "YouTube Case (a): No Whitelist -> Blocked", {
        "type": "check_url",
        "url": "https://www.youtube.com/watch?v=whatever_video"
    })
    step += 1

    # 5. Set session YouTube whitelist to "abc123" (Requirement 2b prep)
    run_step(proc, step, "Set Session YouTube Whitelist to 'abc123'", {
        "type": "set_session_youtube_whitelist",
        "sessionId": session_id,
        "videoId": "abc123"
    })
    step += 1

    # 6. YouTube Case (b): Whitelisted video "abc123" -> blocked: false (Requirement 2b)
    run_step(proc, step, "YouTube Case (b): Whitelisted Video 'abc123' -> Allowed", {
        "type": "check_url",
        "url": "https://www.youtube.com/watch?v=abc123"
    })
    step += 1

    # 7. YouTube Case (c): Different video "xyz789" -> blocked: true (Requirement 2c)
    run_step(proc, step, "YouTube Case (c): Different Video 'xyz789' -> Blocked", {
        "type": "check_url",
        "url": "https://www.youtube.com/watch?v=xyz789"
    })
    step += 1

    # 8. End session clean-up
    run_step(proc, step, "End Session Clean-up", {
        "type": "end_session",
        "sessionId": session_id
    })
    step += 1

    # Close stdin to signal EOF (simulating browser closing the port)
    print(">> Closing stdin (simulating extension port disconnect / EOF)...")
    proc.stdin.close()
    
    try:
        exit_code = proc.wait(timeout=5)
        print(f">> Native host exited cleanly with code: {exit_code}")
    except subprocess.TimeoutExpired:
        print("<< ERROR: Process did not exit after EOF!")
        proc.kill()
        sys.exit(1)

    stderr_out = proc.stderr.read().decode("utf-8", errors="replace")
    if stderr_out:
        print(f"Host stderr:\n{stderr_out}")

    print("\n=== Protocol Test Completed Successfully ===")

if __name__ == "__main__":
    main()
