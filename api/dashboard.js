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

    const [
      { data: balances },
      { data: recentBills },
      { data: recentPmts },
      { data: todayBills },
      { data: todayPmts },
      { data: anomalies }
    ] = await Promise.all([
      supabase.rpc('get_firm_balances'),
      supabase.from('bills').select('firm_id, total_amount, bill_date').gte('bill_date', sixMonthsAgoStr),
      supabase.from('payments').select('firm_id, amount, payment_date').gte('payment_date', sixMonthsAgoStr),
      supabase.from('bills').select('id, firm_id, total_amount, is_credit, bill_date').eq('bill_date', today),
      supabase.from('payments').select('id, firm_id, amount, method, bank_name').eq('payment_date', today),
      supabase.from('anomalies').select('*').eq('dismissed', false).order('detected_at', { ascending: false }),
    ]);

    const billedMap = {};
    const paidMap = {};
    (balances || []).forEach(b => {
      billedMap[b.firm_id] = b.billed || 0;
      paidMap[b.firm_id] = b.paid || 0;
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

    const monthlyStats = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      monthlyStats[key] = { billed: 0, collected: 0 };
    }
    (recentBills || []).forEach(b => {
      const k = b.bill_date.slice(0, 7);
      if (monthlyStats[k]) monthlyStats[k].billed += b.total_amount || 0;
    });
    (recentPmts || []).forEach(p => {
      const k = p.payment_date.slice(0, 7);
      if (monthlyStats[k]) monthlyStats[k].collected += p.amount || 0;
    });

    const thisMonth = today.slice(0, 7);
    const billedThisMonth = monthlyStats[thisMonth]?.billed || 0;
    const collectedThisMonth = monthlyStats[thisMonth]?.collected || 0;
    const collectionRate = billedThisMonth > 0
      ? Math.round((collectedThisMonth / billedThisMonth) * 100) : 0;

    const todayBillsWithNames = (todayBills || []).map(b => ({
      ...b,
      firm_name: firms.find(f => f.id === b.firm_id)?.name || 'Unknown'
    }));

    const todayPmtsWithNames = (todayPmts || []).map(p => ({
      ...p,
      firm_name: firms.find(f => f.id === p.firm_id)?.name || 'Unknown'
    }));

    res.json({
      totalOutstanding,
      billedThisMonth,
      collectedThisMonth,
      collectionRate,
      billsToday: todayBillsWithNames.length,
      top10,
      todayBills: todayBillsWithNames,
      todayPmts: todayPmtsWithNames,
      monthlyStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};