// dashboardAdmin.js (versão completa, simplificada — Visão Geral + Usuários + validação front)
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
    getEl('statUsers') && (getEl('statUsers').innerText = data.total_users ?? '—');
    getEl('statOrders') && (getEl('statOrders').innerText = data.total_orders ?? '—');
    getEl('statFlow') && (getEl('statFlow').innerText = data.total_credit_flow ?? '—');

    // load last orders for overview (non-blocking)
    try {
      const orders = await safeFetch('/admin/orders');
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
  const tpl = getEl('userRowTpl');
  list.forEach(u => {
    try {
      if (!tpl) {
        const r = document.createElement('div'); r.className='row'; r.innerText = `${u.id} — ${u.username||u.email||'—'}`; root.appendChild(r); return;
      }
      const row = tpl.content.cloneNode(true);
      row.querySelector('.idcol').innerText = u.id || '—';
      row.querySelector('.usercol').innerHTML = `<strong>${escapeHtml(u.username||u.email||'—')}</strong><div class="muted small">${escapeHtml(u.email||'')}</div>`;
      row.querySelector('.rolecol').innerText = u.role||'—';
      row.querySelector('.creditcol').innerText = (u.credits||0) + ' creditos';
      const actionCell = row.querySelector('.actioncol');
      actionCell.innerHTML = '';
      actionCell.appendChild(createBtn('Ver', ()=>safeCall(()=>showUser(u.id))));
      actionCell.appendChild(createBtn('Editar', ()=>safeCall(()=>openEditUserModal(u))));
      actionCell.appendChild(createBtn('Excluir', ()=>safeCall(()=>deleteUser(u.id)), 'danger'));
      root.appendChild(row);
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
        <label>CNPJ <input id="formCNPJ" name="cnpj" placeholder="00.000.000/0000-00 ou 00000000000000" /></label>
        <label>Endereço <input id="formCompanyAddress" name="company_address" /></label>
        <label>Telefone <input id="formCompanyPhone" name="company_phone" placeholder="+55 (11) 9xxxx-xxxx" /></label>
        <label>Balance inicial <input id="formCompanyBalance" name="balance" type="number" value="0" /></label>
      </fieldset>`;
  } else if (role === 'cliente'){
    return `
      <fieldset class="role-extra">
        <legend>Dados do Cliente</legend>
        <label>Nome completo <input id="formFullName" name="full_name" /></label>
        <label>Endereço <input id="formClientAddress" name="client_address" /></label>
        <label>Telefone <input id="formClientPhone" name="client_phone" placeholder="+55 (11) 9xxxx-xxxx" /></label>
        <label>CPF (opcional) <input id="formClientCPF" name="client_cpf" placeholder="000.000.000-00" /></label>
      </fieldset>`;
  } else if (role === 'entregador'){
    return `
      <fieldset class="role-extra">
        <legend>Dados do Entregador</legend>
        <label>Nome completo <input id="formDeliveryFullName" name="delivery_full_name" /></label>
        <label>Documento (CPF / RG) <input id="formDocumentId" name="document_id" placeholder="CPF: 000.000.000-00" /></label>
        <label>Telefone <input id="formDeliveryPhone" name="delivery_phone" placeholder="+55 (11) 9xxxx-xxxx" /></label>
        <label>Tipo veículo <input id="formVehicleType" name="vehicle_type" placeholder="moto / carro / bicicleta" /></label>
        <label>Balance inicial <input id="formDeliveryBalance" name="delivery_balance" type="number" value="0" /></label>
      </fieldset>`;
  } else {
    return '';
  }
}

/* ================= Validation regexes & helpers ================= */
const RE = {
  username: /^[a-zA-Z0-9_.-]{3,30}$/, // letras, números, _ . - , 3-30 chars
  email: /^\S+@\S+\.\S+$/,            // simples e robusto para emails
  password: /^(?=.*[A-Za-z])(?=.*\d).{6,}$/, // min 6 chars, ao menos 1 letra e 1 dígito
  cnpj: /^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})$/, // 14 dígitos / opcional pontuação
  cpf: /^(\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/, // CPF formato 000.000.000-00
  phone: /^(\+?55\s?)?(\(?\d{2}\)?\s?)?(9?\d{4}-?\d{4})$/, // BR phone (com +55, ddd opcional)
  name: /^[A-Za-zÀ-ÿ'.\-\s]{2,80}$/, // nomes com acentos, espaços, 2-80 chars
  zip: /^\d{5}-?\d{3}$/,              // CEP 00000-000 ou 00000000
  number: /^\d+$/,                   // inteiros (usado para balance)
  vehicleType: /^(carro|moto|bicicleta|bike|van|outro|other|motorbike|bicycle)$/i
};

function markInvalid(el){
  if(!el) return;
  el.classList.add('invalid');
}
function clearInvalid(el){
  if(!el) return;
  el.classList.remove('invalid');
}

/* ================= validate form DOM ================= */
function validateUserFormDOM(formEl){
  // Retorna { ok: boolean, errors: [], firstInvalidEl: element|null }
  const errors = [];
  let firstInvalid = null;

  // helpers for querying inside the modal form
  const $ = sel => formEl.querySelector(sel);

  // clear prior marks
  formEl.querySelectorAll('.invalid').forEach(el => clearInvalid(el));

  const username = $('input[name="username"]');
  const email = $('input[name="email"]');
  const password = $('input[name="password"]');
  const role = $('select[name="role"]');

  // username
  if (!username || !username.value.trim()){
    errors.push("Username é obrigatório (3-30 chars).");
    markInvalid(username); if(!firstInvalid) firstInvalid = username;
  } else if (!RE.username.test(username.value.trim())){
    errors.push("Username inválido — apenas letras, números, _ . - (3-30 chars).");
    markInvalid(username); if(!firstInvalid) firstInvalid = username;
  }

  // email
  if (!email || !email.value.trim()){
    errors.push("Email é obrigatório.");
    markInvalid(email); if(!firstInvalid) firstInvalid = email;
  } else if (!RE.email.test(email.value.trim())){
    errors.push("Email com formato inválido.");
    markInvalid(email); if(!firstInvalid) firstInvalid = email;
  }

  // password
  if (!password || !password.value.trim()){
    errors.push("Senha é obrigatória (mínimo 6 chars, pelo menos 1 letra e 1 número).");
    markInvalid(password); if(!firstInvalid) firstInvalid = password;
  } else if (!RE.password.test(password.value)){
    errors.push("Senha fraca — mínimo 6 caracteres, inclua letras e números.");
    markInvalid(password); if(!firstInvalid) firstInvalid = password;
  }

  // role
  if (!role || !role.value){
    errors.push("Papel (role) é obrigatório.");
    markInvalid(role); if(!firstInvalid) firstInvalid = role;
  }

  // extras por papel
  const r = role ? role.value : '';
  if (r === 'empresa'){
    const name = $('#formCompanyName');
    const cnpj = $('#formCNPJ');
    const phone = $('#formCompanyPhone');
    const addr = $('#formCompanyAddress');
    const bal = $('#formCompanyBalance');

    if (!name || !name.value.trim()){ errors.push("Nome da empresa é obrigatório."); markInvalid(name); if(!firstInvalid) firstInvalid = name; }
    if (!cnpj || !cnpj.value.trim()){ errors.push("CNPJ é obrigatório."); markInvalid(cnpj); if(!firstInvalid) firstInvalid = cnpj; }
    else if (!RE.cnpj.test(cnpj.value.trim())){ errors.push("CNPJ inválido (14 dígitos)."); markInvalid(cnpj); if(!firstInvalid) firstInvalid = cnpj; }
    if (phone && phone.value.trim() && !RE.phone.test(phone.value.trim())){ errors.push("Telefone da empresa inválido."); markInvalid(phone); if(!firstInvalid) firstInvalid = phone; }
    if (!addr || addr.value.trim().length < 5){ errors.push("Endereço da empresa precisa ter ao menos 5 caracteres."); markInvalid(addr); if(!firstInvalid) firstInvalid = addr; }
    if (bal && bal.value && !RE.number.test(String(bal.value).trim())){ errors.push("Balance deve ser um número inteiro."); markInvalid(bal); if(!firstInvalid) firstInvalid = bal; }
  }

  if (r === 'cliente'){
    const fullname = $('#formFullName');
    const phone = $('#formClientPhone');
    const addr = $('#formClientAddress');
    const cpf = $('#formClientCPF');

    if (!fullname || !fullname.value.trim()){ errors.push("Nome do cliente é obrigatório."); markInvalid(fullname); if(!firstInvalid) firstInvalid = fullname; }
    else if (!RE.name.test(fullname.value.trim())){ errors.push("Nome do cliente contém caracteres inválidos."); markInvalid(fullname); if(!firstInvalid) firstInvalid = fullname; }
    if (!addr || addr.value.trim().length < 5){ errors.push("Endereço do cliente é obrigatório (mínimo 5 chars)."); markInvalid(addr); if(!firstInvalid) firstInvalid = addr; }
    if (phone && phone.value.trim() && !RE.phone.test(phone.value.trim())){ errors.push("Telefone do cliente inválido."); markInvalid(phone); if(!firstInvalid) firstInvalid = phone; }
    if (cpf && cpf.value.trim() && !RE.cpf.test(cpf.value.trim())){ errors.push("CPF inválido (use 000.000.000-00)."); markInvalid(cpf); if(!firstInvalid) firstInvalid = cpf; }
  }

  if (r === 'entregador'){
    const fullname = $('#formDeliveryFullName');
    const doc = $('#formDocumentId');
    const phone = $('#formDeliveryPhone');
    const vehicle = $('#formVehicleType');
    const balance = $('#formDeliveryBalance');

    if (!fullname || !fullname.value.trim()){ errors.push("Nome do entregador é obrigatório."); markInvalid(fullname); if(!firstInvalid) firstInvalid = fullname; }
    else if (!RE.name.test(fullname.value.trim())){ errors.push("Nome do entregador contém caracteres inválidos."); markInvalid(fullname); if(!firstInvalid) firstInvalid = fullname; }

    if (!doc || !doc.value.trim()){ errors.push("Documento do entregador é obrigatório."); markInvalid(doc); if(!firstInvalid) firstInvalid = doc; }
    else {
      const v = doc.value.trim();
      if (!(RE.cpf.test(v) || /\d{5,}/.test(v))) { // allow CPF or generic numeric id (>=5 digits)
        errors.push("Documento inválido — use CPF (000.000.000-00) ou outro ID válido.");
        markInvalid(doc); if(!firstInvalid) firstInvalid = doc;
      }
    }

    if (!phone || !phone.value.trim()){ errors.push("Telefone do entregador é obrigatório."); markInvalid(phone); if(!firstInvalid) firstInvalid = phone; }
    else if (!RE.phone.test(phone.value.trim())){ errors.push("Telefone do entregador inválido."); markInvalid(phone); if(!firstInvalid) firstInvalid = phone; }

    if (!vehicle || !vehicle.value.trim()){ errors.push("Tipo de veículo é obrigatório."); markInvalid(vehicle); if(!firstInvalid) firstInvalid = vehicle; }
    else if (!RE.vehicleType.test(vehicle.value.trim())){
      // não bloqueante — apenas aviso (se quiser, ative bloqueio)
      // errors.push("Tipo de veículo incomum (ex: moto, carro, bicicleta).");
      // markInvalid(vehicle); if(!firstInvalid) firstInvalid = vehicle;
    }

    if (balance && balance.value && !RE.number.test(String(balance.value).trim())){ errors.push("Balance do entregador deve ser número inteiro."); markInvalid(balance); if(!firstInvalid) firstInvalid = balance; }
  }

  return { ok: errors.length === 0, errors, firstInvalid };
}

/* ================= open create user modal (com validação) ================= */
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

      <div style="margin-top:.6rem"><button type="submit" id="submitUserBtn" class="small-btn">Criar</button></div>
    </form>`);

  const form = getEl('frmCreateUser');
  const roleSelect = getEl('formRole');
  const extrasContainer = getEl('roleExtraContainer');
  const errorBox = getEl('formError');

  // inicial
  if (roleSelect && extrasContainer) extrasContainer.innerHTML = roleExtraFieldsHTML(roleSelect.value);

  // trocar extras ao mudar role
  roleSelect && roleSelect.addEventListener('change', ()=> {
    extrasContainer.innerHTML = roleExtraFieldsHTML(roleSelect.value);
  });

  // envio com validação
  form && form.addEventListener('submit', async e=>{
    e.preventDefault();
    errorBox.style.display = 'none';
    const result = validateUserFormDOM(form);
    if (!result.ok){
      // show errors
      errorBox.innerHTML = result.errors.map(s => `<div>⚠ ${escapeHtml(s)}</div>`).join('');
      errorBox.style.display = 'block';
      if (result.firstInvalid) result.firstInvalid.focus();
      return;
    }

    // se passou, monta payload e envia (mesma lógica que você usa hoje)
    try {
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      // normaliza números
      if (body.balance) body.balance = parseInt(body.balance) || 0;
      if (body.delivery_balance) body.delivery_balance = parseInt(body.delivery_balance) || 0;

      // chama endpoint de registro /register (ou /admin/users conforme sua infra)
      const regResp = await safeFetch('/register', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });

      const newUserId = regResp && (regResp.user_id || (regResp.user && regResp.user.id)) ? (regResp.user_id || regResp.user.id) : null;

      // cria enterprise/delivery se necessário (não bloqueante)
      if (newUserId && body.role === 'empresa'){
        const entPayload = { owner_id: newUserId, name: body.company_name || body.username || (body.email||'').split('@')[0], balance: parseInt(body.balance||0) || 0 };
        safeFetch('/admin/enterprises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(entPayload) }).catch(()=>{});
      }
      if (newUserId && body.role === 'entregador'){
        const profile = { name: body.delivery_full_name || body.username, phone: body.delivery_phone || '' };
        const delPayload = { profile, balance: parseInt(body.delivery_balance||0) || 0 };
        safeFetch('/admin/delivery', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(delPayload) }).catch(()=>{});
      }

      alert('Usuário criado com sucesso.');
      closeModal();
      safeCall(loadUsers);
      safeCall(loadOverview);
    } catch (err) {
      errorBox.innerHTML = `<div>⚠ Erro ao criar usuário: ${escapeHtml(err.message || String(err))}</div>`;
      errorBox.style.display = 'block';
      console.error('create user error', err);
    }
  });

  // small UX: remove invalid mark on input
  form && form.querySelectorAll('input,select').forEach(inp=> inp.addEventListener('input', ()=> clearInvalid(inp)));
}

/* ---------- edit / show / delete (basic) ---------- */
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
      alert('Usuário atualizado');
      closeModal();
      safeCall(loadUsers); safeCall(loadOverview);
    } catch (err) { alert('Erro atualizar usuário: ' + (err.message||err)); console.error(err); }
  });
}

async function showUser(userId){
  try {
    const user = await safeFetch(`/admin/users/${encodeURIComponent(userId)}`);
    openModal(`<h3>${escapeHtml(user.username||user.email||'—')}</h3>
      <pre class="json-block">${escapeHtml(JSON.stringify(user,null,2))}</pre>`);
  } catch (err) { alert('Erro ao carregar usuário: ' + (err.message||err)); console.error(err); }
}

async function deleteUser(userId){
  if (!confirm('Excluir usuário permanentemente?')) return;
  try {
    await safeFetch(`/admin/users/${encodeURIComponent(userId)}`, { method:'DELETE' });
    alert('Usuário excluído');
    safeCall(loadUsers); safeCall(loadOverview);
  } catch (err) { alert('Erro excluir: ' + (err.message||err)); console.error(err); }
}

/* ---------- orders small renderer for overview ---------- */
function renderOrdersTable(list, containerId, compact=false){
  const root = getEl(containerId); if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = '<div class="muted">Nenhum pedido</div>'; return; }
  root.innerHTML = '';
  list.forEach(o=>{
    const r = document.createElement('div'); r.className='row';
    r.innerHTML = `<div class="cell idcol">${escapeHtml(o.order_id||'—')}</div><div class="cell usercol">${escapeHtml(o.user_id||'—')}</div><div class="cell totalcol">${escapeHtml(String(o.total_credits||0))} pts</div><div class="cell statuscol">${escapeHtml(o.status||'—')}</div>`;
    root.appendChild(r);
  });
}

/* ---------- export / logout ---------- */
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

async function logout(){
  try {
    // enviar POST direto com credentials; se falhar, ignore e redirecione de qualquer forma
    await fetch('/logout', { method:'POST', credentials:'same-origin' }).catch(()=>{});
  } catch (e){}
  // redireciona sempre para raiz/login
  window.location.href = '/';
}

/* ---------- helpers ---------- */
function openModal(html){
  const modal = getEl('modal'); if (!modal) return;
  getEl('modalBody').innerHTML = html;
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
  getEl('modalClose').onclick = closeModal;
}
function closeModal(){ const m = getEl('modal'); if (!m) return; m.classList.add('hidden'); m.setAttribute('aria-hidden','true'); }
document.addEventListener('click', (e)=>{ if(e.target && e.target.id==='modal') closeModal(); });

function createBtn(text, onClick, kind=''){
  const b = document.createElement('button');
  b.className = 'small-btn ' + (kind||'');
  b.innerText = text;
  b.addEventListener('click', (ev)=>{ ev.stopPropagation(); try { onClick(); } catch (err) { console.error('button handler error', err); } });
  return b;
}
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
