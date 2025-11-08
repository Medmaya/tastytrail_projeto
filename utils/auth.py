from functools import wraps
from flask import session, jsonify, request
from utils.file_manager import read_json

def require_auth():
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if "id" not in session or "role" not in session:
                return jsonify({"error":"login required"}), 401
            # Optionally: re-check banned status from Users.json
            users = read_json("Users.json", {"users":[]})["users"]
            me = next((u for u in users if u["id"] == session["id"]), None)
            if not me:
                session.clear()
                return jsonify({"error":"invalid session"}), 401
            if me.get("banned"):
                return jsonify({"error":"user banned"}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if "role" not in session:
                return jsonify({"error":"login required"}), 401
            if session["role"] not in roles:
                return jsonify({"error":"forbidden"}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

def require_owner_or_role(param_id_name, roles_allowed=()):
    """Verifica se o user é owner do recurso (comparando session['id'] com param) ou tem role autorizada"""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            sid = session.get("id")
            resource_id = kwargs.get(param_id_name) or request.view_args.get(param_id_name)
            if sid == resource_id or session.get("role") in roles_allowed:
                return f(*args, **kwargs)
            return jsonify({"error":"forbidden"}), 403
        return wrapper
    return decorator
