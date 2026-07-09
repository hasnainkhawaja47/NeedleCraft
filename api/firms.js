const supabase = require('./_supabase');

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
        const { data } = await supabase.from('firms').select('*').eq('id', query.id).single();
        // Calculate balance
        const { data: bills } = await supabase.from('bills').select('total_amount').eq('firm_id', query.id);
        const { data: pmts } = await supabase.from('payments').select('amount').eq('firm_id', query.id);
        const balance = (bills || []).reduce((s, b) => s + b.total_amount, 0) - (pmts || []).reduce((s, p) => s + p.amount, 0);
        return res.json({ ...data, balance });
      }

      // All firms with balances
      const { data: firms } = await supabase.from('firms').select('*').order('name');
      const { data: allBills } = await supabase.from('bills').select('firm_id, total_amount');
      const { data: allPmts } = await supabase.from('payments').select('firm_id, amount');

      const billMap = {}, pmtMap = {};
      (allBills || []).forEach(b => { billMap[b.firm_id] = (billMap[b.firm_id] || 0) + b.total_amount; });
      (allPmts || []).forEach(p => { pmtMap[p.firm_id] = (pmtMap[p.firm_id] || 0) + p.amount; });

      const result = (firms || []).map(f => ({ ...f, balance: (billMap[f.id] || 0) - (pmtMap[f.id] || 0) }));
      return res.json(result);
    }

    if (method === 'POST') {
      const { data, error } = await supabase.from('firms').insert({ name: body.name }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (method === 'PUT') {
      const { data, error } = await supabase.from('firms').update({ name: body.name }).eq('id', query.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (method === 'DELETE') {
      // Check if firm has bills or payments
      const { data: bills } = await supabase.from('bills').select('id').eq('firm_id', query.id).limit(1);
      const { data: pmts } = await supabase.from('payments').select('id').eq('firm_id', query.id).limit(1);
      if ((bills && bills.length > 0) || (pmts && pmts.length > 0)) {
        return res.status(400).json({ error: 'Cannot delete: this client has bills or payments on record.' });
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
