# routes/cliente_routes.py
from flask import Blueprint, jsonify, request, session
import uuid
from datetime import datetime
from utils.file_manager import read_json, write_json
from utils.wallet import debit_user

cliente_bp = Blueprint("cliente", __name__, url_prefix="/cliente")

USERSTATE_F = "UserState.json"
ORDERS_F = "Orders.json"
ENTERPRISE_F = "EnterpriseState.json"

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def _find_product(pid):
    ents = read_json(ENTERPRISE_F, {})
    for eid, ent in ents.items():
        for p in ent.get("products", []):
            if p.get("id") == pid:
                return eid, p
    return None, None

@cliente_bp.route("/cart", methods=["GET"])
def view_cart():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401
    us = read_json(USERSTATE_F, {})
    cart = us.get(uid, {}).get("cart", [])
    return jsonify(cart)

@cliente_bp.route("/cart/add", methods=["POST"])
def add_to_cart():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401
    data = request.get_json() or {}
    pid = data.get("product_id")
    qty = int(data.get("quantity", 1))
    eid, prod = _find_product(pid)
    if not prod:
        return jsonify({"error":"product not found"}), 404

    us = read_json(USERSTATE_F, {})
    state = us.get(uid, {"cart": [], "favorites": {}, "orders": []})
    state.setdefault("cart", []).append({
        "product_id": pid,
        "enterprise_id": eid,
        "quantity": qty,
        "added_at": now_iso()
    })
    us[uid] = state
    write_json(USERSTATE_F, us)
    return jsonify({"message":"added to cart"})

@cliente_bp.route("/cart/remove", methods=["POST"])
def remove_from_cart():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401
    data = request.get_json() or {}
    pid = data.get("product_id")
    us = read_json(USERSTATE_F, {})
    state = us.get(uid, {"cart": []})
    new_cart = [c for c in state.get("cart", []) if c.get("product_id") != pid]
    state["cart"] = new_cart
    us[uid] = state
    write_json(USERSTATE_F, us)
    return jsonify({"message":"removed"})

@cliente_bp.route("/order", methods=["POST"])
def place_order():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401
    us = read_json(USERSTATE_F, {})
    state = us.get(uid, {})
    cart = state.get("cart", [])
    if not cart:
        return jsonify({"error":"empty cart"}), 400

    ents = read_json(ENTERPRISE_F, {})
    total = 0
    for item in cart:
        _, prod = _find_product(item["product_id"])
        if not prod:
            continue
        total += prod["price_credits"] * item["quantity"]

    try:
        debit_user(uid, total)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    orders = read_json(ORDERS_F, [])
    order = {
        "order_id": str(uuid.uuid4()),
        "user_id": uid,
        "items": cart,
        "total_credits": total,
        "status": "pending",
        "created_at": now_iso()
    }
    orders.append(order)
    write_json(ORDERS_F, orders)

    state["orders"] = state.get("orders", []) + [order["order_id"]]
    state["cart"] = []  # clear cart
    us[uid] = state
    write_json(USERSTATE_F, us)

    return jsonify({"message":"order placed","order": order})
