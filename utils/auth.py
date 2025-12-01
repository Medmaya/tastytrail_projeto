from functools import wraps
from flask import session, jsonify, request, redirect, url_for
from utils.file_manager import read_json

# Defina o nome do arquivo centralizado para não errar mais
DB_FILE = "data.json"

def require_auth():
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # 1. Verifica se a sessão existe no navegador
            if "id" not in session or "role" not in session:
                if request.is_json:
                    return jsonify({"error": "login required"}), 401
                return redirect(url_for('login')) # Redireciona se for acesso via navegador

            # 2. Validação no Banco de Dados (Segurança extra)
            db = read_json(DB_FILE, {"users":[]})
            users = db.get("users", [])
            
            # Procura o usuário na lista
            me = next((u for u in users if u["id"] == session["id"]), None)

            # Se o usuário não existe no arquivo (foi deletado ou arquivo errado)
            if not me:
                session.clear()
                if request.is_json:
                    return jsonify({"error": "invalid session (user not found)"}), 401
                return redirect(url_for('login'))

            # Se o usuário foi banido
            if me.get("banned"):
                session.clear()
                if request.is_json:
                    return jsonify({"error": "user banned"}), 403
                return "Sua conta foi banida.", 403

            return f(*args, **kwargs)
        return wrapper
    return decorator

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Primeiro verifica se está logado (chamando a lógica manual ou confiando na session)
            if "role" not in session:
                if request.is_json:
                    return jsonify({"error": "login required"}), 401
                return redirect(url_for('login'))

            # Verifica se a role bate
            if session["role"] not in roles:
                if request.is_json:
                    return jsonify({"error": "forbidden"}), 403
                # Retorna uma mensagem de erro ou página 403 visual
                return "Acesso Negado: Você não tem permissão.", 403

            return f(*args, **kwargs)
        return wrapper
    return decorator

def require_owner_or_role(param_id_name, roles_allowed=()):
    """
    Verifica se o user é owner do recurso (comparando session['id'] com param) 
    ou tem role autorizada
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            sid = session.get("id")
            # Tenta pegar dos kwargs (rota) ou args (query)
            resource_id = kwargs.get(param_id_name) or request.view_args.get(param_id_name)
            
            if sid == resource_id or session.get("role") in roles_allowed:
                return f(*args, **kwargs)
            
            if request.is_json:
                return jsonify({"error": "forbidden"}), 403
            return "Acesso Negado", 403
            
        return wrapper
    return decorator