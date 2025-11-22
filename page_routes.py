from flask import render_template, session, redirect, url_for
from utils.auth import require_auth, require_role

def register_routes(app):

    # Página pública
    @app.route('/')
    def index():
        return render_template('inicio.html')
    
    @app.route('/login')
    def login():
        return render_template('login.html')

    @app.route('/registro')
    def registro():
        return render_template('registro.html')

    # Páginas que exige login
    @app.route('/dashboard')
    @require_auth()
    def dashboard():
        user_role = session.get("role")
        return render_template('dashboard.html', role=user_role)

    # Páginas exclusiva de ADMIN
    @app.route('/admin')
    @require_role('admin')
    def admin_panel():
        return render_template('admin.html')

    # Páginas exclusiva de ENTREGADOR
    @app.route('/entregas')
    @require_role('entregador', 'admin')
    def entregador_panel():
        return render_template('entregador.html')

    # Páginas exclusiva de CLIENTE
    @app.route('/cliente')
    @require_role('cliente', 'admin')
    def cliente_panel():
        return render_template('cliente.html')

    # Logout simples
    @app.route('/logout')
    def logout():
        session.clear()
        return redirect(url_for('index'))
