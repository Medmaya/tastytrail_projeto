from flask import Flask
from routes.main_routes import main_bp
from routes.admin_routes import admin_bp
from routes.empresa_routes import empresa_bp
from routes.cliente_routes import cliente_bp
from routes.entregador_routes import entregador_bp
from page_routes import register_routes

app = Flask(__name__)
app.secret_key = "chave-super-secreta"

# --- REGISTRO DE BLUEPRINTS ---
app.register_blueprint(main_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(empresa_bp)
app.register_blueprint(cliente_bp)
app.register_blueprint(entregador_bp)

# --- Registrando rotas das páginas --- #
register_routes(app)

# --- INÍCIO DO SERVIDOR ---
if __name__ == "__main__":
    app.run(debug=True)
