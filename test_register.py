import requests
import json

BASE_URL = "http://127.0.0.1:5000"

def create_user(username, password, role):
    """Envia uma requisição para criar usuário no servidor Flask"""
    data = {
        "username": username,
        "password": password,
        "role": role
    }

    response = requests.post(f"{BASE_URL}/register", json=data)

    print(f"-> Criando usuário {username}:")
    print("Status:", response.status_code)
    print("Resposta:", response.json())
    print("-" * 40)


def list_users():
    """Mostra todos os usuários cadastrados"""
    response = requests.get(f"{BASE_URL}/users")
    print("Usuários cadastrados:")
    print(json.dumps(response.json(), indent=4, ensure_ascii=False))
    print("=" * 40)


if __name__ == "__main__":
    # Da pra criarmos quantos quiser pra testar:
    create_user("admin", "123", "admin")
    create_user("empresa01", "abc", "empresa")
    create_user("cliente01", "senha", "cliente")
    create_user("entregador01", "bike", "entregador")

    # Listar todos
    list_users()
