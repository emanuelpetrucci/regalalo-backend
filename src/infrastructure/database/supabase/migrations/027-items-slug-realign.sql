-- 027-items-slug-realign.sql
-- Alinea item_slug_base con src/domain/slug.ts (slugBase):
-- minúsculas, NFD, marcas combinantes fuera del bloque básico también se quitan,
-- lo que no sea [a-z0-9] pasa a '-', extremos recortados, máximo 60, vacío → 'item'.
-- Si la base es un UUID v4, se antepone 'item-' para que GET /items/:param no la
-- trate como id. No modifica 026. Solo reescribe filas cuyo slug no es la base
-- nueva ni base-<n>.

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
  cleaned := regexp_replace(
    cleaned,
    U&'[\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]',
    '',
    'g'
  );
  cleaned := regexp_replace(cleaned, '[^a-z0-9]+', '-', 'g');
  cleaned := regexp_replace(cleaned, '^-+|-+$', '', 'g');
  cleaned := left(cleaned, 60);
  cleaned := regexp_replace(cleaned, '-+$', '');
  IF cleaned = '' THEN
    cleaned := 'item';
  END IF;
  IF cleaned ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    cleaned := regexp_replace(left('item-' || cleaned, 60), '-+$', '');
    IF cleaned = '' THEN
      RETURN 'item';
    END IF;
  END IF;
  RETURN cleaned;
END;
$$;

CREATE TEMP TABLE slug_rekey (id uuid PRIMARY KEY);

INSERT INTO slug_rekey (id)
SELECT i.id
FROM items i
WHERE NOT (
  i.slug = item_slug_base(i.title)
  OR (
    i.slug LIKE item_slug_base(i.title) || '-%'
    AND substring(i.slug FROM char_length(item_slug_base(i.title)) + 2) ~ '^[0-9]+$'
  )
);

UPDATE items i
SET slug = 'rekey-' || i.id::text
FROM slug_rekey r
WHERE i.id = r.id;

DO $$
DECLARE
  rec record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR rec IN
    SELECT i.id, i.title
    FROM items i
    JOIN slug_rekey r ON r.id = i.id
    ORDER BY i.created_at, i.id
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

DROP TABLE slug_rekey;
