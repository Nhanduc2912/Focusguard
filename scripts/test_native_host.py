import sys
import os
import struct
import json
import subprocess

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

    test_messages = [
        {"type": "ping"},
        {"type": "get_status"},
        {"type": "get_blacklist"},
        {"type": "check_url", "url": "https://www.facebook.com/messages"},
        {"type": "check_url", "url": "https://docs.rs/byteorder/latest"},
        {"type": "hello_extension", "client": "Chrome M120"},
    ]

    for i, msg in enumerate(test_messages, start=1):
        prefix, raw_data = send_message(proc, msg)
        print(f"--- [Message {i}] ---")
        print(f">> SEND Framing (4 bytes LE): {list(prefix)} (length = {len(raw_data)})")
        print(f">> SEND Payload JSON:         {json.dumps(msg)}")
        
        resp_prefix, resp_raw, resp_json = read_message(proc)
        if resp_prefix is None:
            print("<< ERROR: Premature EOF received from host!")
            break
            
        print(f"<< RECV Framing (4 bytes LE): {list(resp_prefix)} (length = {len(resp_raw)})")
        print(f"<< RECV Payload JSON:         {json.dumps(resp_json, indent=2, ensure_ascii=False)}")
        print()

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
