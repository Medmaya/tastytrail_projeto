from flask import Blueprint, request, jsonify, session
from functools import wraps
from datetime import datetime
import uuid

from utils.file_manager import read_json, write_json
from utils.auth import require_role

entregador_bp = Blueprint("entregador", __name__, url_prefix="/entregador")

DATA_FILE = "data.json"

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def load_db():
    return read_json(DATA_FILE, {
        "users": [], "enterprises": [], "orders": [], 
        "transactions": [], "payouts": [], "delivery": {}
    })

def save_db(db):
    write_json(DATA_FILE, db)

def entregador_only(f):
    @wraps(f)
    @require_role("entregador", "admin")
    def wrapper(*args, **kwargs):
        return f(*args, **kwargs)
    return wrapper

# --- HELPER PARA ENRIQUECER O PEDIDO COM ENDEREÇO E LOJA ---
def enrich_order(order, db):
    """Adiciona nome da loja e endereço do cliente ao objeto do pedido"""
    # 1. Nome da Loja
    ent_id = order.get("enterprise_id")
    if ent_id:
        ent = next((e for e in db.get("enterprises", []) if e["id"] == ent_id), None)
        if ent:
            # Injeta no primeiro item ou cria campo direto
            if "items" in order and len(order["items"]) > 0:
                order["items"][0]["enterprise_name"] = ent.get("name")
            order["enterprise_name"] = ent.get("name")

    # 2. Endereço do Cliente
    user_id = order.get("user_id")
    if user_id:
        user = next((u for u in db.get("users", []) if u["id"] == user_id), None)
        if user:
            # Tenta pegar do client_data ou company_data
            client_addr = user.get("client_data", {}).get("address")
            comp_addr = user.get("company_data", {}).get("address")
            order["client_address"] = client_addr or comp_addr or "Endereço não cadastrado"
        else:
            order["client_address"] = "Cliente não encontrado"
            
    # 3. Garante Taxa de Entrega (Fallback para pedidos antigos)
    if "delivery_fee" not in order:
        order["delivery_fee"] = 5 # Valor padrão visual

    return order

# --- ROTAS ---

@entregador_bp.route("/assigned", methods=["GET"])
@entregador_only
def list_assigned():
    uid = session.get("id")
    db = load_db()
    # Filtra pedidos deste entregador
    raw_orders = [o for o in db.get("orders", []) if str(o.get("assigned_delivery")) == str(uid)]
    
    # Enriquece com endereços
    enriched = [enrich_order(o, db) for o in raw_orders]
    return jsonify(enriched)

@entregador_bp.route("/available", methods=["GET"])
@entregador_only
def list_available():
    db = load_db()
    # Pedidos sem entregador e com status pendente/pronto
    raw_orders = [
        o for o in db.get("orders", [])
        if not o.get("assigned_delivery") 
        and o.get("status") in ["pending", "preparing", "ready_for_pickup"]
    ]
    
    enriched = [enrich_order(o, db) for o in raw_orders]
    return jsonify(enriched)

@entregador_bp.route("/assign/<order_id>", methods=["POST"])
@entregador_only
def accept_order(order_id):
    uid = session.get("id")
    db = load_db()
    orders = db.get("orders", [])
    updated = False
    target_order = None

    for idx, o in enumerate(orders):
        if o.get("order_id") == order_id:
            if o.get("assigned_delivery") and str(o.get("assigned_delivery")) != str(uid):
                return jsonify({"error": "Já pego por outro entregador"}), 400

            o["assigned_delivery"] = str(uid)
            o["status"] = "out_for_delivery"
            orders[idx] = o
            target_order = o
            updated = True
            break

    if updated:
        save_db(db)
        return jsonify({"message": "Pedido aceito", "order": target_order})
    
    return jsonify({"error": "Pedido não encontrado"}), 404

@entregador_bp.route("/complete/<order_id>", methods=["POST"])
@entregador_only
def complete_order(order_id):
    uid = session.get("id")
    db = load_db()
    orders = db.get("orders", [])
    target_order = None

    for idx, o in enumerate(orders):
        if o.get("order_id") == order_id:
            if str(o.get("assigned_delivery")) != str(uid):
                return jsonify({"error": "Permissão negada"}), 403
            target_order = o
            orders[idx]["status"] = "delivered"
            orders[idx]["delivered_at"] = now_iso()
            break
            
    if not target_order: return jsonify({"error": "Não encontrado"}), 404

    # Lógica de Pagamento
    # Se o pedido for antigo e não tiver fee, usa 5 como padrão
    fee = int(target_order.get("delivery_fee", 5))
    
    # Atualiza saldo do entregador no dicionário 'delivery'
    dels = db.setdefault("delivery", {})
    d_profile = dels.get(str(uid), {"balance": 0, "assigned_orders": []})
    
    d_profile["balance"] = int(d_profile.get("balance", 0)) + fee
    dels[str(uid)] = d_profile
    
    # Salva no banco
    db["orders"] = orders
    db["delivery"] = dels
    
    # Registra transação
    db.setdefault("transactions", []).append({
        "tx_id": str(uuid.uuid4()),
        "type": "credit_delivery",
        "to": uid,
        "amount": fee,
        "meta": {"order": order_id},
        "created_at": now_iso()
    })

    save_db(db)
    
    return jsonify({"message": "Entrega concluída", "earned": fee})

@entregador_bp.route("/balance", methods=["GET"])
@entregador_only
def view_balance():
    uid = session.get("id")
    db = load_db()
    d = db.get("delivery", {}).get(str(uid), {})
    return jsonify({"balance": int(d.get("balance", 0))})

@entregador_bp.route("/payout/request", methods=["POST"])
@entregador_only
def payout_request():
    # (Mantém igual ao anterior)
    uid = session.get("id")
    data = request.get_json() or {}
    try: amount = int(data.get("amount", 0))
    except: return jsonify({"error": "invalid"}), 400

    db = load_db()
    dels = db.setdefault("delivery", {})
    d = dels.get(str(uid))
    
    if not d or int(d.get("balance", 0)) < amount:
        return jsonify({"error": "Saldo insuficiente"}), 400

    d["balance"] -= amount
    dels[str(uid)] = d
    
    db.setdefault("payouts", []).append({
        "payout_id": str(uuid.uuid4()),
        "entity_id": uid,
        "amount": amount,
        "status": "pending",
        "requested_at": now_iso()
    })
    save_db(db)
    return jsonify({"message": "Solicitado"}), 200