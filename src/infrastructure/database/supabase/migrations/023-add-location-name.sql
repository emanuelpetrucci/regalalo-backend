-- 023-add-location-name.sql — añade nombre de localidad a usuarios e items
-- Permite mostrar el lugar asociado al código postal además de la distancia en km.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_name TEXT;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS location_name TEXT;
