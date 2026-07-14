const supabase = require('./_supabase');

async function getRows(table, columns, firmId, from, to) {
  let allRows = [];
  let start = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase.from(table).select(columns).eq('firm_id', firmId);
    if (from) q = q.gte(table.includes('bill') ? 'bill_date' : 'payment_date', from);
    if (to) q = q.lte(table.includes('bill') ? 'bill_date' : 'payment_date', to);
    const { data, error } = await q.range(start, start + pageSize - 1);
    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    start += pageSize;
  }
  return allRows;
}

async function getAllRows(table, columns, firmId) {
  let allRows = [];
  let start = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table).select(columns).eq('firm_id', firmId)
      .range(start, start + pageSize - 1);
    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    start += pageSize;
  }
  return allRows;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { firm_id, from, to } = req.query;
  if (!firm_id) return res.status(400).json({ error: 'firm_id required' });

  try {
    const fromDate = from || null;
    const toDate = to || null;

    // Fetch entries within the date range from BOTH active and archive tables
    const [
      activeBills,
      activePmts,
      archiveBills,
      archivePmts
    ] = await Promise.all([
      getRows('bills', 'id, bill_date, total_amount, bilty_no, do_no, is_credit', firm_id, fromDate, toDate),
      getRows('payments', 'id, payment_date, amount, method, bank_name, cheque_number, memo', firm_id, fromDate, toDate),
      getRows('archive_bills', 'id, bill_date, total_amount, bilty_no, do_no, is_credit', firm_id, fromDate, toDate),
      getRows('archive_payments', 'id, payment_date, amount, method, bank_name, cheque_number, memo', firm_id, fromDate, toDate),
    ]);

    // Calculate opening balance = everything BEFORE fromDate (both active and archive)
    let openingBalance = 0;
    if (fromDate) {
      const [
        allBillsBefore,
        allPmtsBefore,
        archBillsBefore,
        archPmtsBefore
      ] = await Promise.all([
        getAllRows('bills', 'total_amount, bill_date', firm_id),
        getAllRows('payments', 'amount, payment_date', firm_id),
        getAllRows('archive_bills', 'total_amount, bill_date', firm_id),
        getAllRows('archive_payments', 'amount, payment_date', firm_id),
      ]);

      const billsBefore = [
        ...allBillsBefore.filter(b => b.bill_date < fromDate),
        ...archBillsBefore.filter(b => b.bill_date < fromDate),
      ];
      const pmtsBefore = [
        ...allPmtsBefore.filter(p => p.payment_date < fromDate),
        ...archPmtsBefore.filter(p => p.payment_date < fromDate),
      ];

      openingBalance =
        billsBefore.reduce((s, b) => s + (b.total_amount || 0), 0) -
        pmtsBefore.reduce((s, p) => s + (p.amount || 0), 0);
    }

    // Build combined entries from both active and archive
    const entries = [];

    // if (openingBalance !== 0 && fromDate) {
    //   entries.push({
    //     date: fromDate,
    //     type: 'opening',
    //     id: null,
    //     description: 'Opening balance brought forward',
    //     credit: openingBalance > 0 ? openingBalance : 0,
    //     debit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    //   });
    // }
    if (fromDate) {
      entries.push({
        date: fromDate,
        type: 'opening',
        id: null,
        description: 'Opening balance brought forward',
        credit: 0,
        debit: 0,
        openingBalance: openingBalance,
      });
    }

    const allBills = [...activeBills, ...archiveBills];
    const allPmts = [...activePmts, ...archivePmts];
    const activeIds = new Set(activeBills.map(b => b.id));

    allBills.forEach(b => {
      entries.push({
        date: b.bill_date,
        type: 'bill',
        id: b.id,
        isActive: activeIds.has(b.id),
        description: `Bill # ${b.id}${b.bilty_no ? ' · Bilty: ' + b.bilty_no : ''}`,
        credit: b.total_amount || 0,
        debit: 0,
      });
    });

    const activePmtIds = new Set(activePmts.map(p => p.id));
    allPmts.forEach(p => {
      const bankPart = p.bank_name && p.bank_name !== ''
        ? ` — ${p.bank_name}${p.cheque_number ? ' · Ref: ' + p.cheque_number : ''}`
        : '';
      entries.push({
        date: p.payment_date,
        type: 'payment',
        id: p.id,
        isActive: activePmtIds.has(p.id),
        description: `${p.method}${bankPart}`,
        credit: 0,
        debit: p.amount || 0,
      });
    });

    // Sort by date, then bills before payments on same day
    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.type === 'opening') return -1;
      if (b.type === 'opening') return 1;
      if (a.type === 'bill' && b.type !== 'bill') return -1;
      if (b.type === 'bill' && a.type !== 'bill') return 1;
      return 0;
    });

    // Running balance starting from opening balance
    // let running = openingBalance;
    // if (!fromDate) running = 0;
    // entries.forEach(e => {
    //   if (e.type !== 'opening') {
    //     running += e.credit - e.debit;
    //   }
    //   e.balance = running;
    // });
    let running = fromDate ? openingBalance : 0;
    entries.forEach(e => {
      if (e.type !== 'opening') {
        running += e.credit - e.debit;
      }
      e.balance = running;
    });

    // Totals for the date range only (not including opening balance)
    const totalBilled = allBills.reduce((s, b) => s + (b.total_amount || 0), 0);
    const totalPaid = allPmts.reduce((s, p) => s + (p.amount || 0), 0);

    res.json({
      entries,
      totalBilled,
      totalPaid,
      balance: running,
      openingBalance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};