// static/scripts/dashboardEmpresa.js

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
  
  if(themeToggle){
      themeToggle.addEventListener("click", () => {
        const cur = root.getAttribute("data-theme") === "black" ? "light" : "black";
        root.setAttribute("data-theme", cur);
        localStorage.setItem(THEME_KEY, cur);
      });
  }

  // --- LOGOUT ---
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try { await fetch("/logout", { method: "POST" }); } catch(e){}
    window.location.href = "/login";
  });

  // menu navigation
  menu.addEventListener("click", (e) => {
    const li = e.target.closest(".menu-item");
    if (!li) return;
    [...menu.querySelectorAll(".menu-item")].forEach(m => m.classList.remove("active"));
    li.classList.add("active");
    
    const sectionName = li.dataset.section;
    showSection(sectionName);
    
    // Auto-load content based on section
    if(sectionName === 'products') loadProducts();
    if(sectionName === 'orders') loadOrders();
    if(sectionName === 'payouts') loadPayouts();
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
    try {
      const resp = await fetch("/empresa/dashboard", { credentials: "same-origin" });
      const data = await jsonOrNull(resp);
      if (data) {
        document.getElementById("statMonthSales").innerText = (data.total_credits_sold || 0);
        document.getElementById("statTotalOrders").innerText = (data.total_orders || 0);
        document.getElementById("statProducts").innerText = (data.total_products || 0);
        document.getElementById("statClients").innerText = "—"; // Não temos essa métrica ainda
        document.getElementById("enterpriseBalance").innerText = (data.balance || 0);
        return;
      }
    } catch (e) { console.error(e); }
    
    // fallback
    document.getElementById("statMonthSales").innerText = "—";
    document.getElementById("statTotalOrders").innerText = "—";
    document.getElementById("enterpriseBalance").innerText = "—";
  }

  // ---------------- PRODUCTS CRUD ----------------
  const productsList = document.getElementById("productsList");
  const productFormWrap = document.getElementById("productFormWrap");
  const productForm = document.getElementById("productForm");
  const productFormTitle = document.getElementById("productFormTitle");
  let editingProductId = null;
  const searchProduct = document.getElementById("searchProduct");

  // Botões para abrir modal
  document.getElementById("btnNewProduct").addEventListener("click", () => openProductForm());
  document.getElementById("createProductBtn").addEventListener("click", () => {
      // Navega para a aba produtos e abre o form
      menu.querySelector('[data-section="products"]').click();
      openProductForm();
  });
  
  // Botões de navegação rápida da home
  document.getElementById("openProductsBtn").addEventListener("click", () => menu.querySelector('[data-section="products"]').click());
  document.getElementById("openOrdersBtn").addEventListener("click", () => menu.querySelector('[data-section="orders"]').click());

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
      populateOverview(); // Atualiza contadores
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

  // Helper de imagem (igual cliente)
  function getImgSrc(prodName) {
    if (!prodName) return 'https://img.icons8.com/ios/100/meal.png';
    const cleanName = prodName.split(' ')[0];
    return `/static/img/${cleanName}.svg`;
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
      const imgSrc = getImgSrc(p.name);
      
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <img src="${imgSrc}" onerror="this.src='https://img.icons8.com/ios/100/meal.png'" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">
            <h4 style="margin:0">${p.name}</h4>
        </div>
        <div class="product-meta">R$ ${p.price_credits || 0} • ${ (p.ingredients||[]).slice(0,3).join(", ") }</div>
        <p style="font-size:0.8rem; color:#777; margin-bottom:10px;">${p.description || 'Sem descrição'}</p>
        <div class="actions-row">
          <button class="btn small" data-action="edit" data-id="${p.id}">Editar</button>
          <button class="btn ghost small" style="color:var(--danger); border-color:var(--danger);" data-action="delete" data-id="${p.id}">Excluir</button>
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
        if (!resp.ok) { alert("Erro ao excluir"); return; }
        loadProducts();
        populateOverview();
      } catch { alert("Erro ao conectar com o servidor"); }
    }
  });

  searchProduct && searchProduct.addEventListener("input", () => loadProducts());

  // ---------------- ORDERS ----------------
  const ordersListDOM = document.getElementById("ordersList"); // Renomeado para evitar conflito
  const filterOrderStatus = document.getElementById("filterOrderStatus");
  
  document.getElementById("refreshOrders").addEventListener("click", loadOrders);
  filterOrderStatus && filterOrderStatus.addEventListener("change", loadOrders);

  async function loadOrders() {
    ordersListDOM.innerHTML = '<p class="muted">Carregando pedidos...</p>';
    try {
      const resp = await fetch("/empresa/orders", { credentials: "same-origin" });
      let list = await jsonOrNull(resp) || [];
      const statusFilter = (filterOrderStatus && filterOrderStatus.value) || "";
      if (statusFilter) list = list.filter(o => o.status === statusFilter);
      
      // Ordena mais recentes
      list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      
      renderOrders(list);
    } catch {
      ordersListDOM.innerHTML = '<p class="muted">Erro ao carregar pedidos.</p>';
    }
  }

  function renderOrders(list) {
    if (!list.length) { ordersListDOM.innerHTML = '<p class="muted">Nenhum pedido encontrado.</p>'; return; }
    ordersListDOM.innerHTML = "";
    list.forEach(o => {
      const div = document.createElement("div");
      div.className = "order-card";
      
      // Descrição dos itens
      const itemsDesc = o.items.map(i => `${i.quantity}x ${i.product_name || i.name || 'Item'}`).join(", ");
      
      div.innerHTML = `
        <div class="order-info">
          <div>
            <strong>#${(o.order_id||"").slice(0,8)}</strong>
            <div class="meta" style="color:#333; margin-top:4px;">${itemsDesc}</div>
            <div class="meta">Cliente ID: ${o.user_id ? o.user_id.slice(0,8) : 'Anon'}</div>
          </div>
          <div style="text-align:right;">
             <div class="meta"><strong>${o.total_credits || 0} pts</strong></div>
             <div class="meta">${o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</div>
          </div>
        </div>
        <div class="order-actions" style="margin-top:15px; padding-top:10px; border-top:1px solid #eee;">
          <select data-order="${o.order_id}" class="status-select" style="padding:5px;">
            <option ${o.status==='pending'?'selected':''} value="pending">Pendente</option>
            <option ${o.status==='preparing'?'selected':''} value="preparing">Preparando</option>
            <option ${o.status==='ready_for_pickup'?'selected':''} value="ready_for_pickup">Pronto p/ Retirada</option>
            <option ${o.status==='out_for_delivery'?'selected':''} value="out_for_delivery">Saiu p/ Entrega</option>
            <option ${o.status==='delivered'?'selected':''} value="delivered">Entregue</option>
            <option ${o.status==='canceled'?'selected':''} value="canceled">Cancelado</option>
          </select>
          <button class="btn small" data-action="update" data-id="${o.order_id}">Atualizar Status</button>
        </div>
      `;
      ordersListDOM.appendChild(div);
    });
  }

  ordersListDOM.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='update']");
    if (!btn) return;
    const orderId = btn.dataset.id;
    const sel = btn.parentElement.querySelector(".status-select");
    const newStatus = sel && sel.value;
    if (!newStatus) return;
    
    btn.innerText = "...";
    try {
      const resp = await fetch(`/empresa/orders/${orderId}/status`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        credentials: "same-origin",
        body: JSON.stringify({status: newStatus})
      });
      if (!resp.ok) { alert("Erro ao atualizar"); return; }
      btn.innerText = "OK";
      setTimeout(() => loadOrders(), 500);
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
      
      out.innerText = "Solicitação enviada com sucesso!";
      document.getElementById("payoutAmount").value = "";
      populateOverview(); // Atualiza saldo
      loadPayouts();      // Atualiza lista (se implementada no futuro)
    } catch { out.innerText = "Erro ao conectar com o servidor"; }
  });

  // Placeholder para Payouts List (se não tiver endpoint, deixa quieto)
  async function loadPayouts() {
      // Se tiver rota /empresa/payouts, descomente:
      /*
      try {
        const resp = await fetch("/empresa/payouts"); 
        const list = await jsonOrNull(resp) || [];
        // Render list...
      } catch {}
      */
  }

  // ---------------- Startup ----------------
  function start() {
    populateOverview();
    // Carrega produtos em background para agilizar
    loadProducts(); 
  }

  start();
})();