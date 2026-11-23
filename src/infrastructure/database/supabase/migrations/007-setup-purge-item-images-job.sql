-- Job pg_cron: purgar imágenes de objetos completados/cancelados (corre a las 03:00 UTC diario)
-- El trigger trg_queue_storage_deletion (migración 004) encola automáticamente los storage_path
-- en storage_deletion_queue cuando se eliminan registros de item_images.
DO $$
BEGIN
  PERFORM cron.unschedule('purge-item-images');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;
SELECT cron.schedule(
  'purge-item-images',
  '0 3 * * *',
  $$
    DELETE FROM item_images
    WHERE item_id IN (
      SELECT id FROM items
      WHERE status IN ('completed', 'cancelled')
        AND completed_at < NOW() - INTERVAL '30 days'
    );
  $$
);
