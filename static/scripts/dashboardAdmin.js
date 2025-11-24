// dashboardAdmin.js (versão corrigida e mais resiliente)
const API_ROOT = '';

document.addEventListener('DOMContentLoaded', () => {
  try {
    initMenu();
    bindUI();
    // carregamentos independentes — cada um protegido
    safeCall(loadOverview);
    safeCall(loadUsers);
    safeCall(loadOrders);
    safeCall(loadEnterprises);
    safeCall(loadTransactions);
  } catch (err) {
    console.error('Erro inicializando dashboard:', err);
  }
});

/* ---------- util helpers ---------- */
function getEl(id) { return document.getElementById(id) || null; }
function safeCall(fn) { return Promise.resolve().then(()=>fn()).catch(err=>console.error(fn.name+' failed:', err)); }

function handleAuthError(resp) {
  if (resp.status === 401) { window.location.href = '/login'; return true; }
  return false;
}
async function jsonOrText(resp) {
  const ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text();
}
async function safeFetch(path, opts = {}) {
  opts.credentials = opts.credentials || 'same-origin';
  opts.headers = Object.assign({'Accept': 'application/json'}, opts.headers || {});
  const resp = await fetch(API_ROOT + path, opts);
  if (handleAuthError(resp)) throw new Error('not authenticated');
  const payload = await jsonOrText(resp).catch(()=>null);
  if (!resp.ok) {
    const msg = (payload && payload.error) || (typeof payload === 'string' && payload) || `HTTP ${resp.status}`;
    const err = new Error(String(msg));
    err.raw = payload; err.status = resp.status;
    throw err;
  }
  return payload;
}

/* ---------- menu + bindings ---------- */
function initMenu(){
  document.querySelectorAll('.menu-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.menu-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const section = btn.dataset.section;
      document.querySelectorAll('.section').forEach(s=> s.classList.toggle('active', s.id === section));
    });
  });
}

function bindUI(){
  try {
    getEl('exportBtn')?.addEventListener('click', ()=>safeCall(exportBackup));
    getEl('logoutBtn')?.addEventListener('click', ()=>safeCall(logout));

    // refresh buttons
    getEl('refreshUsers')?.addEventListener('click', ()=>safeCall(loadUsers));
    getEl('refreshOrders')?.addEventListener('click', ()=>safeCall(loadOrders));
    getEl('refreshEnterprises')?.addEventListener('click', ()=>safeCall(loadEnterprises));
    getEl('refreshTx')?.addEventListener('click', ()=>safeCall(loadTransactions));

    // search inputs
    getEl('userSearch')?.addEventListener('input', e => filterUsers(e.target.value));
    getEl('orderSearch')?.addEventListener('input', e => filterOrders(e.target.value));
    getEl('enterpriseSearch')?.addEventListener('input', e => filterEnterprises(e.target.value));
    getEl('txSearch')?.addEventListener('input', e => filterTx(e.target.value));
    getEl('filterRole')?.addEventListener('change', ()=>filterUsers(getEl('userSearch')?.value));

    // create buttons (conditionally bind)
    getEl('createUserBtn')?.addEventListener('click', ()=>safeCall(openCreateUserModal));
    getEl('createOrderBtn')?.addEventListener('click', ()=>safeCall(openCreateOrderModal));
    getEl('createEnterpriseBtn')?.addEventListener('click', ()=>safeCall(openCreateEnterpriseModal));
    getEl('createTxBtn')?.addEventListener('click', ()=>safeCall(openCreateTxModal));
    getEl('createDeliveryBtn')?.addEventListener('click', ()=>safeCall(openCreateDeliveryModal));
  } catch (err) {
    console.error('bindUI error', err);
  }
}

/* ---------- overview ---------- */
async function loadOverview(){
  try {
    const data = await safeFetch('/admin/dashboard');
    getEl('cardUsers') && (getEl('cardUsers').innerText = data.total_users ?? '—');
    getEl('cardOrders') && (getEl('cardOrders').innerText = data.total_orders ?? '—');
    getEl('cardFlow') && (getEl('cardFlow').innerText = data.total_credit_flow ?? '—');
    getEl('statUsers') && (getEl('statUsers').innerText = data.total_users ?? '—');
    getEl('statOrders') && (getEl('statOrders').innerText = data.total_orders ?? '—');
    getEl('statFlow') && (getEl('statFlow').innerText = data.total_credit_flow ?? '—');

    // last orders (gracefully ignore errors)
    try {
      const orders = await safeFetch('/admin/orders');
      renderOrdersTable((orders||[]).slice(-8).reverse(), 'overviewOrders', true);
    } catch (err) {
      console.warn('Could not load overview orders:', err);
    }
  } catch (err) {
    console.error('loadOverview error', err);
  }
}

/* ------------------- USERS ------------------- */
let USERS_CACHE = [];
async function loadUsers(){
  try {
    USERS_CACHE = await safeFetch('/admin/users') || [];
    renderUsersTable(USERS_CACHE);
  } catch (err) {
    console.error('loadUsers', err);
    getEl('usersTable') && (getEl('usersTable').innerHTML = `<div class="muted">Erro ao carregar usuários — ${escapeHtml(err.message)}</div>`);
  }
}

function renderUsersTable(list){
  const root = getEl('usersTable');
  if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhum usuário</div>'; return; }
  root.innerHTML = '';
  list.forEach(u => {
    try {
      const tpl = getEl('userRowTpl');
      if (!tpl) {
        // fallback row
        const row = document.createElement('div'); row.className='row';
        row.innerText = `${u.id} — ${u.username || u.email}`;
        root.appendChild(row);
        return;
      }
      const row = tpl.content.cloneNode(true);
      row.querySelector('.idcol').innerText = u.id || '—';
      row.querySelector('.usercol').innerHTML = `<strong>${escapeHtml(u.username||u.email||'—')}</strong><div class="muted small">${escapeHtml(u.email||'')}</div>`;
      row.querySelector('.rolecol').innerText = u.role||'—';
      row.querySelector('.creditcol').innerText = (u.credits||0) + ' pts';
      const actionCell = row.querySelector('.actioncol');
      // clear then append
      actionCell.innerHTML = '';
      actionCell.appendChild(createBtn('Ver', ()=>safeCall(()=>showUser(u.id))));
      actionCell.appendChild(createBtn('Editar', ()=>safeCall(()=>openEditUserModal(u))));
      actionCell.appendChild(createBtn('Excluir', ()=>safeCall(()=>deleteUser(u.id)), 'danger'));
      actionCell.appendChild(createBtn('Banir', ()=>safeCall(()=>banUser(u.id)), 'danger'));
      actionCell.appendChild(createBtn('Avisar', ()=>safeCall(()=>warnUser(u.id))));
      actionCell.appendChild(createBtn('Topup', ()=>safeCall(()=>promptTopup(u.id)), 'accent'));
      root.appendChild(row);
    } catch (err) {
      console.error('renderUsersTable row error', err);
    }
  });
}

function filterUsers(q){
  q = (q||'').toLowerCase().trim();
  const role = getEl('filterRole') ? getEl('filterRole').value : '';
  const filtered = USERS_CACHE.filter(u => {
    const matchQ = !q || (u.username||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q) || (u.id||'').toLowerCase().includes(q);
    const matchRole = !role || (u.role === role);
    return matchQ && matchRole;
  });
  renderUsersTable(filtered);
}

/* create/edit/delete users */
function openCreateUserModal(){
  openModal(`<h3>Novo usuário</h3>
    <form id="frmCreateUser" class="modal-form">
      <label>Username <input name="username" required /></label>
      <label>Email <input name="email" type="email" required /></label>
      <label>Senha <input name="password" type="password" required /></label>
      <label>Role <select name="role"><option value="cliente">cliente</option><option value="empresa">empresa</option><option value="entregador">entregador</option><option value="admin">admin</option></select></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar</button></div>
    </form>`);
  const form = getEl('frmCreateUser');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await safeFetch('/admin/users', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Usuário criado'); closeModal(); safeCall(loadUsers); safeCall(loadOverview);
    } catch (err) { alert('Erro criar usuário: '+(err.message||err)); console.error(err); }
  });
}

function openEditUserModal(user){
  openModal(`<h3>Editar usuário</h3>
    <form id="frmEditUser" class="modal-form">
      <label>Username <input name="username" value="${escapeHtml(user.username||'')}" /></label>
      <label>Email <input name="email" type="email" value="${escapeHtml(user.email||'')}" /></label>
      <label>Role <select name="role">
        <option ${user.role==='cliente'?'selected':''} value="cliente">cliente</option>
        <option ${user.role==='empresa'?'selected':''} value="empresa">empresa</option>
        <option ${user.role==='entregador'?'selected':''} value="entregador">entregador</option>
        <option ${user.role==='admin'?'selected':''} value="admin">admin</option>
      </select></label>
      <label>Credits <input name="credits" type="number" value="${escapeHtml(String(user.credits||0))}" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Salvar</button></div>
    </form>`);
  const form = getEl('frmEditUser');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await safeFetch(`/admin/users/${encodeURIComponent(user.id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Usuário atualizado'); closeModal(); safeCall(loadUsers); safeCall(loadOverview);
    } catch (err) { alert('Erro atualizar usuário: '+(err.message||err)); console.error(err); }
  });
}

async function deleteUser(userId){
  if (!confirm('Excluir usuário permanentemente?')) return;
  try {
    await safeFetch(`/admin/users/${encodeURIComponent(userId)}`, { method:'DELETE' });
    alert('Usuário excluído'); safeCall(loadUsers); safeCall(loadOverview);
  } catch (err) { alert('Erro excluir: ' + (err.message||err)); console.error(err); }
}

/* ban / warn / topup */
async function banUser(userId){
  const accept = confirm('Banir usuário permanentemente? (OK = permanente, Cancel = temporário)');
  const payload = accept ? {permanent:true, reason:'Banimento administrativo'} : {permanent:false, until:null, reason:'Temporário'};
  try { await safeFetch(`/admin/ban/${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); alert('Usuário banido'); safeCall(loadUsers); }
  catch (err) { alert('Erro banir: '+(err.message||err)); console.error(err); }
}
async function warnUser(userId){
  const note = prompt('Motivo do aviso (opcional):','Comportamento suspeito');
  if (note === null) return;
  try { await safeFetch(`/admin/warn/${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({note}) }); alert('Aviso registrado'); safeCall(loadUsers); }
  catch (err){ alert('Erro: '+(err.message||err)); console.error(err); }
}
function promptTopup(userId){
  const v = prompt('Valor (créditos) para adicionar:', '100');
  if (v === null) return;
  const amount = parseInt(v);
  if (isNaN(amount)) { alert('Valor inválido'); return; }
  topupUser(userId, amount);
}
async function topupUser(userId, amount){
  try {
    await safeFetch('/admin/topup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({user_id:userId, amount})});
    alert('Topup realizado'); safeCall(loadUsers); safeCall(loadOverview);
  } catch (err) { alert('Erro topup: '+(err.message||err)); console.error(err); }
}

/* ------------------- ORDERS ------------------- */
let ORDERS_CACHE = [];
async function loadOrders(){
  try {
    ORDERS_CACHE = await safeFetch('/admin/orders') || [];
    renderOrdersTable(ORDERS_CACHE, 'ordersTable', false);
  } catch (err) {
    console.error('loadOrders', err);
    getEl('ordersTable') && (getEl('ordersTable').innerHTML = `<div class="muted">Erro ao carregar pedidos — ${escapeHtml(err.message)}</div>`);
  }
}

function renderOrdersTable(list, containerId, compact=false){
  const root = getEl(containerId);
  if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhum pedido</div>'; return; }
  root.innerHTML = '';
  list.forEach(o => {
    try {
      const tpl = getEl('orderRowTpl');
      if (!tpl) {
        const r = document.createElement('div'); r.className='row'; r.innerText = `${o.order_id} — ${o.user_id}`;
        root.appendChild(r); return;
      }
      const row = tpl.content.cloneNode(true);
      row.querySelector('.idcol').innerText = o.order_id || '—';
      row.querySelector('.usercol').innerText = o.user_id || '—';
      row.querySelector('.totalcol').innerText = (o.total_credits||0) + ' pts';
      row.querySelector('.statuscol').innerText = o.status || '—';
      const actions = row.querySelector('.actioncol');
      actions.innerHTML = '';
      actions.appendChild(createBtn('Ver', ()=>safeCall(()=>showOrder(o.order_id))));
      if (!compact) actions.appendChild(createBtn('Editar', ()=>safeCall(()=>openEditOrderModal(o))));
      actions.appendChild(createBtn('Excluir', ()=>safeCall(()=>deleteOrder(o.order_id)), 'danger'));
      root.appendChild(row);
    } catch (err) { console.error('renderOrdersTable row error', err); }
  });
}

function filterOrders(q){
  q = (q||'').toLowerCase().trim();
  const st = getEl('orderFilterStatus') ? getEl('orderFilterStatus').value : '';
  const filtered = ORDERS_CACHE.filter(o => {
    const matchQ = !q || (o.order_id||'').toLowerCase().includes(q) || (o.user_id||'').toLowerCase().includes(q);
    const matchS = !st || (o.status === st);
    return matchQ && matchS;
  });
  renderOrdersTable(filtered, 'ordersTable', false);
}

/* create/edit/delete orders */
function openCreateOrderModal(){
  openModal(`<h3>Criar Pedido</h3>
    <form id="frmCreateOrder" class="modal-form">
      <label>User ID <input name="user_id" required /></label>
      <label>Items (JSON array) <textarea name="items" placeholder='[{"product_id":"id","quantity":1}]' rows="5" required></textarea></label>
      <label>Status <input name="status" value="pending" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar pedido</button></div>
    </form>`);
  const form = getEl('frmCreateOrder');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.items = JSON.parse(body.items || '[]');
      await safeFetch('/admin/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Pedido criado'); closeModal(); safeCall(loadOrders); safeCall(loadOverview);
    } catch (err) { alert('Erro criar pedido: '+(err.message||err)); console.error(err); }
  });
}

function openEditOrderModal(order){
  openModal(`<h3>Editar Pedido</h3>
    <form id="frmEditOrder" class="modal-form">
      <label>Order ID <input name="order_id" value="${escapeHtml(order.order_id||'')}" readonly /></label>
      <label>Status <input name="status" value="${escapeHtml(order.status||'')}" /></label>
      <label>Total <input name="total_credits" value="${escapeHtml(String(order.total_credits||0))}" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Salvar</button></div>
    </form>`);
  const form = getEl('frmEditOrder');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const id = body.order_id; delete body.order_id;
      await safeFetch(`/admin/orders/${encodeURIComponent(id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Pedido atualizado'); closeModal(); safeCall(loadOrders); safeCall(loadOverview);
    } catch (err) { alert('Erro atualizar pedido: '+(err.message||err)); console.error(err); }
  });
}

async function deleteOrder(orderId){
  if (!confirm('Deletar pedido?')) return;
  try { await safeFetch(`/admin/orders/${encodeURIComponent(orderId)}`, { method:'DELETE' }); alert('Pedido deletado'); safeCall(loadOrders); safeCall(loadOverview); }
  catch (err){ alert('Erro deletar: '+(err.message||err)); console.error(err); }
}

/* ------------------- ENTERPRISES ------------------- */
let ENTERPRISE_CACHE = [];
async function loadEnterprises(){
  try {
    ENTERPRISE_CACHE = await safeFetch('/enterprises') || [];
    renderEnterprises(ENTERPRISE_CACHE);
  } catch (err) {
    console.error('loadEnterprises', err);
    getEl('enterprisesTable') && (getEl('enterprisesTable').innerHTML = `<div class="muted">Erro ao carregar empresas — ${escapeHtml(err.message)}</div>`);
  }
}

function renderEnterprises(list){
  const root = getEl('enterprisesTable');
  if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhuma empresa</div>'; return; }
  root.innerHTML = '';
  list.forEach(e=>{
    try {
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `<div class="cell idcol">${escapeHtml(e.id)}</div>
                       <div class="cell usercol"><strong>${escapeHtml(e.name)}</strong><div class="muted small">Owner: ${escapeHtml(e.owner_id||'—')}</div></div>
                       <div class="cell totalcol">${(e.balance||0)}</div>
                       <div class="cell statuscol">${e.created_at||''}</div>
                       <div class="cell actioncol"></div>`;
      const action = row.querySelector('.actioncol');
      action.appendChild(createBtn('Ver', ()=>safeCall(()=>showEnterprise(e.id))));
      action.appendChild(createBtn('Editar', ()=>safeCall(()=>openEditEnterpriseModal(e))));
      action.appendChild(createBtn('Produtos', ()=>safeCall(()=>openProductsModal(e))));
      action.appendChild(createBtn('Excluir', ()=>safeCall(()=>deleteEnterprise(e.id)), 'danger'));
      root.appendChild(row);
    } catch (err) { console.error('renderEnterprises row err', err); }
  });
}

function filterEnterprises(q){ q=(q||'').toLowerCase().trim(); const filtered = ENTERPRISE_CACHE.filter(e => !q || (e.name||'').toLowerCase().includes(q) || (String(e.id||'')).toLowerCase().includes(q)); renderEnterprises(filtered); }

function openCreateEnterpriseModal(){
  openModal(`<h3>Criar Empresa</h3>
    <form id="frmCreateEnt" class="modal-form">
      <label>Owner ID <input name="owner_id" required /></label>
      <label>Nome <input name="name" required /></label>
      <label>Balance <input name="balance" type="number" value="0" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar</button></div>
    </form>`);
  const form = getEl('frmCreateEnt');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await safeFetch('/admin/enterprises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Empresa criada'); closeModal(); safeCall(loadEnterprises);
    } catch (err) { alert('Erro criar empresa: '+(err.message||err)); console.error(err); }
  });
}

function openEditEnterpriseModal(ent){
  openModal(`<h3>Editar Empresa</h3>
    <form id="frmEditEnt" class="modal-form">
      <label>Nome <input name="name" value="${escapeHtml(ent.name||'')}" /></label>
      <label>Balance <input name="balance" type="number" value="${escapeHtml(String(ent.balance||0))}" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Salvar</button></div>
    </form>`);
  const form = getEl('frmEditEnt');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await safeFetch(`/admin/enterprises/${encodeURIComponent(ent.id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Empresa atualizada'); closeModal(); safeCall(loadEnterprises);
    } catch (err) { alert('Erro: '+(err.message||err)); console.error(err); }
  });
}

async function deleteEnterprise(id){
  if (!confirm('Excluir empresa?')) return;
  try { await safeFetch(`/admin/enterprises/${encodeURIComponent(id)}`, { method:'DELETE' }); alert('Empresa excluída'); safeCall(loadEnterprises); }
  catch (err){ alert('Erro excluir: '+(err.message||err)); console.error(err); }
}

async function showEnterprise(id){
  try {
    const ent = await safeFetch(`/admin/enterprises/${encodeURIComponent(id)}`);
    openModal(`<h3>${escapeHtml(ent.name||'—')}</h3><pre class="json-block">${escapeHtml(JSON.stringify(ent,null,2))}</pre>`);
  } catch (err) { alert('Erro ao carregar empresa: '+(err.message||err)); console.error(err); }
}

/* products modal, create/edit/delete inside enterprise (same as earlier) */
function openProductsModal(ent){
  safeFetch(`/admin/enterprises/${encodeURIComponent(ent)}`).then(data=>{
    const prods = (data.products||[]);
    const rows = prods.map(p=>`<div style="display:flex;gap:.6rem;align-items:center;margin-bottom:.4rem">
        <div style="flex:1"><strong>${escapeHtml(p.name)}</strong><div class="muted small">${escapeHtml(p.id)}</div></div>
        <div style="width:6rem">${escapeHtml(String(p.price_credits||0))} pts</div>
        <div><button class="small-btn" data-pid="${escapeHtml(p.id)}" data-ent="${escapeHtml(ent)}">Editar</button></div>
        <div><button class="small-btn danger" data-delpid="${escapeHtml(p.id)}" data-ent="${escapeHtml(ent)}">Excluir</button></div>
      </div>`).join('');
    openModal(`<h3>Produtos — ${escapeHtml(data.name||ent)}</h3>
      <div style="margin-bottom:.6rem"><button id="btnNewProd" class="small-btn">Novo produto</button></div>
      <div id="productsList">${rows}</div>`);
    getEl('btnNewProd')?.addEventListener('click', ()=>openCreateProductModal(ent));
    document.querySelectorAll('[data-pid]').forEach(b=>b.addEventListener('click', ev=>openEditProductModal(ev.target.dataset.ent, ev.target.dataset.pid)));
    document.querySelectorAll('[data-delpid]').forEach(b=>b.addEventListener('click', async ev=>{
      const pid = ev.target.dataset.delpid;
      if (!confirm('Excluir produto?')) return;
      try { await safeFetch(`/admin/products/${encodeURIComponent(pid)}`, { method:'DELETE' }); alert('Produto excluído'); closeModal(); safeCall(loadEnterprises); }
      catch (err) { alert('Erro excluir produto: '+(err.message||err)); console.error(err); }
    }));
  }).catch(err => { alert('Erro carregar produtos: '+(err.message||err)); console.error(err); });
}

function openCreateProductModal(entId){
  openModal(`<h3>Novo Produto</h3>
    <form id="frmNewProd" class="modal-form">
      <label>Nome <input name="name" required /></label>
      <label>Preço (credits) <input name="price_credits" type="number" required /></label>
      <label>Descrição <input name="description" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar</button></div>
    </form>`);
  const form = getEl('frmNewProd');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await safeFetch(`/admin/enterprises/${encodeURIComponent(entId)}/products`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Produto criado'); closeModal(); safeCall(loadEnterprises);
    } catch (err) { alert('Erro criar produto: '+(err.message||err)); console.error(err); }
  });
}

function openEditProductModal(entId, prodId){
  safeFetch(`/admin/products/${encodeURIComponent(prodId)}`).then(p=>{
    openModal(`<h3>Editar Produto</h3>
      <form id="frmEditProd" class="modal-form">
        <label>Nome <input name="name" value="${escapeHtml(p.name||'')}" /></label>
        <label>Preço <input name="price_credits" type="number" value="${escapeHtml(String(p.price_credits||0))}" /></label>
        <label>Descrição <input name="description" value="${escapeHtml(p.description||'')}" /></label>
        <div style="margin-top:.6rem"><button type="submit" class="small-btn">Salvar</button></div>
      </form>`);
    const form = getEl('frmEditProd');
    form && form.addEventListener('submit', async ev=>{
      ev.preventDefault();
      try { const body = Object.fromEntries(new FormData(form).entries()); await safeFetch(`/admin/products/${encodeURIComponent(prodId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); alert('Produto atualizado'); closeModal(); safeCall(loadEnterprises); }
      catch (err) { alert('Erro atualizar produto: '+(err.message||err)); console.error(err); }
    });
  }).catch(err => { alert('Erro obter produto: '+(err.message||err)); console.error(err); });
}

/* ------------------- TRANSACTIONS ------------------- */
let TX_CACHE = [];
async function loadTransactions(){
  try {
    TX_CACHE = await safeFetch('/admin/transactions') || [];
    renderTx(TX_CACHE);
  } catch (err) {
    console.error('loadTransactions', err);
    getEl('txTable') && (getEl('txTable').innerHTML = `<div class="muted">Erro — ${escapeHtml(err.message)}</div>`);
  }
}
function renderTx(list){
  const root = getEl('txTable'); if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhuma transação</div>'; return; }
  root.innerHTML = '';
  list.forEach(t=>{ try { const row=document.createElement('div'); row.className='row'; row.innerHTML = `<div class="cell idcol">${escapeHtml(t.tx_id||'—')}</div><div class="cell usercol">${escapeHtml(t.type||'')}</div><div class="cell totalcol">${escapeHtml(String(t.amount||0))}</div><div class="cell statuscol">${escapeHtml(t.created_at||'')}</div><div class="cell actioncol"></div>`; root.appendChild(row); } catch (err) { console.error('renderTx row err', err); } });
}
function filterTx(q){ q=(q||'').toLowerCase().trim(); const f = TX_CACHE.filter(t => !q || (t.tx_id||'').toLowerCase().includes(q) || (t.type||'').toLowerCase().includes(q)); renderTx(f); }

function openCreateTxModal(){
  openModal(`<h3>Criar transação</h3>
    <form id="frmCreateTx" class="modal-form">
      <label>Type <input name="type" value="manual" /></label>
      <label>From <input name="from" /></label>
      <label>To <input name="to" /></label>
      <label>Amount <input name="amount" type="number" value="0" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar</button></div>
    </form>`);
  const form = getEl('frmCreateTx');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      body.amount = parseInt(body.amount) || 0;
      await safeFetch('/admin/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Transação criada'); closeModal(); safeCall(loadTransactions);
    } catch (err) { alert('Erro criar tx: '+(err.message||err)); console.error(err); }
  });
}

/* ------------------- DELIVERY ------------------- */
function openCreateDeliveryModal(){
  openModal(`<h3>Criar entregador</h3>
    <form id="frmCreateDel" class="modal-form">
      <label>Profile JSON <textarea name="profile" rows="4" placeholder='{"name":"Fulano","phone":"11..."}'>{}</textarea></label>
      <label>Balance <input name="balance" type="number" value="0" /></label>
      <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar</button></div>
    </form>`);
  const form = getEl('frmCreateDel');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      body.profile = JSON.parse(body.profile || '{}');
      body.balance = parseInt(body.balance) || 0;
      await safeFetch('/admin/delivery', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Entregador criado'); closeModal();
    } catch (err) { alert('Erro criar entregador: '+(err.message||err)); console.error(err); }
  });
}

/* ------------------- userstate quick edit ------------------- */
function openEditUserstateModal(userId){
  safeFetch(`/admin/userstate/${encodeURIComponent(userId)}`).then(st=>{
    openModal(`<h3>UserState — ${escapeHtml(userId)}</h3>
      <form id="frmStateEdit" class="modal-form">
        <label>State JSON <textarea name="state" rows="8">${escapeHtml(JSON.stringify(st||{},null,2))}</textarea></label>
        <div style="margin-top:.6rem"><button type="submit" class="small-btn">Salvar</button></div>
      </form>`);
    const form = getEl('frmStateEdit');
    form && form.addEventListener('submit', async e=>{
      e.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        const payload = JSON.parse(body.state || '{}');
        await safeFetch(`/admin/userstate/${encodeURIComponent(userId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        alert('UserState atualizado'); closeModal();
      } catch (err) { alert('Erro atualizar userstate: '+(err.message||err)); console.error(err); }
    });
  }).catch(err=>{
    openModal(`<h3>UserState — criar ${escapeHtml(userId)}</h3>
      <form id="frmStateCreate" class="modal-form">
        <label>State JSON <textarea name="state" rows="8">{}</textarea></label>
        <div style="margin-top:.6rem"><button type="submit" class="small-btn">Criar</button></div>
      </form>`);
    const form = getEl('frmStateCreate');
    form && form.addEventListener('submit', async e=>{
      e.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        const payload = JSON.parse(body.state || '{}');
        await safeFetch(`/admin/userstate/${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        alert('UserState criado'); closeModal();
      } catch (err) { alert('Erro criar userstate: '+(err.message||err)); console.error(err); }
    });
  });
}

/* ---------- modal / helpers ---------- */
function openModal(html){
  const modal = getEl('modal');
  if (!modal) {
    console.warn('modal element not found');
    return;
  }
  getEl('modalBody').innerHTML = html;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  getEl('modalClose').onclick = closeModal;
}
function closeModal(){ const m = getEl('modal'); if (!m) return; m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); }
document.addEventListener('click', (e)=>{ if(e.target && e.target.id==='modal') closeModal(); });

async function exportBackup(){
  try {
    const resp = await fetch('/admin/export', { credentials:'same-origin' });
    if (!resp.ok) { const t = await resp.text().catch(()=>null); alert('Erro ao exportar: ' + (t || resp.status)); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'backup_all.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (err) { alert('Erro export: '+(err.message||err)); console.error(err); }
}

async function logout(){ try { await safeFetch('/logout', { method:'POST' }); } catch(e){} window.location.href = '/'; }

function createBtn(text, onClick, kind=''){
  const b = document.createElement('button');
  b.className = 'small-btn ' + (kind||'');
  b.innerText = text;
  b.addEventListener('click', (ev)=>{ ev.stopPropagation(); try { onClick(); } catch (err) { console.error('button handler error', err); } });
  return b;
}
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
