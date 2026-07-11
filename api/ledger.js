const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { firm_id, from, to } = req.query;
  if (!firm_id) return res.status(400).json({ error: 'firm_id required' });

  try {
    // Default from date is 2024-01-01 if not specified
    const fromDate = from || '2024-01-01';
    const toDate = to || null;

    // Active data query
    let activeBillsQ = supabase.from('bills')
      .select('id, bill_date, total_amount, bilty_no, do_no, is_credit')
      .eq('firm_id', firm_id)
      .gte('bill_date', fromDate);
    if (toDate) activeBillsQ = activeBillsQ.lte('bill_date', toDate);

    let activePmtsQ = supabase.from('payments')
      .select('id, payment_date, amount, method, bank_name, cheque_number, memo')
      .eq('firm_id', firm_id)
      .gte('payment_date', fromDate);
    if (toDate) activePmtsQ = activePmtsQ.lte('payment_date', toDate);

    // Archive data query
    let archiveBillsQ = supabase.from('archive_bills')
      .select('id, bill_date, total_amount, bilty_no, do_no, is_credit')
      .eq('firm_id', firm_id)
      .gte('bill_date', fromDate);
    if (toDate) archiveBillsQ = archiveBillsQ.lte('bill_date', toDate);

    let archivePmtsQ = supabase.from('archive_payments')
      .select('id, payment_date, amount, method, bank_name, cheque_number, memo')
      .eq('firm_id', firm_id)
      .gte('payment_date', fromDate);
    if (toDate) archivePmtsQ = archivePmtsQ.lte('payment_date', toDate);

    const [
      { data: activeBills },
      { data: activePmts },
      { data: archiveBills },
      { data: archivePmts }
    ] = await Promise.all([activeBillsQ, activePmtsQ, archiveBillsQ, archivePmtsQ]);

    // Also get opening balance (everything before fromDate)
    const { data: allBillsBefore } = await supabase.from('bills')
      .select('total_amount').eq('firm_id', firm_id).lt('bill_date', fromDate);
    const { data: allPmtsBefore } = await supabase.from('payments')
      .select('amount').eq('firm_id', firm_id).lt('payment_date', fromDate);
    const { data: archBillsBefore } = await supabase.from('archive_bills')
      .select('total_amount').eq('firm_id', firm_id).lt('bill_date', fromDate);
    const { data: archPmtsBefore } = await supabase.from('archive_payments')
      .select('amount').eq('firm_id', firm_id).lt('payment_date', fromDate);

    const openingBalance =
      (allBillsBefore || []).reduce((s, b) => s + b.total_amount, 0) +
      (archBillsBefore || []).reduce((s, b) => s + b.total_amount, 0) -
      (allPmtsBefore || []).reduce((s, p) => s + p.amount, 0) -
      (archPmtsBefore || []).reduce((s, p) => s + p.amount, 0);

    // Build combined entries
    const entries = [];

    // Add opening balance row if non-zero
    if (openingBalance !== 0 && from) {
      entries.push({
        date: fromDate,
        type: 'opening',
        id: null,
        description: 'Opening balance brought forward',
        credit: openingBalance > 0 ? openingBalance : 0,
        debit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        isArchive: false
      });
    }

    const allBills = [...(activeBills || []), ...(archiveBills || [])];
    const allPmts = [...(activePmts || []), ...(archivePmts || [])];

    allBills.forEach(b => entries.push({
      date: b.bill_date,
      type: 'bill',
      id: b.id,
      description: `Bill # ${b.id}${b.bilty_no ? ' · Bilty: ' + b.bilty_no : ''}`,
      credit: b.total_amount,
      debit: 0,
      isArchive: !!(activeBills || []).find ? !(activeBills || []).find(ab => ab.id === b.id) : false
    }));

    allPmts.forEach(p => {
      const desc = p.bank_name && p.bank_name !== ''
        ? `${p.method} — ${p.bank_name}${p.cheque_number ? ' · Ref: ' + p.cheque_number : ''}`
        : p.method;
      entries.push({
        date: p.payment_date,
        type: 'payment',
        id: p.id,
        description: desc,
        credit: 0,
        debit: p.amount,
        isArchive: false
      });
    });

    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.type === 'opening') return -1;
      if (b.type === 'opening') return 1;
      return a.type === 'bill' ? -1 : 1;
    });

    let running = openingBalance && !from ? 0 : (from ? 0 : 0);
    entries.forEach(e => {
      running += e.credit - e.debit;
      e.balance = running;
    });

    const totalBilled = entries.reduce((s, e) => s + e.credit, 0);
    const totalPaid = entries.reduce((s, e) => s + e.debit, 0);

    res.json({ entries, totalBilled, totalPaid, balance: running });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};