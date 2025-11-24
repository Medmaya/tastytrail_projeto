import requests
import random
import time
import json

BASE_URL = "http://127.0.0.1:5000"

# --- Configurações de Quantidade ---
COUNTS = {
    "empresas": 3,           # Vai criar 3 empresas
    "clientes": 5,           # Vai criar 5 clientes
    "entregadores": 2,       # Vai criar 2 entregadores
    "produtos_por_empresa": 4 # Cada empresa terá 4 produtos
}

# --- Dados Fakes ---
FOOD_NAMES = ["X-Bacon", "Pizza Calabresa", "Açaí 500ml", "Sushi Combo", "Coca-Cola", "Pastel de Carne", "Feijoada", "Pudim", "Suco de Laranja", "Marmita Executiva"]
COMPANY_NAMES = ["Burguer Kingo", "Pizzaria do Mario", "Sushizeiro", "Padaria Estrela", "Açaí do Jota"]
FIRST_NAMES = ["Ana", "Bruno", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gabriel", "Helena"]
LAST_NAMES = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira"]

class TastyPopulator:
    def __init__(self):
        self.session = requests.Session()
        self.admin_creds = {"email": "admin@tasty.com", "password": "admin", "username": "admin"}
        self.products = []

    def _log(self, msg, type="INFO"):
        print(f"[{type}] {msg}")

    def rand_cnpj(self): return f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99)}"
    def rand_cpf(self): return f"{random.randint(100,999)}.{random.randint(100,999)}.{random.randint(100,999)}-{random.randint(10,99)}"
    def rand_phone(self): return f"(11) 9{random.randint(1000,9999)}-{random.randint(1000,9999)}"
    
    def get_headers(self): return {"Content-Type": "application/json"}

    def register(self, payload):
        try:
            resp = self.session.post(f"{BASE_URL}/register", json=payload, headers=self.get_headers())
            if resp.status_code == 201:
                data = resp.json()
                self._log(f"Criado: {payload.get('username') or payload.get('email')}", "USER")
                return data.get("user_id")
            else:
                self._log(f"Erro ao criar {payload.get('email')}: {resp.text}", "ERROR")
                return None
        except Exception as e:
            self._log(f"Erro de conexão: {str(e)}", "CRITICAL")
            return None

    def login(self, email, password):
        s = requests.Session()
        resp = s.post(f"{BASE_URL}/login", json={"email": email, "password": password}, headers=self.get_headers())
        if resp.status_code == 200: return s
        return None

    def run(self):
        print("\n=== 🚀 INICIANDO POPULAÇÃO EM MASSA ===\n")
        
        # 1. Tenta criar Admin (pode falhar se já existir, tudo bem)
        self.register({
            "username": "admin", "email": "admin@tasty.com", 
            "password": "admin", "role": "admin", "credits": 99999
        })
        admin_sess = self.login("admin@tasty.com", "admin")

        if not admin_sess:
            print("❌ ERRO: Não consegui logar como admin. Verifique se o server está rodando.")
            return

        # 2. Criar Empresas
        print("\n--- 🏭 Criando Empresas ---")
        empresas = []
        for i in range(COUNTS["empresas"]):
            name = f"{COMPANY_NAMES[i % len(COMPANY_NAMES)]} {random.randint(1,99)}"
            email = f"empresa{i}@tasty.com"
            payload = {
                "email": email, "password": "123", "role": "empresa",
                "company_name": name, "cnpj": self.rand_cnpj(),
                "address": "Rua Teste", "phone": self.rand_phone(),
                "working_hours": "08:00 - 22:00"
            }
            uid = self.register(payload)
            if uid: empresas.append({"email": email, "password": "123", "id": uid, "name": name})
            time.sleep(0.1)

        # 3. Criar Produtos
        print("\n--- 🍔 Criando Produtos ---")
        for emp in empresas:
            sess = self.login(emp["email"], emp["password"])
            if not sess: continue
            for _ in range(COUNTS["produtos_por_empresa"]):
                p_name = random.choice(FOOD_NAMES)
                payload = {
                    "name": p_name, "description": "Delicioso", 
                    "price_credits": random.randint(15, 60),
                    "ingredients": ["Sabor"]
                }
                resp = sess.post(f"{BASE_URL}/empresa/products", json=payload)
                if resp.status_code == 201:
                    prod = resp.json().get("product")
                    prod["enterprise_id"] = emp["id"]
                    self.products.append(prod)
                    print(f"   + {p_name} na loja {emp['name']}")

        # 4. Criar Clientes e Compras
        print("\n--- 🛒 Criando Clientes e Pedidos ---")
        for i in range(COUNTS["clientes"]):
            email = f"cliente_novo{i}@gmail.com"
            uid = self.register({
                "email": email, "password": "123", "role": "cliente",
                "full_name": f"Cliente {i}", "address": "Rua Casa", "phone": self.rand_phone()
            })
            
            if uid and admin_sess:
                # Dar dinheiro
                admin_sess.put(f"{BASE_URL}/admin/users/{uid}", json={"credits": 500})
                
                # Fazer compra
                sess = self.login(email, "123")
                if sess and self.products:
                    prod = random.choice(self.products)
                    sess.post(f"{BASE_URL}/cliente/cart/add", json={"product_id": prod["id"], "quantity": 1})
                    sess.post(f"{BASE_URL}/cliente/order", json={})
                    print(f"   $ Cliente {i} comprou {prod['name']}")

        print("\n=== ✨ TUDO PRONTO! Atualize a página /produtos no navegador. ===")

if __name__ == "__main__":
    TastyPopulator().run()