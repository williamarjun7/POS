-- ============================================================================
-- POS Menu Seed Data
-- ============================================================================
-- Populates menu_categories (10) and menu_items (55) with the exact
-- names and prices specified for the POS system.
--
-- Safe to run multiple times — uses UPSERT (ON CONFLICT) throughout.
--
-- NOTE: If running via `npx insforge db query`, the SQL must be passed as
-- a single command-line argument. If the input is too long, split into
-- smaller queries or use a migration file.
-- ============================================================================

-- ─── 10 Menu Categories ────────────────────────────────────────────────────

INSERT INTO public.menu_categories (name, slug, display_order, is_active) VALUES
  ('Bakery & Desserts',        'bakery-desserts',        1,  true),
  ('Beverages',                'beverages',              2,  true),
  ('Cigarettes',               'cigarettes',             3,  true),
  ('Espresso Based Coffee',    'espresso-based-coffee',  4,  true),
  ('Hookah',                   'hookah',                 5,  true),
  ('Iced & Speciality Coffee', 'iced-speciality-coffee', 6,  true),
  ('Refreshers',               'refreshers',             7,  true),
  ('Shakes & Lassi',           'shakes-lassi',           8,  true),
  ('Soft Drinks, Water & Energy Drinks', 'soft-drinks-water-energy', 9,  true),
  ('Tea & Coffee Alternatives', 'tea-coffee-alternatives', 10, true)
ON CONFLICT (slug) DO NOTHING;

-- ─── 55 Menu Items ─────────────────────────────────────────────────────────

WITH
  cat_bakery    AS (SELECT id FROM public.menu_categories WHERE slug = 'bakery-desserts'        LIMIT 1),
  cat_beverages AS (SELECT id FROM public.menu_categories WHERE slug = 'beverages'               LIMIT 1),
  cat_cigs      AS (SELECT id FROM public.menu_categories WHERE slug = 'cigarettes'              LIMIT 1),
  cat_espresso  AS (SELECT id FROM public.menu_categories WHERE slug = 'espresso-based-coffee'   LIMIT 1),
  cat_hookah    AS (SELECT id FROM public.menu_categories WHERE slug = 'hookah'                  LIMIT 1),
  cat_iced      AS (SELECT id FROM public.menu_categories WHERE slug = 'iced-speciality-coffee'  LIMIT 1),
  cat_refresh   AS (SELECT id FROM public.menu_categories WHERE slug = 'refreshers'              LIMIT 1),
  cat_shakes    AS (SELECT id FROM public.menu_categories WHERE slug = 'shakes-lassi'            LIMIT 1),
  cat_sodas     AS (SELECT id FROM public.menu_categories WHERE slug = 'soft-drinks-water-energy' LIMIT 1),
  cat_tea       AS (SELECT id FROM public.menu_categories WHERE slug = 'tea-coffee-alternatives'  LIMIT 1)

INSERT INTO public.menu_items (category_id, name, description, price, options, display_order, is_available, is_active)

-- ▸ Bakery & Desserts (6 items)
SELECT cat_bakery.id, 'Black Forest',     'Rich chocolate cake with cream filling',      100, NULL::jsonb, 1, true, true FROM cat_bakery UNION ALL
SELECT cat_bakery.id, 'Chocolate Muffin', 'Moist chocolate muffin',                       60, NULL::jsonb, 2, true, true FROM cat_bakery UNION ALL
SELECT cat_bakery.id, 'Cookies',          'Freshly baked butter cookies',                 10, NULL::jsonb, 3, true, true FROM cat_bakery UNION ALL
SELECT cat_bakery.id, 'Doughnuts',        'Soft glazed doughnuts',                        75, NULL::jsonb, 4, true, true FROM cat_bakery UNION ALL
SELECT cat_bakery.id, 'Vanilla Muffin',   'Light vanilla muffin',                         60, NULL::jsonb, 5, true, true FROM cat_bakery UNION ALL
SELECT cat_bakery.id, 'White Forest',     'White chocolate and cream layered cake',      115, NULL::jsonb, 6, true, true FROM cat_bakery UNION ALL

-- ▸ Beverages (1 item)
SELECT cat_beverages.id, 'Gorkha Strong', 'Strong alcoholic beverage',                   240, NULL::jsonb, 1, true, true FROM cat_beverages UNION ALL

-- ▸ Cigarettes (4 items)
SELECT cat_cigs.id, 'Fusion',      'Fusion brand cigarette',               30, NULL::jsonb, 1, true, true FROM cat_cigs UNION ALL
SELECT cat_cigs.id, 'Shikhar Ice', 'Shikhar Ice brand cigarette',          25, NULL::jsonb, 2, true, true FROM cat_cigs UNION ALL
SELECT cat_cigs.id, 'Surya Light', 'Surya Light brand cigarette',          30, NULL::jsonb, 3, true, true FROM cat_cigs UNION ALL
SELECT cat_cigs.id, 'Surya Red',   'Surya Red brand cigarette',            30, NULL::jsonb, 4, true, true FROM cat_cigs UNION ALL

-- ▸ Espresso Based Coffee (9 items)
SELECT cat_espresso.id, 'Espresso',         'Single shot of espresso',                   90, NULL::jsonb,  1, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Americano Single', 'Single shot americano with hot water',     110, NULL::jsonb,  2, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Ristretto',        'Short ristretto shot',                     120, NULL::jsonb,  3, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Doppio',           'Double espresso shot',                     120, NULL::jsonb,  4, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Americano Double', 'Double shot americano with hot water',     130, NULL::jsonb,  5, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Lungo',            'Long pull espresso',                       130, NULL::jsonb,  6, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Cappuccino',       'Espresso with steamed milk foam',          160, NULL::jsonb,  7, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Flat White',       'Espresso with silky microfoam milk',       220, NULL::jsonb,  8, true, true FROM cat_espresso UNION ALL
SELECT cat_espresso.id, 'Espresso Affogato','Espresso poured over vanilla ice cream',   240, NULL::jsonb,  9, true, true FROM cat_espresso UNION ALL

-- ▸ Hookah (3 items)
SELECT cat_hookah.id, 'Coal',        'Hookah coal replacement',         50, NULL::jsonb, 1, true, true FROM cat_hookah UNION ALL
SELECT cat_hookah.id, 'Hookah',      'Standard hookah session',       400, NULL::jsonb, 2, true, true FROM cat_hookah UNION ALL
SELECT cat_hookah.id, 'Cloud Hookah', 'Premium cloud hookah session', 600, NULL::jsonb, 3, true, true FROM cat_hookah UNION ALL

-- ▸ Iced & Speciality Coffee (8 items)
SELECT cat_iced.id, 'Iced Lungo',       'Long pull espresso served over ice',          140, NULL::jsonb, 1, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'Iced Americano',   'Americano poured over ice',                   180, NULL::jsonb, 2, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'Iced Cappuccino',  'Cappuccino served cold over ice',             190, NULL::jsonb, 3, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'AeroCano',         'Aeropress brewed coffee',                     200, NULL::jsonb, 4, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'Cold Coffee',      'Blended cold coffee beverage',                200, NULL::jsonb, 5, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'Espresso Freddo',  'Chilled espresso shaken with ice',            200, NULL::jsonb, 6, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'Iced Mocha',       'Chilled mocha with chocolate over ice',       200, NULL::jsonb, 7, true, true FROM cat_iced UNION ALL
SELECT cat_iced.id, 'Iced Latte',       'Chilled latte served over ice',               220, NULL::jsonb, 8, true, true FROM cat_iced UNION ALL

-- ▸ Refreshers (5 items)
SELECT cat_refresh.id, 'NimbuPani',       'Traditional salted lemonade',              40, NULL::jsonb,                                               1, true, true FROM cat_refresh UNION ALL
SELECT cat_refresh.id, 'Lemonade',        'Freshly squeezed lemonade',               160, NULL::jsonb,                                               2, true, true FROM cat_refresh UNION ALL
SELECT cat_refresh.id, 'Mint Lemonade',   'Lemonade with fresh mint',                160, NULL::jsonb,                                               3, true, true FROM cat_refresh UNION ALL
SELECT cat_refresh.id, 'Mojito',          'Classic mojito cocktail',                 220, '{"flavours":["Mango","Blueberry","Strawberry"]}'::jsonb,   4, true, true FROM cat_refresh UNION ALL
SELECT cat_refresh.id, 'Watermelon Mojito','Refreshing watermelon mojito',           250, NULL::jsonb,                                               5, true, true FROM cat_refresh UNION ALL

-- ▸ Shakes & Lassi (7 items)
SELECT cat_shakes.id, 'Plain Lassi',        'Traditional yoghurt drink',               120, NULL::jsonb,                                                  1, true, true FROM cat_shakes UNION ALL
SELECT cat_shakes.id, 'Sweet Lassi',        'Sweetened yoghurt drink',                 140, NULL::jsonb,                                                  2, true, true FROM cat_shakes UNION ALL
SELECT cat_shakes.id, 'Badam Shake',        'Almond flavoured milk shake',             150, NULL::jsonb,                                                  3, true, true FROM cat_shakes UNION ALL
SELECT cat_shakes.id, 'Flavored Lassi',     'Yoghurt drink with fruit flavours',       180, '{"flavours":["Mango","Strawberry","Blueberry"]}'::jsonb,      4, true, true FROM cat_shakes UNION ALL
SELECT cat_shakes.id, 'Chocolate Milkshake','Rich chocolate milkshake',                220, NULL::jsonb,                                                  5, true, true FROM cat_shakes UNION ALL
SELECT cat_shakes.id, 'Oreo Milkshake',     'Creamy Oreo cookie milkshake',            220, NULL::jsonb,                                                  6, true, true FROM cat_shakes UNION ALL
SELECT cat_shakes.id, 'Vanilla Milkshake',  'Classic vanilla milkshake',               220, NULL::jsonb,                                                  7, true, true FROM cat_shakes UNION ALL

-- ▸ Soft Drinks, Water & Energy Drinks (7 items)
SELECT cat_sodas.id, 'Mineral Water',   'Bottled mineral water',              30, NULL::jsonb, 1, true, true FROM cat_sodas UNION ALL
SELECT cat_sodas.id, 'Coke',            'Coca-Cola 330ml can',                70, NULL::jsonb, 2, true, true FROM cat_sodas UNION ALL
SELECT cat_sodas.id, 'Mountain Dew',    'Mountain Dew 330ml can',             70, NULL::jsonb, 3, true, true FROM cat_sodas UNION ALL
SELECT cat_sodas.id, 'Sprite',          'Sprite 330ml can',                   70, NULL::jsonb, 4, true, true FROM cat_sodas UNION ALL
SELECT cat_sodas.id, 'Red Bull (Small)','Red Bull energy drink 250ml',       140, NULL::jsonb, 5, true, true FROM cat_sodas UNION ALL
SELECT cat_sodas.id, 'Red Bull',        'Red Bull energy drink 355ml',        180, NULL::jsonb, 6, true, true FROM cat_sodas UNION ALL
SELECT cat_sodas.id, 'Xtreme',          'Xtreme energy drink',                180, NULL::jsonb, 7, true, true FROM cat_sodas UNION ALL

-- ▸ Tea & Coffee Alternatives (5 items)
SELECT cat_tea.id, 'Green Tea',        'Japanese green tea',                    80, NULL::jsonb,                             1, true, true FROM cat_tea UNION ALL
SELECT cat_tea.id, 'Ginger Honey Lime','Warming ginger honey lime beverage',  150, NULL::jsonb,                             2, true, true FROM cat_tea UNION ALL
SELECT cat_tea.id, 'Peach Iced Tea',   'Peach flavoured iced tea',            150, NULL::jsonb,                             3, true, true FROM cat_tea UNION ALL
SELECT cat_tea.id, 'Hot Lemon Honey',  'Lemon and honey hot beverage',        160, '{"serve":["Hot","Ice"]}'::jsonb,         4, true, true FROM cat_tea UNION ALL
SELECT cat_tea.id, 'Iced Honey Lime',  'Chilled honey lime refreshment',      160, NULL::jsonb,                             5, true, true FROM cat_tea

-- UPSERT: update existing items if names match within the same category
ON CONFLICT (category_id, name) DO UPDATE SET
  price        = EXCLUDED.price,
  description  = EXCLUDED.description,
  options      = EXCLUDED.options,
  display_order = EXCLUDED.display_order,
  is_available  = EXCLUDED.is_available,
  is_active     = EXCLUDED.is_active;

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify)
-- ============================================================================

-- SELECT COUNT(*) AS category_count FROM public.menu_categories;
-- SELECT COUNT(*) AS item_count FROM public.menu_items;
--
-- SELECT mc.name AS category, COUNT(mi.id) AS items
-- FROM public.menu_categories mc
-- LEFT JOIN public.menu_items mi ON mi.category_id = mc.id
-- GROUP BY mc.id, mc.name
-- ORDER BY mc.display_order;
--
-- SELECT mi.name, mi.price, mc.name AS category
-- FROM public.menu_items mi
-- JOIN public.menu_categories mc ON mc.id = mi.category_id
-- ORDER BY mc.display_order, mi.display_order;
