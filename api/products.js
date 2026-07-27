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
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');

      const [{ data: products }, { data: soldRows }, { data: soldYtdRows }] = await Promise.all([
        supabase.from('products').select('*').order('code'),
        supabase.rpc('get_product_units_sold'),
        supabase.rpc('get_product_units_sold_ytd'),
      ]);

      const soldMap = {};
      (soldRows || []).forEach(r => { soldMap[r.product_id] = r.units_sold || 0; });

      const soldYtdMap = {};
      (soldYtdRows || []).forEach(r => { soldYtdMap[r.product_id] = r.units_sold_ytd || 0; });

      const result = (products || []).map(p => ({
        ...p,
        units_sold: soldMap[p.id] || 0,
        units_sold_ytd: soldYtdMap[p.id] || 0,
        margin_pct: p.cost_price > 0 ? Math.round(((p.standard_price - p.cost_price) / p.standard_price) * 100) : null
      }));
      return res.json(result);
    }

    if (method === 'POST') {
      const { data, error } = await supabase.from('products').insert(body).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (method === 'PUT') {
      const { data, error } = await supabase.from('products').update(body).eq('id', query.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json(data);
    }

    if (method === 'DELETE') {
      const { data: used } = await supabase.from('bill_items').select('id').eq('product_id', query.id).limit(1);
      if (used && used.length > 0) return res.status(400).json({ error: 'Cannot delete: product has been used in bills.' });
      const { error } = await supabase.from('products').delete().eq('id', query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};