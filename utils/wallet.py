# utils/wallet.py
import uuid
from datetime import datetime
from utils.file_manager import read_json, write_json

USERS_F = "Users.json"
TX_F = "Transactions.json"
PAYOUTS_F = "Payouts.json"

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def _save_tx(tx):
    txs = read_json(TX_F, [])
    txs.append(tx)
    write_json(TX_F, txs)

def _find_user(uid):
    users = read_json(USERS_F, {"users": []})["users"]
    for u in users:
        if u["id"] == uid:
            return u
    return None

def credit_user(user_id, amount, by="system", meta=None):
    users_data = read_json(USERS_F, {"users": []})
    for u in users_data["users"]:
        if u["id"] == user_id:
            u["credits"] = int(u.get("credits", 0)) + int(amount)
            write_json(USERS_F, users_data)
            tx = {
                "tx_id": str(uuid.uuid4()),
                "type": "topup",
                "from": by,
                "to": user_id,
                "amount": int(amount),
                "meta": meta or {},
                "created_at": now_iso()
            }
            _save_tx(tx)
            return tx
    raise ValueError("User not found")

def debit_user(user_id, amount, reason="purchase"):
    users_data = read_json(USERS_F, {"users": []})
    for u in users_data["users"]:
        if u["id"] == user_id:
            current = int(u.get("credits", 0))
            if current < amount:
                raise ValueError("Insufficient credits")
            u["credits"] = current - amount
            write_json(USERS_F, users_data)
            tx = {
                "tx_id": str(uuid.uuid4()),
                "type": reason,
                "from": user_id,
                "to": "system",
                "amount": amount,
                "created_at": now_iso()
            }
            _save_tx(tx)
            return tx
    raise ValueError("User not found")

def request_payout(user_id, amount):
    payout = {
        "payout_id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": int(amount),
        "status": "pending",
        "requested_at": now_iso()
    }
    payouts = read_json(PAYOUTS_F, [])
    payouts.append(payout)
    write_json(PAYOUTS_F, payouts)
    return payout

def complete_payout(payout_id, admin_id="system"):
    payouts = read_json(PAYOUTS_F, [])
    for p in payouts:
        if p.get("payout_id") == payout_id:
            p["status"] = "completed"
            p["completed_by"] = admin_id
            p["completed_at"] = now_iso()
            write_json(PAYOUTS_F, payouts)
            return p
    raise ValueError("Payout not found")
