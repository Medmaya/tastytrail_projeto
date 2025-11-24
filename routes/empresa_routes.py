# routes/empresa_routes.py
from flask import Blueprint, request, jsonify, session
from functools import wraps
import uuid
from datetime import datetime

from utils.file_manager import read_json, write_json
from utils.auth import require_role

# filenames (consistentes com o resto do projeto)
ENTERPRISE_F = "EnterpriseState.json"
ORDERS_F = "Orders.json"
TX_F = "Transactions.json"
USERS_F = "Users.json"
USERSTATE_F = "UserState.json"
PAYOUTS_F = "Payouts.json"

empresa_bp = Blueprint("empresa", __name__, url_prefix="/empresa")

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def _ensure_logged():
    uid = session.get("id")
    if not uid:
        return None, ({"error":"not logged in"}, 401)
    return uid, None

def _find_products_for_enterprise(ent_id):
    ents = read_json(ENTERPRISE_F, {})
    ent = ents.get(str(ent_id))
    return ent

def _find_product_global(pid):
    ents = read_json(ENTERPRISE_F, {})
    for ent_id, ent in ents.items():
        for p in ent.get("products", []):
            if p.get("id") == pid:
                return ent_id, p
    return None, None

# Middleware: only empresa OR admin
def empresa_or_admin(f):
    @wraps(f)
    @require_role("empresa", "admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

# ---------- Dashboard da empresa ----------
@empresa_bp.route("/dashboard", methods=["GET"])
@empresa_or_admin
def dashboard():
    uid = session.get("id")
    # se admin, pode passar ?enterprise_id=...
    ent_id = request.args.get("enterprise_id") if session.get("role") == "admin" else uid
    ent = _find_products_for_enterprise(ent_id)
    if not ent:
        return jsonify({"error":"enterprise not found"}), 404

    # calcula resumo (total pedidos, vendas em créditos)
    orders = read_json(ORDERS_F, [])
    total_orders = 0
    total_credits = 0
    for o in orders:
        if str(o.get("enterprise_id")) == str(ent_id):
            total_orders += 1
            total_credits += int(o.get("total_credits", 0))
    return jsonify({
        "enterprise_id": ent_id,
        "name": ent.get("name"),
        "total_products": len(ent.get("products", [])),
        "total_orders": total_orders,
        "total_credits": total_credits,
        "balance": int(ent.get("balance", 0))
    })

# ---------- Produtos (CRUD) ----------
@empresa_bp.route("/products", methods=["GET"])
@empresa_or_admin
def list_products():
    # lista produtos da empresa logada (ou enterprise_id=... se admin)
    uid = session.get("id")
    ent_id = request.args.get("enterprise_id") if session.get("role") == "admin" else uid
    ent = _find_products_for_enterprise(ent_id)
    if not ent:
        return jsonify({"error":"enterprise not found"}), 404
    prods = ent.get("products", [])
    return jsonify([p for p in prods])

@empresa_bp.route("/products", methods=["POST"])
@empresa_or_admin
def create_product():
    uid = session.get("id")
    ent_id = request.json.get("enterprise_id") if session.get("role") == "admin" else uid
    ents = read_json(ENTERPRISE_F, {})
    ent = ents.get(str(ent_id))
    if not ent:
        return jsonify({"error":"enterprise not found"}), 404

    payload = request.get_json() or {}
    pid = str(uuid.uuid4())
    prod = {
        "id": pid,
        "name": payload.get("name","produto"),
        "price_credits": int(payload.get("price_credits", payload.get("price", 0))),
        "description": payload.get("description",""),
        "ingredients": payload.get("ingredients", []),
        "reviews": []
    }
    ent.setdefault("products", []).append(prod)
    ents[str(ent_id)] = ent
    write_json(ENTERPRISE_F, ents)
    return jsonify({"message":"created","product": prod}), 201

@empresa_bp.route("/products/<product_id>", methods=["PUT"])
@empresa_or_admin
def update_product(product_id):
    uid = session.get("id")
    ents = read_json(ENTERPRISE_F, {})
    found = False
    for ent_id, ent in ents.items():
        for idx, p in enumerate(ent.get("products", [])):
            if p.get("id") == product_id:
                # permission: must be owner (ent_id==uid) or admin
                if session.get("role") != "admin" and str(ent_id) != str(uid):
                    return jsonify({"error":"forbidden"}), 403
                payload = request.get_json() or {}
                for k in ("name","price_credits","description","ingredients"):
                    if k in payload:
                        if k == "price_credits":
                            try:
                                p[k] = int(payload[k])
                            except:
                                pass
                        else:
                            p[k] = payload[k]
                ent["products"][idx] = p
                ents[ent_id] = ent
                write_json(ENTERPRISE_F, ents)
                found = True
                return jsonify({"message":"updated","product":p})
    if not found:
        return jsonify({"error":"not found"}), 404

@empresa_bp.route("/products/<product_id>", methods=["DELETE"])
@empresa_or_admin
def delete_product(product_id):
    uid = session.get("id")
    ents = read_json(ENTERPRISE_F, {})
    deleted = False
    for ent_id, ent in ents.items():
        for p in ent.get("products", []):
            if p.get("id") == product_id:
                if session.get("role") != "admin" and str(ent_id) != str(uid):
                    return jsonify({"error":"forbidden"}), 403
        new_list = [p for p in ent.get("products", []) if p.get("id") != product_id]
        if len(new_list) != len(ent.get("products", [])):
            ent["products"] = new_list
            ents[ent_id] = ent
            deleted = True
    if deleted:
        write_json(ENTERPRISE_F, ents)
        return jsonify({"message":"deleted"}), 200
    return jsonify({"error":"not found"}), 404

# ---------- Pedidos relacionados à empresa ----------
@empresa_bp.route("/orders", methods=["GET"])
@empresa_or_admin
def list_orders_for_enterprise():
    uid = session.get("id")
    ent_id = request.args.get("enterprise_id") if session.get("role") == "admin" else uid
    orders = read_json(ORDERS_F, [])
    res = [o for o in orders if str(o.get("enterprise_id")) == str(ent_id)]
    return jsonify(res)

@empresa_bp.route("/orders/<order_id>/status", methods=["PUT"])
@empresa_or_admin
def update_order_status(order_id):
    uid = session.get("id")
    payload = request.get_json() or {}
    new_status = payload.get("status")
    if not new_status:
        return jsonify({"error":"status required"}), 400
    orders = read_json(ORDERS_F, [])
    for idx,o in enumerate(orders):
        if o.get("order_id") == order_id:
            # only update if order belongs to this enterprise (or admin)
            if session.get("role") != "admin" and str(o.get("enterprise_id")) != str(uid):
                return jsonify({"error":"forbidden"}), 403
            o["status"] = new_status
            o["updated_at"] = now_iso()
            orders[idx] = o
            write_json(ORDERS_F, orders)
            return jsonify({"message":"status updated","order": o})
    return jsonify({"error":"not found"}), 404

# ---------- Payout (empresa solicita saque) ----------
@empresa_bp.route("/payout/request", methods=["POST"])
@require_role("empresa","admin")
def request_payout():
    uid = session.get("id")
    data = request.get_json() or {}
    amount = data.get("amount")
    if amount is None:
        return jsonify({"error":"amount required"}), 400
    try:
        amount = int(amount)
    except:
        return jsonify({"error":"invalid amount"}), 400

    ents = read_json(ENTERPRISE_F, {})
    ent = ents.get(str(uid))
    if not ent:
        return jsonify({"error":"enterprise not found"}), 404
    if int(ent.get("balance",0)) < amount:
        return jsonify({"error":"insufficient balance"}), 400

    # reserve / debit balance
    ent["balance"] = int(ent.get("balance",0)) - amount
    ents[str(uid)] = ent
    write_json(ENTERPRISE_F, ents)

    # create payout entry
    payouts = read_json(PAYOUTS_F, [])
    p = {
        "payout_id": str(uuid.uuid4()),
        "entity_id": uid,
        "entity_type": "enterprise",
        "amount": amount,
        "status": "pending",
        "requested_at": now_iso()
    }
    payouts.append(p)
    write_json(PAYOUTS_F, payouts)

    # record simple tx
    txs = read_json(TX_F, [])
    tx = {"tx_id": str(uuid.uuid4()), "type":"withdraw_request", "from": uid, "to":"payout", "amount": amount, "created_at": now_iso()}
    txs.append(tx)
    write_json(TX_F, txs)

    return jsonify({"message":"payout requested","payout":p}), 200
