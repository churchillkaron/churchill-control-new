-- Phase 37: make Phase 32 canary activation and Phase 35 persistent-policy
-- activation mutually exclusive under the same transaction advisory lock.
-- This prevents concurrent policy stacking in either direction.

create or replace function public.avantiqo_enforce_selection_policy_epoch_isolation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id is null then
    return new;
  end if;

  if new.active is true
    and new.memory_scope = 'platform_learning_experiment_selection_policy_canary_activations'
    and new.metadata->>'contract' = 'AVANTIQO_SELECTION_POLICY_CANARY_V1'
    and new.metadata->>'status' = 'EXPLICIT_BOUNDED_POLICY_CANARY_ACTIVATION_RECORDED'
  then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'avantiqo_persistent_ordering_policy_v1:' || new.organization_id::text,
        0
      )
    );

    if exists (
      select 1
      from public.avantiqo_intelligence_persistent_ordering_policies policy
      where policy.organization_id = new.organization_id
        and policy.state = 'ACTIVE'
    ) then
      raise exception 'AVANTIQO_PHASE37_ACTIVE_PERSISTENT_POLICY_BLOCKS_PHASE32_CANARY';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists avantiqo_selection_policy_epoch_isolation_v1
  on public.intelligence_memories;

create trigger avantiqo_selection_policy_epoch_isolation_v1
before insert or update of organization_id, memory_scope, active, metadata
on public.intelligence_memories
for each row
execute function public.avantiqo_enforce_selection_policy_epoch_isolation_v1();

revoke all on function public.avantiqo_enforce_selection_policy_epoch_isolation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_enforce_selection_policy_epoch_isolation_v1()
  to service_role;
