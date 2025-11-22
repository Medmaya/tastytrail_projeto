# utils/security.py
import hashlib, os, base64, hmac

_PEPPER = b"TastyTrailHash"

def hash_password(password: str, salt: bytes = None) -> str:
    if salt is None:
        salt = os.urandom(16)
    salted = salt + password.encode("utf-8") + _PEPPER
    digest = hashlib.sha256(salted).digest()
    return base64.b64encode(salt + digest).decode("utf-8")

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        data = base64.b64decode(stored_hash.encode("utf-8"))
        salt, digest = data[:16], data[16:]
        test_digest = hashlib.sha256(salt + password.encode("utf-8") + _PEPPER).digest()
        return hmac.compare_digest(digest, test_digest)
    except Exception:
        return False
