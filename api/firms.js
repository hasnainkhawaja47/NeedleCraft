const supabase = require('./_supabase');

async function getAllRows(table, columns) {
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method, query, body } = req;

  try {
    if (method === 'GET') {
      if (query.id) {
        const { data } = await supabase
          .from('firms').select('*').eq('id', query.id).single();

        const [bills, pmts, archBills, archPmts] = await Promise.all([
          getAllRows('bills', 'firm_id, total_amount'),
          getAllRows('payments', 'firm_id, amount'),
          getAllRows('archive_bills', 'firm_id, total_amount'),
          getAllRows('archive_payments', 'firm_id, amount'),
        ]);

        const id = parseInt(query.id);
        const totalBilled =
          bills.filter(b => b.firm_id === id).reduce((s, b) => s + (b.total_amount || 0), 0) +
          archBills.filter(b => b.firm_id === id).reduce((s, b) => s + (b.total_amount || 0), 0);
        const totalPaid =
          pmts.filter(p => p.firm_id === id).reduce((s, p) => s + (p.amount || 0), 0) +
          archPmts.filter(p => p.firm_id === id).reduce((s, p) => s + (p.amount || 0), 0);

        return res.json({ ...data, balance: totalBilled - totalPaid });
      }

      // All firms
      const { data: firms } = await supabase.from('firms').select('*').order('name');
      if (!firms || !firms.length) return res.json([]);

      const [bills, pmts, archBills, archPmts] = await Promise.all([
        getAllRows('bills', 'firm_id, total_amount'),
        getAllRows('payments', 'firm_id, amount'),
        getAllRows('archive_bills', 'firm_id, total_amount'),
        getAllRows('archive_payments', 'firm_id, amount'),
      ]);

      const billedMap = {};
      const paidMap = {};

      bills.forEach(b => { billedMap[b.firm_id] = (billedMap[b.firm_id] || 0) + (b.total_amount || 0); });
      archBills.forEach(b => { billedMap[b.firm_id] = (billedMap[b.firm_id] || 0) + (b.total_amount || 0); });
      pmts.forEach(p => { paidMap[p.firm_id] = (paidMap[p.firm_id] || 0) + (p.amount || 0); });
      archPmts.forEach(p => { paidMap[p.firm_id] = (paidMap[p.firm_id] || 0) + (p.amount || 0); });

      const result = firms.map(f => ({
        ...f,
        balance: (billedMap[f.id] || 0) - (paidMap[f.id] || 0)
      }));

      return res.json(result);
    }

    if (method === 'POST') {
      const { data, error } = await supabase
        .from('firms').insert({ name: body.name }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (method === 'PUT') {
      const { data, error } = await supabase
        .from('firms').update({ name: body.name }).eq('id', query.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (method === 'DELETE') {
      const { data: bills } = await supabase
        .from('bills').select('id').eq('firm_id', query.id).limit(1);
      const { data: pmts } = await supabase
        .from('payments').select('id').eq('firm_id', query.id).limit(1);
      if ((bills && bills.length > 0) || (pmts && pmts.length > 0)) {
        return res.status(400).json({
          error: 'Cannot delete: this client has bills or payments on record.'
        });
      }
      const { error } = await supabase.from('firms').delete().eq('id', query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};