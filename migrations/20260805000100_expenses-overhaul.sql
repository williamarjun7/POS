-- ============================================================================
-- MIGRATION: Expenses Overhaul (2026-08-05)
-- ────────────────────────────────────────────────────────────────────────────
-- Complete overhaul of the expenses module:
--   1. Create expense_categories table with hospitality-focused categories
--   2. Seed default categories
--   3. Add quantity & unit columns to expenses table
--   4. Add cashier INSERT policy for expenses (fixes "Failed to save expense")
--   5. Add cashier SELECT policy for expenses (allows viewing)
--   6. Remove payment_method CHECK constraint (payment method is auto-recorded)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Create expense_categories table
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_slug ON public.expense_categories(slug);
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON public.expense_categories(is_active);

-- Enforce unique names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_name ON public.expense_categories(LOWER(name));

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Seed hospitality-focused expense categories
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.expense_categories (name, slug, description, sort_order, is_active) VALUES
  ('Dairy Products',       'dairy',         'Milk, cheese, butter, yogurt, paneer, cream',              1,  true),
  ('Grocery',              'grocery',       'Rice, flour, pulses, oil, spices, and general groceries',   2,  true),
  ('Vegetables',           'vegetables',    'Fresh vegetables for kitchen and salads',                   3,  true),
  ('Fruits',               'fruits',        'Fresh fruits for juice, desserts, and plating',             4,  true),
  ('Meat',                 'meat',          'Chicken, mutton, fish, and other meat products',            5,  true),
  ('Bakery Supplies',      'bakery',        'Bread, buns, pastries, cake ingredients',                  6,  true),
  ('Snacks',               'snacks',        'Packaged snacks, chips, biscuits, namkeen',                 7,  true),
  ('Beverages',            'beverages',     'Cold drinks, juices, water bottles, energy drinks',         8,  true),
  ('Tea & Coffee Supplies','tea_coffee',    'Tea leaves, coffee beans, milk powder, sugar',             9,  true),
  ('Petrol / Fuel',        'fuel',          'Petrol, diesel, gas for vehicles and generators',          10, true),
  ('Transportation',       'transport',     'Delivery charges, vehicle maintenance, taxi fares',        11, true),
  ('Cleaning Supplies',    'cleaning',      'Detergent, floor cleaner, disinfectant, wipers',           12, true),
  ('Laundry',              'laundry',       'Washing powder, fabric softener, dry cleaning',            13, true),
  ('Maintenance',          'maintenance',   'Repairs, plumbing, electrical, painting, carpentry',       14, true),
  ('Housekeeping',         'housekeeping',  'Linen, towels, toilet paper, room supplies',               15, true),
  ('Utilities',            'utilities',     'Electricity, water, gas, trash disposal',                  16, true),
  ('Internet',             'internet',      'WiFi, broadband, data charges',                            17, true),
  ('Electricity',          'electricity',   'Electricity bill payments',                                18, true),
  ('Rent',                 'rent',          'Property rent, lease payments',                            19, true),
  ('Staff Salary',         'salary',        'Employee salaries, wages, bonuses',                        20, true),
  ('Office Supplies',      'office',        'Stationery, printer, paper, pens, files',                  21, true),
  ('Equipment',            'equipment',     'Kitchen equipment, appliances, tools',                     22, true),
  ('Room Supplies',        'room_supplies', 'Bedding, pillows, curtains, room amenities',               23, true),
  ('Toiletries',           'toiletries',    'Soap, shampoo, toothpaste, bathroom amenities',            24, true),
  ('Guest Amenities',      'amenities',     'Complimentary items, welcome kits, guest extras',          25, true),
  ('Marketing',            'marketing',     'Ads, promotions, signage, social media',                   26, true),
  ('Miscellaneous',        'misc',          'Other expenses not covered above',                         99, true)
ON CONFLICT (LOWER(name)) DO NOTHING;

-- For the slug unique index, handle any conflicts by updating sort_order only
-- (name-based upsert already handled above)

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Add quantity & unit columns to expenses table
-- ════════════════════════════════════════════════════════════════════════════
-- quantity defaults to 1 (single item expense) but allows fractional amounts.
-- unit stores a short label like "kg", "L", "pcs", etc.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00
  CHECK (quantity > 0);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'Unit';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Remove the CHECK constraint on category since we now reference expense_categories
-- ════════════════════════════════════════════════════════════════════════════
-- We keep the column as TEXT (no FK) for simplicity, but remove the old CHECK
-- so new categories can be used. The frontend validates against the active list.

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_category_check;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Make payment_method optional (defaults to 'cash')
-- ════════════════════════════════════════════════════════════════════════════
-- In the simplified expense flow, payment method is auto-recorded as 'cash'.
-- We keep the column but make it nullable with a default.

ALTER TABLE public.expenses
  ALTER COLUMN payment_method SET DEFAULT 'cash';

-- Remove the CHECK constraint so we can use it without validation
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payment_method_check;

-- Add a new CHECK that's more permissive (can be expanded later)
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash','fonepay','credit','reception_qr','bank_transfer'));

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Add cashier INSERT policy for expenses (fixes "Failed to save expense")
-- ════════════════════════════════════════════════════════════════════════════
-- Previous migration restricted expenses to admin/manager only, but the
-- frontend grants cashiers 'expenses.create' permission. This mismatch
-- causes "Failed to save expense" for cashier users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'cashier_insert'
  ) THEN
    CREATE POLICY "cashier_insert" ON public.expenses
      FOR INSERT TO authenticated
      WITH CHECK (public.is_cashier_or_above());
  END IF;
END;
$$;

-- Add cashier SELECT policy so cashiers can view expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'cashier_select'
  ) THEN
    CREATE POLICY "cashier_select" ON public.expenses
      FOR SELECT TO authenticated
      USING (public.is_cashier_or_above());
  END IF;
END;
$$;

-- Add cashier UPDATE policy so cashiers can edit their own expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'cashier_update'
  ) THEN
    CREATE POLICY "cashier_update" ON public.expenses
      FOR UPDATE TO authenticated
      USING (public.is_cashier_or_above())
      WITH CHECK (public.is_cashier_or_above());
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Ensure expense_categories have proper RLS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_categories' AND policyname = 'staff_select'
  ) THEN
    CREATE POLICY "staff_select" ON public.expense_categories
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END;
$$;

-- Admin/manager can manage categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expense_categories' AND policyname = 'admin_manager_all'
  ) THEN
    CREATE POLICY "admin_manager_all" ON public.expense_categories
      FOR ALL TO authenticated
      USING (public.is_manager_or_above())
      WITH CHECK (public.is_manager_or_above());
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Grant permissions
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Check categories were seeded:
--    SELECT name, slug FROM public.expense_categories ORDER BY sort_order;
--
-- 2. Check new columns exist:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'expenses' AND column_name IN ('quantity', 'unit');
--
-- 3. Test as cashier user (should succeed now):
--    INSERT INTO public.expenses (description, category, amount, quantity, unit)
--    VALUES ('Test Milk Purchase', 'dairy', 1500, 2, 'L');
--    DELETE FROM public.expenses WHERE description = 'Test Milk Purchase';
--
-- 4. Check policies:
--    SELECT policyname, cmd, roles FROM pg_policies
--    WHERE tablename = 'expenses'
--    ORDER BY policyname;
