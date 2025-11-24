// static/scripts/dashboardAdmin.js

const API_ROOT = ''; // deixar vazio para same-origin

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  bindUI();
  safeCall(loadOverview);
  safeCall(loadUsers);
});

/* ---------- util helpers ---------- */
function getEl(id){ return document.getElementById(id) || null; }
function safeCall(fn){ return Promise.resolve().then(()=>fn()).catch(err=>console.error(fn.name+' failed:', err)); }

function handleAuthError(resp) {
  if (resp.status === 401) { window.location.href = '/login'; return true; }
  return false;
}
async function jsonOrText(resp){
  const ct = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text();
}
async function safeFetch(path, opts = {}){
  opts.credentials = opts.credentials || 'same-origin';
  opts.headers = Object.assign({'Accept': 'application/json'}, opts.headers || {});
  const resp = await fetch(API_ROOT + path, opts);
  if (handleAuthError(resp)) throw new Error('not authenticated');
  const payload = await jsonOrText(resp).catch(()=>null);
  if (!resp.ok){
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
  getEl('exportBtn')?.addEventListener('click', ()=>safeCall(exportBackup));
  getEl('logoutBtn')?.addEventListener('click', ()=>safeCall(logout));

  getEl('refreshUsers')?.addEventListener('click', ()=>safeCall(loadUsers));
  getEl('userSearch')?.addEventListener('input', e=>filterUsers(e.target.value));
  getEl('filterRole')?.addEventListener('change', ()=>filterUsers(getEl('userSearch')?.value));

  getEl('createUserBtn')?.addEventListener('click', ()=>safeCall(openCreateUserModal));
}

/* ---------- overview ---------- */
async function loadOverview(){
  try {
    const data = await safeFetch('/admin/dashboard');
    getEl('cardUsers') && (getEl('cardUsers').innerText = data.total_users ?? '—');
    getEl('cardOrders') && (getEl('cardOrders').innerText = data.total_orders ?? '—');
    getEl('cardFlow') && (getEl('cardFlow').innerText = data.total_credit_flow ?? '—');
    
    // estatisticas secundárias (opcional, se existirem no HTML)
    getEl('statUsers') && (getEl('statUsers').innerText = data.total_users ?? '—');
    getEl('statOrders') && (getEl('statOrders').innerText = data.total_orders ?? '—');
    getEl('statFlow') && (getEl('statFlow').innerText = data.total_credit_flow ?? '—');

    // load last orders for overview (non-blocking)
    try {
      const orders = await safeFetch('/admin/orders');
      // Pega os ultimos 6 pedidos
      renderOrdersTable((orders||[]).slice(-6).reverse(), 'overviewOrders', true);
    } catch (e) { /* ignore if not available */ }
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
  const root = getEl('usersTable'); if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhum usuário</div>'; return; }
  root.innerHTML = '';
  
  // Template manual de linha, ou usar cloneNode se preferir
  list.forEach(u => {
    try {
      const r = document.createElement('div'); 
      r.className='row'; 
      
      // Colunas
      const cId = `<div class="cell idcol" title="${u.id}">${u.id.substring(0,8)}...</div>`;
      const cUser = `<div class="cell usercol"><strong>${escapeHtml(u.username||u.email||'—')}</strong><div class="muted small">${escapeHtml(u.email||'')}</div></div>`;
      const cRole = `<div class="cell rolecol"><span class="badge ${u.role}">${u.role||'—'}</span></div>`;
      const cCred = `<div class="cell creditcol">${u.credits||0} $</div>`;
      
      // Ações
      const cAct = document.createElement('div'); cAct.className = 'cell actioncol';
      cAct.appendChild(createBtn('✏️', ()=>safeCall(()=>openEditUserModal(u)), 'icon-btn'));
      cAct.appendChild(createBtn('🗑️', ()=>safeCall(()=>deleteUser(u.id)), 'icon-btn danger'));
      
      r.innerHTML = cId + cUser + cRole + cCred;
      r.appendChild(cAct);
      
      root.appendChild(r);
    } catch (err) { console.error('renderUsersTable row err', err); }
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

/* ---------- role-specific extra fields (in create modal) ---------- */
function roleExtraFieldsHTML(role){
  if (role === 'empresa'){
    return `
      <fieldset class="role-extra">
        <legend>Dados da Empresa</legend>
        <label>Nome da empresa <input id="formCompanyName" name="company_name" /></label>
        <label>CNPJ <input id="formCNPJ" name="cnpj" placeholder="00.000.000/0000-00" /></label>
        <label>Endereço <input id="formCompanyAddress" name="company_address" /></label>
        <label>Telefone <input id="formCompanyPhone" name="company_phone" placeholder="(11) 9xxxx-xxxx" /></label>
        <label>Balance inicial <input id="formCompanyBalance" name="balance" type="number" value="0" /></label>
      </fieldset>`;
  } else if (role === 'cliente'){
    return `
      <fieldset class="role-extra">
        <legend>Dados do Cliente</legend>
        <label>Nome completo <input id="formFullName" name="full_name" /></label>
        <label>Endereço <input id="formClientAddress" name="client_address" /></label>
        <label>Telefone <input id="formClientPhone" name="client_phone" placeholder="(11) 9xxxx-xxxx" /></label>
      </fieldset>`;
  } else if (role === 'entregador'){
    return `
      <fieldset class="role-extra">
        <legend>Dados do Entregador</legend>
        <label>Nome completo <input id="formDeliveryFullName" name="delivery_full_name" /></label>
        <label>Documento (CPF) <input id="formDocumentId" name="document_id" placeholder="000.000.000-00" /></label>
        <label>Telefone <input id="formDeliveryPhone" name="delivery_phone" placeholder="(11) 9xxxx-xxxx" /></label>
        <label>Veículo <input id="formVehicleType" name="vehicle_type" placeholder="Moto / Bike" /></label>
      </fieldset>`;
  } else {
    return '';
  }
}

/* ================= Validation regexes & helpers ================= */
const RE = {
  username: /^[a-zA-Z0-9_.-]{3,30}$/,
  email: /^\S+@\S+\.\S+$/,
  password: /.{3,}/, // simplificado para admin poder criar fácil
  cnpj: /^.{14,18}$/, // simplificado
  cpf: /^.{11,14}$/, // simplificado
  phone: /^.{8,20}$/,
  name: /^.{2,80}$/,
  number: /^\d+$/
};

function markInvalid(el){ if(el) el.classList.add('invalid'); }
function clearInvalid(el){ if(el) el.classList.remove('invalid'); }

/* ================= validate form DOM ================= */
function validateUserFormDOM(formEl){
  const errors = [];
  let firstInvalid = null;
  const $ = sel => formEl.querySelector(sel);

  formEl.querySelectorAll('.invalid').forEach(el => clearInvalid(el));

  const username = $('input[name="username"]');
  const email = $('input[name="email"]');
  const role = $('select[name="role"]');

  if (!username || !username.value.trim()){ errors.push("Username obrigatório."); markInvalid(username); if(!firstInvalid) firstInvalid = username; }
  if (!email || !RE.email.test(email.value.trim())){ errors.push("Email inválido."); markInvalid(email); if(!firstInvalid) firstInvalid = email; }

  // extras por papel (simplificado para não travar muito o admin)
  const r = role ? role.value : '';
  if (r === 'empresa'){
    const name = $('#formCompanyName');
    if (!name || !name.value.trim()){ errors.push("Nome da empresa obrigatório."); markInvalid(name); if(!firstInvalid) firstInvalid = name; }
  }

  return { ok: errors.length === 0, errors, firstInvalid };
}

/* ================= open create user modal ================= */
function openCreateUserModal(){
  openModal(`<h3>Novo usuário</h3>
    <form id="frmCreateUser" class="modal-form">
      <div id="formError" style="display:none;color:#b00;margin-bottom:.5rem;font-weight:600;"></div>

      <label>Username <input id="formUsername" name="username" required /></label>
      <label>Email <input id="formEmail" name="email" type="email" required /></label>
      <label>Senha <input id="formPassword" name="password" type="password" required /></label>
      <label>Role
        <select id="formRole" name="role">
          <option value="cliente">cliente</option>
          <option value="empresa">empresa</option>
          <option value="entregador">entregador</option>
          <option value="admin">admin</option>
        </select>
      </label>

      <div id="roleExtraContainer"></div>

      <div style="margin-top:1rem; text-align:right;">
        <button type="button" onclick="closeModal()" class="small-btn sec">Cancelar</button>
        <button type="submit" id="submitUserBtn" class="small-btn">Criar</button>
      </div>
    </form>`);

  const form = getEl('frmCreateUser');
  const roleSelect = getEl('formRole');
  const extrasContainer = getEl('roleExtraContainer');
  const errorBox = getEl('formError');

  if (roleSelect && extrasContainer) extrasContainer.innerHTML = roleExtraFieldsHTML(roleSelect.value);

  roleSelect && roleSelect.addEventListener('change', ()=> {
    extrasContainer.innerHTML = roleExtraFieldsHTML(roleSelect.value);
  });

  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    errorBox.style.display = 'none';
    const result = validateUserFormDOM(form);
    if (!result.ok){
      errorBox.innerHTML = result.errors.map(s => `<div>⚠ ${escapeHtml(s)}</div>`).join('');
      errorBox.style.display = 'block';
      return;
    }

    try {
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      if (body.balance) body.balance = parseInt(body.balance) || 0;

      // ATENÇÃO: Mudando endpoint para /register que é o endpoint publico que cria tudo
      const regResp = await safeFetch('/register', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });

      alert('Usuário criado com sucesso.');
      closeModal();
      safeCall(loadUsers);
      safeCall(loadOverview);
    } catch (err) {
      errorBox.innerHTML = `<div>⚠ Erro: ${escapeHtml(err.message || String(err))}</div>`;
      errorBox.style.display = 'block';
    }
  });
}

/* ---------- edit / delete ---------- */
function openEditUserModal(user){
  openModal(`<h3>Editar usuário: ${user.username}</h3>
    <form id="frmEditUser" class="modal-form">
      <label>Email <input name="email" type="email" value="${escapeHtml(user.email||'')}" /></label>
      <label>Role <select name="role">
        <option ${user.role==='cliente'?'selected':''} value="cliente">cliente</option>
        <option ${user.role==='empresa'?'selected':''} value="empresa">empresa</option>
        <option ${user.role==='entregador'?'selected':''} value="entregador">entregador</option>
        <option ${user.role==='admin'?'selected':''} value="admin">admin</option>
      </select></label>
      <label>Créditos <input name="credits" type="number" value="${escapeHtml(String(user.credits||0))}" /></label>
      
      <div style="margin-top:1rem; text-align:right;">
         <button type="submit" class="small-btn">Salvar Alterações</button>
      </div>
    </form>`);

  const form = getEl('frmEditUser');
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      await safeFetch(`/admin/users/${encodeURIComponent(user.id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      alert('Usuário atualizado');
      closeModal();
      safeCall(loadUsers);
    } catch (err) { alert('Erro: ' + (err.message||err)); }
  });
}

async function deleteUser(userId){
  if (!confirm('Excluir usuário permanentemente?')) return;
  try {
    await safeFetch(`/admin/users/${encodeURIComponent(userId)}`, { method:'DELETE' });
    safeCall(loadUsers); safeCall(loadOverview);
  } catch (err) { alert('Erro excluir: ' + (err.message||err)); }
}

/* ---------- orders small renderer for overview ---------- */
function renderOrdersTable(list, containerId){
  const root = getEl(containerId); if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhum pedido recente</div>'; return; }
  root.innerHTML = '';
  
  // Header simplificado
  const header = document.createElement('div'); header.className='row header';
  header.innerHTML = `<div class="cell">ID</div><div class="cell">Valor</div><div class="cell">Status</div>`;
  root.appendChild(header);

  list.forEach(o=>{
    const r = document.createElement('div'); r.className='row';
    r.innerHTML = `<div class="cell idcol" title="${o.order_id}">${o.order_id.substring(0,8)}</div><div class="cell">${o.total_credits||0} $</div><div class="cell"><span class="badge ${o.status}">${o.status}</span></div>`;
    root.appendChild(r);
  });
}

/* ---------- export / logout ---------- */
async function exportBackup(){
  try {
    const resp = await fetch('/admin/export', { credentials:'same-origin' });
    if (!resp.ok) throw new Error("Erro no download");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'backup_tasty.json'; document.body.appendChild(a); a.click(); a.remove();
  } catch (err) { alert('Erro export: '+(err.message||err)); }
}

async function logout(){
  await fetch('/logout', { method:'POST' }).catch(()=>{});
  window.location.href = '/';
}

/* ---------- Helpers UI ---------- */
function openModal(html){
  const modal = getEl('modal');
  if (!modal) return;
  const body = getEl('modalBody');
  if(body) body.innerHTML = html;
  modal.classList.remove('hidden');
}
function closeModal(){ 
    const m = getEl('modal'); 
    if(m) m.classList.add('hidden'); 
}
// Fecha modal ao clicar fora
document.addEventListener('click', (e)=>{ 
    if(e.target && e.target.id==='modal') closeModal(); 
});

function createBtn(text, onClick, kind=''){
  const b = document.createElement('button');
  b.className = 'small-btn ' + (kind||'');
  b.innerText = text;
  b.addEventListener('click', (ev)=>{ ev.stopPropagation(); onClick(); });
  return b;
}
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }