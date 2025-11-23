// entregador.js
// Fetching endpoints using session cookies: credentials 'same-origin'
const API_ROOT = ""; // mesma origem

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  bindButtons();
  loadAll();
  // poll a cada 12s
  setInterval(loadAssignedAndBalance, 12000);
});

function initMenu() {
  document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".menu-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const s = btn.dataset.section;
      document.querySelectorAll(".section").forEach(sec=>{
        sec.classList.toggle("active", sec.id === s);
      });
      // alterar titulo
      document.querySelector(".page-title").innerText = btn.innerText.replace(/^[^\s]+\s*/, '');
    });
  });
  document.getElementById("refreshBtn").addEventListener("click", loadAll);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
}

function bindButtons(){
  // delegated events for accept/complete (buttons created dynamically)
  document.addEventListener("click", async (ev) => {
    const accept = ev.target.closest(".btn-accept");
    if (accept) {
      const card = accept.closest(".order-card");
      const id = card.dataset.orderId;
      await acceptOrder(id, card);
      return;
    }
    const complete = ev.target.closest(".btn-complete");
    if (complete) {
      const card = complete.closest(".order-card");
      const id = card.dataset.orderId;
      await completeOrder(id, card);
      return;
    }
  });
}

async function loadAll(){
  await Promise.all([loadAssignedAndBalance(), loadAvailable(), loadHistory()]);
  renderChart([]);
}

// FETCH assigned orders + balance
async function loadAssignedAndBalance(){
  try {
    const [assignedResp, balResp] = await Promise.all([
      fetch(API_ROOT + "/entregador/assigned", { credentials: 'same-origin' }),
      fetch(API_ROOT + "/entregador/balance", { credentials: 'same-origin' })
    ]);
    if (assignedResp.ok) {
      const assigned = await assignedResp.json();
      renderAssigned(assigned);
    } else {
      renderAssigned([]);
    }

    if (balResp.ok) {
      const b = await balResp.json();
      document.getElementById("balanceValue").innerText = `R$ ${b.balance || 0}`;
    } else {
      document.getElementById("balanceValue").innerText = "R$ —";
    }
  } catch (err) {
    console.error("Erro carregar assigned/balance:", err);
  }
}

async function loadAvailable(){
  // tenta rota opcional /entregador/available — se não existir, oculta painel
  try {
    const resp = await fetch(API_ROOT + "/entregador/available", { credentials: 'same-origin' });
    const note = document.getElementById("availableNote");
    const list = document.getElementById("availableList");
    if (!resp.ok) {
      note.innerText = "Sem rota de pedidos disponíveis no backend (recurso opcional).";
      list.hidden = true;
      return;
    }
    const data = await resp.json();
    note.hidden = true;
    list.hidden = false;
    renderAvailable(data);
  } catch (err) {
    // rota não existe / erro CORS / 404 — exibe nota
    document.getElementById("availableNote").innerText = "Pedidos disponíveis não implementados no backend.";
    document.getElementById("availableList").hidden = true;
  }
}

async function loadHistory(){
  // aqui reusa assigned como base (apenas demo) — idealmente backend fornece /entregador/history
  try {
    const resp = await fetch(API_ROOT + "/entregador/assigned", { credentials: 'same-origin' });
    if (!resp.ok) return renderHistory([]);
    const data = await resp.json();
    // marcar only delivered orders for history? fallback: empty
    const hist = (data || []).filter(o => o.status === "delivered");
    renderHistory(hist);
  } catch (err) {
    renderHistory([]);
  }
}

function cardFromOrder(o, isAssigned = false){
  const tpl = document.getElementById("orderCardTpl").content.cloneNode(true);
  const container = tpl.querySelector(".order-card");
  container.dataset.orderId = o.order_id || o.orderId || o.id || o.orderId;
  tpl.querySelector(".order-id").innerText = `#${o.order_id || o.orderId || o.id || '—'}`;
  tpl.querySelector(".order-info").innerText = (o.items && o.items.length) ? `${o.items.length} item(s)` : (o.description || "Pedido");
  tpl.querySelector(".order-address").innerText = o.address || o.delivery_address || o.address_line || (o.items && o.items[0] && o.items[0].address) || "Endereço não informado";
  tpl.querySelector(".order-meta").innerText = `Status: ${o.status || '—'}`;
  // buttons visibility
  const acceptBtn = tpl.querySelector(".btn-accept");
  const completeBtn = tpl.querySelector(".btn-complete");
  if (isAssigned) {
    acceptBtn.style.display = "none";
    completeBtn.style.display = "";
  } else {
    acceptBtn.style.display = "";
    completeBtn.style.display = "none";
  }
  return tpl;
}

function renderAssigned(list){
  const el = document.getElementById("ongoingList");
  el.innerHTML = "";
  if (!list || list.length === 0) {
    el.innerHTML = `<div class="muted">Nenhuma entrega atribuída no momento.</div>`;
    return;
  }
  list.forEach(o => {
    el.appendChild(cardFromOrder(o, true));
  });
}

function renderAvailable(list){
  const el = document.getElementById("availableList");
  el.innerHTML = "";
  if (!list || list.length === 0) {
    el.innerHTML = `<div class="muted">Nenhum pedido disponível agora.</div>`;
    return;
  }
  list.forEach(o => el.appendChild(cardFromOrder(o, false)));
}

function renderHistory(list){
  const el = document.getElementById("historyList");
  el.innerHTML = "";
  if (!list || list.length === 0) {
    el.innerHTML = `<div class="muted">Nenhum histórico encontrado.</div>`;
    return;
  }
  list.forEach(o => {
    const node = cardFromOrder(o, true);
    // hide actions
    node.querySelector(".order-actions").remove();
    el.appendChild(node);
  });
}

async function acceptOrder(orderId, cardEl){
  try {
    const resp = await fetch(`/entregador/assign/${orderId}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json'}
    });
    if (!resp.ok) {
      const d = await resp.json().catch(()=>({error:'erro'}));
      alert(d.error || 'Erro ao aceitar pedido');
      return;
    }
    const d = await resp.json();
    // move card to ongoing list
    loadAssignedAndBalance();
    loadAvailable();
  } catch (err) {
    console.error(err);
    alert('Erro ao aceitar pedido');
  }
}

async function completeOrder(orderId, cardEl){
  try {
    const resp = await fetch(`/entregador/complete/${orderId}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json'}
    });
    if (!resp.ok) {
      const d = await resp.json().catch(()=>({error:'erro'}));
      alert(d.error || 'Erro ao completar pedido');
      return;
    }
    loadAssignedAndBalance();
    loadHistory();
  } catch (err) {
    console.error(err);
    alert('Erro ao completar pedido');
  }
}

function renderChart(dataPoints){
  // exemplo demo: random ou dataPoints
  const labels = ['6d','5d','4d','3d','2d','1d','hoje'];
  const data = dataPoints.length ? dataPoints : [40,60,20,90,45,70,120];
  const ctx = document.getElementById('earningsChart');
  if (!ctx) return;
  if (ctx.chart) {
    ctx.chart.data.datasets[0].data = data;
    ctx.chart.update();
    return;
  }
  ctx.chart = new Chart(ctx, {
    type:'bar',
    data:{labels, datasets:[{label:'R$', data, backgroundColor:'rgba(255,107,0,0.9)'}]},
    options:{responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}
  });
}

async function logout(){
  await fetch('/logout', {method:'POST', credentials: 'same-origin'});
  window.location.href = '/';
}
