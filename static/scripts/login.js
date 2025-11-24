// Login.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const resultEl = document.getElementById("loginResult");

  if (!form) return;

  const showError = (msg) => {
    if (resultEl) {
      resultEl.style.color = "red";
      resultEl.innerText = msg;
    } else {
      alert(msg);
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Limpa erros anteriores
    if(resultEl) resultEl.innerText = "";
    const inputs = form.querySelectorAll("input");
    inputs.forEach(i => i.classList.remove("input-error"));

    const emailInput = form.email;
    const passInput = form.password;
    const email = (emailInput.value || "").trim();
    const password = (passInput.value || "");

    // 1. Validação de Campos Vazios
    if (!email || !password) {
      showError("Email e senha são obrigatórios.");
      if(!email) emailInput.classList.add("input-error");
      if(!password) passInput.classList.add("input-error");
      return;
    }

    // 2. Regex de Email 
    const reEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!reEmail.test(email)) {
      showError("Por favor, insira um email válido.");
      emailInput.classList.add("input-error");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.orig = submitBtn.innerText;
      submitBtn.innerText = "Conectando...";
    }

    try {
      const resp = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", 
        body: JSON.stringify({ email, password })
      });

      let data = null;
      try { data = await resp.json(); } catch (err) { }

      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Erro HTTP ${resp.status}`;
        showError(msg);
        return;
      }

      // Redirecionamento baseado na Role
      const role = data && data.role;
      if (role === "cliente") window.location.href = "/cliente";
      else if (role === "empresa") window.location.href = "/empresa";
      else if (role === "entregador") window.location.href = "/entregador";
      else if (role === "admin") window.location.href = "/admin";
      else {
        if (resultEl) { resultEl.style.color = "orange"; resultEl.innerText = "Login OK, conta desconhecida."; }
        else alert("Login realizado, tipo de conta desconhecido.");
      }

    } catch (err) {
      console.error("login error", err);
      showError("Erro de conexão com o servidor.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = submitBtn.dataset.orig || "Entrar";
      }
    }
  });
});