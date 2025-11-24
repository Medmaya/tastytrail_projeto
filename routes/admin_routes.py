from flask import Blueprint, request, jsonify, session, send_file
from functools import wraps
import uuid
from datetime import datetime
import json
import io

from utils.file_manager import read_json, write_json
from utils.auth import require_role

try:
    from utils.security import hash_password
except:
    hash_password = None

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

DATA_FILE = "data.json"

# ----------------- data helpers -----------------
def read_data():
    return read_json(DATA_FILE, {
        "users": [],
        "enterprises": [], # LISTA
        "orders": [],
        "transactions": [],
        "payouts": [],
        "delivery": {},
        "userstate": {}
    })

def write_data(data):
    write_json(DATA_FILE, data)

def now_iso():
    return datetime.utcnow().isoformat() + "Z"


# ----------------- decorators -----------------
def admin_only(f):
    @wraps(f)
    @require_role("admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

def _sanitize_user(u):
    user = dict(u)
    user.pop("password", None)
    user.pop("password_hash", None)
    return user

# =========================================================
#                         DASHBOARD
# =========================================================
@admin_bp.route("/dashboard")
@admin_only
def dashboard():
    data = read_data()
    users = data.get("users", [])
    orders = data.get("orders", [])
    txs = data.get("transactions", [])
    
    return jsonify({
        "total_users": len(users),
        "total_orders": len(orders),
        "total_credit_flow": sum(
            t.get("amount", 0)
            for t in txs
            if t.get("type") in ("topup", "purchase", "credit_enterprise", "credit_delivery")
        )
    })


# =========================================================
#                         USERS CRUD
# =========================================================
@admin_bp.route("/users", methods=["GET"])
@admin_only
def list_users():
    data = read_data()
    return jsonify([_sanitize_user(u) for u in data["users"]])


@admin_bp.route("/users/<user_id>", methods=["GET"])
@admin_only
def get_user(user_id):
    data = read_data()
    for u in data["users"]:
        if u["id"] == user_id:
            return jsonify(_sanitize_user(u))
    return jsonify({"error": "not found"}), 404


@admin_bp.route("/users", methods=["POST"])
@admin_only
def create_user():
    payload = request.get_json() or {}
    username = payload.get("username")
    password = payload.get("password")

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400

    data = read_data()

    if any(u["username"].lower() == username.lower() for u in data["users"]):
        return jsonify({"error": "username exists"}), 400

    uid = str(uuid.uuid4())

    user = {
        "id": uid,
        "username": username,
        "email": payload.get("email"),
        "role": payload.get("role", "cliente"),
        "banned": False,
        "warnings": 0,
        "credits": int(payload.get("credits", 0)),
        "created_at": now_iso()
    }

    if hash_password:
        user["password_hash"] = hash_password(password)
    else:
        user["password"] = password

    data["users"].append(user)
    
    # Inicializações auxiliares
    if user["role"] == "cliente":
        data.setdefault("userstate", {})[uid] = {"cart": [], "favorites": {}, "orders": []}
    elif user["role"] == "entregador":
        data.setdefault("delivery", {})[uid] = {"assigned_orders": [], "balance": 0, "status": "available"}
    elif user["role"] == "empresa":
        # Se admin cria empresa manualmente, cria a entrada na lista enterprises
        new_ent = {
            "id": uid,
            "owner": uid,
            "name": username, # usa username como nome temporário
            "products": [],
            "balance": 0,
            "created_at": now_iso()
        }
        data.setdefault("enterprises", []).append(new_ent)

    write_data(data)

    return jsonify({"message": "created", "user": _sanitize_user(user)}), 201


@admin_bp.route("/users/<user_id>", methods=["PUT"])
@admin_only
def update_user(user_id):
    payload = request.get_json() or {}
    data = read_data()
    
    user_found = None
    for u in data["users"]:
        if u["id"] == user_id:
            user_found = u
            break
            
    if not user_found:
        return jsonify({"error": "not found"}), 404

    for k in ("username", "email", "role", "banned", "warnings"):
        if k in payload:
            user_found[k] = payload[k]

    if "password" in payload:
        if hash_password:
            user_found["password_hash"] = hash_password(payload["password"])
            user_found.pop("password", None)
        else:
            user_found["password"] = payload["password"]

    if "credits" in payload:
        try:
            user_found["credits"] = int(payload["credits"])
        except:
            pass

    write_data(data)
    return jsonify({"message": "updated", "user": _sanitize_user(user_found)})


@admin_bp.route("/users/<user_id>", methods=["DELETE"])
@admin_only
def delete_user(user_id):
    data = read_data()

    new_users = [u for u in data["users"] if u["id"] != user_id]

    if len(new_users) == len(data["users"]):
        return jsonify({"error": "not found"}), 404

    data["users"] = new_users
    data["userstate"].pop(user_id, None)
    data["delivery"].pop(user_id, None)
    
    # Se for empresa, remove da lista enterprises também
    data["enterprises"] = [e for e in data["enterprises"] if e["id"] != user_id]

    write_data(data)

    return jsonify({"message": "deleted"}), 200

# =========================================================
#               ENTERPRISE CRUD (Refatorado para Lista)
# =========================================================
@admin_bp.route("/enterprises", methods=["GET"])
@admin_only
def list_enterprises():
    data = read_data()
    return jsonify(data.get("enterprises", []))


@admin_bp.route("/enterprises/<ent_id>", methods=["GET"])
@admin_only
def get_enterprise(ent_id):
    data = read_data()
    ent = next((e for e in data.get("enterprises", []) if e["id"] == ent_id), None)
    if not ent:
        return jsonify({"error": "not found"}), 404
    return jsonify(ent)


@admin_bp.route("/enterprises", methods=["POST"])
@admin_only
def create_enterprise():
    payload = request.get_json() or {}
    name = payload.get("name")

    if not name:
        return jsonify({"error": "name required"}), 400

    data = read_data()
    ent_id = str(uuid.uuid4())
    
    ent = {
        "id": ent_id,
        "name": name,
        "owner": payload.get("owner"),
        "products": [],
        "balance": 0,
        "created_at": now_iso()
    }

    data.setdefault("enterprises", []).append(ent)
    write_data(data)

    return jsonify({"message": "created", "enterprise": ent}), 201


@admin_bp.route("/enterprises/<ent_id>", methods=["PUT"])
@admin_only
def update_enterprise(ent_id):
    data = read_data()
    
    ent = None
    for e in data.get("enterprises", []):
        if e["id"] == ent_id:
            ent = e
            break
            
    if not ent:
        return jsonify({"error": "not found"}), 404

    payload = request.get_json() or {}

    for k in ("name", "owner"):
        if k in payload:
            ent[k] = payload[k]

    write_data(data)
    return jsonify({"message": "updated", "enterprise": ent})


@admin_bp.route("/enterprises/<ent_id>", methods=["DELETE"])
@admin_only
def delete_enterprise(ent_id):
    data = read_data()
    
    initial_len = len(data.get("enterprises", []))
    data["enterprises"] = [e for e in data.get("enterprises", []) if e["id"] != ent_id]

    if len(data["enterprises"]) == initial_len:
        return jsonify({"error": "not found"}), 404

    write_data(data)
    return jsonify({"message": "deleted"})

# =========================================================
#                  PRODUCTS CRUD (Refatorado)
# =========================================================
@admin_bp.route("/enterprises/<ent_id>/products", methods=["POST"])
@admin_only
def create_product(ent_id):
    data = read_data()
    ent = next((e for e in data.get("enterprises", []) if e["id"] == ent_id), None)
    
    if not ent:
        return jsonify({"error": "enterprise not found"}), 404

    payload = request.get_json() or {}

    product = {
        "id": str(uuid.uuid4()),
        "name": payload.get("name"),
        "description": payload.get("description", ""),
        "price_credits": int(payload.get("price_credits", 0)),
        "created_at": now_iso()
    }

    ent.setdefault("products", []).append(product)
    write_data(data)

    return jsonify({"message": "product created", "product": product}), 201


@admin_bp.route("/enterprises/<ent_id>/products/<pid>", methods=["PUT"])
@admin_only
def update_product(ent_id, pid):
    data = read_data()
    ent = next((e for e in data.get("enterprises", []) if e["id"] == ent_id), None)

    if not ent:
        return jsonify({"error":"enterprise not found"}), 404

    products = ent.get("products", [])
    product_found = False

    for p in products:
        if p["id"] == pid:
            product_found = True
            payload = request.get_json() or {}
            for k in ("name", "description", "price_credits"):
                if k in payload:
                    value = payload[k]
                    if k == "price_credits":
                        try: value = int(value)
                        except: pass
                    p[k] = value
            break

    if not product_found:
        return jsonify({"error":"product not found"}), 404
        
    write_data(data)
    return jsonify({"message":"product updated"})


@admin_bp.route("/enterprises/<ent_id>/products/<pid>", methods=["DELETE"])
@admin_only
def delete_product(ent_id, pid):
    data = read_data()
    ent = next((e for e in data.get("enterprises", []) if e["id"] == ent_id), None)

    if not ent:
        return jsonify({"error":"enterprise not found"}), 404

    products = ent.get("products", [])
    new_products = [p for p in products if p["id"] != pid]
    
    if len(new_products) == len(products):
        return jsonify({"error":"product not found"}), 404
        
    ent["products"] = new_products
    write_data(data)

    return jsonify({"message":"deleted"})

# =========================================================
#                    ORDERS CRUD
# =========================================================
@admin_bp.route("/orders", methods=["GET"])
@admin_only
def list_orders():
    return jsonify(read_data().get("orders", []))


@admin_bp.route("/orders/<oid>", methods=["GET"])
@admin_only
def get_order(oid):
    data = read_data()
    for o in data.get("orders", []):
        if o["order_id"] == oid:
            return jsonify(o)
    return jsonify({"error":"not found"}), 404


@admin_bp.route("/orders", methods=["POST"])
@admin_only
def create_order():
    payload = request.get_json() or {}

    uid = payload.get("user_id")
    items = payload.get("items", [])

    if not uid or not items:
        return jsonify({"error":"user_id and items required"}), 400

    data = read_data()

    order = {
        "order_id": str(uuid.uuid4()),
        "user_id": uid,
        "items": items,
        "status": "pending",
        "created_at": now_iso()
    }

    data.setdefault("orders", []).append(order)

    # salva lista de pedidos do usuário
    if uid in data.get("userstate", {}):
        data["userstate"][uid].setdefault("orders", []).append(order["order_id"])

    write_data(data)

    return jsonify({"message": "order created", "order": order}), 201


@admin_bp.route("/orders/<oid>", methods=["PUT"])
@admin_only
def update_order(oid):
    payload = request.get_json() or {}
    data = read_data()
    
    order_found = None
    for o in data.get("orders", []):
        if o["order_id"] == oid:
            order_found = o
            break
            
    if not order_found:
        return jsonify({"error":"not found"}), 404

    for k in ("status", "assigned_delivery"):
        if k in payload:
            order_found[k] = payload[k]

    if "status" in payload and payload["status"] == "delivered":
        order_found["delivered_at"] = now_iso()

    write_data(data)
    return jsonify({"message":"updated","order": order_found})


@admin_bp.route("/orders/<oid>", methods=["DELETE"])
@admin_only
def delete_order(oid):
    data = read_data()
    new_orders = [o for o in data.get("orders", []) if o["order_id"] != oid]

    if len(new_orders) == len(data.get("orders", [])):
        return jsonify({"error":"not found"}), 404

    data["orders"] = new_orders
    write_data(data)
    return jsonify({"message":"deleted"})

# =========================================================
#                 DELIVERY & FINANCE
# =========================================================
@admin_bp.route("/delivery", methods=["GET"])
@admin_only
def list_delivery_states():
    return jsonify(read_data().get("delivery", {}))


@admin_bp.route("/delivery/reset/<uid>", methods=["POST"])
@admin_only
def reset_delivery(uid):
    data = read_data()

    if uid not in data.get("delivery", {}):
        return jsonify({"error":"not found"}), 404

    data["delivery"][uid] = {
        "assigned_orders": [],
        "status":"available",
        "balance":0,
        "updated_at": now_iso()
    }

    write_data(data)
    return jsonify({"message":"delivery reset"})

@admin_bp.route("/transactions", methods=["GET"])
@admin_only
def list_transactions():
    return jsonify(read_data().get("transactions", []))

@admin_bp.route("/payouts", methods=["GET"])
@admin_only
def list_payouts():
    return jsonify(read_data().get("payouts", []))

@admin_bp.route("/payouts/<pid>/approve", methods=["POST"])
@admin_only
def approve_payout(pid):
    data = read_data()
    for p in data.get("payouts", []):
        if p["payout_id"] == pid:
            p["status"] = "approved"
            p["approved_at"] = now_iso()
            write_data(data)
            return jsonify({"message":"approved","payout":p})
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/payouts/<pid>/reject", methods=["POST"])
@admin_only
def reject_payout(pid):
    data = read_data()
    for p in data.get("payouts", []):
        if p["payout_id"] == pid:
            p["status"] = "rejected"
            p["rejected_at"] = now_iso()
            write_data(data)
            return jsonify({"message":"rejected","payout":p})
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/export", methods=["GET"])
@admin_only
def export_data():
    data = read_data()
    raw = json.dumps(data, indent=2)

    return send_file(
        io.BytesIO(raw.encode("utf-8")),
        mimetype="application/json",
        as_attachment=True,
        download_name=f"backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    )