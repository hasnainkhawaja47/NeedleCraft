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
        const id = parseInt(query.id);
        const [{ data: firm }, { data: balanceRows }] = await Promise.all([
          supabase.from('firms').select('*').eq('id', id).single(),
          supabase.rpc('get_firm_balance', { p_firm_id: id }),
        ]);

        const row = (balanceRows && balanceRows[0]) || {};
        const balance = (row.billed || 0) - (row.paid || 0);

        return res.json({ ...firm, balance });
      }

      // All firms
      const [{ data: firms }, { data: balances }] = await Promise.all([
        supabase.from('firms').select('*').order('name'),
        supabase.rpc('get_firm_balances'),
      ]);
      if (!firms || !firms.length) return res.json([]);

      const billedMap = {};
      const paidMap = {};
      (balances || []).forEach(b => {
        billedMap[b.firm_id] = b.billed || 0;
        paidMap[b.firm_id] = b.paid || 0;
      });

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