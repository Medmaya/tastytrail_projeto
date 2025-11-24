import requests
import random
import string
import time
import json

BASE_URL = "http://127.0.0.1:5000"

# --- Configurações de Quantidade ---
COUNTS = {
    "empresas": 3,
    "clientes": 5,
    "entregadores": 2,
    "produtos_por_empresa": 4
}

# --- Dados Fakes para parecer real ---
FOOD_NAMES = ["X-Bacon", "Pizza Calabresa", "Açaí 500ml", "Sushi Combo", "Coca-Cola", "Pastel de Carne", "Feijoada", "Pudim", "Suco de Laranja", "Marmita Executiva"]
COMPANY_NAMES = ["Burguer Kingo", "Pizzaria do Mario", "Sushizeiro", "Padaria Estrela", "Açaí do Jota"]
FIRST_NAMES = ["Ana", "Bruno", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gabriel", "Helena"]
LAST_NAMES = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira"]

class TastyPopulator:
    def __init__(self):
        self.session = requests.Session()
        self.users = []      # Armazena {email, password, id, role, session}
        self.products = []   # Armazena todos os produtos criados globalmente
        self.admin_creds = {"email": "admin@tasty.com", "password": "admin", "username": "admin"}

    def _log(self, msg, type="INFO"):
        print(f"[{type}] {msg}")

    # --- Helpers de Dados ---
    def rand_cnpj(self): return f"{random.randint(10,99)}.{random.randint(100,999)}.{random.randint(100,999)}/0001-{random.randint(10,99)}"
    def rand_cpf(self): return f"{random.randint(100,999)}.{random.randint(100,999)}.{random.randint(100,999)}-{random.randint(10,99)}"
    def rand_phone(self): return f"(11) 9{random.randint(1000,9999)}-{random.randint(1000,9999)}"
    
    def get_headers(self):
        return {"Content-Type": "application/json"}

    # --- Ações da API ---

    def register(self, payload):
        try:
            resp = self.session.post(f"{BASE_URL}/register", json=payload, headers=self.get_headers())
            
            if resp.status_code == 201:
                data = resp.json()
                self._log(f"Criado: {payload.get('username') or payload.get('email')} ({payload['role']})", "USER")
                return data.get("user_id")
            else:
                # AQUI ESTÁ A MUDANÇA: Mostra o texto do erro
                self._log(f"Falha ao criar {payload.get('email')}: [{resp.status_code}] {resp.text}", "ERROR")
                return None
        except Exception as e:
            self._log(f"Erro de conexão ao criar {payload.get('email')}: {str(e)}", "CRITICAL")
            return None

    def login(self, email, password):
        s = requests.Session() # Nova sessão para cada user
        resp = s.post(f"{BASE_URL}/login", json={"email": email, "password": password}, headers=self.get_headers())
        if resp.status_code == 200:
            return s
        return None

    def create_admin(self):
        # Tenta registrar admin, se falhar assume que existe
        payload = {
            "username": "admin",
            "email": self.admin_creds["email"],
            "password": self.admin_creds["password"],
            "role": "admin",
            "credits": 999999
        }
        # Admins geralmente são criados via rota /admin/users ou script direto, 
        # mas aqui tentamos via register se a API permitir, ou logamos direto.
        # Se sua rota /register não permite criar admin, pule para login.
        self.register(payload) 
        
        sess = self.login(self.admin_creds["email"], self.admin_creds["password"])
        if sess:
            self.users.append({**self.admin_creds, "session": sess, "role": "admin"})
            self._log("Admin logado com sucesso!", "ADMIN")
            return sess
        else:
            self._log("ERRO CRÍTICO: Não foi possível logar como Admin.", "ERROR")
            return None

    def run(self):
        print("\n=== 🚀 INICIANDO POPULAÇÃO TASTY TRAIL ===\n")
        
        # 1. Setup Admin
        admin_sess = self.create_admin()
        if not admin_sess: return

        # 2. Criar Empresas
        print("\n--- 🏭 Criando Empresas ---")
        empresas_criadas = []
        for i in range(COUNTS["empresas"]):
            c_name = list(set(COMPANY_NAMES) - set([e['name'] for e in empresas_criadas])) 
            if not c_name: c_name = [f"Empresa {i}"]
            name = c_name[0]
            
            payload = {
                "email": f"contato@{name.lower().replace(' ', '')}.com",
                "password": "123",
                "role": "empresa",
                "company_name": name,
                "cnpj": self.rand_cnpj(),
                "address": "Rua das Flores, 100",
                "working_hours": "08:00 as 22:00",
                "phone": self.rand_phone()
            }
            uid = self.register(payload)
            if uid:
                empresas_criadas.append({"id": uid, "name": name, "email": payload["email"], "password": "123"})
            time.sleep(0.1)

        # 3. Criar Produtos (Logando como cada empresa)
        print("\n--- 🍔 Criando Cardápios ---")
        for emp in empresas_criadas:
            sess = self.login(emp["email"], emp["password"])
            if not sess: continue
            
            self._log(f"Logado na empresa {emp['name']} para adicionar produtos...", "MENU")
            
            for _ in range(COUNTS["produtos_por_empresa"]):
                prod_name = random.choice(FOOD_NAMES)
                price = random.randint(10, 80)
                
                payload = {
                    "name": prod_name,
                    "description": f"O melhor {prod_name} da região.",
                    "price_credits": price,
                    "ingredients": ["Amor", "Sabor", "Segredo"]
                }
                
                # Rota POST /empresa/products
                resp = sess.post(f"{BASE_URL}/empresa/products", json=payload)
                if resp.status_code == 201:
                    p_data = resp.json().get("product")
                    p_data["enterprise_id"] = emp["id"] # guarda dono
                    self.products.append(p_data)
                    print(f"   + Adicionado: {prod_name} ($ {price})")
                else:
                    print(f"   x Erro ao add produto: {resp.status_code}")
                time.sleep(0.05)

        # 4. Criar Clientes e Entregadores
        print("\n--- 👥 Criando Pessoas ---")
        clientes_criados = []
        
        # Clientes
        for i in range(COUNTS["clientes"]):
            nome = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            payload = {
                "email": f"cliente{i}@gmail.com",
                "password": "123",
                "role": "cliente",
                "full_name": nome,
                "address": f"Av Paulista, {random.randint(100, 2000)}",
                "phone": self.rand_phone()
            }
            uid = self.register(payload)
            if uid:
                clientes_criados.append({"id": uid, "email": payload["email"], "password": "123", "name": nome})
        
        # Entregadores
        for i in range(COUNTS["entregadores"]):
            nome = f"Entregador {random.choice(FIRST_NAMES)}"
            payload = {
                "email": f"driver{i}@log.com",
                "password": "123",
                "role": "entregador",
                "full_name": nome,
                "document_id": self.rand_cpf(),
                "phone": self.rand_phone(),
                "vehicle_type": random.choice(["Moto", "Bike"])
            }
            self.register(payload)

        # 5. Admin dá Dinheiro para Clientes (Update User)
        print("\n--- 💸 Distribuindo Saldo (Admin) ---")
        for cli in clientes_criados:
            # PUT /admin/users/<id>
            resp = admin_sess.put(f"{BASE_URL}/admin/users/{cli['id']}", json={"credits": 500})
            if resp.status_code == 200:
                self._log(f"{cli['name']} recebeu 500 créditos.", "MONEY")
            else:
                self._log(f"Falha ao depositar para {cli['name']}", "ERROR")

        # 6. Simular Compras
        print("\n--- 🛒 Simulando Compras ---")
        if not self.products:
            print("Sem produtos, sem compras.")
            return

        for cli in clientes_criados:
            sess = self.login(cli["email"], cli["password"])
            if not sess: continue

            # Escolhe 2 produtos aleatórios
            compra = random.sample(self.products, k=min(2, len(self.products)))
            
            print(f"> {cli['name']} está comprando...")
            
            for prod in compra:
                # Add to cart
                resp = sess.post(f"{BASE_URL}/cliente/cart/add", json={
                    "product_id": prod["id"],
                    "quantity": random.randint(1, 2)
                })
                if resp.status_code == 200:
                    print(f"   - Colocou {prod['name']} no carrinho.")
            
            time.sleep(0.5)
            
            # Checkout
            resp = sess.post(f"{BASE_URL}/cliente/order", json={})
            if resp.status_code == 200:
                order_id = resp.json().get("order", {}).get("order_id")
                print(f"   PEDIDO FEITO! ID: {order_id}")
            else:
                print(f"    Falha no pedido: {resp.text}")
            
            time.sleep(1)

        print("\n=== ✨ POPULAÇÃO CONCLUÍDA ✨ ===")
        print("Dados gerados. Agora você pode navegar na aplicação e ver tudo preenchido.")

if __name__ == "__main__":
    pop = TastyPopulator()
    try:
        pop.run()
    except requests.exceptions.ConnectionError:
        print("\n ERRO: O servidor Flask não parece estar rodando.")
        print("Certifique-se de iniciar o 'app.py' em outro terminal antes de rodar este script.")