// admin.js
// Usa credentials same-origin para enviar cookies de sessão
const API_ROOT = '';

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  bindUI();
  loadOverview();
  loadUsers();
  loadOrders();
  loadEnterprises();
  loadTransactions();
});

function initMenu(){
  document.querySelectorAll('.menu-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.menu-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const section = btn.dataset.section;
      document.querySelectorAll('.section').forEach(s=>{
        s.classList.toggle('active', s.id === section);
      });
    });
  });

  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('refreshUsers').addEventListener('click', loadUsers);
  document.getElementById('refreshOrders').addEventListener('click', loadOrders);
  document.getElementById('refreshEnterprises').addEventListener('click', loadEnterprises);
  document.getElementById('refreshTx').addEventListener('click', loadTransactions);

  // search handlers
  document.getElementById('userSearch').addEventListener('input', e => filterUsers(e.target.value));
  document.getElementById('orderSearch').addEventListener('input', e => filterOrders(e.target.value));
  document.getElementById('enterpriseSearch').addEventListener('input', e => filterEnterprises(e.target.value));
  document.getElementById('txSearch').addEventListener('input', e => filterTx(e.target.value));
}

async function loadOverview(){
  try {
    const resp = await fetch('/admin/dashboard', {credentials:'same-origin'});
    if (!resp.ok) return;
    const data = await resp.json();
    document.getElementById('cardUsers').innerText = data.total_users ?? '—';
    document.getElementById('cardOrders').innerText = data.total_orders ?? '—';
    document.getElementById('cardFlow').innerText = data.total_credit_flow ?? '—';
    document.getElementById('statUsers').innerText = data.total_users ?? '—';
    document.getElementById('statOrders').innerText = data.total_orders ?? '—';
    document.getElementById('statFlow').innerText = data.total_credit_flow ?? '—';
    // load last orders into overviewOrders (call orders endpoint)
    const ordersResp = await fetch('/admin/orders', {credentials:'same-origin'});
    if (ordersResp.ok) {
      const list = await ordersResp.json();
      renderOrdersTable(list.slice(-8).reverse(), 'overviewOrders', true);
    }
  } catch (err) {
    console.error('overview error', err);
  }
}

/* ------------------- USERS ------------------- */
let USERS_CACHE = [];
async function loadUsers(){
  try {
    const resp = await fetch('/admin/users', {credentials:'same-origin'});
    if (!resp.ok) throw new Error('failed');
    USERS_CACHE = await resp.json();
    renderUsersTable(USERS_CACHE);
  } catch (err) {
    console.error('loadUsers', err);
    document.getElementById('usersTable').innerHTML = '<div class="muted">Erro ao carregar usuários</div>';
  }
}

function renderUsersTable(list){
  const root = document.getElementById('usersTable');
  if (!list || list.length === 0) {
    root.innerHTML = '<div class="muted">Nenhum usuário</div>';
    return;
  }
  root.innerHTML = '';
  list.forEach(u => {
    const row = document.getElementById('userRowTpl').content.cloneNode(true);
    row.querySelector('.idcol').innerText = u.id || '—';
    row.querySelector('.usercol').innerHTML = `<strong>${escapeHtml(u.username||u.email||'—')}</strong><div style="font-size:.8rem;color:rgba(255,255,255,0.6)">${escapeHtml(u.email||'')}</div>`;
    row.querySelector('.rolecol').innerText = u.role||'—';
    row.querySelector('.creditcol').innerText = (u.credits||0) + ' pts';
    const actionCell = row.querySelector('.actioncol');
    // details button
    const detailsBtn = document.createElement('button'); detailsBtn.innerText = 'Ver'; detailsBtn.addEventListener('click', ()=>showUser(u.id));
    // ban button
    const banBtn = document.createElement('button'); banBtn.innerText = 'Banir'; banBtn.classList.add('ban'); banBtn.addEventListener('click', ()=>banUser(u.id));
    // warn
    const warnBtn = document.createElement('button'); warnBtn.innerText = 'Avisar'; warnBtn.addEventListener('click', ()=>warnUser(u.id));
    // topup
    const topupBtn = document.createElement('button'); topupBtn.innerText = 'Topup'; topupBtn.classList.add('topup'); topupBtn.addEventListener('click', ()=>promptTopup(u.id));
    actionCell.append(detailsBtn, banBtn, warnBtn, topupBtn);
    root.appendChild(row);
  });
}

function filterUsers(q){
  q = (q||'').toLowerCase().trim();
  const role = document.getElementById('filterRole').value;
  let filtered = USERS_CACHE.filter(u => {
    const matchQ = !q || (u.username||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q) || (u.id||'').toLowerCase().includes(q);
    const matchRole = !role || (u.role === role);
    return matchQ && matchRole;
  });
  renderUsersTable(filtered);
}

/* ------------------- ORDERS ------------------- */
let ORDERS_CACHE = [];
async function loadOrders(){
  try {
    const resp = await fetch('/admin/orders', {credentials:'same-origin'});
    if (!resp.ok) throw new Error('failed orders');
    ORDERS_CACHE = await resp.json();
    renderOrdersTable(ORDERS_CACHE, 'ordersTable', false);
  } catch (err) {
    console.error('loadOrders', err);
    document.getElementById('ordersTable').innerHTML = '<div class="muted">Erro ao carregar pedidos</div>';
  }
}

function renderOrdersTable(list, containerId, compact=false){
  const root = document.getElementById(containerId);
  if (!list || list.length === 0) {
    root.innerHTML = '<div class="muted">Nenhum pedido</div>';
    return;
  }
  root.innerHTML = '';
  list.forEach(o => {
    const row = document.getElementById('orderRowTpl').content.cloneNode(true);
    row.querySelector('.idcol').innerText = o.order_id || o.orderId || '—';
    row.querySelector('.usercol').innerText = o.user_id || o.user || '—';
    row.querySelector('.totalcol').innerText = (o.total_credits||o.total||0) + ' pts';
    row.querySelector('.statuscol').innerText = o.status || '—';
    const actions = row.querySelector('.actioncol');
    // view
    const v = document.createElement('button'); v.innerText = 'Ver'; v.addEventListener('click', ()=>showOrder(o.order_id));
    // update status select (compact disabled)
    const sBtn = document.createElement('button'); sBtn.innerText = 'Atualizar status'; sBtn.addEventListener('click', ()=>promptUpdateOrder(o.order_id));
    actions.appendChild(v); actions.appendChild(sBtn);
    root.appendChild(row);
  });
}

function filterOrders(q){
  q = (q||'').toLowerCase().trim();
  const st = document.getElementById('orderFilterStatus').value;
  let filtered = ORDERS_CACHE.filter(o => {
    const matchQ = !q || (o.order_id||'').toLowerCase().includes(q) || (o.user_id||'').toLowerCase().includes(q);
    const matchS = !st || (o.status === st);
    return matchQ && matchS;
  });
  renderOrdersTable(filtered, 'ordersTable', false);
}

/* ------------------- ENTERPRISES ------------------- */
let ENTERPRISE_CACHE = [];
async function loadEnterprises(){
  try {
    const resp = await fetch('/admin/enterprises', {credentials:'same-origin'});
    if (!resp.ok) throw new Error('no ent');
    ENTERPRISE_CACHE = await resp.json();
    renderEnterprises(ENTERPRISE_CACHE);
  } catch (err) {
    console.error('enterprises', err);
    document.getElementById('enterprisesTable').innerHTML = '<div class="muted">Erro ao carregar empresas</div>';
  }
}

function renderEnterprises(list){
  const root = document.getElementById('enterprisesTable');
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhuma empresa</div>'; return; }
  root.innerHTML = '';
  list.forEach(e => {
    const row = document.createElement('div'); row.className='row';
    row.innerHTML = `<div class="cell idcol">${escapeHtml(e.id)}</div>
                     <div class="cell usercol"><strong>${escapeHtml(e.name)}</strong><div style="font-size:.8rem;color:rgba(255,255,255,0.6)">Owner: ${escapeHtml(e.owner_id||'—')}</div></div>
                     <div class="cell totalcol">${(e.balance||0)}</div>
                     <div class="cell statuscol">${e.created_at||''}</div>
                     <div class="cell actioncol"></div>`;
    root.appendChild(row);
  });
}

function filterEnterprises(q){
  q = (q||'').toLowerCase().trim();
  const filtered = ENTERPRISE_CACHE.filter(e => !q || (e.name||'').toLowerCase().includes(q) || (String(e.id||'')).toLowerCase().includes(q));
  renderEnterprises(filtered);
}

/* ------------------- TRANSACTIONS ------------------- */
let TX_CACHE = [];
async function loadTransactions(){
  try {
    const resp = await fetch('/admin/transactions', {credentials:'same-origin'});
    if (!resp.ok) throw new Error('no tx');
    TX_CACHE = await resp.json();
    renderTx(TX_CACHE);
  } catch (err) {
    console.error('tx', err);
    document.getElementById('txTable').innerHTML = '<div class="muted">Erro ao carregar transações</div>';
  }
}

function renderTx(list){
  const root = document.getElementById('txTable');
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhuma transação</div>'; return; }
  root.innerHTML = '';
  list.forEach(t => {
    const row = document.createElement('div'); row.className='row';
    row.innerHTML = `<div class="cell idcol">${escapeHtml(t.tx_id||'—')}</div>
                     <div class="cell usercol">${escapeHtml(t.type||'')}</div>
                     <div class="cell totalcol">${escapeHtml(String(t.amount||0))}</div>
                     <div class="cell statuscol">${escapeHtml(t.created_at||'')}</div>
                     <div class="cell actioncol"></div>`;
    root.appendChild(row);
  });
}

function filterTx(q){
  q = (q||'').toLowerCase().trim();
  const f = TX_CACHE.filter(t => !q || (t.tx_id||'').toLowerCase().includes(q) || (t.type||'').toLowerCase().includes(q));
  renderTx(f);
}

/* ------------------- ACTIONS: ban / warn / topup / show details ------------------- */
async function banUser(userId){
  const accept = confirm('Banir usuário permanentemente? (OK = permanente, Cancel = temporário)');
  const payload = accept ? {permanent:true, reason:'Banimento administrativo'} : {permanent:false, until: null, reason:'Aviso/Temporário'};
  try {
    const resp = await fetch(`/admin/ban/${userId}`, {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(()=>({error:'erro'}));
      alert(err.error || 'Erro ao banir');
      return;
    }
    alert('Usuário banido');
    loadUsers();
  } catch (err) { console.error(err); alert('Erro ao banir'); }
}

async function warnUser(userId){
  const note = prompt('Motivo do aviso (opcional):','Comportamento suspeito');
  try {
    const resp = await fetch(`/admin/warn/${userId}`, {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({note})
    });
    if (!resp.ok) {
      const j = await resp.json().catch(()=>({error:'erro'}));
      alert(j.error || 'Erro ao advertir');
      return;
    }
    alert('Aviso registrado');
    loadUsers();
  } catch (err) { console.error(err); alert('Erro ao advertir'); }
}

function promptTopup(userId){
  const v = prompt('Valor (créditos) para adicionar:', '100');
  if (!v) return;
  const amount = parseInt(v);
  if (isNaN(amount)) { alert('Valor inválido'); return; }
  topupUser(userId, amount);
}

async function topupUser(userId, amount){
  try {
    const resp = await fetch('/admin/topup', {
      method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({user_id:userId, amount})
    });
    if (!resp.ok) { const j = await resp.json().catch(()=>({error:'erro'})); alert(j.error||'Erro topup'); return; }
    alert('Créditos adicionados');
    loadUsers();
  } catch (err) { console.error(err); alert('Erro topup'); }
}

async function showUser(userId){
  try {
    const resp = await fetch(`/admin/users/${userId}`, {credentials:'same-origin'});
    if (!resp.ok) { alert('Usuário não encontrado'); return; }
    const u = await resp.json();
    openModal(`<h3>Usuário: ${escapeHtml(u.username||'—')}</h3>
               <p>Email: ${escapeHtml(u.email||'—')}</p>
               <p>Role: ${escapeHtml(u.role||'—')}</p>
               <p>Credits: ${escapeHtml(String(u.credits||0))}</p>
               <pre style="white-space:pre-wrap;margin-top:.6rem">${escapeHtml(JSON.stringify(u, null, 2))}</pre>`);
  } catch (err) { console.error(err); alert('Erro'); }
}

async function showOrder(orderId){
  try {
    const resp = await fetch(`/admin/orders/${orderId}`, {credentials:'same-origin'});
    if (!resp.ok) { alert('Pedido não encontrado'); return; }
    const o = await resp.json();
    openModal(`<h3>Pedido: ${escapeHtml(o.order_id||'—')}</h3>
               <p>User: ${escapeHtml(o.user_id||'—')}</p>
               <p>Total: ${escapeHtml(String(o.total_credits||o.total||0))} pts</p>
               <p>Status: ${escapeHtml(o.status||'—')}</p>
               <pre style="white-space:pre-wrap;margin-top:.6rem">${escapeHtml(JSON.stringify(o, null, 2))}</pre>`);
  } catch (err) { console.error(err); alert('Erro'); }
}

function promptUpdateOrder(orderId){
  const newStatus = prompt('Novo status (pending / out_for_delivery / delivered / canceled):','delivered');
  if (!newStatus) return;
  updateOrderStatus(orderId, newStatus);
}

async function updateOrderStatus(orderId, status){
  try {
    const resp = await fetch(`/admin/orders/${orderId}`, {
      method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status})
    });
    if (!resp.ok) { const j = await resp.json().catch(()=>({error:'erro'})); alert(j.error||'Erro'); return; }
    alert('Status atualizado');
    loadOrders(); loadOverview();
  } catch (err) { console.error(err); alert('Erro'); }
}

/* ------------------- EXPORT & HELPERS ------------------- */
async function exportBackup(){
  try {
    const resp = await fetch('/admin/export', {credentials:'same-origin'});
    if (!resp.ok) { alert('Erro ao exportar'); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'backup_all.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { console.error(err); alert('Erro export'); }
}

function openModal(html){
  const modal = document.getElementById('modal');
  document.getElementById('modalBody').innerHTML = html;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  document.getElementById('modalClose').onclick = closeModal;
}
function closeModal(){ document.getElementById('modal').classList.add('hidden'); document.getElementById('modal').setAttribute('aria-hidden','true'); }
document.getElementById && document.addEventListener('click', (e)=>{ if(e.target && e.target.id==='modal') closeModal(); });

async function logout(){ await fetch('/logout',{method:'POST', credentials:'same-origin'}); window.location.href = '/'; }

/* ------------------- small helpers ------------------- */
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
