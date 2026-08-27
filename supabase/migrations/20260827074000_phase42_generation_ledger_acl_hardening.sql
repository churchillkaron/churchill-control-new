-- Phase 42 ACL hardening.
-- Supabase project defaults grant service_role broad table privileges on newly-created
-- public tables. The Phase 42 generation ledger is intentionally append-only, so make
-- its ACL match the contract in addition to the immutable UPDATE/DELETE trigger.

revoke all on table public.avantiqo_intelligence_persistent_policy_generations
  from service_role;
grant select, insert on table public.avantiqo_intelligence_persistent_policy_generations
  to service_role;
