-- ============================================================================
-- MIGRATION: Menu System (v2)
-- ────────────────────────────────────────────────────────────────────────────
-- Replaces the old `menu_categories` and `menu_items` tables with a new
-- schema that includes slug, display_order, is_active, options (JSON),
-- image_url, and proper NUMERIC price.
-- ============================================================================

-- ─── Drop old tables (order matters because of FK) ─────────────────────────

DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.menu_categories CASCADE;

-- ─── 1. menu_categories ───────────────────────────────────────────────────

CREATE TABLE public.menu_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique slug for URL / lookup
CREATE UNIQUE INDEX idx_menu_categories_slug ON public.menu_categories (slug);

-- Index for ordering
CREATE INDEX idx_menu_categories_display_order ON public.menu_categories (display_order);

-- ─── 2. menu_items ────────────────────────────────────────────────────────

CREATE TABLE public.menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL,
  options       JSONB,
  image_url     TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate items within the same category
  CONSTRAINT uq_menu_items_category_name UNIQUE (category_id, name)
);

-- Indexes for common query patterns
CREATE INDEX idx_menu_items_category_id ON public.menu_items (category_id);
CREATE INDEX idx_menu_items_is_available ON public.menu_items (is_available);
CREATE INDEX idx_menu_items_is_active ON public.menu_items (is_active);
CREATE INDEX idx_menu_items_display_order ON public.menu_items (display_order);

-- ─── Trigger: auto-update updated_at ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_menu_categories_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.menu_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_select" ON public.menu_categories FOR SELECT TO anon USING (true);

CREATE POLICY "auth_all" ON public.menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_select" ON public.menu_items FOR SELECT TO anon USING (true);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- ─── 10 Menu Categories ────────────────────────────────────────────────────

INSERT INTO public.menu_categories (name, slug, display_order) VALUES
  ('Bakery & Desserts',        'bakery-desserts',        1),
  ('Beverages',                'beverages',              2),
  ('Cigarettes',               'cigarettes',             3),
  ('Espresso Based Coffee',    'espresso-based-coffee',  4),
  ('Hookah',                   'hookah',                 5),
  ('Iced & Speciality Coffee', 'iced-speciality-coffee', 6),
  ('Refreshers',               'refreshers',             7),
  ('Shakes & Lassi',           'shakes-lassi',           8),
  ('Soft Drinks, Water & Energy Drinks', 'soft-drinks-water-energy', 9),
  ('Tea & Coffee Alternatives', 'tea-coffee-alternatives', 10)
ON CONFLICT (slug) DO NOTHING;

-- ─── 49 Menu Items ─────────────────────────────────────────────────────────

-- Helper: reference categories by slug
WITH
  cat_bakery          AS (SELECT id FROM public.menu_categories WHERE slug = 'bakery-desserts' LIMIT 1),
  cat_beverages       AS (SELECT id FROM public.menu_categories WHERE slug = 'beverages' LIMIT 1),
  cat_cigarettes      AS (SELECT id FROM public.menu_categories WHERE slug = 'cigarettes' LIMIT 1),
  cat_espresso        AS (SELECT id FROM public.menu_categories WHERE slug = 'espresso-based-coffee' LIMIT 1),
  cat_hookah          AS (SELECT id FROM public.menu_categories WHERE slug = 'hookah' LIMIT 1),
  cat_iced            AS (SELECT id FROM public.menu_categories WHERE slug = 'iced-speciality-coffee' LIMIT 1),
  cat_refreshers      AS (SELECT id FROM public.menu_categories WHERE slug = 'refreshers' LIMIT 1),
  cat_shakes          AS (SELECT id FROM public.menu_categories WHERE slug = 'shakes-lassi' LIMIT 1),
  cat_soft_drinks     AS (SELECT id FROM public.menu_categories WHERE slug = 'soft-drinks-water-energy' LIMIT 1),
  cat_tea             AS (SELECT id FROM public.menu_categories WHERE slug = 'tea-coffee-alternatives' LIMIT 1)

INSERT INTO public.menu_items (category_id, name, description, price, options, display_order)
SELECT cat_bakery.id,     'Muffin',              'Freshly baked muffin',                  120, NULL, 1 FROM cat_bakery
UNION ALL
SELECT cat_bakery.id,     'Brownie',             'Chocolate brownie',                     150, NULL, 2 FROM cat_bakery
UNION ALL
SELECT cat_bakery.id,     'Cookie',              'Butter cookie',                          80, NULL, 3 FROM cat_bakery
UNION ALL
SELECT cat_bakery.id,     'Cake Slice',          'Slice of seasonal cake',                200, NULL, 4 FROM cat_bakery
UNION ALL
SELECT cat_bakery.id,     'Donut',               'Glazed donut',                          100, NULL, 5 FROM cat_bakery
UNION ALL
SELECT cat_bakery.id,     'Croissant',           'Butter croissant',                      150, NULL, 6 FROM cat_bakery
UNION ALL
SELECT cat_bakery.id,     'Baked Cheesecake',    'Creamy baked cheesecake',               280, NULL, 7 FROM cat_bakery
-----------------------
UNION ALL
SELECT cat_beverages.id,  'Hot Chocolate',       'Rich hot chocolate',                    180, NULL, 1 FROM cat_beverages
UNION ALL
SELECT cat_beverages.id,  'Milk Shake',          'Classic thick milkshake',               200, NULL, 2 FROM cat_beverages
UNION ALL
SELECT cat_beverages.id,  'Cold Coffee',         'Chilled coffee beverage',               200, NULL, 3 FROM cat_beverages
UNION ALL
SELECT cat_beverages.id,  'Fresh Juice',         'Freshly squeezed juice',                200, NULL, 4 FROM cat_beverages
-----------------------
UNION ALL
SELECT cat_cigarettes.id, 'Marlboro',            '',                                      20, NULL, 1 FROM cat_cigarettes
UNION ALL
SELECT cat_cigarettes.id, 'Gold Flake',          '',                                      20, NULL, 2 FROM cat_cigarettes
UNION ALL
SELECT cat_cigarettes.id, 'Pine',                '',                                      15, NULL, 3 FROM cat_cigarettes
UNION ALL
SELECT cat_cigarettes.id, 'Cigarette (Single)',  'Single cigarette',                      25, NULL, 4 FROM cat_cigarettes
-----------------------
UNION ALL
SELECT cat_espresso.id,   'Espresso Shot',       'Single shot of espresso',              120, NULL, 1 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Espresso Double Shot','Double shot of espresso',               180, NULL, 2 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Cappuccino',          'Espresso with steamed milk foam',       200, NULL, 3 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Latte',               'Espresso with steamed milk',            220, NULL, 4 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Cafe Mocha',          'Espresso with chocolate and milk',      250, NULL, 5 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Americano',           'Espresso with hot water',               180, NULL, 6 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Flat White',          'Espresso with microfoam milk',          250, NULL, 7 FROM cat_espresso
UNION ALL
SELECT cat_espresso.id,   'Cortado',             'Espresso cut with warm milk',           220, NULL, 8 FROM cat_espresso
-----------------------
UNION ALL
SELECT cat_hookah.id,     'Hookah – Regular',    '',                                     500, NULL, 1 FROM cat_hookah
UNION ALL
SELECT cat_hookah.id,     'Hookah – Premium',    '',                                     800, NULL, 2 FROM cat_hookah
-----------------------
UNION ALL
SELECT cat_iced.id,       'Iced Latte',          'Chilled latte over ice',               250, NULL, 1 FROM cat_iced
UNION ALL
SELECT cat_iced.id,       'Iced Mocha',          'Chilled mocha over ice',               280, NULL, 2 FROM cat_iced
UNION ALL
SELECT cat_iced.id,       'Iced Americano',      'Chilled americano over ice',           200, NULL, 3 FROM cat_iced
UNION ALL
SELECT cat_iced.id,       'Frappe',              'Blended iced coffee',                  300, NULL, 4 FROM cat_iced
UNION ALL
SELECT cat_iced.id,       'Cold Brew',           'Slow-steeped cold coffee',             280, NULL, 5 FROM cat_iced
UNION ALL
SELECT cat_iced.id,       'Iced Caramel Latte',  'Caramel flavoured iced latte',         300, NULL, 6 FROM cat_iced
-----------------------
UNION ALL
SELECT cat_refreshers.id, 'Mojito (Mango)',      'Mango flavoured mojito',               250, '{"flavours": ["Mango", "Blueberry", "Strawberry"]}', 1 FROM cat_refreshers
UNION ALL
SELECT cat_refreshers.id, 'Mojito (Blueberry)',  'Blueberry flavoured mojito',            250, '{"flavours": ["Mango", "Blueberry", "Strawberry"]}', 2 FROM cat_refreshers
UNION ALL
SELECT cat_refreshers.id, 'Mojito (Strawberry)', 'Strawberry flavoured mojito',           250, '{"flavours": ["Mango", "Blueberry", "Strawberry"]}', 3 FROM cat_refreshers
UNION ALL
SELECT cat_refreshers.id, 'Lemon Ice Tea',       'Refreshing lemon iced tea',             200, NULL, 4 FROM cat_refreshers
UNION ALL
SELECT cat_refreshers.id, 'Peach Ice Tea',       'Peach flavoured iced tea',              220, NULL, 5 FROM cat_refreshers
UNION ALL
SELECT cat_refreshers.id, 'Lemonade',            'Freshly squeezed lemonade',             180, NULL, 6 FROM cat_refreshers
-----------------------
UNION ALL
SELECT cat_shakes.id,     'Oreo Shake',          'Creamy oreo milkshake',                300, NULL, 1 FROM cat_shakes
UNION ALL
SELECT cat_shakes.id,     'Snickers Shake',      'Snickers flavoured milkshake',          320, NULL, 2 FROM cat_shakes
UNION ALL
SELECT cat_shakes.id,     'Kit Kat Shake',       'Kit Kat flavoured milkshake',           320, NULL, 3 FROM cat_shakes
UNION ALL
SELECT cat_shakes.id,     'Flavoured Lassi (Strawberry)', 'Strawberry lassi',             200, '{"flavours": ["Strawberry", "Blueberry", "Mango"]}', 4 FROM cat_shakes
UNION ALL
SELECT cat_shakes.id,     'Flavoured Lassi (Blueberry)',  'Blueberry lassi',              200, '{"flavours": ["Strawberry", "Blueberry", "Mango"]}', 5 FROM cat_shakes
UNION ALL
SELECT cat_shakes.id,     'Flavoured Lassi (Mango)',      'Mango lassi',                  200, '{"flavours": ["Strawberry", "Blueberry", "Mango"]}', 6 FROM cat_shakes
UNION ALL
SELECT cat_shakes.id,     'Smoothie',            'Fresh fruit smoothie',                  280, NULL, 7 FROM cat_shakes
-----------------------
UNION ALL
SELECT cat_soft_drinks.id,'Coke',                'Coca-Cola 330ml',                       80, NULL, 1 FROM cat_soft_drinks
UNION ALL
SELECT cat_soft_drinks.id,'Fanta',               'Fanta 330ml',                           80, NULL, 2 FROM cat_soft_drinks
UNION ALL
SELECT cat_soft_drinks.id,'Sprite',              'Sprite 330ml',                          80, NULL, 3 FROM cat_soft_drinks
UNION ALL
SELECT cat_soft_drinks.id,'Dew',                 'Mountain Dew 330ml',                    80, NULL, 4 FROM cat_soft_drinks
UNION ALL
SELECT cat_soft_drinks.id,'Mineral Water',       '1 litre bottled water',                 30, NULL, 5 FROM cat_soft_drinks
UNION ALL
SELECT cat_soft_drinks.id,'Energy Drink',        'Energy drink 250ml',                    150, NULL, 6 FROM cat_soft_drinks
-----------------------
UNION ALL
SELECT cat_tea.id,        'Masala Chai',         'Spiced Indian tea',                    100, NULL, 1 FROM cat_tea
UNION ALL
SELECT cat_tea.id,        'Green Tea',           'Japanese green tea',                   120, NULL, 2 FROM cat_tea
UNION ALL
SELECT cat_tea.id,        'Hot Lemon Honey',     'Lemon honey infusion',                 150, '{"serve": ["Hot", "Ice"]}', 3 FROM cat_tea
UNION ALL
SELECT cat_tea.id,        'Black Tea',           'Classic black tea',                     80, NULL, 4 FROM cat_tea
UNION ALL
SELECT cat_tea.id,        'Earl Grey',           'Bergamot flavoured black tea',          120, NULL, 5 FROM cat_tea
UNION ALL
SELECT cat_tea.id,        'Chamomile Tea',       'Herbal chamomile infusion',             120, NULL, 6 FROM cat_tea;

-- ============================================================================
-- VERIFY
-- ============================================================================

-- Should return 10
-- SELECT COUNT(*) AS category_count FROM public.menu_categories;

-- Should return 49
-- SELECT COUNT(*) AS item_count FROM public.menu_items;

-- Category item counts
-- SELECT mc.name, COUNT(mi.id) AS items
-- FROM public.menu_categories mc
-- LEFT JOIN public.menu_items mi ON mi.category_id = mc.id
-- GROUP BY mc.id, mc.name
-- ORDER BY mc.display_order;
