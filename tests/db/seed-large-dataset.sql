-- ============================================================================
-- Large Dataset Seed Script (Performance-Optimized)
-- ============================================================================
--
-- Populates the database with realistic volumes for performance testing:
--   - 50,000 menu items
--   - 100,000 customers
--   - 500,000 invoices
--   - ~2,000,000 invoice items
--   - 20,000 expenses
--   - 10,000 bookings
--
-- Optimizations:
--   - Temp-disables triggers, foreign keys, and indexes during bulk inserts
--   - Uses batch INSERT ... SELECT for maximum throughput
--   - Wraps each section in a single transaction
--
-- Usage:
--   psql "$DATABASE_URL" -f tests/db/seed-large-dataset.sql
--
-- WARNING: Run ONLY on a test/staging database. This deletes existing test data!
-- ============================================================================

BEGIN;

-- ─── Helper: Generate random timestamp within a range ─────────
CREATE OR REPLACE FUNCTION random_timestamp(start_date DATE, end_date DATE)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN start_date + random() * (end_date - start_date) + random() * INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- ─── Disable triggers & indexes for speed ──────────────────────
-- Re-enabled at the end of this script.

SET session_replication_role = replica;  -- Disable foreign key checks

-- ─── 1. Menu Items (50,000) ────────────────────────────────────

-- Drop indexes for bulk insert, we'll recreate them after
DROP INDEX IF EXISTS idx_menu_items_category;
DROP INDEX IF EXISTS idx_menu_items_available;
DROP INDEX IF EXISTS idx_menu_items_tags;

DO $$
DECLARE
  cat_ids UUID[]; cat_id UUID; i INT;
  names TEXT[] := ARRAY[
    'Espresso','Latte','Cappuccino','Mocha','Americano','Cold Brew',
    'Masala Chai','Green Tea','Iced Tea','Lemonade','Smoothie','Milkshake',
    'Burger','Pizza','Pasta','Sandwich','Salad','Soup',
    'Momo','Chowmein','Fried Rice','Naan','Curry','Biryani',
    'Cake','Ice Cream','Brownie','Mousse','Pudding','Cheesecake',
    'Spring Roll','Nachos','Fries','Wings','Fish & Chips','Steak',
    'Omelette','Paratha','Pancake','Waffle','French Toast','Porridge',
    'Club Sandwich','Wrap','Quesadilla','Taco','Burrito','Sushi',
    'Pad Thai','Ramen','Pho','Dim Sum','Teriyaki','Tempura'
  ];
BEGIN
  SELECT ARRAY_AGG(id ORDER BY name) INTO cat_ids FROM menu_categories;
  IF array_length(cat_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No categories found. Seed menu_categories first.';
  END IF;

  -- Batch insert 500 rows at a time — ~100 iterations instead of 50,000
  FOR i IN 0..99 LOOP
    INSERT INTO menu_items (id, name, description, price, category_id, available, tags)
    SELECT
      gen_random_uuid(),
      names[1 + ((i * 500 + j) % array_length(names, 1))] || ' ' || (i * 500 + j + 1),
      'Description for menu item #' || (i * 500 + j + 1),
      ROUND((random() * 1500 + 50)::numeric, 2),
      cat_ids[1 + ((i * 500 + j) % array_length(cat_ids, 1))],
      random() > 0.1,
      ARRAY[CASE WHEN random() > 0.5 THEN 'popular' ELSE 'standard' END,
            CASE WHEN random() > 0.7 THEN 'new' ELSE 'regular' END]
    FROM generate_series(0, 499) AS j;

    IF (i + 1) % 20 = 0 THEN
      RAISE NOTICE 'Inserted % menu items...', (i + 1) * 500;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: 50,000 menu items';
END $$;

-- Rebuild indexes concurrently
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
CREATE INDEX idx_menu_items_available ON public.menu_items(available);
CREATE INDEX idx_menu_items_tags ON public.menu_items USING GIN(tags);

-- ─── 2. Customers (100,000) ────────────────────────────────────

DROP INDEX IF EXISTS idx_customers_phone;
DROP INDEX IF EXISTS idx_customers_email;
DROP INDEX IF EXISTS idx_customers_name;

DO $$
DECLARE
  firsts TEXT[] := ARRAY[
    'Ram','Shyam','Hari','Sita','Gita','Rita','Mohan','Sohan',
    'Arun','Kabita','Priya','Ravi','Anita','Sunita','Bishnu',
    'Prakash','Deepak','Rajesh','Nirmala','Sarita','Krishna','Mina'
  ];
  lasts TEXT[] := ARRAY[
    'Sharma','Adhikari','Poudel','Thapa','Gurung','Tamang',
    'Khanal','Bhattarai','Dahal','Karki','Neupane','Chaudhary',
    'Singh','Rai','Limbu','Magar','Basnet','Acharya','Subedi','Shrestha'
  ];
BEGIN
  FOR i IN 0..199 LOOP
    INSERT INTO customers (id, name, phone, email, total_orders, total_spent, credit_balance)
    SELECT
      gen_random_uuid(),
      firsts[1 + ((i * 500 + j) % array_length(firsts, 1))] || ' ' ||
        lasts[1 + ((i * 500 + j) % array_length(lasts, 1))],
      '980' || LPAD(CAST(10000000 + i * 500 + j AS TEXT), 7, '0'),
      'customer' || (i * 500 + j + 1) || '@example.com',
      CAST(random() * 200 AS INT),
      ROUND((random() * 100000)::numeric, 2),
      ROUND((CASE WHEN random() > 0.7 THEN random() * 5000 ELSE 0 END)::numeric, 2)
    FROM generate_series(0, 499) AS j;

    IF (i + 1) % 40 = 0 THEN
      RAISE NOTICE 'Inserted % customers...', (i + 1) * 500;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: 100,000 customers';
END $$;

CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_name ON public.customers(name);

-- ─── 3. Invoices (500,000) ─────────────────────────────────────

DROP INDEX IF EXISTS idx_invoices_customer;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoices_created;

DO $$
DECLARE
  cust_ids UUID[];
  statuses TEXT[] := ARRAY['paid','paid','paid','paid','pending','partial','cancelled','overdue'];
  methods TEXT[] := ARRAY['cash','fonepay','credit','reception_qr'];
  start_ts DATE := '2025-01-01';
  end_ts DATE := '2026-07-14';
BEGIN
  SELECT ARRAY_AGG(id) INTO cust_ids FROM customers ORDER BY created_at DESC LIMIT 80000;
  IF array_length(cust_ids, 1) IS NULL THEN RAISE EXCEPTION 'No customers found'; END IF;

  FOR i IN 0..999 LOOP
    INSERT INTO invoices (id, invoice_number, customer_id, customer_name, total, status, payment_method, created_at)
    SELECT
      gen_random_uuid(),
      'INV-PERF-' || LPAD(CAST(i * 500 + j + 1 AS TEXT), 7, '0'),
      cust_ids[1 + ((i * 500 + j) % array_length(cust_ids, 1))],
      'Customer ' || (i * 500 + j + 1),
      ROUND((random() * 15000 + 100)::numeric, 2),
      statuses[1 + CAST(random() * 7 AS INT)],
      methods[1 + CAST(random() * 3 AS INT)],
      random_timestamp(start_ts, end_ts)
    FROM generate_series(0, 499) AS j;

    IF (i + 1) % 200 = 0 THEN
      RAISE NOTICE 'Inserted % invoices...', (i + 1) * 500;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: 500,000 invoices';
END $$;

CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_created ON public.invoices(created_at);

-- ─── 4. Invoice Items (~2,000,000) ─────────────────────────────

DROP INDEX IF EXISTS idx_invoice_items_invoice;

DO $$
DECLARE
  menu_ids UUID[]; item_id UUID;
  inv_record RECORD; cnt INT;
BEGIN
  SELECT ARRAY_AGG(id) INTO menu_ids FROM menu_items ORDER BY RANDOM() LIMIT 1000;
  IF array_length(menu_ids, 1) IS NULL THEN RAISE EXCEPTION 'No menu items found'; END IF;

  cnt := 0;
  FOR inv_record IN SELECT id, created_at FROM invoices ORDER BY created_at ASC LOOP
    INSERT INTO invoice_items (id, invoice_id, menu_item_id, name, quantity, unit_price, total_price, created_at)
    SELECT
      gen_random_uuid(),
      inv_record.id,
      menu_ids[1 + CAST(random() * (array_length(menu_ids, 1) - 1) AS INT)],
      'Item ' || gs,
      CAST(random() * 3 + 1 AS INT),
      ROUND((random() * 500 + 50)::numeric, 2),
      ROUND((random() * 1500 + 50)::numeric, 2),
      inv_record.created_at + random() * INTERVAL '1 hour'
    FROM generate_series(1, CAST(random() * 6 + 1 AS INT)) AS gs;

    cnt := cnt + 1;
    IF cnt % 50000 = 0 THEN
      RAISE NOTICE 'Inserted items for % invoices...', cnt;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: ~2,000,000 invoice items for % invoices', cnt;
END $$;

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- ─── 5. Expenses (20,000) ──────────────────────────────────────

DROP INDEX IF EXISTS idx_expenses_date;
DROP INDEX IF EXISTS idx_expenses_category;

DO $$
DECLARE
  cats TEXT[] := ARRAY['utilities','supplies','maintenance','staff','marketing','other'];
  meths TEXT[] := ARRAY['cash','fonepay','credit'];
  start_ts DATE := '2025-01-01';
  end_ts DATE := '2026-07-14';
BEGIN
  FOR i IN 0..39 LOOP
    INSERT INTO expenses (id, description, category, amount, date, payment_method, notes)
    SELECT
      gen_random_uuid(),
      'Expense item #' || (i * 500 + j + 1),
      cats[1 + CAST(random() * 5 AS INT)],
      ROUND((random() * 50000 + 100)::numeric, 2),
      (start_ts + CAST(random() * (end_ts - start_ts) AS INT)::TEXT::DATE),
      meths[1 + CAST(random() * 2 AS INT)],
      'Performance test expense'
    FROM generate_series(0, 499) AS j;

    IF (i + 1) % 10 = 0 THEN
      RAISE NOTICE 'Inserted % expenses...', (i + 1) * 500;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: 20,000 expenses';
END $$;

CREATE INDEX idx_expenses_date ON public.expenses(date);
CREATE INDEX idx_expenses_category ON public.expenses(category);

-- ─── 6. Bookings (10,000) ──────────────────────────────────────

DROP INDEX IF EXISTS idx_bookings_room;
DROP INDEX IF EXISTS idx_bookings_status;
DROP INDEX IF EXISTS idx_bookings_dates;

DO $$
DECLARE
  r_ids UUID[]; stat TEXT[] := ARRAY['confirmed','checked_in','checked_out','cancelled','pending'];
  start_ts DATE := '2025-06-01';
  end_ts DATE := '2026-07-20';
  ci DATE; co DATE;
BEGIN
  SELECT ARRAY_AGG(id) INTO r_ids FROM rooms;

  FOR i IN 0..19 LOOP
    INSERT INTO bookings (id, guest_name, guest_email, guest_phone, room_id, check_in, check_out, status, total_amount, paid_amount, payment_status)
    SELECT
      gen_random_uuid(),
      'Guest ' || (i * 500 + j + 1),
      'guest' || (i * 500 + j + 1) || '@example.com',
      '980' || LPAD(CAST(20000000 + i * 500 + j AS TEXT), 7, '0'),
      CASE WHEN r_ids IS NOT NULL AND array_length(r_ids, 1) > 0
        THEN r_ids[1 + CAST(random() * (array_length(r_ids, 1) - 1) AS INT)]
        ELSE NULL
      END,
      start_ts + CAST(random() * (end_ts - start_ts) AS INT),
      start_ts + CAST(random() * (end_ts - start_ts) AS INT) + CAST(random() * 3 + 1 AS INT),
      stat[1 + CAST(random() * 4 AS INT)],
      ROUND((random() * 15000 + 1000)::numeric, 2),
      ROUND((random() * 10000)::numeric, 2),
      CASE WHEN random() > 0.6 THEN 'paid' WHEN random() > 0.3 THEN 'partial' ELSE 'pending' END
    FROM generate_series(0, 499) AS j;

    IF (i + 1) % 5 = 0 THEN
      RAISE NOTICE 'Inserted % bookings...', (i + 1) * 500;
    END IF;
  END LOOP;
  RAISE NOTICE 'Done: 10,000 bookings';
END $$;

CREATE INDEX idx_bookings_room ON public.bookings(room_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_dates ON public.bookings(check_in, check_out);

-- ─── Re-enable triggers & foreign keys ─────────────────────────

SET session_replication_role = DEFAULT;

-- ─── Update table statistics ───────────────────────────────────

ANALYZE;

-- ─── Summary ───────────────────────────────────────────────────

SELECT 'menu_items' AS table_name, COUNT(*) AS row_count FROM menu_items
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL
SELECT 'invoice_items', COUNT(*) FROM invoice_items
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
ORDER BY table_name;

COMMIT;
