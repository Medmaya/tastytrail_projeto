from flask import render_template, session, redirect, url_for
from utils.auth import require_auth, require_role

def register_routes(app):

    # Página pública
    @app.route('/')
    def home():
        return render_template('main/home.html')

    @app.route('/login')
    def login():
        return render_template('main/login.html')

    @app.route('/registro')
    def registro():
        return render_template('main/registro.html')

    @app.route('/sobre')
    def sobre():
        return render_template('main/sobre.html')
        
    @app.route('/contatos')
    def contatos():
        return render_template('main/contatos.html')
    
    @app.route('/produtos')
    def produtos():
        return render_template('main/produtos.html')

    # Páginas que exige login
    @app.route('/cliente')
    @require_auth()
    def cliente():
        user_role = session.get("role")
        return render_template('cliente/dashboard.html', role=user_role)

    # Páginas exclusiva de ADMIN
    @app.route('/admin')
    @require_role('admin')
    def admin():
        return render_template('admin/dashboard.html')

    # Páginas exclusiva de ENTREGADOR
    @app.route('/entregador')
    @require_role('entregador', 'admin')
    def entregador():
        return render_template('entregador/dashboard.html')

    # Páginas exclusiva de EMPRESA
    @app.route('/empresa')
    @require_role('empresa', 'admin')
    def empresa():
        return render_template('empresa/dashboard.html')

    # Logout simples
    @app.route('/logout')
    def logout():
        session.clear()
        return redirect(url_for('home'))
