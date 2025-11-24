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
  }

  else if (type === "cliente") {
    extra.innerHTML = `
      <label>Nome Completo:</label>
      <input type="text" name="full_name" required />

      <label>Endereço:</label>
      <input type="text" name="address" required />

      <label>Telefone:</label>
      <input type="text" name="phone" required />
    `;
  }

  else if (type === "entregador") {
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
  }
}



// ------------ ENVIO PARA O BACKEND -------------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedType) {
      alert("Selecione o tipo de conta!");
      return;
    }

    const formData = new FormData(form);
    const json = {};

    for (const [key, value] of formData.entries()) {
      json[key] = value;
    }

    json["role"] = selectedType;

    const resp = await fetch("http://127.0.0.1:5000/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    });

    const data = await resp.json();

    const result = document.getElementById("result");
    result.style.color = resp.ok ? "green" : "red";
    result.innerText = data.message || data.error;
  });
});
