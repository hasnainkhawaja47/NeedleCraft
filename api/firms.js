const supabase = require('./_supabase');

async function getClientBalance(firmId) {
  const [
    { data: bills },
    { data: pmts },
    { data: archBills },
    { data: archPmts }
  ] = await Promise.all([
    supabase.from('bills').select('total_amount').eq('firm_id', firmId),
    supabase.from('payments').select('amount').eq('firm_id', firmId),
    supabase.from('archive_bills').select('total_amount').eq('firm_id', firmId),
    supabase.from('archive_payments').select('amount').eq('firm_id', firmId),
  ]);

  const totalBilled =
    (bills || []).reduce((s, b) => s + (b.total_amount || 0), 0) +
    (archBills || []).reduce((s, b) => s + (b.total_amount || 0), 0);

  const totalPaid =
    (pmts || []).reduce((s, p) => s + (p.amount || 0), 0) +
    (archPmts || []).reduce((s, p) => s + (p.amount || 0), 0);

  return totalBilled - totalPaid;
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
        const { data } = await supabase.from('firms').select('*').eq('id', query.id).single();
        const balance = await getClientBalance(query.id);
        return res.json({ ...data, balance });
      }

      const { data: firms } = await supabase.from('firms').select('*').order('name');
      if (!firms || !firms.length) return res.json([]);

      // Fetch all balance data in 4 queries total
      const [
        { data: allBills },
        { data: allPmts },
        { data: archBills },
        { data: archPmts }
      ] = await Promise.all([
        supabase.from('bills').select('firm_id, total_amount'),
        supabase.from('payments').select('firm_id, amount'),
        supabase.from('archive_bills').select('firm_id, total_amount'),
        supabase.from('archive_payments').select('firm_id, amount'),
      ]);

      // Build maps
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