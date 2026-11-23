CREATE TABLE IF NOT EXISTS item_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES items(id),
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage_deletion_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION fn_queue_storage_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO storage_deletion_queue (storage_path)
  VALUES (OLD.storage_path);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_queue_storage_deletion
AFTER DELETE ON item_images
FOR EACH ROW EXECUTE FUNCTION fn_queue_storage_deletion();

CREATE INDEX IF NOT EXISTS idx_item_images_item ON item_images(item_id);
CREATE INDEX IF NOT EXISTS idx_storage_deletion_queue_pending
  ON storage_deletion_queue(created_at)
  WHERE processed_at IS NULL;
