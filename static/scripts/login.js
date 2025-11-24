// Login.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const resultEl = document.getElementById("loginResult");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (form.email && form.email.value || "").trim();
    const password = (form.password && form.password.value) || "";

    if (!email || !password) {
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = "Email e senha são obrigatórios."; }
      else alert("Email e senha são obrigatórios.");
      return;
    }

    // valida email simples
    const reEmail = /^\S+@\S+\.\S+$/;
    if (!reEmail.test(email)) {
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = "Email inválido."; }
      else alert("Email inválido.");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.orig = submitBtn.innerText; submitBtn.innerText = "Conectando..."; }

    try {
      const resp = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password })
      });

      let data = null;
      try { data = await resp.json(); } catch (err) { /* ignore */ }

      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Erro HTTP ${resp.status}`;
        if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = msg; }
        else alert(msg);
        return;
      }

      const role = data && data.role;
      if (role === "cliente") window.location.href = "/cliente";
      else if (role === "empresa") window.location.href = "/empresa";
      else if (role === "entregador") window.location.href = "/entregador";
      else if (role === "admin") window.location.href = "/admin";
      else {
        if (resultEl) { resultEl.style.color = "orange"; resultEl.innerText = "Login realizado, mas tipo de conta desconhecido."; }
        else alert("Login realizado, tipo de conta desconhecido.");
      }

    } catch (err) {
      console.error("login error", err);
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = "Erro de rede durante login."; }
      else alert("Erro de rede durante login.");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.orig || "Entrar"; }
    }
  });
});
