-- 017-reputation-events-role.sql — MIGR-001 (RFC-RANK v1.0)

ALTER TABLE reputation_events
  ADD COLUMN IF NOT EXISTS role VARCHAR(8)
    CHECK (role IN ('donor', 'receiver'));

COMMENT ON COLUMN reputation_events.role IS
  'Rol del usuario en la sesión de entrega. NULL en filas anteriores a MIGR-001.
   donor = donante que confirmó la entrega.
   receiver = receptor (en delivery_completed) o receptor penalizado (en no_show).';
