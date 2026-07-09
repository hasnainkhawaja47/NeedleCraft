// ─── FORMATTING ──────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n && n !== 0) return '—';
  return '₨ ' + Math.round(n).toLocaleString('en-PK');
}

function fmtNum(n) {
  return Math.round(n || 0).toLocaleString('en-PK');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── AMOUNT IN WORDS (Pakistani: lakhs/crores) ───────────────────────────────

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numToWords(n) {
  n = Math.round(n);
  if (n === 0) return 'Zero';
  if (n < 0) return 'Minus ' + numToWords(-n);

  let result = '';
  if (n >= 10000000) { result += numToWords(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
  if (n >= 100000) { result += numToWords(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
  if (n >= 1000) { result += numToWords(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
  if (n >= 100) { result += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
  if (n >= 20) { result += tens[Math.floor(n / 10)] + ' '; n %= 10; }
  if (n > 0) result += ones[n] + ' ';
  return result.trim();
}

function amountInWords(n) {
  if (!n || n === 0) return 'Zero only';
  return numToWords(n) + ' only';
}

// ─── API HELPERS ─────────────────────────────────────────────────────────────

const BASE = '/api';

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

function showToast({ title, subtitle, entries = [], hasAnomaly = false, firmId = null }) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast' + (hasAnomaly ? ' anomaly' : '');

  const entryHtml = entries.map(e =>
    `<div class="toast-entry${e.highlight ? ' highlight' : ''}">${e.date} &nbsp;·&nbsp; ${e.desc} &nbsp;·&nbsp; ${e.amount}${e.highlight ? ' ⚠ possible duplicate' : ''}</div>`
  ).join('');

  toast.innerHTML = `
    <div class="toast-head">
      <span class="toast-title">${title}</span>
      <button class="close-toast" onclick="this.closest('.toast').remove()">✕</button>
    </div>
    <div class="toast-prog"><div class="toast-bar"></div></div>
    ${subtitle ? `<div class="toast-subtitle">${subtitle}</div>` : ''}
    ${entryHtml}
    <div class="toast-footer">
      ${firmId ? `<button class="toast-ledger-btn" onclick="openLedger(${firmId});this.closest('.toast').remove()"><i class="ti ti-book" style="font-size:12px"></i> View full ledger</button>` : '<span></span>'}
      <button class="btn-ghost" style="font-size:11px;padding:3px 9px" onclick="this.closest('.toast').remove()">Dismiss</button>
    </div>`;

  container.appendChild(toast);

  let timer;
  const startTimer = () => {
    timer = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  };
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', startTimer);
  startTimer();
}

// ─── CONFIRM DIALOG ──────────────────────────────────────────────────────────

function confirm(message) {
  return window.confirm(message);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
}

function closeModalDirect() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ─── MISC ─────────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function buildSearchDropdown(inputId, dropdownId, firmsList, hiddenId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    const matches = firmsList.filter(f => f.name.toLowerCase().includes(q)).slice(0, 10);
    if (!q || matches.length === 0) { dropdown.classList.add('hidden'); return; }
    dropdown.innerHTML = matches.map(f => `<div class="dropdown-item" data-id="${f.id}" data-name="${f.name}">${f.name}</div>`).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.name;
        document.getElementById(hiddenId).value = item.dataset.id;
        dropdown.classList.add('hidden');
        if (onSelect) onSelect(item.dataset.id, item.dataset.name);
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add('hidden');
  });
}
