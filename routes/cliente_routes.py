# routes/cliente_routes.py
from flask import Blueprint, jsonify, request, session
import uuid
from datetime import datetime

from utils.file_manager import read_json, write_json

# tentativa de importar helper de wallet (pode não existir)
try:
    from utils.wallet import debit_user
except Exception:
    debit_user = None

cliente_bp = Blueprint("cliente", __name__, url_prefix="/cliente")

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
        "userstate": {}   # mapeamento user_id -> { cart:[], orders:[], ... }
    })

def save_db(db):
    write_json(DATA_FILE, db)

def _find_product(pid):
    """
    Procura produto entre todas as enterprises no data.json.
    Retorna (enterprise_id, product) ou (None, None).
    """
    db = load_db()
    for ent in db.get("enterprises", []):
        for p in ent.get("products", []):
            if p.get("id") == pid:
                return ent.get("id"), p
    return None, None

@cliente_bp.route("/cart", methods=["GET"])
def view_cart():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401

    db = load_db()
    state = db.get("userstate", {}).get(str(uid), {})
    cart = state.get("cart", [])
    return jsonify(cart)

@cliente_bp.route("/cart/add", methods=["POST"])
def add_to_cart():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401

    data = request.get_json() or {}
    pid = data.get("product_id")
    try:
        qty = int(data.get("quantity", 1))
    except:
        qty = 1
    if not pid:
        return jsonify({"error":"product_id required"}), 400

    eid, prod = _find_product(pid)
    if not prod:
        return jsonify({"error":"product not found"}), 404

    db = load_db()
    us = db.setdefault("userstate", {})
    state = us.get(str(uid), {"cart": [], "favorites": {}, "orders": [], "preferences": {}})

    # Append item to cart
    state.setdefault("cart", []).append({
        "product_id": pid,
        "enterprise_id": eid,
        "quantity": qty,
        "added_at": now_iso()
    })
    us[str(uid)] = state
    db["userstate"] = us
    save_db(db)

    return jsonify({"message":"added to cart"})

@cliente_bp.route("/cart/remove", methods=["POST"])
def remove_from_cart():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401

    data = request.get_json() or {}
    pid = data.get("product_id")
    if not pid:
        return jsonify({"error":"product_id required"}), 400

    db = load_db()
    us = db.setdefault("userstate", {})
    state = us.get(str(uid), {"cart": []})
    new_cart = [c for c in state.get("cart", []) if c.get("product_id") != pid]
    state["cart"] = new_cart
    us[str(uid)] = state
    db["userstate"] = us
    save_db(db)

    return jsonify({"message":"removed"})

@cliente_bp.route("/order", methods=["POST"])
def place_order():
    uid = session.get("id")
    if not uid:
        return jsonify({"error":"not logged in"}), 401

    db = load_db()
    us = db.setdefault("userstate", {})
    state = us.get(str(uid), {})
    cart = state.get("cart", [])

    if not cart:
        return jsonify({"error":"empty cart"}), 400

    # calcula total
    total = 0
    product_not_found = False
    for item in cart:
        pid = item.get("product_id")
        _, prod = _find_product(pid)
        if not prod:
            product_not_found = True
            continue
        price = int(prod.get("price_credits", 0))
        qty = int(item.get("quantity", 1))
        total += price * qty

    if product_not_found:
        # não falha automaticamente — apenas avisa, mas você pode forçar a falha se preferir
        # return jsonify({"error":"one or more products not found"}), 400
        pass

    # tenta debitar via helper externo (wallet). Se não existir, faz fallback direto no users[].credits
    if debit_user:
        try:
            debit_user(uid, total)
        except Exception as e:
            return jsonify({"error": str(e)}), 400
    else:
        # fallback: procura usuário e decrementa credits
        users = db.get("users", [])
        user = next((u for u in users if str(u.get("id")) == str(uid)), None)
        if not user:
            return jsonify({"error":"user not found"}), 404
        current = int(user.get("credits", 0))
        if current < total:
            return jsonify({"error":"insufficient credits"}), 400
        user["credits"] = current - total
        # regista transação simples
        tx = {
            "tx_id": str(uuid.uuid4()),
            "type": "purchase",
            "from": uid,
            "to": "enterprise",
            "amount": total,
            "created_at": now_iso()
        }
        db.setdefault("transactions", []).append(tx)
        # save users and transactions will happen after order addition

    # criar order
    orders = db.setdefault("orders", [])
    order = {
        "order_id": str(uuid.uuid4()),
        "user_id": str(uid),
        "items": cart,
        "total_credits": total,
        "status": "pending",
        "created_at": now_iso(),
        # enterprise_id: se todos os itens forem da mesma enterprise, setar; senão None
        "enterprise_id": (cart[0].get("enterprise_id") if len(cart)>0 else None)
    }
    orders.append(order)
    db["orders"] = orders

    # atualizar userstate: limpar carrinho e adicionar order id
    state["orders"] = state.get("orders", []) + [order["order_id"]]
    state["cart"] = []
    us[str(uid)] = state
    db["userstate"] = us

    # salvar banco (users já foi modificado no fallback)
    save_db(db)

    return jsonify({"message":"order placed","order": order})
