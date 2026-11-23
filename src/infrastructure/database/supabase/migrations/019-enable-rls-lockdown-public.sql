-- RLS deny-by-default for backend-only architecture (JWT custom, no Supabase Auth).
-- Enables RLS on public tables without policies for anon/authenticated → PostgREST cannot read/write app data.
-- Backend pool (postgres) and service_role bypass RLS; authorization remains in Express use-cases (BOLA).

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Supabase linter: migration tracking in public schema
ALTER TABLE IF EXISTS public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- PostGIS catalog (owner is extension superuser); skip if migration role is not owner
DO $$
BEGIN
  ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'spatial_ref_sys: RLS not enabled (requires table owner)';
END $$;
