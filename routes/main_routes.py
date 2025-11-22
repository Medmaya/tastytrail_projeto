from flask import Blueprint, request, jsonify, session
from utils.file_manager import read_json, write_json
from utils.security import hash_password, verify_password
import uuid

main_bp = Blueprint("main", __name__, url_prefix="")

@main_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    email = data.get("email")
    role = data.get("role")

    if not username or not password or not email or not role:
        return jsonify({"error": "Dados inválidos"}), 400

    db = read_json("Users.json", {"users": []})
    users = db["users"]

    # Verifica duplicados
    for u in users:
        if u["email"].lower() == email.lower():
            return jsonify({"error": "Email já cadastrado"}), 400
        if u["username"].lower() == username.lower():
            return jsonify({"error": "Usuário já existe"}), 400

    new_user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "email": email,
        "password_hash": hash_password(password),
        "role": role,
        "credits": 0,
        "banned": False,
        "warnings": 0
    }

    users.append(new_user)
    write_json("Users.json", db)

    return jsonify({
        "message": f"Usuário {username} criado com sucesso!",
        "user_id": new_user["id"]
    }), 201


@main_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    db = read_json("Users.json", {"users": []})
    users = db.get("users", [])

    for u in users:
        user_email = u.get("email")
        if not user_email:
            # pula registros antigos/íncompletos
            continue

        if user_email.lower() == email.lower():
            stored = u.get("password_hash") or u.get("password")
            # tenta verificação com hash seguro primeiro
            try:
                if stored and verify_password(password, stored):
                    if u.get("banned"):
                        return jsonify({"error": "banned"}), 403
                    session.update({
                        "id": u["id"],
                        "username": u.get("username"),
                        "role": u.get("role")
                    })
                    return jsonify({"message": "logged in", "role": u.get("role")}), 200
            except Exception:
                # se verify_password lançar por formato inesperado, tentamos fallback abaixo
                pass

            # fallback simples: compara plaintext (apenas para compatibilidade com dados antigos)
            if stored == password:
                if u.get("banned"):
                    return jsonify({"error": "banned"}), 403
                session.update({
                    "id": u["id"],
                    "username": u.get("username"),
                    "role": u.get("role")
                })
                return jsonify({"message": "logged in (fallback)", "role": u.get("role")}), 200

            # se achou o email mas senha está errada
            return jsonify({"error": "invalid credentials"}), 401

    # nenhum usuário com esse email
    return jsonify({"error": "invalid credentials"}), 401



@main_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "logged out"}), 200
