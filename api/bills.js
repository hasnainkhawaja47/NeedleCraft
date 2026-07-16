const supabase = require('./_supabase');

async function checkAnomalies(bill, firmId) {
  const anomalies = [];

  // 1. Duplicate: same firm, same amount, same date
  const { data: dupes } = await supabase.from('bills')
    .select('id')
    .eq('firm_id', firmId)
    .eq('total_amount', bill.total_amount)
    .eq('bill_date', bill.bill_date);
  if (dupes && dupes.length > 0) {
    anomalies.push({ type: 'Duplicate', firm_id: firmId, details: `₨${bill.total_amount.toLocaleString()} entered again on ${bill.bill_date}`, reference_type: 'bill' });
  }

  // 2. Unusually large: > 3x average of last 10 bills
  // const { data: lastBills } = await supabase.from('bills')
  //   .select('total_amount')
  //   .eq('firm_id', firmId)
  //   .order('created_at', { ascending: false })
  //   .limit(10);
  // if (lastBills && lastBills.length >= 3) {
  //   const avg = lastBills.reduce((s, b) => s + b.total_amount, 0) / lastBills.length;
  //   if (bill.total_amount > avg * 3) {
  //     anomalies.push({ type: 'Large Bill', firm_id: firmId, details: `₨${bill.total_amount.toLocaleString()} is ${Math.round(bill.total_amount / avg)}× the average of last ${lastBills.length} bills`, reference_type: 'bill' });
  //   }
  // }
  // 2. Unusually large: > 3x average of last 10 bills (only if client has 5+ bills)
  const { data: lastBills } = await supabase.from('bills')
    .select('total_amount')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (lastBills && lastBills.length >= 5) {
    const avg = lastBills.reduce((s, b) => s + b.total_amount, 0) / lastBills.length;
    if (avg > 0 && bill.total_amount > avg * 3) {
      anomalies.push({ type: 'Large Bill', firm_id: firmId, details: `₨${bill.total_amount.toLocaleString()} is ${Math.round(bill.total_amount / avg)}× the average of last ${lastBills.length} bills`, reference_type: 'bill' });
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
        let allResults = [];
        let start = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase
            .from('bills').select('*, firms(name)')
            .range(start, start + pageSize - 1)
            .order('id', { ascending: false });
          if (!data || data.length === 0) break;
          allResults = allResults.concat(data);
          if (data.length < pageSize) break;
          start += pageSize;
        }

        const { from, to, do_no, bill_no } = query;
        let filtered = allResults;

        if (bill_no) {
          filtered = filtered.filter(b => String(b.id).includes(bill_no.trim()));
        } else if (do_no) {
          filtered = filtered.filter(b => b.do_no && b.do_no.toLowerCase().includes(do_no.trim().toLowerCase()));
        } else if (from || to) {
          if (from) filtered = filtered.filter(b => b.bill_date >= from);
          if (to) filtered = filtered.filter(b => b.bill_date <= to);
        }

        return res.json(filtered);
      }

      if (query.today) {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase.from('bills').select('*, firms(name)').eq('bill_date', today).order('id', { ascending: false });
        return res.json(data || []);
      }
      if (query.firm_id) {
        const { data } = await supabase.from('bills').select('*, bill_items(*)').eq('firm_id', query.firm_id).order('bill_date', { ascending: false });
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

      // Check anomalies
      const anomalies = await checkAnomalies(billRecord, firm_id);
      for (const a of anomalies) {
        const { data: firm } = await supabase.from('firms').select('name').eq('id', firm_id).single();
        await supabase.from('anomalies').insert({ ...a, firm_name: firm?.name, reference_id: newBill.id });
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
