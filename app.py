# Importa as funções principais do Flask
from flask import Flask, render_template

# Cria uma instância da aplicação Flask
app = Flask(__name__)

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
    

