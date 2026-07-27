const supabase = require('./_supabase');

async function checkAnomalies(bill, firmId, excludeBillId) {
  const anomalies = [];

  // Fetch last 10 bills for this firm once, reuse for both checks
  const { data: recentFirmBills } = await supabase.from('bills')
    .select('id, total_amount, bill_date')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .limit(10);

  const bills = recentFirmBills || [];

  // 1. Duplicate: same firm, same amount, same date (excluding the bill itself)
  const dupes = bills.filter(b =>
    b.id !== excludeBillId &&
    b.total_amount === bill.total_amount &&
    b.bill_date === bill.bill_date
  );
  if (dupes.length > 0) {
    anomalies.push({ type: 'Duplicate', firm_id: firmId, details: `₨${bill.total_amount.toLocaleString()} entered again on ${bill.bill_date}`, reference_type: 'bill' });
  }

  // 2. Unusually large: > 3x average of last 10 bills (only if client has 5+ bills)
  if (bills.length >= 5) {
    const avg = bills.reduce((s, b) => s + b.total_amount, 0) / bills.length;
    if (avg > 0 && bill.total_amount > avg * 3) {
      anomalies.push({ type: 'Large Bill', firm_id: firmId, details: `₨${bill.total_amount.toLocaleString()} is ${Math.round(bill.total_amount / avg)}× the average of last ${bills.length} bills`, reference_type: 'bill' });
    }
  }

  return anomalies;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method, query, body } = req;

  try {
    // GET /api/bills?firm_id=X or /api/bills?id=X or /api/bills?today=1
    if (method === 'GET') {
      if (query.id) {
        const { data } = await supabase.from('bills').select('*, bill_items(*)').eq('id', query.id).single();
        return res.json(data);
      }

      if (query.search) {
        const { from, to, do_no, bill_no } = query;
        let q = supabase.from('bills').select('*, firms(name)').order('id', { ascending: false });

        if (bill_no) {
          const trimmed = bill_no.trim();
          if (/^\d+$/.test(trimmed)) {
            q = q.eq('id', parseInt(trimmed));
          } else {
            q = q.ilike('id::text', `%${trimmed}%`);
          }
        } else if (do_no) {
          q = q.ilike('do_no', `%${do_no.trim()}%`);
        } else if (from || to) {
          if (from) q = q.gte('bill_date', from);
          if (to) q = q.lte('bill_date', to);
        }

        const { data, error } = await q.limit(500);
        if (error) return res.status(400).json({ error: error.message });
        return res.json(data || []);
      }

      if (query.today) {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase.from('bills').select('*, firms(name)').eq('bill_date', today).order('id', { ascending: false });
        return res.json(data || []);
      }
      if (query.firm_id) {
        const { data } = await supabase.from('bills').select('*, bill_items(*)').eq('firm_id', query.firm_id).order('bill_date', { ascending: false }).limit(200);
        return res.json(data || []);
      }
      const { data } = await supabase.from('bills').select('*, firms(name)').order('id', { ascending: false }).limit(50);
      return res.json(data || []);
    }

    // POST /api/bills — create new bill
    if (method === 'POST') {
      const { firm_id, bill_date, bilty_no, do_no, bilty_charges, packaging_charges, total_amount, is_credit, items } = body;

      const billRecord = { firm_id, bill_date, bilty_no: bilty_no || '', do_no: do_no || '', bilty_charges: bilty_charges || 0, packaging_charges: packaging_charges || 0, total_amount, is_credit: is_credit !== false };
      const { data: newBill, error } = await supabase.from('bills').insert(billRecord).select().single();
      if (error) return res.status(400).json({ error: error.message });

      // Insert items
      if (items && items.length > 0) {
        const billItems = items.map(item => ({ ...item, bill_id: newBill.id }));
        const { error: iErr } = await supabase.from('bill_items').insert(billItems);
        if (iErr) console.error('Bill items error:', iErr.message);
      }

      // Check anomalies (now a single query internally instead of two)
      const anomalies = await checkAnomalies(billRecord, firm_id, newBill.id);
      if (anomalies.length > 0) {
        const { data: firm } = await supabase.from('firms').select('name').eq('id', firm_id).single();
        const anomalyRows = anomalies.map(a => ({ ...a, firm_name: firm?.name, reference_id: newBill.id }));
        await supabase.from('anomalies').insert(anomalyRows);
      }

      // Get recent entries for toast
      const { data: recentBills } = await supabase.from('bills').select('id, bill_date, total_amount').eq('firm_id', firm_id).order('bill_date', { ascending: false }).limit(4);
      const { data: recentPmts } = await supabase.from('payments').select('payment_date, amount, method, bank_name').eq('firm_id', firm_id).order('payment_date', { ascending: false }).limit(2);

      return res.json({ bill: newBill, anomalies, recentBills: recentBills || [], recentPmts: recentPmts || [] });
    }

    // PUT /api/bills?id=X — update bill
    if (method === 'PUT') {
      const { id } = query;
      const { items, ...billData } = body;
      const { data: updated, error } = await supabase.from('bills').update(billData).eq('id', id).select().single();
      if (error) return res.status(400).json({ error: error.message });

      // Replace items
      if (items) {
        await supabase.from('bill_items').delete().eq('bill_id', id);
        if (items.length > 0) {
          const billItems = items.map(item => ({ ...item, bill_id: parseInt(id) }));
          await supabase.from('bill_items').insert(billItems);
        }
      }
      return res.json({ bill: updated });
    }

    // DELETE /api/bills?id=X
    if (method === 'DELETE') {
      const { id } = query;
      const { error } = await supabase.from('bills').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};