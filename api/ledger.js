const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { firm_id, from, to, archive } = req.query;
  if (!firm_id) return res.status(400).json({ error: 'firm_id required' });

  try {
    const isArchive = archive === '1';

    let billsQuery = supabase.from(isArchive ? 'archive_bills' : 'bills').select('id, bill_date, total_amount, bilty_no, do_no, is_credit').eq('firm_id', firm_id);
    let pmtsQuery = supabase.from(isArchive ? 'archive_payments' : 'payments').select('id, payment_date, amount, method, bank_name, cheque_number, memo').eq('firm_id', firm_id);

    if (from) { billsQuery = billsQuery.gte('bill_date', from); pmtsQuery = pmtsQuery.gte('payment_date', from); }
    if (to) { billsQuery = billsQuery.lte('bill_date', to); pmtsQuery = pmtsQuery.lte('payment_date', to); }

    const [{ data: bills }, { data: pmts }] = await Promise.all([billsQuery, pmtsQuery]);

    // Build combined ledger entries
    const entries = [];
    (bills || []).forEach(b => entries.push({ date: b.bill_date, type: 'bill', id: b.id, description: `Bill # ${b.id}${b.bilty_no ? ' · Bilty: ' + b.bilty_no : ''}`, credit: b.total_amount, debit: 0, raw: b }));
    (pmts || []).forEach(p => {
      const desc = p.bank_name && p.bank_name !== '' ? `${p.method} — ${p.bank_name}${p.cheque_number ? ' · Ref: ' + p.cheque_number : ''}` : p.method;
      entries.push({ date: p.payment_date, type: 'payment', id: p.id, description: desc, credit: 0, debit: p.amount, raw: p });
    });

    // Sort by date then type (bills before payments on same day)
    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.type === 'bill' ? -1 : 1;
    });

    // Running balance
    let running = 0;
    entries.forEach(e => { running += e.credit - e.debit; e.balance = running; });

    const totalBilled = entries.reduce((s, e) => s + e.credit, 0);
    const totalPaid = entries.reduce((s, e) => s + e.debit, 0);

    res.json({ entries, totalBilled, totalPaid, balance: totalBilled - totalPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
