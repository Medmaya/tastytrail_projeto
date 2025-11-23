// dashboardEmpresa.js
// Consome rotas: /empresa/dashboard, /empresa/products, /empresa/orders, /empresa/payout/request
// Fornece CRUD básico para produtos (POST /empresa/products, PUT /empresa/products/:id, DELETE /empresa/products/:id)
// e atualização de status de pedidos (PUT /empresa/orders/<order_id>/status)

(function () {
  const root = document.getElementById("empresaRoot");
  const menu = document.getElementById("menu");
  const sections = document.querySelectorAll(".section");
  const refreshBtn = document.getElementById("refreshBtn");
  const themeToggle = document.getElementById("themeToggle");

  const THEME_KEY = "tasty_theme_e";

  // apply saved theme
  const saved = localStorage.getItem(THEME_KEY) || "light";
  root.setAttribute("data-theme", saved);
  themeToggle.addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") === "black" ? "light" : "black";
    root.setAttribute("data-theme", cur);
    localStorage.setItem(THEME_KEY, cur);
  });

  // menu navigation
  menu.addEventListener("click", (e) => {
    const li = e.target.closest(".menu-item");
    if (!li) return;
    [...menu.querySelectorAll(".menu-item")].forEach(m => m.classList.remove("active"));
    li.classList.add("active");
    showSection(li.dataset.section);
  });

  function showSection(name) {
    sections.forEach(s => s.classList.toggle("hidden", s.id !== `section-${name}`));
  }

  // refresh button
  refreshBtn.addEventListener("click", populateOverview);

  // ---------------- API helpers ----------------
  const jsonOrNull = async (resp) => {
    try {
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  };

  // fetch overview
  async function populateOverview() {
    // attempt to fetch /empresa/dashboard
    try {
      const resp = await fetch("/empresa/dashboard", { credentials: "same-origin" });
      const data = await jsonOrNull(resp);
      if (data) {
        document.getElementById("statMonthSales").innerText = (data.total_credits || 0);
        document.getElementById("statTotalOrders").innerText = (data.total_orders || 0);
        document.getElementById("statProducts").innerText = (data.total_products || 0);
        document.getElementById("statClients").innerText = (data.total_clients || "—");
        document.getElementById("enterpriseBalance").innerText = (data.balance || 0);
        return;
      }
    } catch (e) { /* ignore */ }
    // fallback: placeholders
    document.getElementById("statMonthSales").innerText = "—";
    document.getElementById("statTotalOrders").innerText = "—";
    document.getElementById("statProducts").innerText = "—";
    document.getElementById("statClients").innerText = "—";
    document.getElementById("enterpriseBalance").innerText = "—";
  }

  // ---------------- PRODUCTS CRUD ----------------
  const productsList = document.getElementById("productsList");
  const productFormWrap = document.getElementById("productFormWrap");
  const productForm = document.getElementById("productForm");
  const productFormTitle = document.getElementById("productFormTitle");
  let editingProductId = null;
  const searchProduct = document.getElementById("searchProduct");

  document.getElementById("btnNewProduct").addEventListener("click", () => openProductForm());
  document.getElementById("createProductBtn").addEventListener("click", () => openProductForm());
  document.getElementById("openProductsBtn").addEventListener("click", () => {
    [...menu.querySelectorAll(".menu-item")].forEach(m => m.classList.remove("active"));
    menu.querySelector('[data-section="products"]').classList.add("active");
    showSection("products");
    loadProducts();
  });

  document.getElementById("cancelProduct").addEventListener("click", () => {
    closeProductForm();
  });

  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(productForm);
    const payload = {
      name: fd.get("name"),
      price_credits: Number(fd.get("price_credits") || 0),
      description: fd.get("description") || "",
      ingredients: (fd.get("ingredients") || "").split(",").map(s => s.trim()).filter(Boolean)
    };

    try {
      let resp;
      if (editingProductId) {
        resp = await fetch(`/empresa/products/${editingProductId}`, {
          method: "PUT",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(payload),
          credentials: "same-origin"
        });
      } else {
        resp = await fetch("/empresa/products", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(payload),
          credentials: "same-origin"
        });
      }
      const data = await jsonOrNull(resp);
      if (!resp.ok) {
        alert(data && data.error ? data.error : "Erro ao salvar produto");
        return;
      }
      closeProductForm();
      loadProducts();
    } catch (err) {
      alert("Erro ao conectar com o servidor");
    }
  });

  function openProductForm(product) {
    productFormWrap.classList.remove("hidden");
    if (product) {
      editingProductId = product.id;
      productFormTitle.innerText = "Editar produto";
      productForm.name.value = product.name || "";
      productForm.price_credits.value = product.price_credits || 0;
      productForm.description.value = product.description || "";
      productForm.ingredients.value = (product.ingredients || []).join(", ");
    } else {
      editingProductId = null;
      productFormTitle.innerText = "Novo produto";
      productForm.reset();
    }
  }
  function closeProductForm() {
    editingProductId = null;
    productFormWrap.classList.add("hidden");
    productForm.reset();
  }

  async function loadProducts() {
    productsList.innerHTML = '<p class="muted">Carregando produtos...</p>';
    try {
      const resp = await fetch("/empresa/products", { credentials: "same-origin" });
      const list = await jsonOrNull(resp) || [];
      renderProducts(list);
    } catch {
      productsList.innerHTML = '<p class="muted">Erro ao carregar produtos.</p>';
    }
  }

  function renderProducts(list) {
    const q = (searchProduct && searchProduct.value || "").toLowerCase();
    const filtered = list.filter(p => !q || (p.name || "").toLowerCase().includes(q));
    if (!filtered.length) {
      productsList.innerHTML = '<p class="muted">Nenhum produto encontrado.</p>'; return;
    }
    productsList.innerHTML = "";
    filtered.forEach(p => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <h4>${p.name}</h4>
        <div class="product-meta">R$ ${p.price_credits || 0} • ${ (p.ingredients||[]).slice(0,3).join(", ") }</div>
        <div class="actions-row">
          <button class="btn small" data-action="edit" data-id="${p.id}">Editar</button>
          <button class="btn ghost small" data-action="delete" data-id="${p.id}">Excluir</button>
        </div>
      `;
      productsList.appendChild(card);
    });
  }

  productsList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === "edit") {
      // fetch product detail from /empresa/products? (we have list locally; fetch again)
      try {
        const resp = await fetch("/empresa/products", { credentials: "same-origin" });
        const list = await jsonOrNull(resp) || [];
        const p = list.find(x => x.id === id);
        if (p) openProductForm(p);
      } catch { alert("Erro ao abrir produto"); }
    } else if (action === "delete") {
      if (!confirm("Confirma exclusão do produto?")) return;
      try {
        const resp = await fetch(`/empresa/products/${id}`, { method: "DELETE", credentials: "same-origin" });
        const data = await jsonOrNull(resp);
        if (!resp.ok) { alert(data && data.error ? data.error : "Erro ao excluir"); return; }
        loadProducts();
      } catch { alert("Erro ao conectar com o servidor"); }
    }
  });

  searchProduct && searchProduct.addEventListener("input", () => loadProducts());

  // ---------------- ORDERS ----------------
  const ordersList = document.getElementById("ordersList");
  const filterOrderStatus = document.getElementById("filterOrderStatus");
  document.getElementById("openOrdersBtn").addEventListener("click", () => {
    [...menu.querySelectorAll(".menu-item")].forEach(m => m.classList.remove("active"));
    menu.querySelector('[data-section="orders"]').classList.add("active");
    showSection("orders");
    loadOrders();
  });
  document.getElementById("refreshOrders").addEventListener("click", loadOrders);
  filterOrderStatus && filterOrderStatus.addEventListener("change", loadOrders);

  async function loadOrders() {
    ordersList.innerHTML = '<p class="muted">Carregando pedidos...</p>';
    try {
      const resp = await fetch("/empresa/orders", { credentials: "same-origin" });
      let list = await jsonOrNull(resp) || [];
      const statusFilter = (filterOrderStatus && filterOrderStatus.value) || "";
      if (statusFilter) list = list.filter(o => o.status === statusFilter);
      renderOrders(list);
    } catch {
      ordersList.innerHTML = '<p class="muted">Erro ao carregar pedidos.</p>';
    }
  }

  function renderOrders(list) {
    if (!list.length) { ordersList.innerHTML = '<p class="muted">Nenhum pedido encontrado.</p>'; return; }
    ordersList.innerHTML = "";
    list.forEach(o => {
      const div = document.createElement("div");
      div.className = "order-card";
      div.innerHTML = `
        <div class="order-info">
          <div>
            <strong>#${(o.order_id||"").slice(0,8)}</strong>
            <div class="meta">${(o.items && o.items[0] && o.items[0].name) || '—'}</div>
            <div class="meta">Cliente: ${o.user_id || '—'}</div>
          </div>
          <div class="meta">Total: ${o.total_credits || 0} • ${o.created_at || ''}</div>
        </div>
        <div class="order-actions">
          <select data-order="${o.order_id}" class="status-select">
            <option ${o.status==='pending'?'selected':''} value="pending">Pendente</option>
            <option ${o.status==='out_for_delivery'?'selected':''} value="out_for_delivery">Em entrega</option>
            <option ${o.status==='delivered'?'selected':''} value="delivered">Entregue</option>
            <option ${o.status==='canceled'?'selected':''} value="canceled">Cancelado</option>
          </select>
          <button class="btn small" data-action="update" data-id="${o.order_id}">Atualizar</button>
        </div>
      `;
      ordersList.appendChild(div);
    });
  }

  // handle update status
  ordersList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='update']");
    if (!btn) return;
    const orderId = btn.dataset.id;
    const sel = btn.parentElement.querySelector(".status-select");
    const newStatus = sel && sel.value;
    if (!newStatus) return;
    try {
      const resp = await fetch(`/empresa/orders/${orderId}/status`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        credentials: "same-origin",
        body: JSON.stringify({status: newStatus})
      });
      const data = await jsonOrNull(resp);
      if (!resp.ok) { alert(data && data.error ? data.error : "Erro ao atualizar"); return; }
      alert("Status atualizado");
      loadOrders();
    } catch { alert("Erro ao conectar com o servidor"); }
  });

  // ---------------- PAYOUT ----------------
  document.getElementById("requestPayoutBtn").addEventListener("click", async () => {
    const amount = Number(document.getElementById("payoutAmount").value || 0);
    const out = document.getElementById("payoutResult");
    out.innerText = "Enviando...";
    if (!amount || amount <= 0) { out.innerText = "Valor inválido"; return; }
    try {
      const resp = await fetch("/empresa/payout/request", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        credentials: "same-origin",
        body: JSON.stringify({amount})
      });
      const data = await jsonOrNull(resp);
      if (!resp.ok) { out.innerText = data && data.error ? data.error : "Erro ao solicitar saque"; return; }
      out.innerText = "Solicitação enviada";
      loadPayouts();
    } catch { out.innerText = "Erro ao conectar com o servidor"; }
  });

  async function loadPayouts() {
    try {
      const resp = await fetch("/empresa/payouts", { credentials: "same-origin" });
      const list = await jsonOrNull(resp) || [];
      const div = document.getElementById("payoutsList");
      if (!list.length) { div.innerHTML = '<p class="muted">Nenhum saque solicitado.</p>'; return; }
      div.innerHTML = list.map(p => `<div>${p.payout_id.slice(0,8)} — ${p.amount} — ${p.status}</div>`).join("");
    } catch { document.getElementById("payoutsList").innerHTML = '<p class="muted">Erro ao carregar histórico.</p>'; }
  }

  // ---------------- startup ----------------
  function start() {
    populateOverview();
    // bind quick loads
    loadProducts();
    loadOrders();
    loadPayouts();
    // default view already overview
    showSection("overview");
  }

  start();
})();
