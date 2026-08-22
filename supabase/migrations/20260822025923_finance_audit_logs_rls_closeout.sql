-- Finance close-out: audit_logs is read through the authenticated Finance
-- audit-trail service. Keep direct browser access closed; the server performs
-- organisation access and Finance permission checks before service-role reads.

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
