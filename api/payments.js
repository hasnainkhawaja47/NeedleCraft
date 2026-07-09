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
      if (query.firm_id) {
        const { data } = await supabase.from('payments').select('*').eq('firm_id', query.firm_id).order('payment_date', { ascending: false });
        return res.json(data || []);
      }
      const { data } = await supabase.from('payments').select('*, firms(name)').order('payment_date', { ascending: false }).limit(50);
      return res.json(data || []);
    }

    if (method === 'POST') {
      const { firm_id, payment_date, amount, method: pmtMethod, cheque_number, bank_name, memo } = body;

      // Overpayment check
      const { data: bills } = await supabase.from('bills').select('total_amount').eq('firm_id', firm_id);
      const { data: pmts } = await supabase.from('payments').select('amount').eq('firm_id', firm_id);
      const totalBilled = (bills || []).reduce((s, b) => s + b.total_amount, 0);
      const totalPaid = (pmts || []).reduce((s, p) => s + p.amount, 0);
      const currentBalance = totalBilled - totalPaid;
      let anomaly = null;
      if (amount > currentBalance && currentBalance > 0) {
        anomaly = { type: 'Overpayment', firm_id, details: `Payment of ₨${amount.toLocaleString()} exceeds balance of ₨${currentBalance.toLocaleString()}`, reference_type: 'payment' };
      }

      const { data: newPmt, error } = await supabase.from('payments').insert({ firm_id, payment_date, amount, method: pmtMethod || 'Cash', cheque_number: cheque_number || '', bank_name: bank_name || '', memo: memo || '' }).select().single();
      if (error) return res.status(400).json({ error: error.message });

      if (anomaly) {
        const { data: firm } = await supabase.from('firms').select('name').eq('id', firm_id).single();
        await supabase.from('anomalies').insert({ ...anomaly, firm_name: firm?.name, reference_id: newPmt.id });
      }

      // Recent entries for toast
      const { data: recentBills } = await supabase.from('bills').select('id, bill_date, total_amount').eq('firm_id', firm_id).order('bill_date', { ascending: false }).limit(3);
      const { data: recentPmts } = await supabase.from('payments').select('payment_date, amount, method, bank_name').eq('firm_id', firm_id).order('payment_date', { ascending: false }).limit(3);

      return res.json({ payment: newPmt, anomaly, recentBills: recentBills || [], recentPmts: recentPmts || [] });
    }

    if (method === 'PUT') {
      const { id } = query;
      const { data: updated, error } = await supabase.from('payments').update(body).eq('id', id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ payment: updated });
    }

    if (method === 'DELETE') {
      const { id } = query;
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
