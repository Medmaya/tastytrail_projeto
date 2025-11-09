# Importa as funções principais do Flask
from flask import Flask, render_template, request, jsonify
from utils.file_manager import read_json, write_json
import os

# Cria uma instância da aplicação Flask
app = Flask(__name__)


# Caminho dos arquivos de dados
BASE_PATH = "data"
USERS_PATH = os.path.join(BASE_PATH, "users.json")

# Cria pasta data se não existir
os.makedirs(BASE_PATH, exist_ok=True)

# Função para inicializar o arquivo JSON se estiver vazio
if not os.path.exists(USERS_PATH):
    write_json(USERS_PATH, {"users": []})

# Funções banco de dados

@app.route("/register", methods=["POST"])
def register():
    """Cria um novo usuário"""
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "cliente")  # cliente, empresa, entregador, admin

    db = read_json(USERS_PATH)
    users = db.get("users", [])

    # Verifica se já existe
    if any(u["username"] == username for u in users):
        return jsonify({"error": "Usuário já existe"}), 400

    new_user = {
        "username": username,
        "password": password,  # depois criptografamos
        "role": role,
        "banned": False,
        "warnings": 0
    }

    users.append(new_user)
    write_json(USERS_PATH, {"users": users})

    return jsonify({"message": f"Usuário {username} criado com sucesso!"})


@app.route("/users", methods=["GET"])
def list_users():
    """Lista todos os usuários"""
    db = read_json(USERS_PATH)
    return jsonify(db)

# ---------- ROTAS (páginas do site) ----------

# Página inicial
@app.route('/')
def index():
    return render_template('index.html')

# Página "Sobre"
@app.route('/sobre')
def sobre():
    return render_template('sobre.html')

# ---------- EXECUTAR O SERVIDOR ----------
if __name__ == '__main__':
    app.run(debug=True)
    

