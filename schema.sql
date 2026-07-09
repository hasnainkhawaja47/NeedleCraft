-- NEEDLE CRAFT DATABASE SCHEMA
-- Run this in Supabase SQL Editor before running migrate.js

-- Active tables (2024 onwards)

CREATE TABLE IF NOT EXISTS firms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  standard_price INTEGER DEFAULT 0,
  cost_price INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id),
  bill_date DATE NOT NULL,
  bilty_no TEXT DEFAULT '',
  do_no TEXT DEFAULT '',
  bilty_charges INTEGER DEFAULT 0,
  packaging_charges INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  is_credit BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_items (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  colour TEXT DEFAULT '',
  size TEXT DEFAULT '',
  quantity INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id),
  payment_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  method TEXT DEFAULT 'Cash',
  cheque_number TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anomalies (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  firm_id INTEGER REFERENCES firms(id),
  firm_name TEXT,
  details TEXT,
  reference_id INTEGER,
  reference_type TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  dismissed BOOLEAN DEFAULT false
);

-- Archive tables (pre-2024, read-only from app)

CREATE TABLE IF NOT EXISTS archive_bills (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id),
  original_bill_no TEXT,
  bill_date DATE NOT NULL,
  bilty_no TEXT DEFAULT '',
  do_no TEXT DEFAULT '',
  bilty_charges INTEGER DEFAULT 0,
  packaging_charges INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  is_credit BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS archive_bill_items (
  id SERIAL PRIMARY KEY,
  archive_bill_id INTEGER REFERENCES archive_bills(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  colour TEXT DEFAULT '',
  size TEXT DEFAULT '',
  quantity INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS archive_payments (
  id SERIAL PRIMARY KEY,
  firm_id INTEGER REFERENCES firms(id),
  payment_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  method TEXT DEFAULT 'Cash',
  cheque_number TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  memo TEXT DEFAULT ''
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bills_firm_id ON bills(firm_id);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_firm_id ON payments(firm_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_archive_bills_firm_id ON archive_bills(firm_id);
CREATE INDEX IF NOT EXISTS idx_archive_payments_firm_id ON archive_payments(firm_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_dismissed ON anomalies(dismissed);
