-- ============================================================================
-- POS Complete Database Schema
-- Generated from codebase audit — July 12, 2026
--
-- All 28 tables with relationships, indexes, RLS, and seed data.
-- Compatible with InsForge (PostgreSQL).
-- ============================================================================

-- ─── Extensions ────────────────────────────────────────────────────────────
-- These are typically pre-enabled on InsForge.
-- If needed: npx @insforge/cli db query "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

-- ─── Helper: updated_at trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── Sequences for auto-generated numbers ──────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS public.booking_number_seq START 100;

-- ============================================================================
-- TABLE DEFINITIONS (in dependency order)
-- ============================================================================

-- ─── 1. Branches ──────────────────────────────────────────────────────────

CREATE TABLE public.branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  manager     TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. Restaurant Tables (Dining) ────────────────────────────────────────

CREATE TABLE public.restaurant_tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number    TEXT NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 4,
  section         TEXT NOT NULL DEFAULT 'Main',
  branch_id       UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  display_order   INTEGER NOT NULL DEFAULT 999,
  status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','occupied','reserved','cleaning','maintenance','disabled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tables_number_branch ON public.restaurant_tables(table_number, branch_id);
CREATE TRIGGER trg_restaurant_tables_updated_at
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. Menu Categories ───────────────────────────────────────────────────

CREATE TABLE public.menu_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'UtensilsCrossed',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_menu_categories_name ON public.menu_categories(name);
CREATE TRIGGER trg_menu_categories_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Menu Items ────────────────────────────────────────────────────────

CREATE TABLE public.menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price         DECIMAL(12,2) NOT NULL CHECK (price >= 0),
  category_id   UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
  prep_time     INTEGER CHECK (prep_time IS NULL OR prep_time >= 0),
  available     BOOLEAN NOT NULL DEFAULT true,
  image         TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
CREATE INDEX idx_menu_items_available ON public.menu_items(available);
CREATE INDEX idx_menu_items_tags ON public.menu_items USING GIN(tags);
CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5. Customers ─────────────────────────────────────────────────────────

CREATE TABLE public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  total_orders    INTEGER NOT NULL DEFAULT 0,
  total_spent     DECIMAL(14,2) NOT NULL DEFAULT 0,
  last_visit      TIMESTAMPTZ,
  loyalty_points  INTEGER NOT NULL DEFAULT 0,
  credit_balance  DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_name ON public.customers(name);
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 6. Room Types ────────────────────────────────────────────────────────

CREATE TABLE public.room_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  price_per_night DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (price_per_night >= 0),
  capacity        INTEGER NOT NULL DEFAULT 2,
  amenities       TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_room_types_name ON public.room_types(name);
CREATE TRIGGER trg_room_types_updated_at
  BEFORE UPDATE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 7. Rooms ─────────────────────────────────────────────────────────────

CREATE TABLE public.rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number     TEXT NOT NULL,
  room_type_id    UUID REFERENCES public.room_types(id) ON DELETE RESTRICT,
  floor           INTEGER NOT NULL DEFAULT 1,
  price_per_night DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (price_per_night >= 0),
  amenities       TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'vacant'
                    CHECK (status IN ('vacant','occupied','reserved','cleaning','maintenance','out_of_order','available','dirty')),
  branch_id       UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_rooms_number_branch ON public.rooms(room_number, branch_id);
CREATE INDEX idx_rooms_status ON public.rooms(status);
CREATE INDEX idx_rooms_floor ON public.rooms(floor);
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 8. Bookings (Reservations) ───────────────────────────────────────────

CREATE TABLE public.bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number    TEXT DEFAULT ('BK-' || nextval('public.booking_number_seq'::regclass)::TEXT),
  guest_name        TEXT NOT NULL,
  guest_email       TEXT NOT NULL DEFAULT '',
  guest_phone       TEXT NOT NULL DEFAULT '',
  room_id           UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL CHECK (check_out > check_in),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled')),
  total_amount      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount       DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_status    TEXT NOT NULL DEFAULT 'pending'
                      CHECK (payment_status IN ('pending','partial','paid','refunded')),
  payment_method    TEXT,
  special_requests  TEXT,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_room ON public.bookings(room_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_dates ON public.bookings(check_in, check_out);
CREATE INDEX idx_bookings_guest ON public.bookings(guest_name);
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 9. Order Batches ─────────────────────────────────────────────────────

CREATE TABLE public.order_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  room_id         UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  customer_name   TEXT,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','paid','cancelled')),
  is_locked       BOOLEAN NOT NULL DEFAULT false,
  subtotal        DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount        DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  paid_amount     DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_batches_table ON public.order_batches(table_id);
CREATE INDEX idx_order_batches_status ON public.order_batches(status);
CREATE INDEX idx_order_batches_customer ON public.order_batches(customer_id);
CREATE TRIGGER trg_order_batches_updated_at
  BEFORE UPDATE ON public.order_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 10. Order Batch Items ────────────────────────────────────────────────

CREATE TABLE public.order_batch_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL REFERENCES public.order_batches(id) ON DELETE CASCADE,
  menu_item_id  UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','credit','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_batch_items_batch ON public.order_batch_items(batch_id);
CREATE INDEX idx_order_batch_items_status ON public.order_batch_items(status);

-- ─── 11. Invoices ─────────────────────────────────────────────────────────

CREATE TABLE public.invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   TEXT NOT NULL DEFAULT ('INV-' || nextval('public.invoice_number_seq'::regclass)::TEXT),
  customer_id      UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL DEFAULT '',
  table_id         UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  booking_id       UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  order_batch_ids  UUID[] NOT NULL DEFAULT '{}',
  subtotal         DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax              DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  discount         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total            DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('paid','pending','overdue','partial','cancelled')),
  payment_method   TEXT,
  due_date         DATE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_created ON public.invoices(created_at);
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 12. Invoice Items ────────────────────────────────────────────────────

CREATE TABLE public.invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  menu_item_id  UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price   DECIMAL(14,2) NOT NULL CHECK (total_price >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- ─── 13. Payments ─────────────────────────────────────────────────────────

CREATE TABLE public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  batch_id        UUID REFERENCES public.order_batches(id) ON DELETE SET NULL,
  amount          DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL
                    CHECK (payment_method IN ('cash','fonepay','card','bank_transfer','credit','reception_qr')),
  reference       TEXT,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  notes           TEXT,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_method ON public.payments(payment_method);
CREATE INDEX idx_payments_created ON public.payments(created_at);
CREATE INDEX idx_payments_customer ON public.payments(customer_id);

-- ─── 14. Expenses ─────────────────────────────────────────────────────────

CREATE TABLE public.expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description     TEXT NOT NULL,
  category        TEXT NOT NULL
                    CHECK (category IN ('utilities','supplies','maintenance','staff','marketing','other')),
  amount          DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'cash'
                    CHECK (payment_method IN ('cash','fonepay','card','bank_transfer','credit')),
  recorded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  receipt_url     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date ON public.expenses(date);
CREATE INDEX idx_expenses_category ON public.expenses(category);

-- ─── 15. Cash Reconciliations ─────────────────────────────────────────────

CREATE TABLE public.cash_reconciliations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_balance   DECIMAL(14,2) NOT NULL DEFAULT 0,
  cash_received     DECIMAL(14,2) NOT NULL DEFAULT 0,
  cash_paid         DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_balance  DECIMAL(14,2) NOT NULL DEFAULT 0,
  actual_balance    DECIMAL(14,2) NOT NULL DEFAULT 0,
  variance          DECIMAL(14,2) NOT NULL DEFAULT 0,
  reconciled_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cash_recon_date ON public.cash_reconciliations(date);
CREATE TRIGGER trg_cash_reconciliations_updated_at
  BEFORE UPDATE ON public.cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 16. Suppliers (before inventory_items, which references it) ──────────

CREATE TABLE public.suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  contact             TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL DEFAULT '',
  total_orders        INTEGER NOT NULL DEFAULT 0,
  outstanding_balance DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (outstanding_balance >= 0),
  rating              DECIMAL(2,1) NOT NULL DEFAULT 4.0 CHECK (rating >= 0 AND rating <= 5),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_name ON public.suppliers(name);
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 17. Inventory Items ──────────────────────────────────────────────────

CREATE TABLE public.inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT '',
  current_stock   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  min_stock       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit            TEXT NOT NULL DEFAULT 'kg',
  cost_per_unit   DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  last_restocked  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_category ON public.inventory_items(category);
CREATE INDEX idx_inventory_supplier ON public.inventory_items(supplier_id);
CREATE INDEX idx_inventory_stock ON public.inventory_items(current_stock);
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 18. Stock Movements (History) ────────────────────────────────────────

CREATE TABLE public.stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('add','remove','create','update')),
  quantity        DECIMAL(12,2) NOT NULL,
  previous_stock  DECIMAL(12,2) NOT NULL,
  new_stock       DECIMAL(12,2) NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_item ON public.stock_movements(item_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at);

-- ─── 19. Purchase Orders ──────────────────────────────────────────────────

CREATE TABLE public.purchase_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number         TEXT,
  supplier_id       UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name     TEXT NOT NULL DEFAULT '',
  total_amount      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','ordered','received','cancelled')),
  order_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 20. Purchase Order Items ─────────────────────────────────────────────

CREATE TABLE public.purchase_order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  quantity    DECIMAL(12,2) NOT NULL CHECK (quantity > 0),
  unit_price  DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_items_po ON public.purchase_order_items(po_id);

-- ─── 21. Supplier Payments ────────────────────────────────────────────────

CREATE TABLE public.supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name   TEXT NOT NULL DEFAULT '',
  amount          DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL DEFAULT 'Bank Transfer',
  reference       TEXT NOT NULL DEFAULT '',
  notes           TEXT,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_payments_supplier ON public.supplier_payments(supplier_id);
CREATE INDEX idx_supplier_payments_date ON public.supplier_payments(payment_date);

-- ─── 22. Housekeeping Tasks ───────────────────────────────────────────────

CREATE TABLE public.housekeeping_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_number   TEXT NOT NULL,
  assigned_to   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','completed')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','medium','high','urgent')),
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hk_room ON public.housekeeping_tasks(room_id);
CREATE INDEX idx_hk_status ON public.housekeeping_tasks(status);
CREATE INDEX idx_hk_assigned ON public.housekeeping_tasks(assigned_to);
CREATE TRIGGER trg_housekeeping_tasks_updated_at
  BEFORE UPDATE ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 23. Maintenance Requests ─────────────────────────────────────────────

CREATE TABLE public.maintenance_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_number   TEXT NOT NULL,
  description   TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','resolved','closed')),
  reported_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maint_room ON public.maintenance_requests(room_id);
CREATE INDEX idx_maint_status ON public.maintenance_requests(status);
CREATE TRIGGER trg_maintenance_requests_updated_at
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 24. Notifications ────────────────────────────────────────────────────

CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL
                CHECK (type IN ('payment','inventory','reservation','system','order','maintenance')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  read        BOOLEAN NOT NULL DEFAULT false,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at);
CREATE INDEX idx_notifications_type ON public.notifications(type);

-- ─── 25. Activity Logs (Audit Trail) ──────────────────────────────────────

CREATE TABLE public.activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name     TEXT,
  activity_type TEXT NOT NULL,
  entity_id     TEXT,
  entity_label  TEXT,
  status        TEXT,
  location      TEXT,
  amount        DECIMAL(14,2) DEFAULT 0,
  details       TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_type ON public.activity_logs(activity_type);
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at);
CREATE INDEX idx_activity_logs_entity ON public.activity_logs(entity_id);

-- ─── 26. Print Settings ───────────────────────────────────────────────────

CREATE TABLE public.print_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL DEFAULT '',
  pan             TEXT NOT NULL DEFAULT '',
  paper_size      TEXT NOT NULL DEFAULT '80mm'
                    CHECK (paper_size IN ('58mm','80mm','A4')),
  show_logo       BOOLEAN NOT NULL DEFAULT true,
  auto_print      BOOLEAN NOT NULL DEFAULT false,
  print_copies    INTEGER NOT NULL DEFAULT 1 CHECK (print_copies >= 1 AND print_copies <= 10),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_print_settings_singleton ON public.print_settings((true));
CREATE TRIGGER trg_print_settings_updated_at
  BEFORE UPDATE ON public.print_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 27. Business Settings ────────────────────────────────────────────────

CREATE TABLE public.business_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name          TEXT NOT NULL DEFAULT 'My Business',
  address                TEXT NOT NULL DEFAULT '',
  phone                  TEXT NOT NULL DEFAULT '',
  email                  TEXT NOT NULL DEFAULT '',
  tax_id                 TEXT NOT NULL DEFAULT '',
  vat_rate               DECIMAL(5,2) NOT NULL DEFAULT 13.00 CHECK (vat_rate >= 0),
  service_charge         DECIMAL(5,2) NOT NULL DEFAULT 10.00 CHECK (service_charge >= 0),
  tax_inclusive          BOOLEAN NOT NULL DEFAULT false,
  apply_vat_room_service BOOLEAN NOT NULL DEFAULT true,
  apply_service_charge   TEXT NOT NULL DEFAULT 'dine-in only'
                           CHECK (apply_service_charge IN ('all','dine-in only','disabled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_business_settings_singleton ON public.business_settings((true));
CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 28. Feature Flags ────────────────────────────────────────────────────

CREATE TABLE public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_feature_flags_name ON public.feature_flags(name);
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- SEED DATA (insert BEFORE enabling RLS)
-- ============================================================================

INSERT INTO public.print_settings (phone, pan, paper_size, show_logo, auto_print, print_copies)
VALUES ('xxxxxxxxxx', 'xxxxxxxxx', '80mm', true, false, 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.business_settings (business_name, address, phone, email, tax_id, vat_rate, service_charge)
VALUES ('My Business', '', '', '', '', 13.00, 10.00)
ON CONFLICT DO NOTHING;

INSERT INTO public.menu_categories (name, icon, sort_order) VALUES
  ('Coffee & Tea', 'Coffee', 1),
  ('Beverages', 'Droplets', 2),
  ('Food', 'UtensilsCrossed', 3),
  ('Hookah', 'Sparkles', 4),
  ('Desserts', 'ChefHat', 5),
  ('Room Service', 'ConciergeBell', 6)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.room_types (name, description, price_per_night, capacity, amenities) VALUES
  ('Single', 'Single room with basic amenities', 2500, 1, ARRAY['WiFi', 'TV']),
  ('Double', 'Double room with basic amenities', 3500, 2, ARRAY['WiFi', 'TV']),
  ('Single with AC', 'Single room with air conditioning', 4000, 1, ARRAY['WiFi', 'TV', 'AC']),
  ('Double with AC', 'Double room with air conditioning', 5500, 2, ARRAY['WiFi', 'TV', 'AC', 'Mini Bar'])
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.feature_flags (name, description, enabled) VALUES
  ('multi_branch', 'Enable multi-branch support', false),
  ('room_service', 'Enable room service ordering', true),
  ('credit_accounts', 'Enable customer credit account management', true),
  -- ('auto_kitchen_print', 'Automatically print KOT when order is placed', true), -- removed (kitchen module eliminated)
  ('online_ordering', 'Enable online ordering', false)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- ─── All authenticated users can read all tables ───────────────────────────

CREATE POLICY "sel" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.restaurant_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.menu_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.room_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.print_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.business_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "sel" ON public.feature_flags FOR SELECT TO authenticated USING (true);

-- ─── Full CRUD for authenticated users on all operational tables ───────────

CREATE POLICY "all" ON public.branches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.restaurant_tables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.menu_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.room_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.order_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.order_batch_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.cash_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.supplier_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.housekeeping_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.maintenance_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all" ON public.feature_flags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- User-scoped notifications
CREATE POLICY "ns" ON public.notifications FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "ni" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "nu" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

-- Activity logs (append-only audit trail)
CREATE POLICY "ai" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "as" ON public.activity_logs FOR SELECT TO authenticated USING (true);

-- Settings (insert+update)
CREATE POLICY "si" ON public.print_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "su" ON public.print_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "si" ON public.business_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "su" ON public.business_settings FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- GRANTS (safe for non-superuser)
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
