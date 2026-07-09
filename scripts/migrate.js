#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { distance } = require('fastest-levenshtein');
const readline = require('readline-sync');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CSV_DIR = path.join(__dirname, '../csvs');
const MAP_FILE = path.join(__dirname, '../product_map.json');
const UNMATCHED_FILE = path.join(__dirname, '../unmatched.csv');

// ─── NON-PRODUCT PATTERNS ────────────────────────────────────────────────────
const NON_PRODUCT_PATTERNS = [
  /^cash/i, /^online/i, /^transfer/i, /^tranf/i, /^transer/i,
  /^balance/i, /^payment/i, /^b\/f/i, /^sent/i, /^given/i,
  /^dated/i, /^packing bill/i, /^shopper/i, /^returned shirts/i,
  /^leather patch/i, /^patch on/i, /^size /i, /^s\/\d/i, /^m\/\d/i,
  /^l\/\d/i, /^xl\//i, /^with /i, /^for /i, /^through/i, /^trough/i,
  /^\d+\/\d+/i, /^[0-9]+$/, /^0+$/, /^aaada/i, /^jhjkh/i,
  /^elbow patch/i, /^valcro/i, /^ribbon/i, /^sandow with/i,
  /^sandow mono/i, /^shoulder flap/i, /^name plates/i,
  /^pakistan flags/i, /^malaca cane/i, /^mallac/i, /^malacca/i,
  /^zeen/i, /^sewing thread/i, /^thread/i, /^sweing/i, /^sweimh/i,
  /^difference in/i, /^5 pse less/i, /^full saleeves with/i,
  /^full salvees/i, /^cheaque/i, /^haroon sahi/i, /^mian rafique/i,
  /^bashir army/i, /^given to/i, /^iniform/i,
];

function isNonProduct(name) {
  const n = name.trim();
  if (n.length <= 1) return true;
  return NON_PRODUCT_PATTERNS.some(p => p.test(n));
}

// ─── PRODUCT GROUPS ──────────────────────────────────────────────────────────
// Pre-defined canonical product families to guide fuzzy matching
const PRODUCT_FAMILIES = [
  { code: 'JRA', name: 'Jersey Rib/Acrylic', keywords: ['jersey', 'jesey', 'jersy', 'jersys', 'jerseys', 'jersies', 'jeresys', 'jereseys', 'jersesys', 'jereys', 'jeerseys', 'jsereys', 'jrseys', 'jersry', 'jerswys', 'jersyes', 'jersiy', 'jerises', 'jersies', 'jeesy', 'jeresy', 'jersys', 'jserys'], subKeywords: ['rib', 'acr', 'acy', 'acylic', 'acrylic'] },
  { code: 'JRW', name: 'Jersey Rib/Wool', keywords: ['jersey', 'jersy', 'jersys', 'jerseys', 'jersies', 'jeresys'], subKeywords: ['wool', 'woolen', 'wollen', 'woollen'] },
  { code: 'JRN', name: 'Jersey Round Neck', keywords: ['jersey', 'jersy', 'jersys', 'jerseys', 'jersies'], subKeywords: ['round neck', 'r.neck', 'r/neck', 'rnd nck', 'r.n', 'r/n'] },
  { code: 'JHN', name: 'Jersey High Neck', keywords: ['jersey', 'jersy', 'jersys', 'jerseys', 'jersies'], subKeywords: ['high neck', 'h.neck', 'h/neck', 'h/nk', 'highneck'] },
  { code: 'JSP', name: 'Jersey Sports', keywords: ['jersey', 'jersy', 'jersys', 'jerseys', 'jersies', 'sports jersey', 'sports jersys'], subKeywords: ['sports', 'soprts', 'sporst'] },
  { code: 'JUN', name: 'Jersey Uniform', keywords: ['jersey', 'jersy', 'jersys', 'jerseys', 'jersies'], subKeywords: ['uniform', 'unifrom', 'iniform'] },
  { code: 'JLA', name: 'Jersey Ladies Coat', keywords: ['jersey', 'jersy', 'jerseys', 'ladies coat', 'ladies coti', 'ladies coty'], subKeywords: ['ladies', 'coat', 'coti', 'coty', 'zipper coat'] },
  { code: 'SV', name: 'Summer Vests', keywords: ['summer vest', 'summer vests', 'summe vests', 'sumer vests', 'summer vets', 'summmer vests', 'sumnmer vests', 'suummer vest', 'vest/summer', 'vest /summer'] },
  { code: 'SFS', name: 'Shirts Fleece', keywords: ['shirts fleece', 'shirt fleece', 'shirts flees', 'shirt flees', 'fleece shirt', 'fleece shirts', 'shirts fllece', 'shit fleece', 'shitrs fleece', 'siut fleece', 'siuit fleece', 'suit sleece', 'suit flece'] },
  { code: 'SFT', name: 'Suits Fleece', keywords: ['suit fleece', 'suits fleece', 'suit fllece', 'siut fleece', 'siuit fleece', 'suit flece', 'suit slece', 'fleece suit'] },
  { code: 'TRF', name: 'Trousers Fleece', keywords: ['trousers fleece', 'trouser fleece', 'trousers flece', 'torusers fleece', 'trouers fleece', 'trausers', 'trouser', 'trousesrs fleece', 'fleece trousers', 'fleece trousers'] },
  { code: 'SHP', name: 'Shirts Polo', keywords: ['shirts polo', 'shirt polo', 'polo shirt', 'polo shirts', 'shirts plolo', 'shirts pollo'] },
  { code: 'TSH', name: 'T-Shirts', keywords: ['t shirt', 't shirts', 't.shirt', 't.shirts', 't/shirt', 't/shirts', 'tshirt'] },
  { code: 'SWV', name: 'Summer Vests Poly', keywords: ['summer vest poly', 'summer vests poly', 'vests poly', 'vests f.s poly', 'vests h.s poly'] },
  { code: 'WOL', name: 'Wool', keywords: ['wool'] },
  { code: 'GLA', name: 'Gloves Acrylic', keywords: ['gloves acr', 'gloves acy', 'gloves acylic', 'gloves acrylic', 'golves', 'gloves'] },
  { code: 'GLW', name: 'Gloves Woolen', keywords: ['gloves wool', 'gloves wolen', 'gloves woolen'] },
  { code: 'SCK', name: 'Socks Cotton', keywords: ['socks cotton', 'sockd cotton', 'skocks cotton', 'socks cottton', 'scks'] },
  { code: 'SKW', name: 'Socks Woolen', keywords: ['socks woolen', 'socks wollen', 'socks wooelen', 'socks wooolen', 'socks wolen', 'socks wooeln'] },
  { code: 'SKL', name: 'Socks Lycra', keywords: ['socks lycra', 'socks lyra', 'sockslycra'] },
  { code: 'SKT', name: 'Socks Towel', keywords: ['socks towel', 'socka towel', 'socks tawal'] },
  { code: 'SKS', name: 'Socks Sports', keywords: ['socks sports', 'socks action', 'sports socks'] },
  { code: 'STK', name: 'Stocking', keywords: ['stocking', 'stoking', 'stoccking'] },
  { code: 'CAP', name: 'Cap Comforter', keywords: ['cap comforter', 'cap comferter', 'cap comferer', 'cap comfeter', 'cap comferetr', 'caps woolen', 'cao comferter'] },
  { code: 'MUF', name: 'Muffler', keywords: ['muffler', 'mufler'] },
  { code: 'SCF', name: 'Scarf', keywords: ['scarf', 'scalf', 'skalf', 'scalf acrylic', 'scarf acrylic', 'scarf woolen'] },
  { code: 'SHW', name: 'Shoulders', keywords: ['shoulders', 'shoulder flap', 'shoulder patch', 'patch on shoulders'] },
  { code: 'FAB', name: 'Fleece Fabric', keywords: ['fleece fabric', 'fleece 5 kg', 'o.green fleece fabric'] },
  { code: 'TAC', name: 'Tactical Shirts', keywords: ['tactical shirts'] },
  { code: 'WRD', name: 'Shirts Warden', keywords: ['shirts warden', 'shirt warden'] },
];

function parseDateStr(str) {
  if (!str || str === 'Nil' || str === '0') return null;
  const s = str.trim().replace(' 0:00:00', '').replace(/\s+\d+:\d+:\d+$/, '');
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y) return null;
  const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function cleanStr(s) {
  if (!s) return '';
  return s.trim().replace(/^"/, '').replace(/"$/, '').replace(/\r/g, '');
}

function readCSV(filename) {
  const filepath = path.join(CSV_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: Cannot find ${filepath}`);
    console.error(`Please place your CSV files in the csvs/ folder.`);
    process.exit(1);
  }
  const content = fs.readFileSync(filepath, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
}

function findBestFamily(particular) {
  const p = particular.toLowerCase().trim();
  let bestScore = Infinity;
  let bestFamily = null;

  for (const family of PRODUCT_FAMILIES) {
    for (const kw of family.keywords) {
      if (p.includes(kw.toLowerCase())) {
        if (family.subKeywords) {
          const hasSub = family.subKeywords.some(sk => p.includes(sk.toLowerCase()));
          if (hasSub) {
            const score = distance(p, kw.toLowerCase());
            if (score < bestScore) { bestScore = score; bestFamily = family; }
          }
        } else {
          const score = distance(p, kw.toLowerCase());
          if (score < bestScore) { bestScore = score; bestFamily = family; }
        }
      }
    }
  }

  // Fallback: pure distance match against all family names
  if (!bestFamily) {
    for (const family of PRODUCT_FAMILIES) {
      const score = distance(p, family.name.toLowerCase());
      if (score < bestScore && score < 8) { bestScore = score; bestFamily = family; }
    }
  }

  return bestFamily;
}

// ─── STEP 1: PRODUCT MAPPING ─────────────────────────────────────────────────
async function buildProductMap() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  NEEDLE CRAFT — MIGRATION SCRIPT');
  console.log('  Step 1: Product Mapping');
  console.log('═══════════════════════════════════════════════════════\n');

  if (fs.existsSync(MAP_FILE)) {
    console.log('✓ product_map.json already exists — skipping mapping step.\n');
    return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  }

  console.log('Reading Bill_Det.csv...');
  const billDet = readCSV('Bill_Det.csv');

  const allParticulars = [...new Set(billDet.map(r => cleanStr(r.Particular)).filter(Boolean))];
  console.log(`Found ${allParticulars.length} unique particulars.\n`);

  const productMap = {};
  const autoMapped = [];
  const manualQueue = [];
  const skipped = [];

  for (const particular of allParticulars) {
    if (isNonProduct(particular)) {
      skipped.push(particular);
      continue;
    }
    const family = findBestFamily(particular);
    if (family) {
      productMap[particular] = { code: family.code, name: family.name };
      autoMapped.push({ particular, code: family.code, name: family.name });
    } else {
      manualQueue.push(particular);
    }
  }

  console.log(`✓ Auto-mapped ${autoMapped.length} items silently.`);
  console.log(`✓ Skipped ${skipped.length} non-product entries.`);
  console.log(`⚠ ${manualQueue.length} items need your confirmation.\n`);

  if (manualQueue.length > 0) {
    console.log('Please confirm the following mappings.');
    console.log('Press Enter to accept, or type a product code to assign a different one.');
    console.log('Type "skip" to mark as non-product.\n');

    // Show available codes
    console.log('Available product codes:');
    PRODUCT_FAMILIES.forEach(f => console.log(`  ${f.code.padEnd(6)} = ${f.name}`));
    console.log('  NEW    = Define a new product (you will be prompted for code + name)\n');

    for (const particular of manualQueue) {
      const guess = findBestFamily(particular);
      const suggestion = guess ? `${guess.code} (${guess.name})` : 'unknown — needs mapping';

      console.log(`─────────────────────────────────────────────`);
      console.log(`Item: "${particular}"`);
      console.log(`Suggestion: ${suggestion}`);
      const answer = readline.question(`Accept? [Enter] or type code: `).trim().toUpperCase();

      if (answer === '' && guess) {
        productMap[particular] = { code: guess.code, name: guess.name };
        console.log(`  → Mapped to ${guess.code} (${guess.name})\n`);
      } else if (answer === 'SKIP') {
        skipped.push(particular);
        console.log(`  → Skipped\n`);
      } else if (answer === 'NEW') {
        const newCode = readline.question('  New product code (e.g. XYZ): ').trim().toUpperCase();
        const newName = readline.question('  New product name (e.g. Button Pants): ').trim();
        productMap[particular] = { code: newCode, name: newName };
        // Add to families for future matches
        PRODUCT_FAMILIES.push({ code: newCode, name: newName, keywords: [newName.toLowerCase()] });
        console.log(`  → Created new product ${newCode} (${newName})\n`);
      } else {
        const found = PRODUCT_FAMILIES.find(f => f.code === answer);
        if (found) {
          productMap[particular] = { code: found.code, name: found.name };
          console.log(`  → Mapped to ${found.code} (${found.name})\n`);
        } else {
          console.log(`  Code not found. Skipping.\n`);
          skipped.push(particular);
        }
      }
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(productMap, null, 2));
  console.log(`\n✓ product_map.json saved with ${Object.keys(productMap).length} mappings.\n`);
  return productMap;
}

// ─── STEP 2: IMPORT DATA ──────────────────────────────────────────────────────
async function importData(productMap) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Step 2: Importing data into Supabase');
  console.log('═══════════════════════════════════════════════════════\n');

  const unmatched = [];
  const stats = { firms: 0, activeBills: 0, archiveBills: 0, billItems: 0, archiveBillItems: 0, activePayments: 0, archivePayments: 0 };

  // ── 2a. Import firms ──────────────────────────────────────────────────────
  console.log('Importing firms...');
  const firmRows = readCSV('Firm_Name.csv');
  const firmMap = {}; // name → supabase id

  const firmData = firmRows.map(r => ({ name: cleanStr(r.Name) })).filter(r => r.name);
  const uniqueFirmNames = [...new Set(firmData.map(r => r.name))];
  const firmsToInsert = uniqueFirmNames.map(name => ({ name }));

  const { data: insertedFirms, error: firmErr } = await supabase.from('firms').insert(firmsToInsert).select();
  if (firmErr) { console.error('Firm insert error:', firmErr.message); process.exit(1); }
  insertedFirms.forEach(f => { firmMap[f.name] = f.id; });
  stats.firms = insertedFirms.length;
  console.log(`  ✓ ${stats.firms} firms imported.\n`);

  function resolveFirmId(name) {
    const clean = cleanStr(name);
    if (firmMap[clean]) return firmMap[clean];
    // Fuzzy fallback
    let best = null, bestDist = Infinity;
    for (const [firmName, id] of Object.entries(firmMap)) {
      const d = distance(clean.toLowerCase(), firmName.toLowerCase());
      if (d < bestDist) { bestDist = d; best = id; }
    }
    return bestDist < 6 ? best : null;
  }

  // ── 2b. Read Bills and Bill_Det ───────────────────────────────────────────
  console.log('Reading Bills.csv and Bill_Det.csv...');
  const billRows = readCSV('Bills.csv');
  const billDetRows = readCSV('Bill_Det.csv');

  // Group bill_det by SNo
  const detBySNo = {};
  for (const det of billDetRows) {
    const sno = cleanStr(det.SNo);
    if (!detBySNo[sno]) detBySNo[sno] = [];
    detBySNo[sno].push(det);
  }

  const CUTOFF = '2024-01-01';

  // ── 2c. Import bills ──────────────────────────────────────────────────────
  console.log('Importing bills (this may take a moment)...');

  // Build unique product list from productMap
  const productsByCode = {};
  for (const [, v] of Object.entries(productMap)) {
    if (!productsByCode[v.code]) productsByCode[v.code] = v.name;
  }

  // Upsert products
  const productsToInsert = Object.entries(productsByCode).map(([code, name]) => ({ code, name, standard_price: 0, cost_price: 0 }));
  if (productsToInsert.length > 0) {
    const { error: pErr } = await supabase.from('products').upsert(productsToInsert, { onConflict: 'code' });
    if (pErr) console.warn('Products insert warning:', pErr.message);
  }

  // Fetch product ids
  const { data: productRows } = await supabase.from('products').select('id, code');
  const productIdByCode = {};
  if (productRows) productRows.forEach(p => { productIdByCode[p.code] = p.id; });

  for (const bill of billRows) {
    const billDate = parseDateStr(cleanStr(bill.Bill_Date));
    if (!billDate) { unmatched.push({ source: 'Bills', row: JSON.stringify(bill), reason: 'Invalid date' }); continue; }
    const firmId = resolveFirmId(bill.Name);
    if (!firmId) { unmatched.push({ source: 'Bills', row: JSON.stringify(bill), reason: 'Firm not found: ' + bill.Name }); continue; }

    const billRecord = {
      firm_id: firmId,
      bill_date: billDate,
      bilty_no: cleanStr(bill.Bilty_No) === 'Nil' ? '' : cleanStr(bill.Bilty_No),
      do_no: cleanStr(bill.D_O_No) === 'Nil' ? '' : cleanStr(bill.D_O_No),
      bilty_charges: parseInt(bill.Bilty_Charges) || 0,
      packaging_charges: parseFloat(bill.packaging_charges) || 0,
      total_amount: parseInt(bill.Total_Amount) || 0,
      is_credit: true,
    };

    const isArchive = billDate < CUTOFF;

    if (isArchive) {
      const { data: inserted, error } = await supabase.from('archive_bills').insert({ ...billRecord, original_bill_no: cleanStr(bill.Bill_No) }).select('id').single();
      if (error) { unmatched.push({ source: 'Bills', row: JSON.stringify(bill), reason: error.message }); continue; }
      stats.archiveBills++;

      // Archive bill items
      const detRows = detBySNo[cleanStr(bill.SNo)] || [];
      const archiveItems = detRows
        .filter(d => !isNonProduct(cleanStr(d.Particular)))
        .map(d => ({
          archive_bill_id: inserted.id,
          product_name: productMap[cleanStr(d.Particular)]?.name || cleanStr(d.Particular),
          colour: cleanStr(d.Colour),
          size: cleanStr(d.Size),
          quantity: parseInt(d.Quantity) || 0,
          price: parseInt(d.Per) || 0,
          total: parseInt(d.Total) || 0,
        }));
      if (archiveItems.length > 0) {
        const { error: aiErr } = await supabase.from('archive_bill_items').insert(archiveItems);
        if (aiErr) console.warn('Archive bill items warning:', aiErr.message);
        else stats.archiveBillItems += archiveItems.length;
      }
    } else {
      const { data: inserted, error } = await supabase.from('bills').insert(billRecord).select('id').single();
      if (error) { unmatched.push({ source: 'Bills', row: JSON.stringify(bill), reason: error.message }); continue; }
      stats.activeBills++;

      // Active bill items
      const detRows = detBySNo[cleanStr(bill.SNo)] || [];
      const activeItems = detRows
        .filter(d => !isNonProduct(cleanStr(d.Particular)))
        .map(d => ({
          bill_id: inserted.id,
          product_id: productIdByCode[productMap[cleanStr(d.Particular)]?.code] || null,
          product_name: productMap[cleanStr(d.Particular)]?.name || cleanStr(d.Particular),
          colour: cleanStr(d.Colour),
          size: cleanStr(d.Size),
          quantity: parseInt(d.Quantity) || 0,
          price: parseInt(d.Per) || 0,
          total: parseInt(d.Total) || 0,
        }));
      if (activeItems.length > 0) {
        const { error: biErr } = await supabase.from('bill_items').insert(activeItems);
        if (biErr) console.warn('Bill items warning:', biErr.message);
        else stats.billItems += activeItems.length;
      }
    }
  }

  console.log(`  ✓ ${stats.activeBills} active bills imported.`);
  console.log(`  ✓ ${stats.archiveBills} archive bills imported.`);
  console.log(`  ✓ ${stats.billItems} active bill items imported.`);
  console.log(`  ✓ ${stats.archiveBillItems} archive bill items imported.\n`);

  // ── 2d. Import payments ───────────────────────────────────────────────────
  console.log('Importing payments...');
  const balanceRows = readCSV('Bill_Balance.csv');

  for (const pmt of balanceRows) {
    const pmtDate = parseDateStr(cleanStr(pmt.Bill_Date));
    if (!pmtDate) { unmatched.push({ source: 'Bill_Balance', row: JSON.stringify(pmt), reason: 'Invalid date' }); continue; }
    const firmId = resolveFirmId(pmt.Name);
    if (!firmId) { unmatched.push({ source: 'Bill_Balance', row: JSON.stringify(pmt), reason: 'Firm not found: ' + pmt.Name }); continue; }

    let method = 'Cash';
    // Note: column is By_Checque (misspelled in source)
    if (parseInt(pmt.By_Checque) === 1 || parseInt(pmt['By_Checque']) === 1) method = 'Cheque';
    else if (parseInt(pmt.Deposit_in_Bank) === 1) method = 'Bank Transfer';
    else if (parseInt(pmt.By_Draft) === 1) method = 'Draft';
    else if (parseInt(pmt.Return) === 1) method = 'Return';
    else if (parseInt(pmt.By_Hand) === 1) method = 'Cash';

    const pmtRecord = {
      firm_id: firmId,
      payment_date: pmtDate,
      amount: parseInt(pmt.Total_Amount) || 0,
      method,
      cheque_number: cleanStr(pmt.C_Number) === 'Nil' ? '' : cleanStr(pmt.C_Number),
      bank_name: cleanStr(pmt.Bank_Name) === 'Nil' ? '' : cleanStr(pmt.Bank_Name),
      memo: cleanStr(pmt.memo) || '',
    };

    const isArchive = pmtDate < CUTOFF;
    if (isArchive) {
      const { error } = await supabase.from('archive_payments').insert(pmtRecord);
      if (error) unmatched.push({ source: 'Bill_Balance', row: JSON.stringify(pmt), reason: error.message });
      else stats.archivePayments++;
    } else {
      const { error } = await supabase.from('payments').insert(pmtRecord);
      if (error) unmatched.push({ source: 'Bill_Balance', row: JSON.stringify(pmt), reason: error.message });
      else stats.activePayments++;
    }
  }

  console.log(`  ✓ ${stats.activePayments} active payments imported.`);
  console.log(`  ✓ ${stats.archivePayments} archive payments imported.\n`);

  // ── Save unmatched ─────────────────────────────────────────────────────────
  if (unmatched.length > 0) {
    const lines = ['source,row,reason', ...unmatched.map(u => `"${u.source}","${u.row.replace(/"/g, '""')}","${u.reason}"`)];
    fs.writeFileSync(UNMATCHED_FILE, lines.join('\n'));
    console.log(`  ⚠ ${unmatched.length} unmatched rows saved to unmatched.csv\n`);
  }

  return stats;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  // Check CSV folder
  if (!fs.existsSync(CSV_DIR)) {
    fs.mkdirSync(CSV_DIR);
    console.log(`Created csvs/ folder. Please place your 4 CSV files there and run again.`);
    console.log(`Required files: Firm_Name.csv, Bills.csv, Bill_Det.csv, Bill_Balance.csv`);
    process.exit(0);
  }

  const productMap = await buildProductMap();
  const stats = await importData(productMap);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Migration Complete');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Firms imported:               ${stats.firms}`);
  console.log(`  Active bills (2024+):         ${stats.activeBills}`);
  console.log(`  Archive bills (pre-2024):     ${stats.archiveBills}`);
  console.log(`  Active bill items:            ${stats.billItems}`);
  console.log(`  Archive bill items:           ${stats.archiveBillItems}`);
  console.log(`  Active payments (2024+):      ${stats.activePayments}`);
  console.log(`  Archive payments (pre-2024):  ${stats.archivePayments}`);
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Your data is now live in Supabase. You can open the app.\n');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
