const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const today = new Date().toISOString().split('T')[0];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0].slice(0, 8) + '01';

    const { data: firms } = await supabase.from('firms').select('id, name');
    if (!firms) return res.status(500).json({ error: 'Could not load firms' });

    // All 4 balance queries in parallel
    const [
      { data: allBills },
      { data: allPmts },
      { data: archBills },
      { data: archPmts }
    ] = await Promise.all([
      supabase.from('bills').select('firm_id, total_amount, bill_date'),
      supabase.from('payments').select('firm_id, amount, payment_date'),
      supabase.from('archive_bills').select('firm_id, total_amount, bill_date'),
      supabase.from('archive_payments').select('firm_id, amount, payment_date'),
    ]);

    // Build balance maps — billed and paid separately, then combined
    const billedMap = {};
    const paidMap = {};

    (allBills || []).forEach(b => {
      billedMap[b.firm_id] = (billedMap[b.firm_id] || 0) + (b.total_amount || 0);
    });
    (archBills || []).forEach(b => {
      billedMap[b.firm_id] = (billedMap[b.firm_id] || 0) + (b.total_amount || 0);
    });
    (allPmts || []).forEach(p => {
      paidMap[p.firm_id] = (paidMap[p.firm_id] || 0) + (p.amount || 0);
    });
    (archPmts || []).forEach(p => {
      paidMap[p.firm_id] = (paidMap[p.firm_id] || 0) + (p.amount || 0);
    });

    let totalOutstanding = 0;
    const clientBalances = [];
    firms.forEach(f => {
      const balance = (billedMap[f.id] || 0) - (paidMap[f.id] || 0);
      if (balance > 0) {
        totalOutstanding += balance;
        clientBalances.push({ id: f.id, name: f.name, balance });
      }
    });
    clientBalances.sort((a, b) => b.balance - a.balance);
    const top10 = clientBalances.slice(0, 10);

    // Monthly stats for charts (active only)
    const monthlyStats = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      monthlyStats[key] = { billed: 0, collected: 0 };
    }
    (allBills || []).filter(b => b.bill_date >= sixMonthsAgoStr).forEach(b => {
      const k = b.bill_date.slice(0, 7);
      if (monthlyStats[k]) monthlyStats[k].billed += b.total_amount || 0;
    });
    (allPmts || []).filter(p => p.payment_date >= sixMonthsAgoStr).forEach(p => {
      const k = p.payment_date.slice(0, 7);
      if (monthlyStats[k]) monthlyStats[k].collected += p.amount || 0;
    });

    const thisMonth = today.slice(0, 7);
    const billedThisMonth = monthlyStats[thisMonth]?.billed || 0;
    const collectedThisMonth = monthlyStats[thisMonth]?.collected || 0;
    const collectionRate = billedThisMonth > 0
      ? Math.round((collectedThisMonth / billedThisMonth) * 100) : 0;

    // Today's bills
    const { data: todayBills } = await supabase
      .from('bills')
      .select('id, firm_id, total_amount, is_credit, bill_date')
      .eq('bill_date', today);

    const todayBillsWithNames = (todayBills || []).map(b => ({
      ...b,
      firm_name: firms.find(f => f.id === b.firm_id)?.name || 'Unknown'
    }));

    // Aging — based on last active bill date per client
    const now = new Date();
    const aging = {
      current: { amount: 0, count: 0 },
      overdue31: { amount: 0, count: 0 },
      overdue61: { amount: 0, count: 0 },
      critical: { amount: 0, count: 0 }
    };

    const lastBillByFirm = {};
    (allBills || []).forEach(b => {
      if (!lastBillByFirm[b.firm_id] || b.bill_date > lastBillByFirm[b.firm_id]) {
        lastBillByFirm[b.firm_id] = b.bill_date;
      }
    });

    clientBalances.forEach(c => {
      const lastDate = lastBillByFirm[c.id];
      if (!lastDate) return;
      const days = Math.floor((now - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      if (days <= 30) { aging.current.amount += c.balance; aging.current.count++; }
      else if (days <= 60) { aging.overdue31.amount += c.balance; aging.overdue31.count++; }
      else if (days <= 90) { aging.overdue61.amount += c.balance; aging.overdue61.count++; }
      else { aging.critical.amount += c.balance; aging.critical.count++; }
    });

    // Anomalies
    const { data: anomalies } = await supabase
      .from('anomalies')
      .select('*')
      .eq('dismissed', false)
      .order('detected_at', { ascending: false });

    res.json({
      totalOutstanding,
      billedThisMonth,
      collectedThisMonth,
      collectionRate,
      billsToday: todayBillsWithNames.length,
      top10,
      todayBills: todayBillsWithNames,
      monthlyStats,
      aging,
      anomalies: anomalies || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};