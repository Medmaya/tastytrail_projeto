// dashboardCliente.js
// Consome API quando disponível; degrade gracioso se endpoints ausentes.
// Funcionalidades:
// - menu lateral funcional
// - theme toggle (localStorage)
// - fetch para /cliente/cart, /cliente/orders (tenta), /empresa/products (tenta)
// - popula estatísticas e cards

(function () {
  const root = document.getElementById("dashboardRoot");
  const menu = document.getElementById("menu");
  const sections = document.querySelectorAll(".section");
  const pageTitle = document.getElementById("pageTitle");
  const userCreditsEl = document.getElementById("userCredits");

  // utilities
  const jsonOrNull = async (resp) => {
    try {
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  };

  // --------------- THEME ---------------
  const THEME_KEY = "tasty_theme";
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  // initial
  const saved = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(saved);
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") === "black" ? "light" : "black";
    applyTheme(cur);
  });

  // --------------- MENU ---------------
  menu.addEventListener("click", (ev) => {
    const li = ev.target.closest(".menu-item");
    if (!li) return;
    [...menu.querySelectorAll(".menu-item")].forEach((m) => m.classList.remove("active"));
    li.classList.add("active");
    const section = li.dataset.section;
    showSection(section);
  });

  function showSection(name) {
    sections.forEach((s) => {
      s.classList.toggle("hidden", s.dataset.section !== name);
    });
    // update title
    const titles = {
      "overview": "Olá, cliente",
      "orders": "Meus pedidos",
      "restaurants": "Restaurantes",
      "order-now": "Pedir Agora"
    };
    pageTitle.innerText = titles[name] || "Dashboard";
  }

  // --------------- API calls & render ---------------
  async function fetchCart() {
    try {
      const resp = await fetch("/cliente/cart", { credentials: "same-origin" });
      return await jsonOrNull(resp);
    } catch (e) {
      return null;
    }
  }

  async function fetchOrders() {
    // tentar rota cliente/orders (caso exista). se não, fallback nulo.
    try {
      const resp = await fetch("/cliente/orders", { credentials: "same-origin" });
      return await jsonOrNull(resp);
    } catch (e) {
      return null;
    }
  }

  async function fetchProducts() {
    // tentar rota pública de produtos (may require auth); fallback para vazio
    try {
      const resp = await fetch("/empresa/products", { credentials: "same-origin" });
      return await jsonOrNull(resp);
    } catch (e) {
      return null;
    }
  }

  // render helpers
  function renderLastOrder(order) {
    const box = document.getElementById("lastOrderBox");
    box.innerHTML = "";
    if (!order) {
      box.innerHTML = '<p class="muted">Nenhum pedido recente.</p>';
      return;
    }
    const container = document.createElement("div");
    container.className = "order-row";
    container.innerHTML = `
      <img src="${order.items && order.items[0] && order.items[0].image || 'https://placehold.co/120x120'}" alt="item" />
      <div>
        <h4>${order.items && order.items[0] && order.items[0].name || 'Pedido #' + (order.order_id||'')}</h4>
        <p>Restaurante: ${order.items && order.items[0] && (order.items[0].enterprise_name||'—')}</p>
        <p>Status: <span class="status ${order.status || ''}">${order.status || '—'}</span></p>
        <div style="margin-top:.5rem">
          <button class="btn" data-order="${order.order_id}">Ver detalhes</button>
        </div>
      </div>
    `;
    box.appendChild(container);
  }

  function renderOrdersList(orders) {
    const box = document.getElementById("ordersBox");
    box.innerHTML = "";
    if (!orders || !orders.length) {
      box.innerHTML = '<p class="muted">Você ainda não fez pedidos.</p>';
      return;
    }
    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `<thead><tr><th>Nº</th><th>Produto</th><th>Restaurante</th><th>Valor (cred)</th><th>Status</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    orders.slice().reverse().forEach((o, i) => {
      const first = (o.items && o.items[0]) || {};
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>#${o.order_id ? o.order_id.slice(0,6) : i+1}</td>
        <td>${first.name || '—'}</td>
        <td>${first.enterprise_name || '—'}</td>
        <td>${o.total_credits || '—'}</td>
        <td><span class="status ${o.status||''}">${o.status||'—'}</span></td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  function renderRestaurants(products) {
    const box = document.getElementById("restaurantsBox");
    box.innerHTML = "";
    if (!products || !products.length) {
      box.innerHTML = '<p class="muted">Nenhum restaurante/produto disponível.</p>';
      return;
    }
    // agrupar por enterprise_id
    const groups = {};
    products.forEach(p=>{
      const eid = p.enterprise_id || 'unknown';
      groups[eid] = groups[eid] || [];
      groups[eid].push(p);
    });
    for (const eid in groups) {
      const panel = document.createElement("div");
      panel.className = "panel";
      panel.style.marginBottom = ".8rem";
      panel.innerHTML = `<h4 style="margin:0 0 .5rem 0">${groups[eid][0].enterprise_name || 'Restaurante'}</h4>`;
      const grid = document.createElement("div");
      grid.className = "recommended-grid";
      groups[eid].forEach(p=>{
        const card = document.createElement("div");
        card.className = "rec-card";
        card.innerHTML = `<img src="${p.image||'https://placehold.co/320x200'}" alt="${p.name}">
                          <h4>${p.name}</h4>
                          <p>${p.description || ''}</p>
                          <div style="display:flex;gap:.4rem;margin-top:.4rem">
                            <button class="mini-btn" data-pid="${p.id}" data-action="add">Adicionar</button>
                            <button class="mini-btn" data-pid="${p.id}" data-action="buy">Comprar</button>
                          </div>`;
        grid.appendChild(card);
      });
      panel.appendChild(grid);
      box.appendChild(panel);
    }
  }

  function renderRecommended(products){
    const container = document.getElementById("recommendedGrid");
    const orderNow = document.getElementById("orderNowGrid");
    container.innerHTML = ""; orderNow.innerHTML = "";
    if (!products || !products.length) {
      container.innerHTML = '<p class="muted">Nenhuma recomendação por enquanto.</p>';
      return;
    }
    products.slice(0,6).forEach(p=>{
      const card = document.createElement("div");
      card.className = "rec-card";
      card.innerHTML = `
        <img src="${p.image||'https://placehold.co/320x200'}" alt="${p.name}" />
        <h4>${p.name}</h4>
        <p>${p.enterprise_name || ''}</p>
        <button class="mini-btn" data-pid="${p.id}" data-action="add">Pedir</button>
      `;
      container.appendChild(card);

      // also in order-now
      const card2 = card.cloneNode(true);
      orderNow.appendChild(card2);
    });
  }

  // attach global click for add-to-cart
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-action='add']");
    if (!btn) return;
    const pid = btn.dataset.pid;
    // add to cart via API
    try {
      const resp = await fetch("/cliente/cart/add", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({product_id: pid, quantity: 1}),
        credentials: "same-origin"
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || "Erro ao adicionar ao carrinho");
        return;
      }
      alert("Adicionado ao carrinho ✅");
      // refresh cart/orders overview
      populateOverview();
    } catch (e) {
      alert("Erro ao conectar com o servidor");
    }
  });

  // --------------- populate overview ---------------
  async function populateOverview() {
    // cart -> usado para contar itens
    const cart = await fetchCart();
    const cartCount = cart ? cart.length : 0;

    // orders -> tente carregar pedidos (rota opcional)
    const orders = await fetchOrders(); // pode ser null
    const ordersCount = orders ? orders.length : 0;
    const lastOrder = orders && orders.length ? orders[orders.length - 1] : null;

    // products (recommended)
    const products = await fetchProducts();

    // now fill UI
    document.getElementById("statOrders").innerText = ordersCount || cartCount || 0;
    document.getElementById("statSpent").innerText = (orders && orders.reduce((s,o)=>s + (parseInt(o.total_credits||0)||0),0)) ? `R$ ${ (orders.reduce((s,o)=>s + (parseInt(o.total_credits||0)||0),0)).toFixed(2) }` : "R$ 0,00";
    document.getElementById("statReviews").innerText = "—";
    document.getElementById("statRewards").innerText = "—";

    // credits: try to fetch from /user/profile or it's embedded in DOM via template; fallback: —
    try {
      const uresp = await fetch("/me", { credentials: "same-origin" });
      const ujson = await jsonOrNull(uresp);
      if (ujson && ujson.credits !== undefined) userCreditsEl.innerText = ujson.credits;
      else userCreditsEl.innerText = '—';
    } catch {
      userCreditsEl.innerText = '—';
    }

    renderLastOrder(lastOrder);
    renderRecommended(products && Array.isArray(products) ? products : []);
    // for orders page
    renderOrdersList(orders || []);
    // restaurants
    renderRestaurants(products || []);
  }

  // initial
  showSection("overview");
  populateOverview();
})();
