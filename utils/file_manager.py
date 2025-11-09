import json
import os
from threading import Lock

lock = Lock()

def read_json(path):
    """Lê e retorna o conteúdo de um arquivo JSON"""
    if not os.path.exists(path):
        return {}
    with lock:
        with open(path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return {}

def write_json(path, data):
    """Escreve (sobrescreve) dados num arquivo JSON"""
    with lock:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
