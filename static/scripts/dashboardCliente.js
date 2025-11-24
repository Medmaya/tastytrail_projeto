// static/scripts/dashboardCliente.js

(function () {
  // Referências do DOM
  const root = document.getElementById("dashboardRoot");
  const menu = document.getElementById("menu");
  const sections = document.querySelectorAll(".section");
  const pageTitle = document.getElementById("pageTitle");
  const userCreditsEl = document.getElementById("userCredits");
  
  // Botão Checkout
  const btnCheckout = document.getElementById("btnCheckout");
  const cartCounter = document.getElementById("cartCounter");

  // Estatísticas DOM
  const statOrders = document.getElementById("statOrders");
  const statSpent = document.getElementById("statSpent");
  const statReviews = document.getElementById("statReviews");
  const statRewards = document.getElementById("statRewards");

  // Containers
  const lastOrderBox = document.getElementById("lastOrderBox");
  const recommendedGrid = document.getElementById("recommendedGrid");
  const ordersBox = document.getElementById("ordersBox");
  const restaurantsBox = document.getElementById("restaurantsBox");
  const orderNowGrid = document.getElementById("orderNowGrid");

  // --- Utilities ---
  const jsonOrNull = async (resp) => {
    try {
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) { return null; }
  };

  // --- THEME ---
  const THEME_KEY = "tasty_theme";
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  const saved = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(saved);
  
  const themeToggle = document.getElementById("themeToggle");
  if(themeToggle){
    themeToggle.addEventListener("click", () => {
        const cur = root.getAttribute("data-theme") === "black" ? "light" : "black";
        applyTheme(cur);
    });
  }

  // --- MENU NAVIGATION ---
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
    const titles = {
      "overview": "Visão Geral",
      "orders": "Meus Pedidos",
      "restaurants": "Restaurantes",
      "order-now": "Cardápio Completo"
    };
    pageTitle.innerText = titles[name] || "Dashboard";
  }

  // =========================================================
  // 🔹 LOGOUT (CORRIGIDO)
  // =========================================================
  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn){
      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault(); // Evita navegação padrão se for link
        try {
            // Tenta avisar o backend
            await fetch("/logout", { method: "POST" });
        } catch(e) {
            console.log("Logout offline ou erro de rede");
        } finally {
            // Força redirecionamento independente do resultado
            window.location.href = "/login";
        }
      });
  }

  // =========================================================
  // 🔹 API CALLS
  // =========================================================

  async function fetchProfile() {
    const data = await jsonOrNull(await fetch("/cliente/me", { credentials: "same-origin" }));
    return data;
  }

  async function fetchCart() {
    const data = await jsonOrNull(await fetch("/cliente/cart", { credentials: "same-origin" }));
    return Array.isArray(data) ? data : [];
  }

  async function fetchOrders() {
    const data = await jsonOrNull(await fetch("/cliente/orders", { credentials: "same-origin" }));
    return Array.isArray(data) ? data : [];
  }

  async function fetchProducts() {
    const data = await jsonOrNull(await fetch("/cliente/products", { credentials: "same-origin" }));
    return Array.isArray(data) ? data : [];
  }

  async function addToCartAPI(pid) {
    try {
      const resp = await fetch("/cliente/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: pid, quantity: 1 }),
        credentials: "same-origin"
      });
      
      if (resp.status === 401) {
        window.location.href = "/login";
        return false;
      }
      
      if (!resp.ok) {
        const err = await resp.json();
        alert("Erro: " + (err.error || "Falha ao adicionar"));
        return false;
      }
      return true;
    } catch (e) {
      alert("Erro de conexão");
      return false;
    }
  }

  // =========================================================
  // 🔹 CHECKOUT (NOVO)
  // =========================================================
  
  // Botão flutuante de finalizar
  btnCheckout.addEventListener("click", async () => {
      if(!confirm("Deseja finalizar a compra com os itens do carrinho?")) return;

      const originalText = btnCheckout.innerText;
      btnCheckout.innerText = "Processando...";
      btnCheckout.disabled = true;

      try {
          const resp = await fetch("/cliente/order", { 
              method: "POST", 
              headers: {"Content-Type": "application/json"},
              credentials: "same-origin" 
          });
          
          const data = await resp.json();

          if(resp.ok) {
              alert("✅ Pedido realizado com sucesso!");
              populateDashboard(); // Atualiza tudo
          } else {
              alert("❌ Erro: " + (data.error || "Saldo insuficiente ou erro no servidor."));
          }
      } catch(e) {
          alert("Erro de rede ao finalizar pedido.");
      } finally {
          btnCheckout.innerText = originalText;
          btnCheckout.disabled = false;
      }
  });

  function updateCartUI(cartItems) {
      const count = cartItems.length;
      cartCounter.innerText = count;
      
      // Mostra ou esconde o botão flutuante
      if(count > 0) {
          btnCheckout.classList.remove("hidden");
      } else {
          btnCheckout.classList.add("hidden");
      }
  }

  // =========================================================
  // 🔹 RENDER FUNCTIONS
  // =========================================================

  function getImgSrc(prodName) {
    if (!prodName) return 'https://img.icons8.com/ios/100/meal.png';
    const cleanName = prodName.split(' ')[0];
    return `/static/img/${cleanName}.svg`;
  }

  function renderLastOrder(order) {
    lastOrderBox.innerHTML = "";
    if (!order) {
      lastOrderBox.innerHTML = '<p class="muted" style="padding:20px;">Você ainda não fez nenhum pedido.</p>';
      return;
    }

    const firstItem = (order.items && order.items[0]) || {};
    const imgUrl = getImgSrc(firstItem.product_name);
    const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : 'Hoje';

    const div = document.createElement("div");
    div.className = "order-row";
    div.innerHTML = `
      <img src="${imgUrl}" onerror="this.src='https://img.icons8.com/ios/100/meal.png'" alt="item" />
      <div>
        <h4>Pedido #${order.order_id.slice(0,8)}</h4>
        <p class="muted">Data: ${dateStr}</p>
        <p>Total: <strong>${order.total_credits} créditos</strong></p>
        <div style="margin-top:5px;">
             <span class="status ${order.status}">${translateStatus(order.status)}</span>
        </div>
      </div>
    `;
    lastOrderBox.appendChild(div);
  }

  function renderOrdersTable(orders) {
    ordersBox.innerHTML = "";
    if (!orders || orders.length === 0) {
      ordersBox.innerHTML = '<p class="muted" style="padding:20px;">Nenhum pedido encontrado.</p>';
      return;
    }

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `<thead><tr><th>ID</th><th>Detalhes</th><th>Total</th><th>Status</th><th>Data</th></tr></thead>`;
    const tbody = document.createElement("tbody");

    orders.forEach(o => {
        const tr = document.createElement("tr");
        const itemsDesc = o.items ? o.items.length + " itens" : "Ver detalhes";
        tr.innerHTML = `
            <td>#${o.order_id.slice(0,8)}</td>
            <td>${itemsDesc}</td>
            <td>${o.total_credits} pts</td>
            <td><span class="status ${o.status}">${translateStatus(o.status)}</span></td>
            <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    ordersBox.appendChild(table);
  }

  function renderRestaurants(products) {
    restaurantsBox.innerHTML = "";
    orderNowGrid.innerHTML = "";
    recommendedGrid.innerHTML = "";

    if(!products || products.length === 0) {
        restaurantsBox.innerHTML = '<p class="muted">Nenhum restaurante cadastrado.</p>';
        return;
    }

    const groups = {};
    products.forEach(p => {
        const name = p.enterprise_name || "Outros";
        if(!groups[name]) groups[name] = [];
        groups[name].push(p);
        
        // Popula grid de "Pedir Agora" (lista plana)
        orderNowGrid.appendChild(createProductCard(p));
    });

    // Popula Recomendados (4 primeiros)
    products.slice(0, 4).forEach(p => recommendedGrid.appendChild(createProductCard(p)));

    // Popula Restaurantes (Agrupado)
    for (const [entName, prods] of Object.entries(groups)) {
        const panel = document.createElement("div");
        panel.className = "panel";
        panel.style.marginBottom = "20px";
        panel.innerHTML = `<h3 style="border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:15px;">${entName}</h3>`;
        
        const grid = document.createElement("div");
        grid.className = "recommended-grid";
        
        prods.forEach(p => grid.appendChild(createProductCard(p)));
        panel.appendChild(grid);
        restaurantsBox.appendChild(panel);
    }
  }

  function createProductCard(p) {
      const card = document.createElement("div");
      card.className = "rec-card";
      const imgUrl = getImgSrc(p.name);
      
      card.innerHTML = `
        <img src="${imgUrl}" onerror="this.src='https://img.icons8.com/ios/100/meal.png'" alt="${p.name}" />
        <h4>${p.name}</h4>
        <p class="muted" style="font-size:0.8rem">${p.description ? p.description.slice(0,25)+'...' : 'Delicioso'}</p>
        <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center; width:100%;">
            <strong style="color:var(--primary)">${p.price_credits} pts</strong>
            <button class="mini-btn" data-action="add" data-pid="${p.id}">Add</button>
        </div>
      `;
      return card;
  }

  function translateStatus(st) {
      const map = { 'pending': 'Pendente', 'preparing': 'Preparando', 'ready_for_pickup': 'Pronto', 'out_for_delivery': 'Em rota', 'delivered': 'Entregue', 'canceled': 'Cancelado' };
      return map[st] || st;
  }

  // =========================================================
  // 🔹 CORE LOGIC (POPULATE)
  // =========================================================

  async function populateDashboard() {
    const [profile, cart, orders, products] = await Promise.all([
        fetchProfile(), fetchCart(), fetchOrders(), fetchProducts()
    ]);

    // 1. UI Header
    if(profile) {
        userCreditsEl.innerText = profile.credits;
    }

    // 2. Carrinho (Controla botão checkout)
    updateCartUI(cart);

    // 3. Pedidos
    const orderCount = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + (o.total_credits || 0), 0);
    
    statOrders.innerText = orderCount;
    statSpent.innerText = totalSpent + " pts";
    statRewards.innerText = Math.floor(totalSpent * 0.1) + " pts";
    statReviews.innerText = "0";

    renderLastOrder(orderCount > 0 ? orders[0] : null);
    renderOrdersTable(orders);

    // 4. Produtos
    renderRestaurants(products);
  }

  // =========================================================
  // 🔹 CLICK HANDLER GLOBAL (Add to Cart)
  // =========================================================
  document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-action='add']");
      if(!btn) return;

      const originalText = btn.innerText;
      btn.innerText = "⏳";
      btn.disabled = true;
      
      const success = await addToCartAPI(btn.dataset.pid);
      
      if(success) {
          btn.innerText = "✔";
          // Recarrega apenas o carrinho para atualizar contador
          const newCart = await fetchCart();
          updateCartUI(newCart);
          
          setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 800);
      } else {
          btn.innerText = "Erro";
          setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 1000);
      }
  });

  // Inicializa
  showSection("overview");
  populateDashboard();

})();