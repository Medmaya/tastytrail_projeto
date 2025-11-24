# routes/admin_routes.py
from flask import Blueprint, request, jsonify, session, render_template, send_file
from functools import wraps
import uuid
from datetime import datetime
import io
import json

# storage helpers (assumed implemented in utils/file_manager)
from utils.file_manager import read_json, write_json

# auth decorator (assumed implemented)
from utils.auth import require_role

# optional security + wallet helpers (if you implemented them)
try:
    from utils.security import hash_password
except Exception:
    hash_password = None

try:
    from utils.wallet import credit_user, request_payout, complete_payout
except Exception:
    credit_user = None
    request_payout = None
    complete_payout = None

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

# filenames (consistent with our design)
USERS_F = "Users.json"
ENTERPRISE_F = "EnterpriseState.json"
ORDERS_F = "Orders.json"
TX_F = "Transactions.json"
PAYOUTS_F = "Payouts.json"
DELIVERY_F = "DeliveryUser.json"
USERSTATE_F = "UserState.json"

# ----------------- helpers -----------------
def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def _sanitize_user(user):
    """Remove campos sensíveis antes de retornar"""
    u = dict(user)
    # avoid exposing password or password_hash
    u.pop("password", None)
    u.pop("password_hash", None)
    return u

def _find_product(pid):
    """
    Retorna (enterprise_id, product, enterprise_obj) se encontrado
    Caso contrário -> (None, None, None)
    """
    ents = read_json(ENTERPRISE_F, {})
    for ent_id, ent in ents.items():
        for p in ent.get("products", []):
            if p.get("id") == pid:
                return ent_id, p, ent
    return None, None, None

def _save_users_list(users):
    write_json(USERS_F, {"users": users})

def _get_user_by_id(uid):
    users = read_json(USERS_F, {"users": []})["users"]
    for u in users:
        if u.get("id") == uid:
            return u
    return None

# Decorator extra to ensure session is admin (in addition to require_role)
def admin_only(f):
    @wraps(f)
    @require_role("admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

# ----------------- Admin pages / dashboard -----------------
@admin_bp.route("/dashboard")
@admin_only
def dashboard():
    # Simple JSON dashboard; templates can render if preferred
    users = read_json(USERS_F, {"users": []})["users"]
    orders = read_json(ORDERS_F, [])
    txs = read_json(TX_F, [])
    total_users = len(users)
    total_orders = len(orders)
    total_credit_flow = sum(int(tx.get("amount", 0)) for tx in txs if tx.get("type") in ("topup","purchase","credit_enterprise","credit_delivery"))
    return jsonify({
        "total_users": total_users,
        "total_orders": total_orders,
        "total_credit_flow": total_credit_flow
    })

# ----------------- Users CRUD -----------------
@admin_bp.route("/users", methods=["GET"])
@admin_only
def list_users():
    data = read_json(USERS_F, {"users": []})["users"]
    return jsonify([_sanitize_user(u) for u in data])

@admin_bp.route("/users/<user_id>", methods=["GET"])
@admin_only
def get_user(user_id):
    u = _get_user_by_id(user_id)
    if not u:
        return jsonify({"error":"not found"}), 404
    return jsonify(_sanitize_user(u))

@admin_bp.route("/users", methods=["POST"])
@admin_only
def create_user():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "cliente")
    email = data.get("email")
    if not username or not password:
        return jsonify({"error":"username and password required"}), 400

    users = read_json(USERS_F, {"users": []})["users"]
    if any(u["username"].lower() == username.lower() for u in users):
        return jsonify({"error":"username exists"}), 400

    new_id = str(uuid.uuid4())
    user_obj = {
        "id": new_id,
        "username": username,
        "email": email,
        "role": role,
        "banned": False,
        "warnings": 0,
        "created_at": now_iso(),
        "credits": int(data.get("credits", 0))
    }
    # password handling
    if hash_password:
        user_obj["password_hash"] = hash_password(password)
    else:
        # fallback (not recommended) - store plain but mark to migrate
        user_obj["password"] = password

    users.append(user_obj)
    _save_users_list(users)

    # initialize user state
    userstate = read_json(USERSTATE_F, {})
    userstate[new_id] = {"cart": [], "favorites": {"products": [], "enterprises": []}, "orders": [], "preferences": {}, "created_at": now_iso()}
    write_json(USERSTATE_F, userstate)

    return jsonify({"message":"created", "user": _sanitize_user(user_obj)}), 201

@admin_bp.route("/users/<user_id>", methods=["PUT"])
@admin_only
def update_user(user_id):
    payload = request.get_json() or {}
    users = read_json(USERS_F, {"users": []})["users"]
    for u in users:
        if u["id"] == user_id:
            # allow updating some fields
            for k in ("username","email","role","banned","warnings"):
                if k in payload:
                    u[k] = payload[k]
            if "password" in payload:
                if hash_password:
                    u["password_hash"] = hash_password(payload["password"])
                    u.pop("password", None)
                else:
                    u["password"] = payload["password"]
            if "credits" in payload:
                try:
                    u["credits"] = int(payload["credits"])
                except:
                    pass
            _save_users_list(users)
            return jsonify({"message":"updated","user": _sanitize_user(u)})
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/users/<user_id>", methods=["DELETE"])
@admin_only
def delete_user(user_id):
    users = read_json(USERS_F, {"users": []})["users"]
    new_list = [u for u in users if u["id"] != user_id]
    if len(new_list) == len(users):
        return jsonify({"error":"not found"}), 404
    _save_users_list(new_list)
    # optionally remove userstate
    us = read_json(USERSTATE_F, {})
    if user_id in us:
        us.pop(user_id)
        write_json(USERSTATE_F, us)
    return jsonify({"message":"deleted"}), 200

@admin_bp.route("/ban/<user_id>", methods=["POST"])
@admin_only
def ban_user(user_id):
    payload = request.get_json() or {}
    permanent = bool(payload.get("permanent", False))
    until = payload.get("until")
    reason = payload.get("reason", "")
    users = read_json(USERS_F, {"users": []})["users"]
    for u in users:
        if u["id"] == user_id:
            u["banned"] = True
            if permanent:
                u["ban_info"] = {"permanent": True, "reason": reason, "by": session.get("username"), "at": now_iso()}
            else:
                u["ban_info"] = {"until": until, "reason": reason, "by": session.get("username"), "at": now_iso()}
            _save_users_list(users)
            return jsonify({"message":"user banned"}), 200
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/warn/<user_id>", methods=["POST"])
@admin_only
def warn_user(user_id):
    payload = request.get_json() or {}
    note = payload.get("note","")
    users = read_json(USERS_F, {"users": []})["users"]
    for u in users:
        if u["id"] == user_id:
            u["warnings"] = int(u.get("warnings",0)) + 1
            # optionally append a warnings array
            w = u.setdefault("warning_logs", [])
            w.append({"at": now_iso(), "by": session.get("username"), "note": note})
            _save_users_list(users)
            return jsonify({"message":"warned","warnings": u["warnings"]}), 200
    return jsonify({"error":"not found"}), 404

# ----------------- Enterprises CRUD -----------------
@admin_bp.route("/enterprises", methods=["GET"])
@admin_only
def list_enterprises():
    ents = read_json(ENTERPRISE_F, {})
    # return list of enterprise objects with their id
    res = []
    for ent_id, ent in ents.items():
        e = dict(ent)
        e["id"] = ent_id
        res.append(e)
    return jsonify(res)

@admin_bp.route("/enterprises/<ent_id>", methods=["GET"])
@admin_only
def get_enterprise(ent_id):
    ents = read_json(ENTERPRISE_F, {})
    ent = ents.get(str(ent_id))
    if not ent:
        return jsonify({"error":"not found"}), 404
    e = dict(ent)
    e["id"] = ent_id
    return jsonify(e)

@admin_bp.route("/enterprises", methods=["POST"])
@admin_only
def create_enterprise():
    payload = request.get_json() or {}
    owner_id = payload.get("owner_id")
    name = payload.get("name") or payload.get("username") or "empresa"
    ent_id = str(uuid.uuid4())
    ents = read_json(ENTERPRISE_F, {})
    ents[ent_id] = {
        "owner_id": owner_id,
        "name": name,
        "products": [],
        "received_orders": [],
        "balance": int(payload.get("balance", 0)),
        "created_at": now_iso()
    }
    write_json(ENTERPRISE_F, ents)
    return jsonify({"message":"created","enterprise_id": ent_id}), 201

@admin_bp.route("/enterprises/<ent_id>", methods=["PUT"])
@admin_only
def update_enterprise(ent_id):
    payload = request.get_json() or {}
    ents = read_json(ENTERPRISE_F, {})
    ent = ents.get(str(ent_id))
    if not ent:
        return jsonify({"error":"not found"}), 404
    # allow updating name, balance, etc
    for k in ("name","balance"):
        if k in payload:
            if k == "balance":
                try:
                    ent["balance"] = int(payload["balance"])
                except:
                    pass
            else:
                ent[k] = payload[k]
    ents[str(ent_id)] = ent
    write_json(ENTERPRISE_F, ents)
    return jsonify({"message":"updated"})

@admin_bp.route("/enterprises/<ent_id>", methods=["DELETE"])
@admin_only
def delete_enterprise(ent_id):
    ents = read_json(ENTERPRISE_F, {})
    if str(ent_id) in ents:
        ents.pop(str(ent_id))
        write_json(ENTERPRISE_F, ents)
        return jsonify({"message":"deleted"}), 200
    return jsonify({"error":"not found"}), 404

# ----------------- Products CRUD (global) -----------------
@admin_bp.route("/products", methods=["GET"])
@admin_only
def list_products():
    ents = read_json(ENTERPRISE_F, {})
    products = []
    for ent_id,ent in ents.items():
        for p in ent.get("products",[]):
            pp = dict(p)
            pp["enterprise_id"] = ent_id
            products.append(pp)
    return jsonify(products)

@admin_bp.route("/products/<product_id>", methods=["GET"])
@admin_only
def get_product(product_id):
    ent_id, p, ent = _find_product(product_id)
    if not p:
        return jsonify({"error":"not found"}), 404
    out = dict(p)
    out["enterprise_id"] = ent_id
    return jsonify(out)

@admin_bp.route("/enterprises/<ent_id>/products", methods=["POST"])
@admin_only
def create_product(ent_id):
    payload = request.get_json() or {}
    ents = read_json(ENTERPRISE_F, {})
    ent = ents.get(str(ent_id))
    if not ent:
        return jsonify({"error":"enterprise not found"}), 404
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

@admin_bp.route("/products/<product_id>", methods=["PUT"])
@admin_only
def update_product(product_id):
    ents = read_json(ENTERPRISE_F, {})
    updated = False
    for ent_id, ent in ents.items():
        for idx, p in enumerate(ent.get("products", [])):
            if p.get("id") == product_id:
                payload = request.get_json() or {}
                for k in ("name","price_credits","description","ingredients"):
                    if k in payload:
                        if k == "price_credits":
                            try:
                                p["price_credits"] = int(payload[k])
                            except:
                                pass
                        else:
                            p[k] = payload[k]
                ent["products"][idx] = p
                ents[ent_id] = ent
                updated = True
                break
        if updated:
            break
    if not updated:
        return jsonify({"error":"not found"}), 404
    write_json(ENTERPRISE_F, ents)
    return jsonify({"message":"updated"})

@admin_bp.route("/products/<product_id>", methods=["DELETE"])
@admin_only
def delete_product_admin(product_id):
    ents = read_json(ENTERPRISE_F, {})
    deleted = False
    for ent_id, ent in ents.items():
        new_list = [p for p in ent.get("products", []) if p.get("id") != product_id]
        if len(new_list) != len(ent.get("products", [])):
            ent["products"] = new_list
            ents[ent_id] = ent
            deleted = True
    if deleted:
        write_json(ENTERPRISE_F, ents)
        return jsonify({"message":"deleted"}), 200
    return jsonify({"error":"not found"}), 404

# ----------------- Orders CRUD -----------------
@admin_bp.route("/orders", methods=["GET"])
@admin_only
def list_orders():
    orders = read_json(ORDERS_F, [])
    return jsonify(orders)

@admin_bp.route("/orders/<order_id>", methods=["GET"])
@admin_only
def get_order(order_id):
    orders = read_json(ORDERS_F, [])
    for o in orders:
        if o.get("order_id") == order_id:
            return jsonify(o)
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/orders/<order_id>", methods=["PUT"])
@admin_only
def update_order(order_id):
    payload = request.get_json() or {}
    orders = read_json(ORDERS_F, [])
    for idx,o in enumerate(orders):
        if o.get("order_id") == order_id:
            # allow status update and assigned_delivery
            if "status" in payload:
                o["status"] = payload["status"]
            if "assigned_delivery" in payload:
                o["assigned_delivery"] = payload["assigned_delivery"]
            orders[idx] = o
            write_json(ORDERS_F, orders)
            return jsonify({"message":"updated","order":o})
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/orders/<order_id>", methods=["DELETE"])
@admin_only
def delete_order(order_id):
    orders = read_json(ORDERS_F, [])
    new = [o for o in orders if o.get("order_id") != order_id]
    if len(new) == len(orders):
        return jsonify({"error":"not found"}), 404
    write_json(ORDERS_F, new)
    return jsonify({"message":"deleted"}), 200

# ----------------- Transactions / Payouts -----------------
@admin_bp.route("/transactions", methods=["GET"])
@admin_only
def list_transactions():
    txs = read_json(TX_F, [])
    return jsonify(txs)

@admin_bp.route("/transactions/<tx_id>", methods=["GET"])
@admin_only
def get_transaction(tx_id):
    txs = read_json(TX_F, [])
    for t in txs:
        if t.get("tx_id") == tx_id:
            return jsonify(t)
    return jsonify({"error":"not found"}), 404

@admin_bp.route("/payouts", methods=["GET"])
@admin_only
def list_payouts():
    ps = read_json(PAYOUTS_F, [])
    return jsonify(ps)

@admin_bp.route("/payouts/<payout_id>/complete", methods=["POST"])
@admin_only
def complete_payout_admin(payout_id):
    payload = request.get_json() or {}
    admin_id = session.get("id")
    # try to use wallet helper if available
    if complete_payout:
        try:
            res = complete_payout(payout_id, admin_id=admin_id)
            return jsonify({"message":"payout completed","payout": res}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 400
    # fallback: mark in Payouts.json
    payouts = read_json(PAYOUTS_F, [])
    for p in payouts:
        if p.get("payout_id") == payout_id:
            p["status"] = "completed"
            p["completed_at"] = now_iso()
            write_json(PAYOUTS_F, payouts)
            return jsonify({"message":"payout completed (fallback)","payout":p}), 200
    return jsonify({"error":"not found"}), 404

# ----------------- Delivery Users (entregadores) -----------------
@admin_bp.route("/delivery", methods=["GET"])
@admin_only
def list_delivery_users():
    dels = read_json(DELIVERY_F, {})
    res = []
    for did, d in dels.items():
        dd = dict(d)
        dd["id"] = did
        res.append(dd)
    return jsonify(res)

@admin_bp.route("/delivery/<delivery_id>", methods=["PUT"])
@admin_only
def update_delivery_user(delivery_id):
    payload = request.get_json() or {}
    dels = read_json(DELIVERY_F, {})
    d = dels.get(str(delivery_id))
    if not d:
        return jsonify({"error":"not found"}), 404
    for k in ("status","rating","balance","assigned_orders"):
        if k in payload:
            d[k] = payload[k]
    dels[str(delivery_id)] = d
    write_json(DELIVERY_F, dels)
    return jsonify({"message":"updated"})

# ----------------- UserState (cart, favorites) -----------------
@admin_bp.route("/userstate/<user_id>", methods=["GET"])
@admin_only
def get_userstate(user_id):
    us = read_json(USERSTATE_F, {})
    st = us.get(str(user_id))
    if not st:
        return jsonify({"error":"not found"}), 404
    return jsonify(st)

@admin_bp.route("/userstate/<user_id>", methods=["PUT"])
@admin_only
def update_userstate(user_id):
    payload = request.get_json() or {}
    us = read_json(USERSTATE_F, {})
    st = us.get(str(user_id), {})
    # merge payload fields (cart,favorites,orders,preferences)
    for k in ("cart","favorites","orders","preferences"):
        if k in payload:
            st[k] = payload[k]
    us[str(user_id)] = st
    write_json(USERSTATE_F, us)
    return jsonify({"message":"updated"})

# ----------------- Backup / Export (admin) -----------------
@admin_bp.route("/export", methods=["GET"])
@admin_only
def export_all_json():
    # create a zip-like in-memory JSON blob (for simplicity return JSON object containing all)
    all_data = {
        "users": read_json(USERS_F, {"users":[]})["users"],
        "enterprises": read_json(ENTERPRISE_F, {}),
        "orders": read_json(ORDERS_F, []),
        "transactions": read_json(TX_F, []),
        "payouts": read_json(PAYOUTS_F, []),
        "delivery": read_json(DELIVERY_F, {}),
        "userstate": read_json(USERSTATE_F, {})
    }
    # return as downloadable JSON
    mem = io.BytesIO()
    mem.write(json.dumps(all_data, indent=2, ensure_ascii=False).encode("utf-8"))
    mem.seek(0)
    return send_file(mem, mimetype="application/json", as_attachment=True, attachment_filename="backup_all.json")

# ----------------- Admin topup (credits) -----------------
@admin_bp.route("/topup", methods=["POST"])
@admin_only
def admin_topup():
    payload = request.get_json() or {}
    user_id = payload.get("user_id")
    amount = payload.get("amount")
    if not user_id or amount is None:
        return jsonify({"error":"user_id and amount required"}), 400
    try:
        amount = int(amount)
    except:
        return jsonify({"error":"invalid amount"}), 400

    # try using wallet helper if present
    if credit_user:
        try:
            tx = credit_user(user_id, amount, by=session.get("username"))
            return jsonify({"message":"topped up","tx":tx}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 400

    # fallback: directly update Users.json
    users = read_json(USERS_F, {"users": []})["users"]
    for u in users:
        if u.get("id") == user_id:
            u["credits"] = int(u.get("credits", 0)) + amount
            _save_users_list(users)
            # record basic tx
            txs = read_json(TX_F, [])
            tx = {"tx_id": str(uuid.uuid4()), "type": "topup", "from": session.get("username"), "to": user_id, "amount": amount, "meta": {}, "created_at": now_iso()}
            txs.append(tx)
            write_json(TX_F, txs)
            return jsonify({"message":"topped up (fallback)","tx":tx}), 200
    return jsonify({"error":"user not found"}), 404

# ----------------- Orders (CREATE) -----------------
@admin_bp.route("/orders", methods=["POST"])
@admin_only
def create_order_admin():
    payload = request.get_json() or {}
    user_id = payload.get("user_id")
    items = payload.get("items", [])  # esperado: lista de {product_id, quantity, enterprise_id (opcional)}
    if not user_id or not items:
        return jsonify({"error":"user_id and items required"}), 400

    # calcula total com base em ENTERPRISE_F
    ents = read_json(ENTERPRISE_F, {})
    total = 0
    for it in items:
        pid = it.get("product_id")
        qty = int(it.get("quantity", 1))
        # procura produto
        found = None
        for ent_id, ent in ents.items():
            for p in ent.get("products", []):
                if p.get("id") == pid:
                    found = (ent_id, p)
                    break
            if found:
                break
        if not found:
            continue
        _, p = found
        total += int(p.get("price_credits", 0)) * qty

    orders = read_json(ORDERS_F, [])
    order = {
        "order_id": str(uuid.uuid4()),
        "user_id": user_id,
        "items": items,
        "total_credits": total,
        "status": payload.get("status","pending"),
        "created_at": now_iso(),
        "enterprise_id": items[0].get("enterprise_id") if items and items[0].get("enterprise_id") else None
    }
    orders.append(order)
    write_json(ORDERS_F, orders)

    # opcional: add order id to userstate
    us = read_json(USERSTATE_F, {})
    st = us.get(str(user_id), {"cart":[], "orders":[]})
    st.setdefault("orders", []).append(order["order_id"])
    us[str(user_id)] = st
    write_json(USERSTATE_F, us)

    return jsonify({"message":"order created", "order": order}), 201

# ----------------- Transactions (CREATE) -----------------
@admin_bp.route("/transactions", methods=["POST"])
@admin_only
def create_transaction_admin():
    payload = request.get_json() or {}
    tx_id = str(uuid.uuid4())
    tx = {
        "tx_id": tx_id,
        "type": payload.get("type","manual"),
        "from": payload.get("from"),
        "to": payload.get("to"),
        "amount": int(payload.get("amount", 0)),
        "meta": payload.get("meta", {}),
        "created_at": now_iso()
    }
    txs = read_json(TX_F, [])
    txs.append(tx)
    write_json(TX_F, txs)
    return jsonify({"message":"transaction created", "tx": tx}), 201

# ----------------- Delivery user (CREATE) -----------------
@admin_bp.route("/delivery", methods=["POST"])
@admin_only
def create_delivery_user_admin():
    payload = request.get_json() or {}
    did = str(uuid.uuid4())
    dels = read_json(DELIVERY_F, {})
    d = {
        "assigned_orders": payload.get("assigned_orders", []),
        "status": payload.get("status", "available"),
        "rating": payload.get("rating", 0),
        "balance": int(payload.get("balance", 0)),
        "profile": payload.get("profile", {})
    }
    dels[did] = d
    write_json(DELIVERY_F, dels)
    return jsonify({"message":"delivery user created","id":did, "delivery": d}), 201

# ----------------- Quick userstate update (PUT by admin) -----------------
@admin_bp.route("/userstate/<user_id>", methods=["POST"])
@admin_only
def create_or_update_userstate_admin(user_id):
    payload = request.get_json() or {}
    us = read_json(USERSTATE_F, {})
    st = us.get(str(user_id), {"cart": [], "favorites": {}, "orders": [], "preferences": {}})
    # merge shallow
    for k in ("cart","favorites","orders","preferences"):
        if k in payload:
            st[k] = payload[k]
    us[str(user_id)] = st
    write_json(USERSTATE_F, us)
    return jsonify({"message":"userstate updated", "userstate": st}), 200

@admin_bp.route("/api/enterprises", methods=["GET"])
@require_role('admin')
def api_get_enterprises():
    enterprises = [u for u in USERS.values() if u.get("role") == "empresa"]

    return jsonify({
        "enterprises": enterprises,
        "count": len(enterprises)
    })
