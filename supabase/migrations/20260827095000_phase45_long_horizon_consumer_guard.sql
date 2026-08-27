-- AVANTIQO PHASE 45 LONG-HORIZON CONSUMER GUARD
-- Any Phase29 mutation derived from long-horizon outcome profiles is refused unless
-- the complete Phase45 outcome-attribution ledger is currently integral.

create or replace function public.avantiqo_phase45_guard_long_horizon_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_integrity jsonb;
begin
  if coalesce(new.metadata->>'phase29_contract', '')
    <> 'AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_V1'
  then
    return new;
  end if;

  v_integrity := public.verify_avantiqo_policy_outcome_attribution_v1(new.organization_id);
  if coalesce((v_integrity->>'success')::boolean, false) is not true
    or coalesce((v_integrity->>'historical_outcome_use_allowed')::boolean, false) is not true
    or coalesce((v_integrity->>'research_generation_allowed')::boolean, false) is not true
  then
    raise exception 'AVANTIQO_PHASE45_LONG_HORIZON_MUTATION_BLOCKED_BY_OUTCOME_ATTRIBUTION_INTEGRITY';
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_phase45_guard_long_horizon_mutation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_guard_long_horizon_mutation_v1()
  to service_role;

drop trigger if exists avantiqo_phase45_guard_long_horizon_mutation_v1
  on public.intelligence_memories;
create trigger avantiqo_phase45_guard_long_horizon_mutation_v1
before insert or update of metadata on public.intelligence_memories
for each row
execute function public.avantiqo_phase45_guard_long_horizon_mutation_v1();
