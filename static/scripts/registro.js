// Register.js
let selectedType = null;

function selectType(type) {
  selectedType = type;
  const extra = document.getElementById("extraFields");

  if (type === "empresa") {
    extra.innerHTML = `
      <label>Nome da Empresa:</label>
      <input type="text" name="company_name" required />

      <label>CNPJ:</label>
      <input type="text" name="cnpj" required />

      <label>Endereço:</label>
      <input type="text" name="address" required />

      <label>Horário de Funcionamento:</label>
      <input type="text" name="working_hours" required />

      <label>Telefone:</label>
      <input type="text" name="phone" required />
    `;
  } else if (type === "cliente") {
    extra.innerHTML = `
      <label>Nome Completo:</label>
      <input type="text" name="full_name" required />

      <label>Endereço:</label>
      <input type="text" name="address" required />

      <label>Telefone:</label>
      <input type="text" name="phone" required />
    `;
  } else if (type === "entregador") {
    extra.innerHTML = `
      <label>Nome Completo:</label>
      <input type="text" name="full_name" required />

      <label>Documento:</label>
      <input type="text" name="document_id" required />

      <label>Telefone:</label>
      <input type="text" name="phone" required />

      <label>Tipo de Veículo:</label>
      <input type="text" name="vehicle_type" required />
    `;
  } else {
    extra.innerHTML = '';
  }
}

/* ---------- Validação simples (client-side) ---------- */
const RE = {
  email: /^\S+@\S+\.\S+$/,
  cnpj: /^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})$/,
  phone: /^(\+?55\s?)?(\(?\d{2}\)?\s?)?(9?\d{4}-?\d{4})$/,
  username: /^[a-zA-Z0-9_.-]{3,30}$/,
  password: /^(?=.*[A-Za-z])(?=.*\d).{6,}$/,
  name: /^.{2,80}$/
};

function collectFormToJSON(formEl) {
  const fd = new FormData(formEl);
  const obj = {};
  for (const [k, v] of fd.entries()) {
    obj[k] = typeof v === 'string' ? v.trim() : v;
  }
  return obj;
}

function validateRegisterPayload(payload) {
  const errors = [];
  if (!payload.email || !RE.email.test(payload.email)) errors.push("Email inválido.");
  if (!payload.password || !RE.password.test(payload.password)) errors.push("Senha inválida (mín 6 chars, letras e números).");
  if (payload.username && !RE.username.test(payload.username)) errors.push("Username inválido (3-30 caracteres).");
  const role = payload.role;
  if (!role) errors.push("Selecione o tipo de conta.");

  if (role === "empresa") {
    if (!payload.company_name || !RE.name.test(payload.company_name)) errors.push("Nome da empresa inválido.");
    if (!payload.cnpj || !RE.cnpj.test(payload.cnpj)) errors.push("CNPJ inválido (formato 00.000.000/0000-00 ou 14 dígitos).");
    if (!payload.address || payload.address.length < 5) errors.push("Endereço da empresa muito curto.");
    if (payload.phone && !RE.phone.test(payload.phone)) errors.push("Telefone da empresa inválido.");
  } else if (role === "cliente") {
    if (!payload.full_name || !RE.name.test(payload.full_name)) errors.push("Nome completo inválido.");
    if (!payload.address || payload.address.length < 5) errors.push("Endereço inválido.");
    if (payload.phone && !RE.phone.test(payload.phone)) errors.push("Telefone inválido.");
  } else if (role === "entregador") {
    if (!payload.full_name || !RE.name.test(payload.full_name)) errors.push("Nome do entregador inválido.");
    if (!payload.document_id || payload.document_id.length < 5) errors.push("Documento do entregador inválido.");
    if (!payload.phone || !RE.phone.test(payload.phone)) errors.push("Telefone inválido.");
    if (!payload.vehicle_type || payload.vehicle_type.length < 2) errors.push("Tipo de veículo inválido.");
  }

  return errors;
}

/* ---------- Envio do formulário (separado do DOMContentLoaded pra permitir incluir selectType) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const resultEl = document.getElementById("result"); // container para mensagens (opcional)

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // determina role (selectedType ou campo role no form, se existir)
    const role = selectedType || (form.querySelector('select[name="role"]') && form.querySelector('select[name="role"]').value);
    if (!role) {
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = "Selecione o tipo de conta."; }
      else alert("Selecione o tipo de conta.");
      return;
    }

    const payload = collectFormToJSON(form);
    payload.role = role;

    // validar no front
    const errors = validateRegisterPayload(payload);
    if (errors.length) {
      const msg = errors.join("\n");
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = msg; }
      else alert(msg);
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.orig = submitBtn.innerText; submitBtn.innerText = "Enviando..."; }

    try {
      const resp = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin", // essencial para cookie de sessão do Flask
        body: JSON.stringify(payload)
      });

      let data = null;
      try { data = await resp.json(); } catch (err) { /* ignore */ }

      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Erro HTTP ${resp.status}`;
        if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = msg; }
        else alert(msg);
        return;
      }

      // sucesso
      const success = (data && (data.message || "Usuário criado com sucesso.")) || "Criado";
      if (resultEl) { resultEl.style.color = "green"; resultEl.innerText = success; }
      else alert(success);

      // redireciona para login após breve pausa
      setTimeout(()=> { window.location.href = "/login"; }, 700);

    } catch (err) {
      console.error("register error", err);
      const msg = "Erro de rede ao enviar registro.";
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = msg; }
      else alert(msg);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.orig || "Criar"; }
    }
  });
});
