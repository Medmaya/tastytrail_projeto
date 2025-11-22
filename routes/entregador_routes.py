# routes/entregador_routes.py
from flask import Blueprint, request, jsonify, session
from functools import wraps
from datetime import datetime
import uuid

from utils.file_manager import read_json, write_json
from utils.auth import require_role
try:
    from utils.wallet import request_payout
except Exception:
    request_payout = None

ORDERS_F = "Orders.json"
DELIVERY_F = "DeliveryUser.json"
TX_F = "Transactions.json"
PAYOUTS_F = "Payouts.json"

entregador_bp = Blueprint("entregador", __name__, url_prefix="/entregador")

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def entregador_only(f):
    @wraps(f)
    @require_role("entregador","admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

# listar pedidos atribuídos ao entregador
@entregador_bp.route("/assigned", methods=["GET"])
@entregador_only
def list_assigned():
    uid = session.get("id")
    orders = read_json(ORDERS_F, [])
    assigned = [o for o in orders if o.get("assigned_delivery") == uid]
    return jsonify(assigned)

# aceitar/assumir um pedido (entregador aceita tarefa)
@entregador_bp.route("/assign/<order_id>", methods=["POST"])
@entregador_only
def accept_order(order_id):
    uid = session.get("id")
    orders = read_json(ORDERS_F, [])
    for idx,o in enumerate(orders):
        if o.get("order_id") == order_id:
            if o.get("assigned_delivery") and o.get("assigned_delivery") != uid:
                return jsonify({"error":"already assigned"}), 400
            o["assigned_delivery"] = uid
            o["status"] = "out_for_delivery"
            o["picked_at"] = now_iso()
            orders[idx] = o
            write_json(ORDERS_F, orders)
            # update delivery user state
            dels = read_json(DELIVERY_F, {})
            d = dels.get(str(uid), {"assigned_orders": [], "status":"available", "balance":0})
            d.setdefault("assigned_orders", []).append(order_id)
            d["status"] = "delivering"
            dels[str(uid)] = d
            write_json(DELIVERY_F, dels)
            return jsonify({"message":"order accepted","order":o})
    return jsonify({"error":"not found"}), 404

# marcar entregue
@entregador_bp.route("/complete/<order_id>", methods=["POST"])
@entregador_only
def complete_order(order_id):
    uid = session.get("id")
    orders = read_json(ORDERS_F, [])
    for idx,o in enumerate(orders):
        if o.get("order_id") == order_id:
            if o.get("assigned_delivery") != uid and session.get("role") != "admin":
                return jsonify({"error":"forbidden"}), 403
            o["status"] = "delivered"
            o["delivered_at"] = now_iso()
            orders[idx] = o
            write_json(ORDERS_F, orders)
            # remove from delivery assigned_orders and optionally credit delivery balance
            dels = read_json(DELIVERY_F, {})
            d = dels.get(str(uid), {"assigned_orders": [], "status":"available", "balance":0})
            d["assigned_orders"] = [a for a in d.get("assigned_orders",[]) if a != order_id]
            if not d["assigned_orders"]:
                d["status"] = "available"
            # opcional: credit delivery fee (simple fixed value or percent)
            delivery_fee = int(o.get("delivery_fee", 0))
            if delivery_fee:
                d["balance"] = int(d.get("balance",0)) + delivery_fee
                txs = read_json(TX_F, [])
                tx = {"tx_id": str(uuid.uuid4()), "type":"credit_delivery", "from":"system", "to": uid, "amount": delivery_fee, "meta":{"order": order_id}, "created_at": now_iso()}
                txs.append(tx)
                write_json(TX_F, txs)
            dels[str(uid)] = d
            write_json(DELIVERY_F, dels)
            return jsonify({"message":"order completed","order": o})
    return jsonify({"error":"not found"}), 404

# ver saldo do entregador
@entregador_bp.route("/balance", methods=["GET"])
@entregador_only
def view_balance():
    uid = session.get("id")
    dels = read_json(DELIVERY_F, {})
    d = dels.get(str(uid))
    if not d:
        return jsonify({"error":"not found"}), 404
    return jsonify({"balance": int(d.get("balance",0))})

# solicitar saque (payout)
@entregador_bp.route("/payout/request", methods=["POST"])
@entregador_only
def payout_request():
    uid = session.get("id")
    data = request.get_json() or {}
    amount = data.get("amount")
    if amount is None:
        return jsonify({"error":"amount required"}), 400
    try:
        amount = int(amount)
    except:
        return jsonify({"error":"invalid amount"}), 400

    # try using wallet helper if available
    if request_payout:
        try:
            p = request_payout(uid, amount)  # if implemented expects (user_id, amount) in wallet.py
            return jsonify({"message":"payout requested","payout":p}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    # fallback: reduce balance and create payout entry
    dels = read_json(DELIVERY_F, {})
    d = dels.get(str(uid))
    if not d:
        return jsonify({"error":"not found"}), 404
    if int(d.get("balance",0)) < amount:
        return jsonify({"error":"insufficient balance"}), 400
    d["balance"] = int(d.get("balance",0)) - amount
    dels[str(uid)] = d
    write_json(DELIVERY_F, dels)

    payouts = read_json(PAYOUTS_F, [])
    p = {"payout_id": str(uuid.uuid4()), "entity_id": uid, "entity_type":"delivery", "amount": amount, "status":"pending", "requested_at": now_iso()}
    payouts.append(p)
    write_json(PAYOUTS_F, payouts)
    return jsonify({"message":"payout requested (fallback)","payout": p}), 200
