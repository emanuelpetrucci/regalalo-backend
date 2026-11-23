-- 026-items-slug.sql
-- Slug único y estable por ítem. La base replica src/domain/slug.ts (slugBase):
-- minúsculas, NFD sin marcas, lo que no sea [a-z0-9] pasa a '-', extremos
-- recortados, máximo 60 caracteres sin guion final. Vacío → 'item'.
-- El más antiguo (created_at, id) se queda la base; el siguiente es base-2.

CREATE OR REPLACE FUNCTION item_slug_base(raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cleaned text;
BEGIN
  cleaned := lower(COALESCE(raw, ''));
  cleaned := normalize(cleaned, NFD);
  cleaned := regexp_replace(cleaned, U&'[\0300-\036F]', '', 'g');
  cleaned := regexp_replace(cleaned, '[^a-z0-9]+', '-', 'g');
  cleaned := regexp_replace(cleaned, '^-+|-+$', '', 'g');
  cleaned := left(cleaned, 60);
  cleaned := regexp_replace(cleaned, '-+$', '');
  IF cleaned = '' THEN
    RETURN 'item';
  END IF;
  RETURN cleaned;
END;
$$;

ALTER TABLE items ADD COLUMN slug varchar(100);

DO $$
DECLARE
  rec record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR rec IN
    SELECT id, title
    FROM items
    ORDER BY created_at, id
  LOOP
    base := item_slug_base(rec.title);
    candidate := base;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM items WHERE slug = candidate) LOOP
      candidate := base || '-' || suffix::text;
      suffix := suffix + 1;
    END LOOP;
    UPDATE items SET slug = candidate WHERE id = rec.id;
  END LOOP;
END
$$;

ALTER TABLE items ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX idx_items_slug ON items (slug);
