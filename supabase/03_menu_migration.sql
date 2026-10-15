-- SushiPoke: migración incremental del menú existente.
-- Ejecutar una sola vez en Supabase Dashboard > SQL Editor.
-- No borra ni reemplaza los productos actuales.

ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'tempurizados';
ALTER TYPE public.product_category ADD VALUE IF NOT EXISTS 'ensaladas';

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS products_active_category_order_idx
    ON public.products (is_active, category, sort_order, name);

-- El menú público solo debe leer productos activos. Los administradores
-- autenticados conservan la posibilidad de consultar también los inactivos.
DROP POLICY IF EXISTS products_read ON public.products;
CREATE POLICY products_read
    ON public.products
    FOR SELECT
    TO anon, authenticated
    USING (is_active = TRUE);
