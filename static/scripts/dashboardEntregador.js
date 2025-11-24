// static/scripts/dashboardEntregador.js

const API_ROOT = "";

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  bindButtons();
  loadAll();
  setInterval(loadAll, 15000);
});

function initMenu() {
  document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".menu-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      
      const section = btn.dataset.section;
      document.querySelectorAll(".section").forEach(sec => {
        sec.classList.toggle("active", sec.id === section);
      });
      
      const titles = {'overview':'Início', 'ongoing':'Em Andamento', 'available':'Disponíveis', 'history':'Histórico'};
      document.querySelector(".page-title").innerText = titles[section] || "Painel";
      
      if(section === 'available') loadAvailable();
      if(section === 'history') loadHistory();
    });
  });

  document.getElementById("refreshBtn").addEventListener("click", () => {
      const btn = document.getElementById("refreshBtn");
      btn.innerText = "...";
      loadAll().then(() => btn.innerText = "Atualizar");
  });
  
  document.getElementById("logoutBtn").addEventListener("click", async () => {
      await fetch('/logout', {method:'POST'});
      window.location.href = '/';
  });
}

function bindButtons(){
  document.addEventListener("click", async (ev) => {
    const acceptBtn = ev.target.closest(".btn-accept");
    if (acceptBtn) {
      const card = acceptBtn.closest(".order-card");
      await acceptOrder(card.dataset.orderId);
      return;
    }
    const completeBtn = ev.target.closest(".btn-complete");
    if (completeBtn) {
      if(!confirm("Confirmar entrega realizada?")) return;
      const card = completeBtn.closest(".order-card");
      await completeOrder(card.dataset.orderId);
      return;
    }
  });
}

// --- API CALLS ---

async function loadAll(){
  await Promise.all([loadAssignedAndBalance(), loadAvailable()]);
}

async function loadAssignedAndBalance(){
  try {
    const balResp = await fetch(API_ROOT + "/entregador/balance", { credentials: 'same-origin' });
    if(balResp.ok) {
        const bal = await balResp.json();
        document.getElementById("balanceValue").innerText = `R$ ${(bal.balance || 0).toFixed(2)}`;
        document.getElementById("monthEarnings").innerText = `R$ ${(bal.balance || 0).toFixed(2)}`;
    }

    const assignedResp = await fetch(API_ROOT + "/entregador/assigned", { credentials: 'same-origin' });
    const list = assignedResp.ok ? await assignedResp.json() : [];
    const ongoing = list.filter(o => o.status !== 'delivered' && o.status !== 'canceled');
    
    document.getElementById("todayCount").innerText = ongoing.length;
    renderAssigned(ongoing);
  } catch (err) { console.error(err); }
}

async function loadAvailable(){
  try {
    const resp = await fetch(API_ROOT + "/entregador/available", { credentials: 'same-origin' });
    const note = document.getElementById("availableNote");
    const listEl = document.getElementById("availableList");
    
    if (!resp.ok) {
      note.innerText = "Nenhum pedido na região.";
      listEl.innerHTML = "";
      return;
    }
    
    const list = await resp.json();
    note.hidden = true;
    listEl.hidden = false;
    renderAvailable(list);
  } catch (err) { document.getElementById("availableNote").innerText = "Erro ao buscar pedidos."; }
}

async function loadHistory(){
    try {
        const resp = await fetch(API_ROOT + "/entregador/assigned", { credentials: 'same-origin' });
        if(!resp.ok) return;
        const list = await resp.json();
        const history = list.filter(o => o.status === 'delivered' || o.status === 'canceled');
        renderHistory(history);
    } catch(e){}
}

async function acceptOrder(orderId){
  try {
    const resp = await fetch(`/entregador/assign/${orderId}`, { method: 'POST', credentials: 'same-origin' });
    if (!resp.ok) { alert('Erro ao aceitar pedido.'); return; }
    
    alert("Pedido aceito! Vá para a aba 'Em andamento'.");
    loadAll();
    document.querySelector('[data-section="ongoing"]').click();
  } catch (err) { alert('Erro de conexão.'); }
}

async function completeOrder(orderId){
  try {
    const resp = await fetch(`/entregador/complete/${orderId}`, { method: 'POST', credentials: 'same-origin' });
    if (!resp.ok) { alert('Erro ao finalizar entrega.'); return; }
    
    const data = await resp.json();
    // AQUI: Mostra o valor retornado pelo backend
    alert(`Entrega concluída! Você recebeu R$ ${data.earned || 5}`); 
    loadAll();
  } catch (err) { alert('Erro de conexão.'); }
}

// --- RENDER FUNCTIONS ---

function createCardHTML(o, type) {
    const itemsCount = o.items ? o.items.length : 0;
    // AQUI: Usa o campo client_address enviado pelo backend
    const address = o.client_address || "Endereço não disponível"; 
    const entName = o.enterprise_name || (o.items && o.items[0] && o.items[0].enterprise_name) || "Restaurante";
    const fee = o.delivery_fee || 5;

    let buttonsHTML = "";
    if (type === 'available') {
        buttonsHTML = `<button class="btn btn-accept">Aceitar Entrega (+ R$ ${fee})</button>`;
    } else if (type === 'ongoing') {
        buttonsHTML = `<button class="btn btn-complete">Concluir Entrega</button>`;
    }

    return `
        <div class="order-card" data-order-id="${o.order_id}">
            <div class="order-line">
                <div>
                    <p class="order-id">#${o.order_id.slice(0,8)}</p>
                    <p class="order-info">${entName} • ${itemsCount} item(s)</p>
                </div>
                <div>
                    <p class="order-meta" style="color:var(--primary); font-weight:bold;">R$ ${fee}</p>
                </div>
            </div>
            <p class="order-address">📍 ${address}</p>
            <p class="order-meta" style="margin-bottom:10px;">Status: ${o.status}</p>
            <div class="order-actions">
                ${buttonsHTML}
            </div>
        </div>
    `;
}

function renderAssigned(list){
  const el = document.getElementById("ongoingList");
  if (!list.length) { el.innerHTML = `<div class="muted">Você não tem entregas ativas.</div>`; return; }
  el.innerHTML = list.map(o => createCardHTML(o, 'ongoing')).join("");
}

function renderAvailable(list){
  const el = document.getElementById("availableList");
  if (!list.length) { el.innerHTML = `<div class="muted">Nenhum pedido aguardando entregador.</div>`; return; }
  el.innerHTML = list.map(o => createCardHTML(o, 'available')).join("");
}

function renderHistory(list){
  const el = document.getElementById("historyList");
  if (!list.length) { el.innerHTML = `<div class="muted">Histórico vazio.</div>`; return; }
  const sorted = list.slice().reverse();
  el.innerHTML = sorted.map(o => createCardHTML(o, 'history')).join("");
}

// Chart placeholder
const ctx = document.getElementById('earningsChart');
if(ctx && typeof Chart !== 'undefined') {
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'],
            datasets: [{ label: 'Ganhos (R$)', data: [0, 5, 10, 0, 20, 5, 15], backgroundColor: '#27ae60' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}