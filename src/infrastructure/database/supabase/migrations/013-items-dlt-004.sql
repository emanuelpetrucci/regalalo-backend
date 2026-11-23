-- 013-items-dlt-004.sql — DLT-004: columnas analíticas en items

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS weight_range TEXT;

UPDATE items
SET
  category     = COALESCE(category, 'other'),
  weight_range = COALESCE(weight_range, 'lt1')
WHERE category IS NULL OR weight_range IS NULL;

ALTER TABLE items
  ALTER COLUMN category     SET NOT NULL,
  ALTER COLUMN weight_range SET NOT NULL;

ALTER TABLE items
  ADD CONSTRAINT chk_items_category
    CHECK (category IN (
      'furniture','electronics','clothing','books',
      'toys','kitchen','sports','tools','other'
    ));

ALTER TABLE items
  ADD CONSTRAINT chk_items_weight_range
    CHECK (weight_range IN ('lt1','1to5','5to20','gt20'));
