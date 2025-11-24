from flask import Blueprint, request, jsonify, session
from functools import wraps
import uuid
from datetime import datetime

from utils.file_manager import read_json, write_json
from utils.auth import require_role

DATA_FILE = "data.json"
empresa_bp = Blueprint("empresa", __name__, url_prefix="/empresa")

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def load_db():
    return read_json(DATA_FILE, {
        "users": [],
        "enterprises": [], 
        "orders": [],
        "transactions": [],
        "payouts": []
    })

def save_db(db):
    write_json(DATA_FILE, db)

def empresa_or_admin(f):
    @wraps(f)
    @require_role("empresa", "admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

# Helper para achar empresa na lista
def find_enterprise_by_id(db, ent_id):
    return next((e for e in db.get("enterprises", []) if e["id"] == ent_id), None)

# ===========================================
# DASHBOARD EMPRESA
# ===========================================
@empresa_bp.route("/dashboard", methods=["GET"])
@empresa_or_admin
def dashboard():
    db = load_db()
    uid = session.get("id")
    # Se for admin, pode ver de outros. Se for empresa, vê o próprio ID.
    ent_id = request.args.get("enterprise_id") if session.get("role") == "admin" else uid

    enterprise = find_enterprise_by_id(db, ent_id)
    if not enterprise:
        return jsonify({"error": "enterprise not found"}), 404

    # Filtra pedidos desta empresa
    orders = [o for o in db.get("orders", []) if o.get("enterprise_id") == ent_id]

    return jsonify({
        "enterprise_id": ent_id,
        "name": enterprise.get("name"),
        "total_products": len(enterprise.get("products", [])),
        "total_orders": len(orders),
        "total_credits_sold": sum(int(o.get("subtotal", 0)) for o in orders),
        "balance": int(enterprise.get("balance", 0))
    })

# ===========================================
# PRODUTOS (CRUD)
# ===========================================
@empresa_bp.route("/products", methods=["GET"])
@empresa_or_admin
def list_products():
    db = load_db()
    uid = session.get("id")
    ent_id = request.args.get("enterprise_id") if session.get("role") == "admin" else uid

    enterprise = find_enterprise_by_id(db, ent_id)
    if not enterprise: return jsonify({"error": "enterprise not found"}), 404

    return jsonify(enterprise.get("products", []))

@empresa_bp.route("/products", methods=["POST"])
@empresa_or_admin
def create_product():
    db = load_db()
    uid = session.get("id")
    payload = request.get_json() or {}

    ent_id = payload.get("enterprise_id") if session.get("role") == "admin" else uid

    enterprise = find_enterprise_by_id(db, ent_id)
    if not enterprise: return jsonify({"error": "enterprise not found"}), 404

    pid = str(uuid.uuid4())
    product = {
        "id": pid,
        "name": payload.get("name", "produto"),
        "price_credits": int(payload.get("price_credits", 0)),
        "description": payload.get("description", ""),
        "ingredients": payload.get("ingredients", []),
        "reviews": []
    }

    enterprise.setdefault("products", []).append(product)
    save_db(db)

    return jsonify({"message": "created", "product": product}), 201

@empresa_bp.route("/products/<pid>", methods=["PUT"])
@empresa_or_admin
def update_product(pid):
    db = load_db()
    uid = session.get("id")

    # Itera sobre todas as empresas para achar o produto e verificar permissão
    for enterprise in db.get("enterprises", []):
        for i, p in enumerate(enterprise.get("products", [])):
            if p["id"] == pid:
                # Verifica permissão
                if session.get("role") != "admin" and enterprise["id"] != uid:
                    return jsonify({"error": "forbidden"}), 403

                payload = request.get_json() or {}
                for k in ("name", "description", "ingredients"):
                    if k in payload: p[k] = payload[k]

                if "price_credits" in payload:
                    try: p["price_credits"] = int(payload["price_credits"])
                    except: pass

                enterprise["products"][i] = p
                save_db(db)
                return jsonify({"message": "updated", "product": p})

    return jsonify({"error": "not found"}), 404

@empresa_bp.route("/products/<pid>", methods=["DELETE"])
@empresa_or_admin
def delete_product(pid):
    db = load_db()
    uid = session.get("id")
    modified = False

    for enterprise in db.get("enterprises", []):
        # Verifica se produto existe nesta empresa
        prod_exists = any(p["id"] == pid for p in enterprise.get("products", []))
        
        if prod_exists:
             if session.get("role") != "admin" and enterprise["id"] != uid:
                return jsonify({"error": "forbidden"}), 403
             
             enterprise["products"] = [p for p in enterprise["products"] if p["id"] != pid]
             modified = True
             break # assume ID unico global

    if modified:
        save_db(db)
        return jsonify({"message": "deleted"}), 200

    return jsonify({"error": "not found"}), 404

# ===========================================
# PEDIDOS
# ===========================================
@empresa_bp.route("/orders", methods=["GET"])
@empresa_or_admin
def list_orders():
    db = load_db()
    uid = session.get("id")
    ent_id = request.args.get("enterprise_id") if session.get("role") == "admin" else uid

    orders = [o for o in db.get("orders", []) if o.get("enterprise_id") == ent_id]
    return jsonify(orders)

@empresa_bp.route("/orders/<order_id>/status", methods=["PUT"])
@empresa_or_admin
def update_order_status(order_id):
    db = load_db()
    uid = session.get("id")
    payload = request.get_json() or {}
    new_status = payload.get("status")

    if not new_status: return jsonify({"error": "status required"}), 400

    for o in db.get("orders", []):
        if o["order_id"] == order_id:
            if session.get("role") != "admin" and o.get("enterprise_id") != uid:
                return jsonify({"error": "forbidden"}), 403

            o["status"] = new_status
            o["updated_at"] = now_iso()
            
            save_db(db)
            return jsonify({"message": "status updated", "order": o})

    return jsonify({"error": "not found"}), 404

# ===========================================
# SAQUE (PAYOUT)
# ===========================================
@empresa_bp.route("/payout/request", methods=["POST"])
@require_role("empresa", "admin")
def request_payout():
    db = load_db()
    uid = session.get("id")
    payload = request.get_json() or {}
    
    try: amount = int(payload.get("amount", 0))
    except: return jsonify({"error": "invalid amount"}), 400

    enterprise = find_enterprise_by_id(db, uid)
    if not enterprise: return jsonify({"error": "enterprise not found"}), 404

    if enterprise.get("balance", 0) < amount:
        return jsonify({"error": "insufficient balance"}), 400

    enterprise["balance"] -= amount

    payout = {
        "payout_id": str(uuid.uuid4()),
        "entity_id": uid,
        "amount": amount,
        "status": "pending",
        "requested_at": now_iso()
    }
    db.setdefault("payouts", []).append(payout)
    save_db(db)

    return jsonify({"message": "payout requested", "payout": payout}), 200