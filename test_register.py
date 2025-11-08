import requests
import json

BASE_URL = "http://127.0.0.1:5000"

def test_route(endpoint, method="GET", body=None):
    """
    Testa qualquer rota Flask.
    - endpoint: string (ex: '/register')
    - method: string ('GET', 'POST', 'PUT', 'DELETE')
    - body: dicionário (ex: {"username": "teste"})
    """
    url = f"{BASE_URL}{endpoint}"

    headers = {"Content-Type": "application/json"}

    print(f"Testando {method} {url}")
    if body:
        print("Body:", json.dumps(body, indent=2))

    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, json=body)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=body)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=body)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, json=body)
        else:
            print(f"Método {method} não suportado.")
            return

        print("Status:", response.status_code)
        try:
            print("Resposta:", json.dumps(response.json(), indent=2, ensure_ascii=False))
        except Exception:
            print("Resposta (texto):", response.text)
        print("-" * 60)

    except requests.exceptions.ConnectionError:
        print("Não foi possível conectar ao servidor Flask.")
    except Exception as e:
        print(f"Erro: {e}")


if __name__ == "__main__":
    test_route("/register", "POST", {
        "username": "cliente03",
        "password": "abc123",
        "email": "cliente03@gmail.com",
        "role": "cliente"
    })

    test_route("/login", "POST", {
        "email": "cliente03@gmail.com",
        "password": "abc123"
    })

    test_route("/logout", "POST")
