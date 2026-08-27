-- Phase 40 forward repair: PostgreSQL identifiers are limited to 63 bytes.
-- The original descriptive Phase 40 table name and activation RPC are therefore stored
-- under PostgreSQL-truncated identifiers. Keep the deployed authority intact and expose
-- explicit short, stable, service-role-only API names for application runtime use.

create or replace view public.avantiqo_rebased_policy_canary_activations
with (security_invoker = true)
as
select *
from public.avantiqo_intelligence_rebased_selection_policy_canary_activations;

create or replace view public.avantiqo_rebased_policy_canary_applications
with (security_invoker = true)
as
select *
from public.avantiqo_intelligence_rebased_selection_policy_canary_applications;

revoke all on table public.avantiqo_rebased_policy_canary_activations
  from public, anon, authenticated;
revoke all on table public.avantiqo_rebased_policy_canary_applications
  from public, anon, authenticated;
grant select on table public.avantiqo_rebased_policy_canary_activations to service_role;
grant select on table public.avantiqo_rebased_policy_canary_applications to service_role;

create or replace function public.activate_avantiqo_rebased_policy_canary_v1(
  p_organization_id uuid,
  p_release_candidate_fingerprint text,
  p_activator_fingerprint text,
  p_activation_reason text,
  p_expected_canary_influence_fraction numeric,
  p_expected_cycle_limit integer
)
returns public.avantiqo_intelligence_rebased_selection_policy_canary_activations
language sql
security invoker
set search_path = public
as $$
  select *
  from public.activate_avantiqo_intelligence_rebased_selection_policy_canary_v1(
    p_organization_id,
    p_release_candidate_fingerprint,
    p_activator_fingerprint,
    p_activation_reason,
    p_expected_canary_influence_fraction,
    p_expected_cycle_limit
  );
$$;

create or replace function public.apply_avantiqo_rebased_policy_canary_v1(
  p_organization_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.apply_avantiqo_intelligence_rebased_selection_policy_canary_v1(
    p_organization_id
  );
$$;

create or replace function public.close_avantiqo_rebased_policy_canary_v1(
  p_organization_id uuid,
  p_activation_fingerprint text,
  p_close_actor_fingerprint text,
  p_close_reason_code text,
  p_close_reason text
)
returns public.avantiqo_intelligence_rebased_selection_policy_canary_activations
language sql
security invoker
set search_path = public
as $$
  select *
  from public.close_avantiqo_intelligence_rebased_selection_policy_canary_v1(
    p_organization_id,
    p_activation_fingerprint,
    p_close_actor_fingerprint,
    p_close_reason_code,
    p_close_reason
  );
$$;

revoke all on function public.activate_avantiqo_rebased_policy_canary_v1(
  uuid, text, text, text, numeric, integer
) from public, anon, authenticated;
revoke all on function public.apply_avantiqo_rebased_policy_canary_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.close_avantiqo_rebased_policy_canary_v1(
  uuid, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.activate_avantiqo_rebased_policy_canary_v1(
  uuid, text, text, text, numeric, integer
) to service_role;
grant execute on function public.apply_avantiqo_rebased_policy_canary_v1(uuid)
  to service_role;
grant execute on function public.close_avantiqo_rebased_policy_canary_v1(
  uuid, text, text, text, text
) to service_role;
