CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_slug ON public.menu_categories (slug);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  options JSONB,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_menu_items_category_name UNIQUE (category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items (category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON public.menu_items (is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_active ON public.menu_items (is_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items (display_order);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON public.menu_categories;
CREATE POLICY "auth_all" ON public.menu_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select" ON public.menu_categories;
CREATE POLICY "auth_select" ON public.menu_categories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "auth_all" ON public.menu_items;
CREATE POLICY "auth_all" ON public.menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select" ON public.menu_items;
CREATE POLICY "auth_select" ON public.menu_items FOR SELECT TO anon USING (true);
