# utils/file_manager.py
import json, os, threading

_lock = threading.Lock()

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

def _resolve(fname: str) -> str:
    if not fname.endswith(".json"):
        fname += ".json"
    return os.path.join(DATA_DIR, fname)

def read_json(fname: str, default=None):
    path = _resolve(fname)
    if not os.path.exists(path):
        return default if default is not None else {}
    try:
        with _lock:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        return default if default is not None else {}

def write_json(fname: str, data):
    path = _resolve(fname)
    tmp_path = path + ".tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with _lock:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, path)
