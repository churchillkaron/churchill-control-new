-- Finance close-out: payment_transactions is a server-owned Finance table.
-- Requests are authorised through requireOrganizationAccess and Finance
-- permission checks before the service-role repository accesses this table.
-- Keep browser access closed rather than adding broad client policies.

DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
