// Registro.js
let selectedType = null;

// Regex Patterns Fortes
const RE = {
  // Email padrão
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  
  // CNPJ: Aceita com pontos (00.000...) ou apenas números, 14 dígitos
  cnpj: /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})$/,
  
  // Telefone: Aceita (11) 99999-9999, (11)9999-9999 ou só números (10 a 11 digitos)
  phone: /^(\(?\d{2}\)?\s?)?(9?\d{4}-?\d{4})$/,
  
  // Senha: Pelo menos uma letra e um número, min 6 chars
  password: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/,
  
  // Nome: 3 a 80 caracteres, aceita acentos
  name: /^[a-zA-ZÀ-ÿ\s]{3,80}$/,
  
  // Veículo: Apenas letras, min 3 chars
  vehicle: /^[a-zA-ZÀ-ÿ\s]{3,30}$/
};

function selectType(type) {
  selectedType = type;
  const extra = document.getElementById("extraFields");
  
  // Atualiza visual dos botões
  document.querySelectorAll('.select-type-btn').forEach(btn => {
      if(btn.innerText.toLowerCase() === type) btn.style.backgroundColor = "#e0e0e0"; // destaque simples
      else btn.style.backgroundColor = "";
  });

  // Geração de HTML com limites (maxlength) e placeholders
  if (type === "empresa") {
    extra.innerHTML = `
      <label>Nome da Empresa:</label>
      <input type="text" name="company_name" required minlength="3" maxlength="80" placeholder="Nome Fantasia" />

      <label>CNPJ:</label>
      <input type="text" name="cnpj" required maxlength="18" placeholder="00.000.000/0000-00" />

      <label>Endereço:</label>
      <input type="text" name="address" required minlength="5" maxlength="120" placeholder="Rua, Número, Bairro" />

      <label>Horário de Funcionamento:</label>
      <input type="text" name="working_hours" required maxlength="50" placeholder="Ex: 08:00 às 18:00" />

      <label>Telefone:</label>
      <input type="text" name="phone" required maxlength="15" placeholder="(XX) XXXXX-XXXX" />
    `;
  } else if (type === "cliente") {
    extra.innerHTML = `
      <label>Nome Completo:</label>
      <input type="text" name="full_name" required minlength="3" maxlength="80" placeholder="Seu nome completo" />

      <label>Endereço:</label>
      <input type="text" name="address" required minlength="5" maxlength="120" placeholder="Rua, Número, Bairro" />

      <label>Telefone:</label>
      <input type="text" name="phone" required maxlength="15" placeholder="(XX) XXXXX-XXXX" />
    `;
  } else if (type === "entregador") {
    extra.innerHTML = `
      <label>Nome Completo:</label>
      <input type="text" name="full_name" required minlength="3" maxlength="80" placeholder="Seu nome" />

      <label>CPF / Documento:</label>
      <input type="text" name="document_id" required maxlength="14" placeholder="CPF" />

      <label>Telefone:</label>
      <input type="text" name="phone" required maxlength="15" placeholder="(XX) XXXXX-XXXX" />

      <label>Tipo de Veículo:</label>
      <input type="text" name="vehicle_type" required maxlength="30" placeholder="Ex: Moto, Carro, Bike" />
    `;
  } else {
    extra.innerHTML = '';
  }
}

function collectFormToJSON(formEl) {
  const fd = new FormData(formEl);
  const obj = {};
  for (const [k, v] of fd.entries()) {
    obj[k] = typeof v === 'string' ? v.trim() : v;
  }
  return obj;
}

// Retorna null se ok, ou string de erro se falhar
function validateRegisterPayload(payload, formEl) {
  const errors = [];
  
  formEl.querySelectorAll('input').forEach(i => i.classList.remove('input-error'));

  const markError = (fieldName) => {
    const input = formEl.querySelector(`[name="${fieldName}"]`);
    if(input) input.classList.add('input-error');
  };

  // 1. Validação Comum
  if (!payload.email || !RE.email.test(payload.email)) {
    errors.push("Email inválido.");
    markError("email");
  }
  if (!payload.password || !RE.password.test(payload.password)) {
    errors.push("A senha deve ter min 6 caracteres, letras e números.");
    markError("password");
  }

  const role = payload.role;
  if (!role) errors.push("Selecione o tipo de conta (Botões acima).");

  // 2. Validação Específica
  if (role === "empresa") {
    if (!payload.company_name || !RE.name.test(payload.company_name)) {
      errors.push("Nome da empresa inválido."); markError("company_name");
    }
    if (!payload.cnpj || !RE.cnpj.test(payload.cnpj)) {
      errors.push("CNPJ inválido (Formato ou números)."); markError("cnpj");
    }
    if (!payload.address || payload.address.length < 5) {
      errors.push("Endereço muito curto."); markError("address");
    }
    if (payload.phone && !RE.phone.test(payload.phone)) {
      errors.push("Telefone inválido."); markError("phone");
    }
  } 
  else if (role === "cliente") {
    if (!payload.full_name || !RE.name.test(payload.full_name)) {
      errors.push("Nome completo inválido."); markError("full_name");
    }
    if (!payload.address || payload.address.length < 5) {
      errors.push("Endereço muito curto."); markError("address");
    }
    if (payload.phone && !RE.phone.test(payload.phone)) {
      errors.push("Telefone inválido."); markError("phone");
    }
  } 
  else if (role === "entregador") {
    if (!payload.full_name || !RE.name.test(payload.full_name)) {
      errors.push("Nome inválido."); markError("full_name");
    }
    if (!payload.document_id || payload.document_id.length < 5) {
      errors.push("Documento inválido."); markError("document_id");
    }
    if (!payload.phone || !RE.phone.test(payload.phone)) {
      errors.push("Telefone inválido."); markError("phone");
    }
    if (!payload.vehicle_type || !RE.vehicle.test(payload.vehicle_type)) {
      errors.push("Tipo de veículo inválido."); markError("vehicle_type");
    }
  }

  return errors;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const resultEl = document.getElementById("result");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = selectedType;
    if (!role) {
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = "Selecione: Empresa, Cliente ou Entregador."; }
      else alert("Selecione o tipo de conta.");
      return;
    }

    const payload = collectFormToJSON(form);
    payload.role = role;

    // Validação
    const errors = validateRegisterPayload(payload, form);
    
    if (errors.length) {
      const msg = errors[0];
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
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });

      let data = null;
      try { data = await resp.json(); } catch (err) { }

      if (!resp.ok) {
        const msg = (data && (data.error || data.message)) || `Erro HTTP ${resp.status}`;
        if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = msg; }
        return;
      }

      const success = (data && (data.message || "Usuário criado!")) || "Sucesso";
      if (resultEl) { resultEl.style.color = "green"; resultEl.innerText = success + " Redirecionando..."; }

      setTimeout(()=> { window.location.href = "/login"; }, 1500);

    } catch (err) {
      console.error("register error", err);
      if (resultEl) { resultEl.style.color = "red"; resultEl.innerText = "Erro de rede ao enviar registro."; }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.orig || "Criar"; }
    }
  });
});