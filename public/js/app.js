// ─── STATE ────────────────────────────────────────────────────────────────────

function checkAuth() {
  const token = localStorage.getItem('nc_token');
  if (!token) { showLoginScreen(); return false; }
  return true;
}

function showLoginScreen() {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1a2e">
      <div style="background:#fff;border-radius:16px;padding:2rem;width:100%;max-width:360px;text-align:center">
        <div style="width:48px;height:48px;background:#C8A951;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M3 21l7-7"/><circle cx="18" cy="6" r="3"/><path d="M10 14l4-4"/></svg>
        </div>
        <h2 style="font-size:18px;font-weight:500;margin-bottom:4px">Needle Craft</h2>
        <p style="font-size:13px;color:#888;margin-bottom:1.5rem">Enter password to continue</p>
        <input type="password" id="login-pw" placeholder="Password" style="width:100%;padding:10px 14px;font-size:14px;border:1px solid #d0d0cc;border-radius:8px;margin-bottom:10px;outline:none" onkeydown="if(event.key==='Enter')doLogin()">
        <div id="login-error" style="color:#A32D2D;font-size:12px;margin-bottom:8px;display:none">Incorrect password</div>
        <button onclick="doLogin()" style="width:100%;padding:10px;background:#1a1a2e;color:#C8A951;border:none;border-radius:8px;font-size:14px;cursor:pointer">Sign in</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('login-pw')?.focus(), 100);
}

async function doLogin() {
  const pw = document.getElementById('login-pw').value;
  try {
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('nc_token', data.token);
      location.reload();
    } else {
      document.getElementById('login-error').style.display = 'block';
    }
  } catch (e) {
    document.getElementById('login-error').style.display = 'block';
  }
}

let allFirms = [];
let allProducts = [];
let currentLedgerFirmId = null;
let currentLedgerMode = 'active';
let editingBillId = null;
let revenueChart = null;
let effChart = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;
  document.getElementById('greeting').textContent = greeting();
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Wire sidebar nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage(page);
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  await loadFirms();
  await loadProducts();
  await loadDashboard();
  initNewBillForm();
});

// ─── PAGE NAVIGATION ──────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const p = document.getElementById('page-' + name);
  if (p) p.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === name);
  });

  if (name === 'dashboard') loadDashboard();
  if (name === 'clients') loadClients();
  if (name === 'products') loadProducts();
  if (name === 'payments') loadRecentPayments();
  if (name === 'new-bill') { editingBillId = null; initNewBillForm(); }
}

// ─── LOAD FIRMS ───────────────────────────────────────────────────────────────
async function loadFirms() {
  try {
    allFirms = await api('/firms');
  } catch (e) { console.error('loadFirms:', e); }
}

// ─── LOAD PRODUCTS ────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const data = await api('/products');
    allProducts = data;
    renderProductsTable(data);
  } catch (e) { console.error('loadProducts:', e); }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const d = await api('/dashboard');

    // Metrics
    document.getElementById('dash-metrics').innerHTML = `
      <div class="metric-card"><div class="metric-label">Total outstanding</div><div class="metric-value red">${fmt(d.totalOutstanding)}</div></div>
      <div class="metric-card"><div class="metric-label">Collected this month</div><div class="metric-value green">${fmt(d.collectedThisMonth)}</div></div>
      <div class="metric-card"><div class="metric-label">Billed this month</div><div class="metric-value gold">${fmt(d.billedThisMonth)}</div></div>
      <div class="metric-card"><div class="metric-label">Collection rate</div><div class="metric-value blue">${d.collectionRate}%</div></div>`;

    // Aging strip
    const ag = d.aging;
    document.getElementById('aging-strip').innerHTML = `
      <div class="aging-card age-0" onclick="showOutstandingFiltered(0,30)"><div class="aging-label">Current 0–30 days</div><div class="aging-value">${fmt(ag.current.amount)}</div><div class="aging-sub">${ag.current.count} clients</div></div>
      <div class="aging-card age-1" onclick="showOutstandingFiltered(31,60)"><div class="aging-label">Overdue 31–60 days</div><div class="aging-value">${fmt(ag.overdue31.amount)}</div><div class="aging-sub">${ag.overdue31.count} clients</div></div>
      <div class="aging-card age-2" onclick="showOutstandingFiltered(61,90)"><div class="aging-label">Overdue 61–90 days</div><div class="aging-value">${fmt(ag.overdue61.amount)}</div><div class="aging-sub">${ag.overdue61.count} clients</div></div>
      <div class="aging-card age-3" onclick="showOutstandingFiltered(91,9999)"><div class="aging-label">Critical 90+ days</div><div class="aging-value">${fmt(ag.critical.amount)}</div><div class="aging-sub">${ag.critical.count} clients</div></div>`;

    // Charts
    const months = Object.keys(d.monthlyStats);
    const labels = months.map(m => { const [y, mo] = m.split('-'); return new Date(y, mo - 1).toLocaleString('default', { month: 'short' }); });
    const billed = months.map(m => Math.round(d.monthlyStats[m].billed / 100) / 10);
    const collected = months.map(m => Math.round(d.monthlyStats[m].collected / 100) / 10);
    const efficiency = months.map(m => d.monthlyStats[m].billed > 0 ? Math.round((d.monthlyStats[m].collected / d.monthlyStats[m].billed) * 100) : 0);

    if (revenueChart) revenueChart.destroy();
    if (effChart) effChart.destroy();

    revenueChart = new Chart(document.getElementById('revenueChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Billed', data: billed, backgroundColor: '#1a1a2e', borderRadius: 3 }, { label: 'Collected', data: collected, backgroundColor: '#C8A951', borderRadius: 3 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888' } }, y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#888', callback: v => '₨' + v + 'L' } } } }
    });

    effChart = new Chart(document.getElementById('effChart'), {
      type: 'line',
      data: { labels, datasets: [{ label: 'Collection %', data: efficiency, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', borderWidth: 2, pointBackgroundColor: '#1D9E75', pointRadius: 4, fill: true, tension: 0.3 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888' } }, y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#888', callback: v => v + '%' } } } }
    });

    // Anomalies table
    renderAnomalyTable(d.anomalies || []);

    // Top clients
    document.getElementById('top-clients-table').innerHTML = d.top10.length === 0 ? '<p style="color:#888;font-size:13px;padding:8px">No outstanding balances.</p>' : `
      <table><thead><tr><th style="width:24px">#</th><th>Client</th><th style="text-align:right;width:100px">Balance</th></tr></thead>
      <tbody>${d.top10.map((c, i) => `<tr class="tr-hover" onclick="openLedger(${c.id})"><td>${i + 1}</td><td>${c.name}</td><td style="text-align:right" class="red">${fmtNum(c.balance)}</td></tr>`).join('')}</tbody></table>`;

    // Today's bills
    document.getElementById('todays-bills-table').innerHTML = d.todayBills.length === 0 ? '<p style="color:#888;font-size:13px;padding:8px">No bills yet today.</p>' : `
      <table><thead><tr><th style="width:50px">Bill #</th><th>Client</th><th style="width:50px">Type</th><th style="text-align:right;width:80px">Amount</th><th style="width:36px"></th></tr></thead>
      <tbody>${d.todayBills.map(b => `<tr class="tr-hover"><td>${b.id}</td><td>${b.firm_name}</td><td><span class="badge ${b.is_credit ? 'badge-credit' : 'badge-cash'}">${b.is_credit ? 'Credit' : 'Cash'}</span></td><td style="text-align:right">${fmtNum(b.total_amount)}</td><td><button class="icon-btn" onclick="editBill(${b.id})" title="Edit"><i class="ti ti-edit"></i></button></td></tr>`).join('')}</tbody></table>`;

  } catch (e) { console.error('loadDashboard:', e); }
}

function renderAnomalyTable(anomalies) {
  const wrap = document.getElementById('anomaly-table-wrap');
  if (!anomalies.length) { wrap.innerHTML = '<p style="color:#888;font-size:13px;padding:4px">No anomalies detected.</p>'; return; }
  wrap.innerHTML = `<table style="table-layout:auto">
    <thead><tr><th style="width:90px">Type</th><th>Client</th><th>Details</th><th style="width:70px">When</th><th style="width:80px"></th></tr></thead>
    <tbody>${anomalies.map(a => `
      <tr id="anom-${a.id}">
        <td><span class="badge ${a.type === 'Duplicate' ? 'badge-danger' : 'badge-warn'}">${a.type}</span></td>
        <td>${a.firm_name || '—'}</td>
        <td style="white-space:normal;font-size:12px">${a.details}</td>
        <td style="font-size:11px;color:#888">${fmtDate(a.detected_at)}</td>
        <td><div class="action-btns">
          ${a.firm_id ? `<button class="icon-btn" onclick="openLedger(${a.firm_id})" title="View ledger"><i class="ti ti-book"></i></button>` : ''}
          <button class="icon-btn del" onclick="dismissAnomaly(${a.id})" title="Dismiss"><i class="ti ti-x"></i></button>
        </div></td>
      </tr>`).join('')}
    </tbody></table>`;
}

async function dismissAnomaly(id) {
  try {
    await api(`/anomalies?id=${id}`, 'PUT');
    const row = document.getElementById('anom-' + id);
    if (row) row.remove();
  } catch (e) { alert(e.message); }
}

// ─── NEW BILL ─────────────────────────────────────────────────────────────────
function initNewBillForm() {
  document.getElementById('bill-date').value = today();
  document.getElementById('bill-bilty').value = '';
  document.getElementById('bill-do').value = '';
  document.getElementById('bill-bilty-charges').value = '0';
  document.getElementById('bill-pkg-charges').value = '0';
  document.getElementById('bill-client-input').value = '';
  document.getElementById('bill-firm-id').value = '';
  document.getElementById('prev-bal-row').style.display = 'none';
  document.getElementById('new-balance-row').style.display = 'none';
  document.getElementById('grand-total-val').textContent = '₨ 0';
  document.getElementById('amount-words').textContent = '';

  const tbody = document.getElementById('bill-items-body');
  tbody.innerHTML = '';
  addBillRow(); addBillRow(); addBillRow();

  document.getElementById('next-bill-num').textContent = 'Auto';

  buildSearchDropdown('bill-client-input', 'bill-client-dropdown', allFirms, 'bill-firm-id', async (id) => {
    await loadPrevBalance(id);
  });

  // Set toggle to Credit
  document.querySelectorAll('#page-new-bill .tog-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#page-new-bill .tog-btn:last-child').classList.add('active');
  document.getElementById('bill-type').value = 'credit';
}

async function loadPrevBalance(firmId) {
  try {
    const firm = await api(`/firms?id=${firmId}`);
    const balance = firm.balance || 0;
    document.getElementById('prev-bal-row').style.display = 'block';
    document.getElementById('prev-bal-val').textContent = fmt(balance);
    document.getElementById('prev-bal-val').className = balance > 0 ? 'prev-bal-val red' : 'prev-bal-val green';
    recalcTotal();
  } catch (e) { }
}

function addBillRow() {
  const tbody = document.getElementById('bill-items-body');
  const rowNum = tbody.rows.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="color:#888;font-size:11px;text-align:center">${rowNum}</td>
    <td style="position:relative">
      <input class="particular-input" placeholder="Code or name..." oninput="onParticularInput(this)" onblur="hideParticulars(this)">
      <div class="dropdown-list hidden particular-dropdown"></div>
    </td>
    <td><input placeholder="Colour"></td>
    <td><input placeholder="Size"></td>
    <td><input type="number" min="0" placeholder="0" onchange="calcRowTotal(this)" oninput="calcRowTotal(this)"></td>
    <td><input type="number" min="0" placeholder="0" onchange="calcRowTotal(this)" oninput="calcRowTotal(this)"></td>
    <td style="font-weight:500;font-size:12px;text-align:right;padding-right:6px">—</td>
    <td><button class="icon-btn del" onclick="this.closest('tr').remove();recalcTotal()" title="Remove"><i class="ti ti-x"></i></button></td>`;
  tbody.appendChild(tr);
}

function onParticularInput(input) {
  const q = input.value.toLowerCase();
  const dropdown = input.nextElementSibling;
  const matches = allProducts.filter(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  if (!q || matches.length === 0) { dropdown.classList.add('hidden'); return; }
  dropdown.innerHTML = matches.map(p => `<div class="dropdown-item" data-code="${p.code}" data-name="${p.name}" data-price="${p.standard_price}">${p.code} — ${p.name} <span style="color:#888;float:right">₨${fmtNum(p.standard_price)}</span></div>`).join('');
  dropdown.classList.remove('hidden');
  dropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = item.dataset.name;
      input.dataset.code = item.dataset.code;
      // Fill price
      const row = input.closest('tr');
      const priceInput = row.querySelectorAll('input[type=number]')[1];
      if (priceInput && (!priceInput.value || priceInput.value === '0')) priceInput.value = item.dataset.price;
      dropdown.classList.add('hidden');
      calcRowTotal(priceInput);
    });
  });
}

function hideParticulars(input) {
  setTimeout(() => { const d = input.nextElementSibling; if (d) d.classList.add('hidden'); }, 150);
}

function calcRowTotal(input) {
  const row = input.closest('tr');
  const inputs = row.querySelectorAll('input[type=number]');
  const qty = parseFloat(inputs[0]?.value) || 0;
  const price = parseFloat(inputs[1]?.value) || 0;
  const total = qty * price;
  const totalCell = row.cells[6];
  totalCell.textContent = total > 0 ? fmtNum(total) : '—';
  recalcTotal();
}

function recalcTotal() {
  const rows = document.querySelectorAll('#bill-items-body tr');
  let sum = 0;
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input[type=number]');
    const qty = parseFloat(inputs[0]?.value) || 0;
    const price = parseFloat(inputs[1]?.value) || 0;
    sum += qty * price;
  });
  const bilty = parseFloat(document.getElementById('bill-bilty-charges').value) || 0;
  const pkg = parseFloat(document.getElementById('bill-pkg-charges').value) || 0;
  const grand = sum + bilty + pkg;
  document.getElementById('grand-total-val').textContent = fmt(grand);
  document.getElementById('amount-words').textContent = amountInWords(grand);

  // Update new balance
  const prevBalEl = document.getElementById('prev-bal-val');
  const firmId = document.getElementById('bill-firm-id').value;
  if (firmId && prevBalEl) {
    const prevText = prevBalEl.textContent.replace(/[₨,\s]/g, '');
    const prev = parseFloat(prevText) || 0;
    const newBal = prev + grand;
    document.getElementById('new-balance-row').style.display = 'block';
    document.getElementById('new-bal-val').textContent = fmt(newBal);
  }
}

function setBillType(type, btn) {
  document.querySelectorAll('#page-new-bill .tog-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('bill-type').value = type;
}

function collectBillItems() {
  const rows = document.querySelectorAll('#bill-items-body tr');
  const items = [];
  rows.forEach(row => {
    const particular = row.querySelector('.particular-input')?.value?.trim();
    if (!particular) return;
    const inputs = row.querySelectorAll('input[type=number]');
    const qty = parseInt(inputs[0]?.value) || 0;
    const price = parseInt(inputs[1]?.value) || 0;
    if (qty === 0 && price === 0) return;
    const colour = row.cells[2].querySelector('input')?.value?.trim() || '';
    const size = row.cells[3].querySelector('input')?.value?.trim() || '';
    const product = allProducts.find(p => p.name.toLowerCase() === particular.toLowerCase() || p.code.toLowerCase() === particular.toLowerCase());
    items.push({ product_id: product?.id || null, product_name: product?.name || particular, colour, size, quantity: qty, price, total: qty * price });
  });
  return items;
}

async function saveBill() {
  const firmId = parseInt(document.getElementById('bill-firm-id').value);
  if (!firmId) { alert('Please select a client.'); return; }
  const billDate = document.getElementById('bill-date').value;
  if (!billDate) { alert('Please enter a date.'); return; }

  const items = collectBillItems();
  if (items.length === 0) { alert('Please add at least one item.'); return; }

  const total = items.reduce((s, i) => s + i.total, 0)
    + (parseInt(document.getElementById('bill-bilty-charges').value) || 0)
    + (parseInt(document.getElementById('bill-pkg-charges').value) || 0);

  const billData = {
    firm_id: firmId,
    bill_date: billDate,
    bilty_no: document.getElementById('bill-bilty').value,
    do_no: document.getElementById('bill-do').value,
    bilty_charges: parseInt(document.getElementById('bill-bilty-charges').value) || 0,
    packaging_charges: parseInt(document.getElementById('bill-pkg-charges').value) || 0,
    total_amount: total,
    is_credit: document.getElementById('bill-type').value === 'credit',
    items
  };

  try {
    let result;
    if (editingBillId) {
      result = await api(`/bills?id=${editingBillId}`, 'PUT', billData);
      result.anomalies = [];
    } else {
      result = await api('/bills', 'POST', billData);
    }

    const firm = allFirms.find(f => f.id === firmId);
    const hasAnomaly = result.anomalies && result.anomalies.length > 0;

    const toastEntries = (result.recentBills || []).map(b => ({
      date: fmtDate(b.bill_date),
      desc: `Bill # ${b.id}`,
      amount: fmt(b.total_amount),
      highlight: hasAnomaly && b.total_amount === total && b.id !== result.bill?.id
    }));

    showToast({
      title: hasAnomaly ? `Bill saved — ${result.anomalies[0].type} detected` : (editingBillId ? 'Bill updated' : 'Bill saved'),
      subtitle: `Recent entries — ${firm?.name || ''}`,
      entries: toastEntries,
      hasAnomaly,
      firmId
    });

    editingBillId = null;
    initNewBillForm();
    await loadFirms();
  } catch (e) { alert('Error saving bill: ' + e.message); }
}

async function editBill(id) {
  try {
    const bill = await api(`/bills?id=${id}`);
    editingBillId = id;
    showPage('new-bill');
    document.querySelector('.nav-btn[data-page="new-bill"]').classList.add('active');

    await new Promise(r => setTimeout(r, 50));

    const firm = allFirms.find(f => f.id === bill.firm_id);
    document.getElementById('bill-client-input').value = firm?.name || '';
    document.getElementById('bill-firm-id').value = bill.firm_id;
    document.getElementById('bill-date').value = bill.bill_date;
    document.getElementById('bill-bilty').value = bill.bilty_no || '';
    document.getElementById('bill-do').value = bill.do_no || '';
    document.getElementById('bill-bilty-charges').value = bill.bilty_charges || 0;
    document.getElementById('bill-pkg-charges').value = bill.packaging_charges || 0;
    document.getElementById('next-bill-num').textContent = bill.id;

    if (!bill.is_credit) {
      document.querySelectorAll('#page-new-bill .tog-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('#page-new-bill .tog-btn:first-child').classList.add('active');
      document.getElementById('bill-type').value = 'cash';
    }

    const tbody = document.getElementById('bill-items-body');
    tbody.innerHTML = '';
    (bill.bill_items || []).forEach(item => {
      addBillRow();
      const row = tbody.lastElementChild;
      row.querySelector('.particular-input').value = item.product_name;
      row.cells[2].querySelector('input').value = item.colour || '';
      row.cells[3].querySelector('input').value = item.size || '';
      row.querySelectorAll('input[type=number]')[0].value = item.quantity || 0;
      row.querySelectorAll('input[type=number]')[1].value = item.price || 0;
      row.cells[6].textContent = fmtNum(item.total);
    });
    addBillRow();
    recalcTotal();
    await loadPrevBalance(bill.firm_id);

    buildSearchDropdown('bill-client-input', 'bill-client-dropdown', allFirms, 'bill-firm-id', async (id) => { await loadPrevBalance(id); });
  } catch (e) { alert('Error loading bill: ' + e.message); }
}

async function deleteBill(id) {
  if (!window.confirm('Delete this bill? This cannot be undone.')) return;
  try {
    await api(`/bills?id=${id}`, 'DELETE');
    showToast({ title: 'Bill deleted', subtitle: '', entries: [] });
    showPage('dashboard');
  } catch (e) { alert(e.message); }
}

// ─── PRINT ────────────────────────────────────────────────────────────────────
function previewPrint() {
  const firmId = document.getElementById('bill-firm-id').value;
  const firm = allFirms.find(f => f.id == firmId);
  const billDate = document.getElementById('bill-date').value;
  const biltyNo = document.getElementById('bill-bilty').value;
  const doNo = document.getElementById('bill-do').value;
  const billType = document.getElementById('bill-type').value;
  const items = collectBillItems();
  const biltyCharges = parseInt(document.getElementById('bill-bilty-charges').value) || 0;
  const pkgCharges = parseInt(document.getElementById('bill-pkg-charges').value) || 0;
  const grand = items.reduce((s, i) => s + i.total, 0) + biltyCharges + pkgCharges;
  const prevBalText = document.getElementById('prev-bal-val')?.textContent?.replace(/[₨,\s]/g, '') || '0';
  const prevBal = parseFloat(prevBalText) || 0;
  const newBal = prevBal + grand;
  const billNum = editingBillId || document.getElementById('next-bill-num').textContent;

  const html = `
    <div class="print-doc">
      <div class="print-header">
        <div class="print-logo">NEEDLE CRAFT</div>
        <div class="print-sub">Wholesale Garments — Rawalpindi</div>
        <div class="print-sub">Ph: 051-XXXXXXX</div>
      </div>
      <div class="print-meta">
        <div><strong>Bill #:</strong> ${billNum}<br>${biltyNo ? `<strong>Bilty #:</strong> ${biltyNo}<br>` : ''}${doNo ? `<strong>D/O #:</strong> ${doNo}` : ''}</div>
        <div style="text-align:right"><strong>Date:</strong> ${fmtDate(billDate)}<br><strong>Type:</strong> ${billType === 'credit' ? 'Credit' : 'Cash'}<br><strong>Client:</strong> ${firm?.name || '—'}</div>
      </div>
      <table class="print-table">
        <thead><tr><th>#</th><th>Particular</th><th>Colour</th><th>Size</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.product_name}</td><td>${item.colour || ''}</td><td>${item.size || ''}</td><td>${item.quantity}</td><td>${fmtNum(item.price)}</td><td>${fmtNum(item.total)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="print-totals">
        ${biltyCharges ? `<div>Bilty charges: ${fmtNum(biltyCharges)}</div>` : ''}
        ${pkgCharges ? `<div>Packaging: ${fmtNum(pkgCharges)}</div>` : ''}
        <div style="font-size:15px;font-weight:700;margin-top:5px">Total: Rs. ${fmtNum(grand)}</div>
        <div class="print-words">${amountInWords(grand)}</div>
      </div>
      <div class="print-balances">
        <div>Previous balance: Rs. ${fmtNum(prevBal)}</div>
        <div><strong>New balance: Rs. ${fmtNum(newBal)}</strong></div>
      </div>
      <div class="print-footer">Thank you for your business &nbsp;·&nbsp; Needle Craft</div>
    </div>`;

  document.getElementById('print-content').innerHTML = html;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-print').classList.add('active');
}

function hidePrint() {
  showPage(editingBillId ? 'new-bill' : 'new-bill');
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
function initPaymentsForm() {
  document.getElementById('pmt-date').value = today();
  document.getElementById('pmt-amount').value = '';
  document.getElementById('pmt-method').value = 'Cash';
  document.getElementById('pmt-bank').value = '';
  document.getElementById('pmt-ref').value = '';
  document.getElementById('pmt-memo').value = '';
  document.getElementById('bank-fields').style.display = 'none';
  document.getElementById('pmt-client-input').value = '';
  document.getElementById('pmt-firm-id').value = '';
  buildSearchDropdown('pmt-client-input', 'pmt-client-dropdown', allFirms, 'pmt-firm-id', null);
}

document.addEventListener('DOMContentLoaded', () => { setTimeout(initPaymentsForm, 100); });

function toggleBankFields() {
  const method = document.getElementById('pmt-method').value;
  document.getElementById('bank-fields').style.display = (method === 'Cheque' || method === 'Bank Transfer') ? 'block' : 'none';
}

async function savePayment() {
  const firmId = parseInt(document.getElementById('pmt-firm-id').value);
  if (!firmId) { alert('Please select a client.'); return; }
  const amount = parseInt(document.getElementById('pmt-amount').value);
  if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

  const pmtData = {
    firm_id: firmId,
    payment_date: document.getElementById('pmt-date').value,
    amount,
    method: document.getElementById('pmt-method').value,
    bank_name: document.getElementById('pmt-bank').value,
    cheque_number: document.getElementById('pmt-ref').value,
    memo: document.getElementById('pmt-memo').value,
  };

  try {
    const result = await api('/payments', 'POST', pmtData);
    const firm = allFirms.find(f => f.id === firmId);
    const hasAnomaly = !!result.anomaly;

    const entries = [];
    (result.recentBills || []).forEach(b => entries.push({ date: fmtDate(b.bill_date), desc: `Bill # ${b.id}`, amount: fmt(b.total_amount), highlight: false }));
    (result.recentPmts || []).slice(0, 2).forEach(p => entries.push({ date: fmtDate(p.payment_date), desc: p.method + (p.bank_name ? ' — ' + p.bank_name : ''), amount: fmt(p.amount), highlight: false }));

    showToast({
      title: hasAnomaly ? 'Payment saved — Overpayment detected' : 'Payment saved',
      subtitle: `Recent entries — ${firm?.name || ''}`,
      entries,
      hasAnomaly,
      firmId
    });

    initPaymentsForm();
    await loadRecentPayments();
    await loadFirms();
  } catch (e) { alert('Error saving payment: ' + e.message); }
}

async function loadRecentPayments() {
  try {
    const data = await api('/payments');
    const wrap = document.getElementById('recent-pmts-table');
    if (!data.length) { wrap.innerHTML = '<p style="color:#888;font-size:13px;padding:8px">No payments yet.</p>'; return; }
    wrap.innerHTML = `<table style="table-layout:auto">
      <thead><tr><th>Date</th><th>Client</th><th>Method</th><th style="text-align:right">Amount</th><th style="width:70px"></th></tr></thead>
      <tbody>${data.map(p => `
        <tr>
          <td>${fmtDate(p.payment_date)}</td>
          <td><button class="btn-link" onclick="openLedger(${p.firm_id})">${p.firms?.name || '—'}</button></td>
          <td>${p.method}${p.bank_name ? ' — ' + p.bank_name : ''}</td>
          <td style="text-align:right">${fmt(p.amount)}</td>
          <td><div class="action-btns">
            <button class="icon-btn" onclick="editPaymentModal(${p.id})" title="Edit"><i class="ti ti-edit"></i></button>
            <button class="icon-btn del" onclick="deletePayment(${p.id})" title="Delete"><i class="ti ti-trash"></i></button>
          </div></td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch (e) { console.error(e); }
}

async function deletePayment(id) {
  if (!window.confirm('Delete this payment? This cannot be undone.')) return;
  try {
    await api(`/payments?id=${id}`, 'DELETE');
    showToast({ title: 'Payment deleted', entries: [] });
    await loadRecentPayments();
    await loadFirms();
  } catch (e) { alert(e.message); }
}

async function editPaymentModal(id) {
  try {
    const data = await api('/payments');
    const p = data.find(x => x.id === id);
    if (!p) return;
    showModal(`
      <div class="modal-title">Edit payment</div>
      <div class="fg"><label>Date</label><input type="date" id="ep-date" value="${p.payment_date}"></div>
      <div class="fg"><label>Amount (₨)</label><input type="number" id="ep-amount" value="${p.amount}"></div>
      <div class="fg"><label>Method</label><select id="ep-method"><option ${p.method === 'Cash' ? 'selected' : ''}>Cash</option><option ${p.method === 'Cheque' ? 'selected' : ''}>Cheque</option><option ${p.method === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option><option ${p.method === 'Draft' ? 'selected' : ''}>Draft</option></select></div>
      <div class="fg"><label>Bank name</label><input type="text" id="ep-bank" value="${p.bank_name || ''}"></div>
      <div class="fg"><label>Reference #</label><input type="text" id="ep-ref" value="${p.cheque_number || ''}"></div>
      <div class="fg"><label>Memo</label><input type="text" id="ep-memo" value="${p.memo || ''}"></div>
      <div class="btn-row">
        <button class="btn-primary" onclick="saveEditedPayment(${id})"><i class="ti ti-device-floppy"></i> Save</button>
        <button class="btn-sec" onclick="closeModalDirect()">Cancel</button>
      </div>`);
  } catch (e) { alert(e.message); }
}

async function saveEditedPayment(id) {
  const body = {
    payment_date: document.getElementById('ep-date').value,
    amount: parseInt(document.getElementById('ep-amount').value),
    method: document.getElementById('ep-method').value,
    bank_name: document.getElementById('ep-bank').value,
    cheque_number: document.getElementById('ep-ref').value,
    memo: document.getElementById('ep-memo').value,
  };
  try {
    await api(`/payments?id=${id}`, 'PUT', body);
    closeModalDirect();
    showToast({ title: 'Payment updated', entries: [] });
    await loadRecentPayments();
    await loadFirms();
  } catch (e) { alert(e.message); }
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
async function loadClients() {
  try {
    allFirms = await api('/firms');
    renderClientsTable(allFirms);
  } catch (e) { console.error(e); }
}

function renderClientsTable(firms) {
  const wrap = document.getElementById('clients-table');
  if (!firms.length) { wrap.innerHTML = '<p style="color:#888;font-size:13px;padding:12px">No clients found.</p>'; return; }
  wrap.innerHTML = `<table>
    <thead><tr><th style="width:36px">#</th><th>Name</th><th style="text-align:right;width:110px">Balance</th><th style="width:80px"></th></tr></thead>
    <tbody>${firms.map((f, i) => `
      <tr>
        <td style="color:#888">${i + 1}</td>
        <td>${f.name}</td>
        <td style="text-align:right" class="${f.balance > 0 ? 'red' : 'green'}">${fmt(f.balance || 0)}</td>
        <td><div class="action-btns">
          <button class="icon-btn" onclick="openLedger(${f.id})" title="View ledger"><i class="ti ti-book"></i></button>
          <button class="icon-btn del" onclick="deleteClient(${f.id})" title="Delete"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>`).join('')}
    </tbody></table>`;
}

function filterClients() {
  const q = document.getElementById('client-search').value.toLowerCase();
  const filtered = allFirms.filter(f => f.name.toLowerCase().includes(q));
  renderClientsTable(filtered);
}

function showAddClientModal() {
  showModal(`
    <div class="modal-title">Add new client</div>
    <div class="fg"><label>Client / firm name</label><input type="text" id="new-client-name" placeholder="e.g. Garrison Army Store Quetta" autofocus></div>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveNewClient()"><i class="ti ti-check"></i> Save client</button>
      <button class="btn-sec" onclick="closeModalDirect()">Cancel</button>
    </div>`);
}

async function saveNewClient() {
  const name = document.getElementById('new-client-name').value.trim();
  if (!name) { alert('Please enter a name.'); return; }
  try {
    const firm = await api('/firms', 'POST', { name });
    closeModalDirect();
    showToast({ title: `Client "${firm.name}" added`, entries: [] });
    await loadFirms();
    await loadClients();
  } catch (e) { alert(e.message); }
}

async function deleteClient(id) {
  if (!window.confirm('Delete this client?')) return;
  try {
    await api(`/firms?id=${id}`, 'DELETE');
    showToast({ title: 'Client deleted', entries: [] });
    await loadFirms();
    await loadClients();
  } catch (e) { alert(e.message); }
}

// ─── LEDGER ───────────────────────────────────────────────────────────────────
async function openLedger(firmId) {
  currentLedgerFirmId = firmId;
  currentLedgerMode = 'active';
  const firm = allFirms.find(f => f.id == firmId);
  document.getElementById('ledger-firm-name').textContent = firm?.name || 'Ledger';
  document.getElementById('ledger-from').value = '';
  document.getElementById('ledger-to').value = '';
  document.getElementById('ledger-active-btn').classList.add('active');
  document.getElementById('ledger-archive-btn').classList.remove('active');
  document.getElementById('archive-banner').classList.add('hidden');
  showPage('ledger');
  await loadLedger();
}

async function loadLedger() {
  if (!currentLedgerFirmId) return;
  const from = document.getElementById('ledger-from').value;
  const to = document.getElementById('ledger-to').value;
  const isArchive = currentLedgerMode === 'archive';
  let url = `/ledger?firm_id=${currentLedgerFirmId}`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  if (isArchive) url += `&archive=1`;

  try {
    const data = await api(url);
    document.getElementById('ledger-metrics').innerHTML = `
      <div class="metric-card"><div class="metric-label">Total billed</div><div class="metric-value">${fmt(data.totalBilled)}</div></div>
      <div class="metric-card"><div class="metric-label">Total paid</div><div class="metric-value green">${fmt(data.totalPaid)}</div></div>
      <div class="metric-card"><div class="metric-label">Balance due</div><div class="metric-value ${data.balance > 0 ? 'red' : 'green'}">${fmt(data.balance)}</div></div>`;

    if (!data.entries.length) {
      document.getElementById('ledger-table').innerHTML = '<p style="color:#888;font-size:13px;padding:12px">No entries found.</p>';
      return;
    }

    document.getElementById('ledger-table').innerHTML = `<table style="table-layout:auto">
      <thead><tr><th style="width:90px">Date</th><th>Description</th><th style="text-align:right;width:90px">Credit</th><th style="text-align:right;width:90px">Debit</th><th style="text-align:right;width:90px">Balance</th>${isArchive ? '' : '<th style="width:60px"></th>'}</tr></thead>
      <tbody>${data.entries.map(e => `
        <tr>
          <td style="color:#888;font-size:12px">${fmtDate(e.date)}</td>
          <td>${e.description}</td>
          <td style="text-align:right">${e.credit > 0 ? fmtNum(e.credit) : '—'}</td>
          <td style="text-align:right">${e.debit > 0 ? fmtNum(e.debit) : '—'}</td>
          <td style="text-align:right" class="${e.balance > 0 ? 'red' : 'green'}">${fmtNum(e.balance)}</td>
          ${isArchive ? '' : `<td><div class="action-btns">
            ${e.type === 'bill' ? `<button class="icon-btn" onclick="editBill(${e.id})" title="Edit bill"><i class="ti ti-edit"></i></button>` : `<button class="icon-btn" onclick="editPaymentModal(${e.id})" title="Edit payment"><i class="ti ti-edit"></i></button>`}
            <button class="icon-btn del" onclick="${e.type === 'bill' ? `deleteBill(${e.id})` : `deletePayment(${e.id})`}" title="Delete"><i class="ti ti-trash"></i></button>
          </div></td>`}
        </tr>`).join('')}
      </tbody></table>`;
  } catch (e) { console.error(e); }
}

function setLedgerMode(mode, btn) {
  currentLedgerMode = mode;
  document.querySelectorAll('.archive-toggle .tog-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('archive-banner').classList.toggle('hidden', mode !== 'archive');
  loadLedger();
}

function clearLedgerFilter() {
  document.getElementById('ledger-from').value = '';
  document.getElementById('ledger-to').value = '';
  loadLedger();
}

function printLedger() { window.print(); }

function exportLedgerPDF() {
  alert('To export as PDF: use the Print button and select "Save as PDF" as your printer.');
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
function renderProductsTable(products) {
  const wrap = document.getElementById('products-table');
  if (!wrap) return;
  if (!products.length) { wrap.innerHTML = '<p style="color:#888;font-size:13px;padding:12px">No products yet.</p>'; return; }
  wrap.innerHTML = `<table style="table-layout:auto">
    <thead><tr><th>Code</th><th>Product name</th><th style="text-align:right">Std. price</th><th style="text-align:right;color:#bbb">Cost price</th><th style="text-align:right;color:#bbb">Margin</th><th style="text-align:right">Units sold</th><th style="width:60px"></th></tr></thead>
    <tbody>${products.map(p => `
      <tr>
        <td style="font-weight:500">${p.code}</td>
        <td>${p.name}</td>
        <td style="text-align:right">${fmtNum(p.standard_price)}</td>
        <td style="text-align:right;color:#888;font-size:12px">${p.cost_price ? fmtNum(p.cost_price) : '—'}</td>
        <td style="text-align:right;color:#888;font-size:12px">${p.margin_pct !== null ? p.margin_pct + '%' : '—'}</td>
        <td style="text-align:right">${fmtNum(p.units_sold)}</td>
        <td><div class="action-btns">
          <button class="icon-btn" onclick="editProductModal(${p.id})" title="Edit"><i class="ti ti-edit"></i></button>
          <button class="icon-btn del" onclick="deleteProduct(${p.id})" title="Delete"><i class="ti ti-trash"></i></button>
        </div></td>
      </tr>`).join('')}
    </tbody></table>`;
}

function showAddProductModal() {
  showModal(`
    <div class="modal-title">Add new product</div>
    <div class="form-2">
      <div class="fg"><label>Code</label><input type="text" id="np-code" placeholder="e.g. SV" style="text-transform:uppercase"></div>
      <div class="fg"><label>Standard price (₨)</label><input type="number" id="np-price" placeholder="0" min="0"></div>
    </div>
    <div class="fg"><label>Product name</label><input type="text" id="np-name" placeholder="e.g. Summer Vests"></div>
    <div class="fg"><label>Cost price (₨) — optional</label><input type="number" id="np-cost" placeholder="0" min="0"></div>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveNewProduct()"><i class="ti ti-check"></i> Save product</button>
      <button class="btn-sec" onclick="closeModalDirect()">Cancel</button>
    </div>`);
}

async function saveNewProduct() {
  const code = document.getElementById('np-code').value.trim().toUpperCase();
  const name = document.getElementById('np-name').value.trim();
  const price = parseInt(document.getElementById('np-price').value) || 0;
  const cost = parseInt(document.getElementById('np-cost').value) || 0;
  if (!code || !name) { alert('Please enter code and name.'); return; }
  try {
    await api('/products', 'POST', { code, name, standard_price: price, cost_price: cost });
    closeModalDirect();
    showToast({ title: `Product "${name}" added`, entries: [] });
    await loadProducts();
  } catch (e) { alert(e.message); }
}

async function editProductModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  showModal(`
    <div class="modal-title">Edit product</div>
    <div class="form-2">
      <div class="fg"><label>Code</label><input type="text" id="ep2-code" value="${p.code}" style="text-transform:uppercase"></div>
      <div class="fg"><label>Standard price (₨)</label><input type="number" id="ep2-price" value="${p.standard_price}" min="0"></div>
    </div>
    <div class="fg"><label>Product name</label><input type="text" id="ep2-name" value="${p.name}"></div>
    <div class="fg"><label>Cost price (₨) — optional</label><input type="number" id="ep2-cost" value="${p.cost_price || 0}" min="0"></div>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveEditedProduct(${id})"><i class="ti ti-device-floppy"></i> Save</button>
      <button class="btn-sec" onclick="closeModalDirect()">Cancel</button>
    </div>`);
}

async function saveEditedProduct(id) {
  const body = {
    code: document.getElementById('ep2-code').value.trim().toUpperCase(),
    name: document.getElementById('ep2-name').value.trim(),
    standard_price: parseInt(document.getElementById('ep2-price').value) || 0,
    cost_price: parseInt(document.getElementById('ep2-cost').value) || 0,
  };
  try {
    await api(`/products?id=${id}`, 'PUT', body);
    closeModalDirect();
    showToast({ title: 'Product updated', entries: [] });
    await loadProducts();
  } catch (e) { alert(e.message); }
}

async function deleteProduct(id) {
  if (!window.confirm('Delete this product?')) return;
  try {
    await api(`/products?id=${id}`, 'DELETE');
    showToast({ title: 'Product deleted', entries: [] });
    await loadProducts();
  } catch (e) { alert(e.message); }
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function showOutstanding() { showOutstandingFiltered(0, 9999); }

function showOutstandingFiltered(minDays, maxDays) {
  const now = new Date();
  const filtered = allFirms.filter(f => {
    if (!f.balance || f.balance <= 0) return false;
    return true;
  }).sort((a, b) => b.balance - a.balance);

  showModal(`
    <div class="modal-title">Outstanding balances</div>
    <table style="table-layout:auto;width:100%">
      <thead><tr><th>#</th><th>Client</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${filtered.map((f, i) => `<tr><td>${i + 1}</td><td>${f.name}</td><td style="text-align:right" class="red">${fmt(f.balance)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2" style="font-weight:500;padding-top:8px">Total</td><td style="text-align:right;font-weight:500;padding-top:8px" class="red">${fmt(filtered.reduce((s, f) => s + f.balance, 0))}</td></tr></tfoot>
    </table>
    <div class="btn-row" style="margin-top:1rem">
      <button class="btn-primary" onclick="window.print()"><i class="ti ti-printer"></i> Print</button>
      <button class="btn-sec" onclick="closeModalDirect()">Close</button>
    </div>`);
}

async function showDailySummary() {
  showModal(`
    <div class="modal-title">Daily summary</div>
    <div class="fg"><label>Select date</label><input type="date" id="ds-date" value="${today()}"></div>
    <button class="btn-primary" onclick="loadDailySummary()"><i class="ti ti-search"></i> Load</button>
    <div id="ds-result" style="margin-top:1rem"></div>`);
}

async function loadDailySummary() {
  const date = document.getElementById('ds-date').value;
  try {
    const data = await api(`/bills?today=1`);
    const filtered = data.filter(b => b.bill_date === date);
    const total = filtered.reduce((s, b) => s + b.total_amount, 0);
    document.getElementById('ds-result').innerHTML = filtered.length === 0
      ? '<p style="color:#888;font-size:13px">No bills on this date.</p>'
      : `<table style="table-layout:auto;width:100%">
          <thead><tr><th>Bill #</th><th>Client</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${filtered.map(b => `<tr><td>${b.id}</td><td>${b.firms?.name || '—'}</td><td><span class="badge ${b.is_credit ? 'badge-credit' : 'badge-cash'}">${b.is_credit ? 'Credit' : 'Cash'}</span></td><td style="text-align:right">${fmt(b.total_amount)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3" style="font-weight:500;padding-top:8px">Total</td><td style="text-align:right;font-weight:500;padding-top:8px">${fmt(total)}</td></tr></tfoot>
        </table>`;
  } catch (e) { alert(e.message); }
}

async function showReprintBill() {
  showModal(`
    <div class="modal-title">Reprint bill</div>
    <div class="fg"><label>Search by Bill # or client name</label><input type="text" id="reprint-q" placeholder="e.g. 13472 or Malik Arshad" oninput="searchReprintBills()"></div>
    <div id="reprint-results"></div>`);
}

async function searchReprintBills() {
  const q = document.getElementById('reprint-q').value.trim().toLowerCase();
  if (!q) return;
  try {
    const data = await api('/bills');
    const filtered = data.filter(b => String(b.id).includes(q) || b.firms?.name?.toLowerCase().includes(q)).slice(0, 10);
    document.getElementById('reprint-results').innerHTML = filtered.length === 0
      ? '<p style="color:#888;font-size:13px;margin-top:8px">No bills found.</p>'
      : `<table style="table-layout:auto;width:100%;margin-top:8px">
          <thead><tr><th>Bill #</th><th>Client</th><th>Date</th><th style="text-align:right">Amount</th><th></th></tr></thead>
          <tbody>${filtered.map(b => `<tr><td>${b.id}</td><td>${b.firms?.name || '—'}</td><td>${fmtDate(b.bill_date)}</td><td style="text-align:right">${fmt(b.total_amount)}</td><td><button class="btn-sec" style="font-size:11px;padding:3px 8px" onclick="reprintBill(${b.id})"><i class="ti ti-printer"></i></button></td></tr>`).join('')}</tbody>
        </table>`;
  } catch (e) { }
}

async function reprintBill(id) {
  try {
    const bill = await api(`/bills?id=${id}`);
    const firm = allFirms.find(f => f.id === bill.firm_id);
    const items = bill.bill_items || [];
    const grand = bill.total_amount;

    const html = `
      <div class="print-doc">
        <div class="print-header">
          <div class="print-logo">NEEDLE CRAFT</div>
          <div class="print-sub">Wholesale Garments — Rawalpindi</div>
          <div class="print-sub">Ph: 051-XXXXXXX</div>
        </div>
        <div class="print-meta">
          <div><strong>Bill #:</strong> ${bill.id}${bill.bilty_no ? `<br><strong>Bilty #:</strong> ${bill.bilty_no}` : ''}${bill.do_no ? `<br><strong>D/O #:</strong> ${bill.do_no}` : ''}</div>
          <div style="text-align:right"><strong>Date:</strong> ${fmtDate(bill.bill_date)}<br><strong>Type:</strong> ${bill.is_credit ? 'Credit' : 'Cash'}<br><strong>Client:</strong> ${firm?.name || '—'}</div>
        </div>
        <table class="print-table">
          <thead><tr><th>#</th><th>Particular</th><th>Colour</th><th>Size</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.product_name}</td><td>${item.colour || ''}</td><td>${item.size || ''}</td><td>${item.quantity}</td><td>${fmtNum(item.price)}</td><td>${fmtNum(item.total)}</td></tr>`).join('')}</tbody>
        </table>
        <div class="print-totals">
          ${bill.bilty_charges ? `<div>Bilty charges: ${fmtNum(bill.bilty_charges)}</div>` : ''}
          ${bill.packaging_charges ? `<div>Packaging: ${fmtNum(bill.packaging_charges)}</div>` : ''}
          <div style="font-size:15px;font-weight:700;margin-top:5px">Total: Rs. ${fmtNum(grand)}</div>
          <div class="print-words">${amountInWords(grand)}</div>
        </div>
        <div class="print-footer">Thank you for your business &nbsp;·&nbsp; Needle Craft</div>
      </div>`;

    closeModalDirect();
    document.getElementById('print-content').innerHTML = html;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-print').classList.add('active');
  } catch (e) { alert(e.message); }
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────
async function backupData() {
  try {
    const [firms, bills, payments, products] = await Promise.all([
      api('/firms'), api('/bills'), api('/payments'), api('/products')
    ]);
    const backup = { exported_at: new Date().toISOString(), firms, bills, payments, products };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `needlecraft_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ title: 'Backup downloaded', subtitle: `needlecraft_backup_${today()}.json`, entries: [] });
  } catch (e) { alert('Backup failed: ' + e.message); }
}
