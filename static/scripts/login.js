document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.email.value;
    const password = form.password.value;

    const resp = await fetch("http://127.0.0.1:5000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      alert(data.error || "Erro ao fazer login");
      return;
    }

    if (data.role === "cliente") {
      window.location.href = "/cliente";
    } else if (data.role === "empresa") {
      window.location.href = "/empresa";
    } else if (data.role === "entregador") {
      window.location.href = "/entregador";
    } else if (data.role === "admin") {
      window.location.href = "/admin";
    } else {
      alert("Login feito, mas tipo desconhecido.");
    }
  });
});
