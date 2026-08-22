-- Canonical platform scope is organization_id. These legacy tenant helpers are
-- no longer referenced by application code or RLS policies. Retire the public
-- SECURITY DEFINER entrypoints completely rather than preserving a second
-- authorization boundary.

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_tenant_access(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.get_my_tenant_id();
DROP FUNCTION public.has_tenant_access(uuid);
