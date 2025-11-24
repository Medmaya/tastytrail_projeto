from flask import Blueprint, jsonify, request, session
import uuid
from datetime import datetime

from utils.file_manager import read_json, write_json

# tentativa de importar helper de wallet
try:
    from utils.wallet import debit_user
except Exception:
    debit_user = None

cliente_bp = Blueprint("cliente", __name__, url_prefix="/cliente")

DATA_FILE = "data.json"

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def load_db():
    # Garante que enterprises seja lista e outras chaves existam
    return read_json(DATA_FILE, {
        "users": [],
        "enterprises": [], 
        "orders": [],
        "transactions": [],
        "payouts": [],
        "userstate": {}
    })

def save_db(db):
    write_json(DATA_FILE, db)

def _find_product(pid):
    """
    Procura produto iterando sobre a LISTA de enterprises.
    Retorna (enterprise_id, product) ou (None, None).
    """
    db = load_db()
    for ent in db.get("enterprises", []):
        for p in ent.get("products", []):
            if p.get("id") == pid:
                return ent.get("id"), p
    return None, None

# =========================================================
# 🔹 ROTAS DE DADOS (NOVAS - NECESSÁRIAS PRO DASHBOARD)
# =========================================================

@cliente_bp.route("/me", methods=["GET"])
def get_my_profile():
    """Retorna dados do usuário logado (saldo, nome) para o header do dashboard"""
    uid = session.get("id")
    if not uid: return jsonify({"error": "not logged"}), 401
    
    db = load_db()
    user = next((u for u in db.get("users", []) if str(u.get("id")) == str(uid)), None)
    
    if not user: return jsonify({"error": "user not found"}), 404
    
    return jsonify({
        "id": user.get("id"),
        "username": user.get("username"),
        "email": user.get("email"),
        "credits": user.get("credits", 0),
        "full_name": user.get("client_data", {}).get("full_name", "")
    })

@cliente_bp.route("/orders", methods=["GET"])
def list_my_orders():
    """Lista histórico de pedidos do usuário logado"""
    uid = session.get("id")
    if not uid: return jsonify({"error": "not logged"}), 401
    
    db = load_db()
    # Filtra pedidos onde user_id bate com a sessão
    my_orders = [o for o in db.get("orders", []) if str(o.get("user_id")) == str(uid)]
    
    # Ordena do mais recente para o mais antigo
    my_orders.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return jsonify(my_orders)

@cliente_bp.route("/products", methods=["GET"])
def list_all_products():
    """
    Lista TODOS os produtos de TODAS as empresas.
    Usado para popular a aba 'Restaurantes' e 'Pedir Agora'.
    """
    db = load_db()
    all_products = []
    
    for ent in db.get("enterprises", []):
        ent_name = ent.get("name", "Loja Desconhecida")
        ent_id = ent.get("id")
        
        for p in ent.get("products", []):
            # Cria uma cópia do produto para injetar o nome da loja sem alterar o DB
            p_data = dict(p)
            p_data["enterprise_name"] = ent_name
            p_data["enterprise_id"] = ent_id
            # Se não tiver imagem, garante que o campo exista para o front não quebrar
            if "image" not in p_data: 
                p_data["image"] = "" 
            
            all_products.append(p_data)
            
    return jsonify(all_products)

# =========================================================
# 🔹 ROTAS DE CARRINHO E COMPRA (JÁ EXISTENTES)
# =========================================================

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
    if not uid: return jsonify({"error":"not logged in"}), 401

    data = request.get_json() or {}
    pid = data.get("product_id")
    try: qty = int(data.get("quantity", 1))
    except: qty = 1

    if not pid: return jsonify({"error":"product_id required"}), 400

    eid, prod = _find_product(pid)
    if not prod: return jsonify({"error":"product not found"}), 404

    db = load_db()
    us = db.setdefault("userstate", {})
    state = us.get(str(uid), {"cart": [], "favorites": {}, "orders": []})

    # Adiciona ao carrinho salvando metadados úteis para exibição rápida
    state.setdefault("cart", []).append({
        "product_id": pid,
        "product_name": prod.get("name"), 
        "enterprise_id": eid,
        "quantity": qty,
        "price_credits": prod.get("price_credits", 0),
        "added_at": now_iso()
    })
    us[str(uid)] = state
    save_db(db)

    return jsonify({"message":"added to cart"})

@cliente_bp.route("/cart/remove", methods=["POST"])
def remove_from_cart():
    uid = session.get("id")
    if not uid: return jsonify({"error":"not logged in"}), 401

    data = request.get_json() or {}
    pid = data.get("product_id")
    
    db = load_db()
    us = db.setdefault("userstate", {})
    state = us.get(str(uid), {"cart": []})
    
    # Filtra removendo o item
    new_cart = [c for c in state.get("cart", []) if c.get("product_id") != pid]
    
    state["cart"] = new_cart
    us[str(uid)] = state
    save_db(db)

    return jsonify({"message":"removed"})

@cliente_bp.route("/order", methods=["POST"])
def place_order():
    uid = session.get("id")
    if not uid: return jsonify({"error":"not logged in"}), 401

    db = load_db()
    us = db.setdefault("userstate", {})
    state = us.get(str(uid), {})
    cart = state.get("cart", [])

    if not cart: return jsonify({"error":"empty cart"}), 400

    # 1. Calcula Subtotal
    subtotal = 0
    for item in cart:
        pid = item.get("product_id")
        _, prod = _find_product(pid)
        if prod:
            price = int(prod.get("price_credits", 0))
            qty = int(item.get("quantity", 1))
            subtotal += price * qty

    # 2. Define Taxa de Entrega Fixa
    DELIVERY_FEE = 5 
    total_final = subtotal + DELIVERY_FEE

    # 3. Verifica Saldo e Debita
    users = db.get("users", [])
    user = next((u for u in users if str(u.get("id")) == str(uid)), None)
    
    if not user: return jsonify({"error":"user not found"}), 404
    
    current_credits = int(user.get("credits", 0))
    
    if current_credits < total_final:
        return jsonify({"error": f"Saldo insuficiente. Total: {total_final}, Seu saldo: {current_credits}"}), 400
        
    user["credits"] = current_credits - total_final

    # 4. Registra Transação
    tx = {
        "tx_id": str(uuid.uuid4()),
        "type": "purchase",
        "from": uid,
        "to": "system",
        "amount": total_final,
        "meta": {"subtotal": subtotal, "fee": DELIVERY_FEE},
        "created_at": now_iso()
    }
    db.setdefault("transactions", []).append(tx)

    # 5. Cria o Pedido
    orders = db.setdefault("orders", [])
    order_id = str(uuid.uuid4())
    
    ent_id = cart[0].get("enterprise_id") if len(cart) > 0 else None
    
    order = {
        "order_id": order_id,
        "user_id": str(uid),
        "enterprise_id": ent_id,
        "items": cart,
        "subtotal": subtotal,
        "delivery_fee": DELIVERY_FEE,
        "total_credits": total_final,
        "status": "pending",
        "created_at": now_iso()
    }
    orders.append(order)

    # 6. Limpa Carrinho
    state["orders"] = state.get("orders", []) + [order_id]
    state["cart"] = []
    us[str(uid)] = state

    save_db(db)

    return jsonify({"message":"order placed", "order": order})