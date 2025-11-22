document.addEventListener("DOMContentLoaded", () => {
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");
  const continuar1 = document.getElementById("continuar1");
  const continuar2 = document.getElementById("continuar2");
  const camposExtras = document.getElementById("camposExtras");
  const tipoConta = document.getElementById("tipoConta");
  const form = document.getElementById("register-form");

  continuar1.addEventListener("click", () => {
    const senha = document.getElementById("senha").value.trim();
    const confirmarSenha = document.getElementById("confirmarSenha").value.trim();

    if (senha !== confirmarSenha) {
      alert("As senhas não coincidem! Verifique e tente novamente.");
      return;
    }

    // Avança para o próximo passo
    step1.style.display = "none";
    step2.style.display = "block";
  });

  continuar2.addEventListener("click", () => {
    const tipo = tipoConta.value;

    if (!tipo) {
      alert("Selecione um tipo de conta.");
      return;
    }

    camposExtras.innerHTML = "";

    if (tipo === "cliente") {
      camposExtras.innerHTML = `
        <input type="text" placeholder="Endereço" required>
        <input type="text" placeholder="Número de telefone" required>
      `;
    } else if (tipo === "empresa") {
      camposExtras.innerHTML = `
        <input type="text" placeholder="Nome da empresa" required>
        <input type="text" placeholder="CNPJ" required>
        <input type="text" placeholder="Endereço comercial" required>
      `;
    } else if (tipo === "entregador") {
      camposExtras.innerHTML = `
        <input type="text" placeholder="Número da CNH" required>
        <input type="text" placeholder="Veículo (Ex: Moto, Carro, Bike)" required>
      `;
    }

    // Mostra o passo final
    step2.style.display = "none";
    step3.style.display = "block";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Conta criada com sucesso!");
    // Aqui você pode enviar os dados via fetch() para o backend Python
  });
});
