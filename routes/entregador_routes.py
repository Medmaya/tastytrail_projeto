# routes/entregador_routes.py
from flask import Blueprint, request, jsonify, session
from functools import wraps
from datetime import datetime
import uuid

from utils.file_manager import read_json, write_json
from utils.auth import require_role

# tentativa de importar helper de payout (pode não existir)
try:
    from utils.wallet import request_payout
except Exception:
    request_payout = None

entregador_bp = Blueprint("entregador", __name__, url_prefix="/entregador")

DATA_FILE = "data.json"

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def load_db():
    return read_json(DATA_FILE, {
        "users": [],
        "enterprises": [],
        "orders": [],
        "transactions": [],
        "payouts": [],
        "userstate": {},
        "delivery": {}    # mapping delivery_user_id -> { assigned_orders:[], status, balance, profile, ... }
    })

def save_db(db):
    write_json(DATA_FILE, db)

def entregador_only(f):
    @wraps(f)
    @require_role("entregador", "admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

# listar pedidos atribuídos ao entregador
@entregador_bp.route("/assigned", methods=["GET"])
@entregador_only
def list_assigned():
    uid = session.get("id")
    if not uid:
        return jsonify({"error": "not logged in"}), 401
    db = load_db()
    orders = db.get("orders", [])
    assigned = [o for o in orders if str(o.get("assigned_delivery")) == str(uid)]
    return jsonify(assigned)

# aceitar/assumir um pedido (entregador aceita tarefa)
@entregador_bp.route("/assign/<order_id>", methods=["POST"])
@entregador_only
def accept_order(order_id):
    uid = session.get("id")
    if not uid:
        return jsonify({"error": "not logged in"}), 401

    db = load_db()
    orders = db.get("orders", [])
    updated = False

    for idx, o in enumerate(orders):
        if o.get("order_id") == order_id:
            # if already assigned to another delivery user
            if o.get("assigned_delivery") and str(o.get("assigned_delivery")) != str(uid):
                return jsonify({"error": "already assigned"}), 400

            o["assigned_delivery"] = str(uid)
            o["status"] = "out_for_delivery"
            o["picked_at"] = now_iso()
            orders[idx] = o
            db["orders"] = orders

            # update delivery user record
            dels = db.setdefault("delivery", {})
            d = dels.get(str(uid), {"assigned_orders": [], "status": "available", "balance": 0})
            d.setdefault("assigned_orders", []).append(order_id)
            d["status"] = "delivering"
            dels[str(uid)] = d
            db["delivery"] = dels

            save_db(db)
            updated = True
            return jsonify({"message": "order accepted", "order": o})

    if not updated:
        return jsonify({"error": "not found"}), 404

# marcar entregue
@entregador_bp.route("/complete/<order_id>", methods=["POST"])
@entregador_only
def complete_order(order_id):
    uid = session.get("id")
    if not uid:
        return jsonify({"error": "not logged in"}), 401

    db = load_db()
    orders = db.get("orders", [])

    for idx, o in enumerate(orders):
        if o.get("order_id") == order_id:
            # only assigned delivery or admin can complete
            if str(o.get("assigned_delivery")) != str(uid) and session.get("role") != "admin":
                return jsonify({"error": "forbidden"}), 403

            o["status"] = "delivered"
            o["delivered_at"] = now_iso()
            orders[idx] = o
            db["orders"] = orders

            # update delivery user: remove assigned order, update status and balance (if fee present)
            dels = db.setdefault("delivery", {})
            d = dels.get(str(uid), {"assigned_orders": [], "status": "available", "balance": 0})

            d["assigned_orders"] = [a for a in d.get("assigned_orders", []) if a != order_id]
            if not d["assigned_orders"]:
                d["status"] = "available"

            # credit delivery fee if present
            try:
                delivery_fee = int(o.get("delivery_fee", 0))
            except:
                delivery_fee = 0

            if delivery_fee:
                d["balance"] = int(d.get("balance", 0)) + delivery_fee
                txs = db.setdefault("transactions", [])
                tx = {
                    "tx_id": str(uuid.uuid4()),
                    "type": "credit_delivery",
                    "from": "system",
                    "to": str(uid),
                    "amount": delivery_fee,
                    "meta": {"order": order_id},
                    "created_at": now_iso()
                }
                txs.append(tx)
                db["transactions"] = txs

            dels[str(uid)] = d
            db["delivery"] = dels

            save_db(db)
            return jsonify({"message": "order completed", "order": o})

    return jsonify({"error": "not found"}), 404

# ver saldo do entregador
@entregador_bp.route("/balance", methods=["GET"])
@entregador_only
def view_balance():
    uid = session.get("id")
    if not uid:
        return jsonify({"error": "not logged in"}), 401

    db = load_db()
    dels = db.get("delivery", {})
    d = dels.get(str(uid))
    if not d:
        return jsonify({"error": "not found"}), 404
    return jsonify({"balance": int(d.get("balance", 0))})

# solicitar saque (payout)
@entregador_bp.route("/payout/request", methods=["POST"])
@entregador_only
def payout_request():
    uid = session.get("id")
    if not uid:
        return jsonify({"error": "not logged in"}), 401

    data = request.get_json() or {}
    amount = data.get("amount")
    if amount is None:
        return jsonify({"error": "amount required"}), 400
    try:
        amount = int(amount)
    except:
        return jsonify({"error": "invalid amount"}), 400

    db = load_db()
    # try using wallet helper if available
    if request_payout:
        try:
            p = request_payout(uid, amount)  # signature depends on your utils.wallet implementation
            return jsonify({"message": "payout requested", "payout": p}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    # fallback: reduce balance and create payout entry
    dels = db.setdefault("delivery", {})
    d = dels.get(str(uid))
    if not d:
        return jsonify({"error": "not found"}), 404
    if int(d.get("balance", 0)) < amount:
        return jsonify({"error": "insufficient balance"}), 400

    d["balance"] = int(d.get("balance", 0)) - amount
    dels[str(uid)] = d
    db["delivery"] = dels

    payouts = db.setdefault("payouts", [])
    p = {
        "payout_id": str(uuid.uuid4()),
        "entity_id": str(uid),
        "entity_type": "delivery",
        "amount": amount,
        "status": "pending",
        "requested_at": now_iso()
    }
    payouts.append(p)
    db["payouts"] = payouts

    # optional: record a transaction for bookkeeping
    txs = db.setdefault("transactions", [])
    tx = {
        "tx_id": str(uuid.uuid4()),
        "type": "withdraw_request",
        "from": str(uid),
        "to": "payout",
        "amount": amount,
        "created_at": now_iso()
    }
    txs.append(tx)
    db["transactions"] = txs

    save_db(db)
    return jsonify({"message": "payout requested (fallback)", "payout": p}), 200
