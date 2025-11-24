from flask import Blueprint, request, jsonify, session
from utils.file_manager import read_json, write_json
from utils.security import hash_password, verify_password
import uuid
from datetime import datetime

main_bp = Blueprint("main", __name__, url_prefix="")

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

@main_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    role = data.get("role")
    username = data.get("username") or (email.split("@")[0] if email else None)

    if not email or not password or not role:
        return jsonify({"error": "Dados inválidos"}), 400

    # LER DATABASE 
    db = read_json("data.json", {
        "users": [],
        "orders": [],
        "transactions": [],
        "enterprises": [], 
        "userstate": {},
        "delivery": {},
        "payouts": []
    })

    users = db.get("users", [])

    # Verifica duplicidade de e-mail
    if any(u.get("email", "").lower() == email for u in users):
        return jsonify({"error": "Email já cadastrado"}), 400

    user_id = str(uuid.uuid4())

    new_user = {
        "id": user_id,
        "username": username,
        "email": email,
        "password_hash": hash_password(password),
        "role": role,
        "credits": 0,
        "banned": False,
        "warnings": 0,
        "created_at": now_iso()
    }

    # Campos extras e Criação de Entidades Vinculadas
    if role == "empresa":
        company_data = {
            "company_name": data.get("company_name", ""),
            "cnpj": data.get("cnpj", ""),
            "address": data.get("address", ""),
            "working_hours": data.get("working_hours", ""),
            "phone": data.get("phone", ""),
        }
        new_user["company_data"] = company_data
        
        new_enterprise = {
            "id": user_id, 
            "owner": user_id,
            "name": company_data["company_name"],
            "cnpj": company_data["cnpj"],
            "products": [],
            "balance": 0,
            "created_at": now_iso()
        }
        db.setdefault("enterprises", []).append(new_enterprise)

    elif role == "cliente":
        new_user["client_data"] = {
            "full_name": data.get("full_name", ""),
            "address": data.get("address", ""),
            "phone": data.get("phone", ""),
        }
        # Inicializando estado do usuário
        db.setdefault("userstate", {})[user_id] = {
            "cart": [],
            "favorites": {},
            "orders": []
        }

    elif role == "entregador":
        new_user["deliveryman_data"] = {
            "full_name": data.get("full_name", ""),
            "document_id": data.get("document_id", ""),
            "phone": data.get("phone", ""),
            "vehicle_type": data.get("vehicle_type", ""),
        }
        # Inicializando estado do entregador
        db.setdefault("delivery", {})[user_id] = {
            "assigned_orders": [],
            "status": "available",
            "balance": 0
        }

    users.append(new_user)
    db["users"] = users
    write_json("data.json", db)

    return jsonify({
        "message": f"Usuário {username} criado com sucesso!",
        "user_id": new_user["id"]
    }), 201

@main_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    db = read_json("data.json", {"users": []})
    users = db.get("users", [])

    for u in users:
        if u.get("email", "").lower() == email:

            stored = u.get("password_hash") or u.get("password")

            try:
                valid = verify_password(password, stored)
            except Exception:
                valid = stored == password  

            if not valid:
                return jsonify({"error": "Credenciais inválidas"}), 401

            if u.get("banned"):
                return jsonify({"error": "Usuário banido"}), 403

            session.permanent = True
            session["id"] = u.get("id")
            session["username"] = u.get("username")
            session["role"] = u.get("role")

            print("DEBUG SESSION AFTER LOGIN:", dict(session))

            return jsonify({
                "message": "Login bem-sucedido",
                "role": u.get("role"),
            }), 200

    return jsonify({"error": "Credenciais inválidas"}), 401


@main_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logout concluído"}), 200