"""
test_register_plus.py

Script de testes "plus" para criar usuários, produtos, carrinhos e pedidos aleatórios.
Ele tenta usar a API HTTP do seu servidor Flask (padrão: http://127.0.0.1:5000).
É escrito para ser tolerante a variações de endpoints: se um endpoint específico não existir,
será pulado e o script seguirá adiante.

Ajuste no topo as constantes BASE_URL e os mapeamentos de endpoint conforme sua API.
O script também gera um arquivo `dev.json` com os usuários criados e suas senhas em texto
para facilitar login manual durante o desenvolvimento.

Uso: python test_register_plus.py

Observações:
- Recomendado rodar com o servidor Flask em execução localmente antes de executar.
- O script faz suposições razoáveis sobre payloads (ex: /register espera username,email,password,role).
  Caso seu backend use campos diferentes, ajuste os payloads no dicionário `PAYLOADS_TEMPLATES`.
"""

import requests
import random
import json
import string
import time
from typing import Dict, List

BASE_URL = "http://127.0.0.1:5000"
# Ajuste endpoints aqui conforme sua API real
ENDPOINTS = {
    "register": "/register",
    "login": "/login",
    "logout": "/logout",
    # criação de produto (admin)
    "create_product": "/products",
    # adicionar ao carrinho - tentamos várias possibilidades
    "add_to_cart_candidates": ["/cart/add", "/cart", "/carrinho/add"],
    # criar pedido
    "create_order_candidates": ["/orders", "/create_order", "/orders/create"]
}

# Templates de payloads para casos comuns. Ajuste se sua API tiver nomes diferentes de campos.
PAYLOAD_TEMPLATES = {
    "register": lambda u: {
        "username": u["username"],
        "email": u["email"],
        "password": u["password"],
        "role": u["role"]
    },
    "login": lambda u: {
        "email": u["email"],
        "password": u["password"]
    },
    "create_product": lambda p: {
        "name": p["name"],
        "description": p["description"],
        "price": p["price"],
        "stock": p.get("stock", 10)
    },
    "add_to_cart": lambda prod_id, qty: {
        "product_id": prod_id,
        "quantity": qty
    },
    "create_order": lambda: {
        # se preciso, o backend pode extrair o carrinho do session do usuário
        # ou exigir dados de pagamento. Aqui enviamos um pedido mínimo.
        "payment_method": "card",
        "address": "Rua Exemplo, 123"
    }
}

# Quantidades default
COUNTS = {
    "clientes": 6,
    "empresas": 2,
    "entregadores": 3,
    "admins": 1,
    "products": 12
}

# Helpers

def rand_str(n=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))


def random_user(role: str) -> Dict:
    username = f"{role}_{rand_str(6)}"
    email = f"{username}@example.com"
    password = rand_str(10)
    return {"username": username, "email": email, "password": password, "role": role}


def random_product(i) -> Dict:
    name = f"Produto {i} - {rand_str(4)}"
    description = f"Descrição gerada automaticamente para {name}"
    price = round(random.uniform(5, 300), 2)
    stock = random.randint(1, 50)
    return {"name": name, "description": description, "price": price, "stock": stock}


class APITester:
    def __init__(self, base_url=BASE_URL):
        self.base = base_url.rstrip("/")
        self.endpoints = ENDPOINTS
        self.session = requests.Session()
        # armazenamento local do que foi criado
        self.users: List[Dict] = []
        self.products: List[Dict] = []
        self.dev_json = {"users": []}  # para salvar senhas em texto

    def url(self, path: str) -> str:
        return f"{self.base}{path}"

    def try_post(self, path: str, json_body=None, session: requests.Session = None):
        session = session or self.session
        full = self.url(path)
        try:
            r = session.post(full, json=json_body, timeout=8)
            print(f"POST {full} -> {r.status_code}")
            try:
                return r.status_code, r.json()
            except Exception:
                return r.status_code, r.text
        except requests.exceptions.RequestException as e:
            print(f"ERRO conexão POST {full}: {e}")
            return None, None

    def try_get(self, path: str, session: requests.Session = None):
        session = session or self.session
        full = self.url(path)
        try:
            r = session.get(full, timeout=8)
            print(f"GET {full} -> {r.status_code}")
            try:
                return r.status_code, r.json()
            except Exception:
                return r.status_code, r.text
        except requests.exceptions.RequestException as e:
            print(f"ERRO conexão GET {full}: {e}")
            return None, None

    def register_user(self, user: Dict) -> bool:
        path = self.endpoints.get("register")
        if not path:
            print("Endpoint /register não configurado. Pulando criação de usuário.")
            return False
        payload = PAYLOAD_TEMPLATES["register"](user)
        status, resp = self.try_post(path, json_body=payload)
        ok = status and (200 <= status < 300)
        print(f"create user {user['email']} -> {status}")
        if ok:
            self.users.append(user.copy())
            self.dev_json["users"].append({"email": user["email"], "password": user["password"], "role": user["role"]})
        return ok

    def login_user_session(self, user: Dict) -> requests.Session:
        s = requests.Session()
        path = self.endpoints.get("login")
        payload = PAYLOAD_TEMPLATES["login"](user)
        status, resp = self.try_post(path, json_body=payload, session=s)
        if status and (200 <= status < 300):
            print(f"Login OK para {user['email']}")
            return s
        print(f"Login falhou para {user['email']} -> {status}")
        return None

    def create_products(self, admin_session: requests.Session, count=COUNTS["products"]):
        path = self.endpoints.get("create_product")
        if not path:
            print("Endpoint de criação de produto não configurado. Pulando criação de produtos.")
            return
        for i in range(1, count + 1):
            p = random_product(i)
            status, resp = self.try_post(path, json_body=PAYLOAD_TEMPLATES["create_product"](p), session=admin_session)
            if status and (200 <= status < 300):
                # tentar obter um id retornado (várias APIs retornam o objeto criado)
                if isinstance(resp, dict):
                    p_id = resp.get("id") or resp.get("_id") or resp.get("product_id")
                    if p_id:
                        p["id"] = p_id
                self.products.append(p)
            else:
                print(f"Falha ao criar produto {p['name']}")

    def add_to_cart(self, user_session: requests.Session, prod_id, qty=1):
        # tenta várias rotas candidatas
        for candidate in self.endpoints.get("add_to_cart_candidates", []):
            payload = PAYLOAD_TEMPLATES["add_to_cart"](prod_id, qty)
            status, resp = self.try_post(candidate, json_body=payload, session=user_session)
            if status and (200 <= status < 300):
                print(f"Adicionado produto {prod_id} ao carrinho via {candidate}")
                return True
        print(f"Falha ao adicionar produto {prod_id} ao carrinho (testadas rotas).")
        return False

    def create_order(self, user_session: requests.Session):
        for candidate in self.endpoints.get("create_order_candidates", []):
            payload = PAYLOAD_TEMPLATES["create_order"]()
            status, resp = self.try_post(candidate, json_body=payload, session=user_session)
            if status and (200 <= status < 300):
                print(f"Pedido criado via {candidate}")
                return True
        print("Falha ao criar pedido (rotas testadas).")
        return False

    def run(self):
        # 1) cria usuários
        roles_map = (
            ("cliente", COUNTS["clientes"]),
            ("empresa", COUNTS["empresas"]),
            ("entregador", COUNTS["entregadores"]),
            ("admin", COUNTS["admins"]),
        )

        print("=== Criando usuários ===")
        for role, qty in roles_map:
            for _ in range(qty):
                u = random_user(role)
                self.register_user(u)
                time.sleep(0.1)

        # salva dev.json com senhas em texto
        with open("dev.json", "w", encoding="utf-8") as f:
            json.dump(self.dev_json, f, indent=2, ensure_ascii=False)
        print("Arquivo dev.json gerado com credenciais (texto puro).")

        # 2) tenta identificar um admin para criar produtos
        admin = next((u for u in self.users if u["role"] == "admin"), None)
        admin_session = None
        if admin:
            admin_session = self.login_user_session(admin)
        else:
            print("Nenhum admin criado - pulando criação de produtos")

        # 3) cria produtos (se possível)
        if admin_session:
            print("=== Criando produtos (via admin) ===")
            self.create_products(admin_session, COUNTS["products"])
        else:
            print("Nenhum admin logado - produtos não foram criados via API")

        # 4) para cada cliente, adiciona produtos aleatórios ao carrinho e cria pedidos
        clientes = [u for u in self.users if u["role"] == "cliente"]
        if not clientes:
            print("Nenhum cliente para simular pedidos.")
            return

        # se a API não criou produtos, geramos alguns produtos locais (IDs apenas locais)
        if not self.products:
            print("Nenhum produto criado via API — gerando produtos locais temporários")
            for i in range(1, COUNTS["products"] + 1):
                p = random_product(i)
                p["id"] = f"local-{i}"
                self.products.append(p)

        print("=== Simulando atividade de clientes ===")
        for c in clientes:
            s = self.login_user_session(c)
            if not s:
                print(f"Não foi possível logar cliente {c['email']} — pulando")
                continue
            # adiciona entre 1 e 5 produtos
            to_add = random.randint(1, 5)
            picks = random.sample(self.products, min(to_add, len(self.products)))
            for prod in picks:
                qty = random.randint(1, 3)
                prod_id = prod.get("id") or prod.get("name")
                self.add_to_cart(s, prod_id, qty)
                time.sleep(0.08)
            # tenta criar pedido
            self.create_order(s)
            time.sleep(0.2)

        print("=== Script finalizado ===")


if __name__ == "__main__":
    tester = APITester()
    tester.run()
