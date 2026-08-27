-- AVANTIQO PHASE 44
-- Immutable persistent-policy activation interval closure provenance.
-- Phase 43 records every ACTIVE interval start. Phase 44 records every transition out
-- of ACTIVE without mutating the Phase 43 start ledger, yielding exact transactional
-- [activated_at, closed_at) boundaries for historical attribution.

create table if not exists public.avantiqo_intelligence_policy_activation_closures (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_CLOSURE_V1',
  organization_id uuid not null,
  policy_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policies(id) on delete restrict,
  policy_fingerprint text not null,
  activation_generation_index bigint not null,
  activation_generation_fingerprint text not null,
  activated_at timestamptz not null,
  closed_at timestamptz not null,
  terminal_policy_state text not null,
  closure_reason_code text not null,
  successor_policy_fingerprint text,
  rollback_actor_fingerprint text,
  closure_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint avantiqo_phase44_policy_fp_check
    check (policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase44_activation_fp_check
    check (activation_generation_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase44_closure_fp_check
    check (closure_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase44_generation_index_check
    check (activation_generation_index > 0),
  constraint avantiqo_phase44_interval_order_check
    check (closed_at >= activated_at),
  constraint avantiqo_phase44_terminal_state_check
    check (length(btrim(terminal_policy_state)) > 0 and terminal_policy_state <> 'ACTIVE'),
  constraint avantiqo_phase44_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint avantiqo_phase44_generation_fk
    foreign key (organization_id, activation_generation_fingerprint)
    references public.avantiqo_intelligence_policy_activation_generations
      (organization_id, activation_generation_fingerprint)
    on delete restrict,
  unique (organization_id, activation_generation_fingerprint),
  unique (organization_id, closure_fingerprint)
);

create index if not exists avantiqo_phase44_closure_policy_idx
  on public.avantiqo_intelligence_policy_activation_closures
  (organization_id, policy_id, activation_generation_index desc);

alter table public.avantiqo_intelligence_policy_activation_closures enable row level security;

revoke all on table public.avantiqo_intelligence_policy_activation_closures
  from public, anon, authenticated, service_role;
grant select, insert on table public.avantiqo_intelligence_policy_activation_closures
  to service_role;

-- Fail closed rather than pretending we know an exact historical close time that was
-- never observed. Current production has zero Phase 43 activation-generation rows, so
-- this is intentionally a zero-row compatibility assertion.
do $$
begin
  if exists (
    select 1
    from public.avantiqo_intelligence_policy_activation_generations g
    join public.avantiqo_intelligence_persistent_ordering_policies p
      on p.id = g.policy_id
    where not (
      p.state = 'ACTIVE'
      and lower(btrim(coalesce(p.metadata->>'phase43_activation_generation_fingerprint', '')))
        = g.activation_generation_fingerprint
    )
  ) then
    raise exception 'AVANTIQO_PHASE44_HISTORICAL_INTERVAL_CLOSE_RECONSTRUCTION_FORBIDDEN';
  end if;
end;
$$;

create or replace function public.avantiqo_phase44_append_activation_closure_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_generation public.avantiqo_intelligence_policy_activation_generations;
  v_generation_count integer;
  v_generation_fingerprint text;
  v_closed_at timestamptz;
  v_reason_code text;
  v_successor_fingerprint text;
  v_rollback_actor text;
  v_closure_fingerprint text;
begin
  if old.state = 'ACTIVE' and new.state <> 'ACTIVE' then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'avantiqo-policy-activation-generation-v1:' || new.organization_id::text,
        0
      )
    );

    v_generation_fingerprint := lower(
      btrim(coalesce(old.metadata->>'phase43_activation_generation_fingerprint', ''))
    );
    if v_generation_fingerprint !~ '^[a-f0-9]{32,128}$' then
      raise exception 'AVANTIQO_PHASE44_ACTIVE_GENERATION_FINGERPRINT_MISSING_FAIL_CLOSED';
    end if;

    select count(*)::integer into v_generation_count
    from public.avantiqo_intelligence_policy_activation_generations
    where organization_id = old.organization_id
      and activation_generation_fingerprint = v_generation_fingerprint;

    if v_generation_count <> 1 then
      raise exception 'AVANTIQO_PHASE44_ACTIVE_GENERATION_AMBIGUOUS_FAIL_CLOSED';
    end if;

    select * into v_generation
    from public.avantiqo_intelligence_policy_activation_generations
    where organization_id = old.organization_id
      and activation_generation_fingerprint = v_generation_fingerprint
    limit 1;

    if v_generation.policy_id <> old.id
      or v_generation.policy_fingerprint <> old.policy_fingerprint
      or v_generation.activation_generation_index
        <> (old.metadata->>'phase43_activation_generation_index')::bigint
      or v_generation.activated_at <> old.activated_at
    then
      raise exception 'AVANTIQO_PHASE44_ACTIVE_GENERATION_LINEAGE_MISMATCH_FAIL_CLOSED';
    end if;

    if exists (
      select 1
      from public.avantiqo_intelligence_policy_activation_closures c
      where c.organization_id = old.organization_id
        and c.activation_generation_fingerprint = v_generation_fingerprint
    ) then
      raise exception 'AVANTIQO_PHASE44_ACTIVE_GENERATION_ALREADY_CLOSED_FAIL_CLOSED';
    end if;

    v_closed_at := now();
    v_successor_fingerprint := nullif(
      lower(btrim(coalesce(new.metadata->>'phase41_successor_policy_fingerprint', ''))),
      ''
    );
    v_rollback_actor := nullif(lower(btrim(coalesce(new.rollback_actor_fingerprint, ''))), '');
    v_reason_code := case
      when new.state = 'SUPERSEDED'
        and coalesce((new.metadata->>'phase41_successor_activation_in_progress')::boolean, false) is true
        then 'SUPERSEDED_BY_GOVERNED_SUCCESSOR'
      when new.state = 'ROLLED_BACK' then 'POLICY_ROLLED_BACK'
      else 'ACTIVE_INTERVAL_CLOSED'
    end;

    if v_successor_fingerprint is not null
      and v_successor_fingerprint !~ '^[a-f0-9]{32,128}$'
    then
      raise exception 'AVANTIQO_PHASE44_SUCCESSOR_FINGERPRINT_INVALID_FAIL_CLOSED';
    end if;
    if v_rollback_actor is not null
      and v_rollback_actor !~ '^[a-f0-9]{32,128}$'
    then
      raise exception 'AVANTIQO_PHASE44_ROLLBACK_ACTOR_INVALID_FAIL_CLOSED';
    end if;

    v_closure_fingerprint := md5(
      'avantiqo-phase44-activation-closure-v1|' ||
      old.organization_id::text || '|' ||
      old.id::text || '|' ||
      old.policy_fingerprint || '|' ||
      v_generation.activation_generation_index::text || '|' ||
      v_generation_fingerprint || '|' ||
      v_generation.activated_at::text || '|' ||
      v_closed_at::text || '|' ||
      new.state || '|' ||
      v_reason_code || '|' ||
      coalesce(v_successor_fingerprint, '') || '|' ||
      coalesce(v_rollback_actor, '')
    );

    insert into public.avantiqo_intelligence_policy_activation_closures (
      organization_id,
      policy_id,
      policy_fingerprint,
      activation_generation_index,
      activation_generation_fingerprint,
      activated_at,
      closed_at,
      terminal_policy_state,
      closure_reason_code,
      successor_policy_fingerprint,
      rollback_actor_fingerprint,
      closure_fingerprint,
      metadata
    ) values (
      old.organization_id,
      old.id,
      old.policy_fingerprint,
      v_generation.activation_generation_index,
      v_generation_fingerprint,
      v_generation.activated_at,
      v_closed_at,
      new.state,
      v_reason_code,
      v_successor_fingerprint,
      v_rollback_actor,
      v_closure_fingerprint,
      jsonb_build_object(
        'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_CLOSURE_V1',
        'activation_generation_fingerprint', v_generation_fingerprint,
        'activation_generation_index', v_generation.activation_generation_index,
        'interval_semantics', '[activated_at,closed_at)',
        'transactional_close_boundary', true,
        'exact_observed_state_transition', true,
        'historical_close_time_reconstructed', false,
        'policy_generation_depth_distinct_from_activation_interval', true,
        'prior_interval_evidence_after_close_eligible', false,
        'cross_interval_evidence_attribution_allowed', false,
        'execution_authorized', false,
        'provider_execution_authorized', false,
        'spend_authorized', false,
        'platform_knowledge_written', false,
        'automatic_training_started', false,
        'automatic_model_weight_mutation', false
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_phase44_append_activation_closure_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase44_append_activation_closure_v1()
  to service_role;

drop trigger if exists avantiqo_phase44_append_activation_closure_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;
create trigger avantiqo_phase44_append_activation_closure_v1
after update of state on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_phase44_append_activation_closure_v1();

create or replace function public.avantiqo_phase44_reject_closure_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'AVANTIQO_PHASE44_ACTIVATION_CLOSURE_LEDGER_APPEND_ONLY';
end;
$$;

revoke all on function public.avantiqo_phase44_reject_closure_mutation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase44_reject_closure_mutation_v1()
  to service_role;

drop trigger if exists avantiqo_phase44_closure_append_only_v1
  on public.avantiqo_intelligence_policy_activation_closures;
create trigger avantiqo_phase44_closure_append_only_v1
before update or delete on public.avantiqo_intelligence_policy_activation_closures
for each row
execute function public.avantiqo_phase44_reject_closure_mutation_v1();

create or replace function public.verify_avantiqo_policy_activation_intervals_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_generation_count integer;
  v_closure_count integer;
  v_active_count integer;
  v_latest_generation_index bigint;
  v_latest_generation_fingerprint text;
  v_active_generation_fingerprint text;
  v_active_policy_id uuid;
  v_open_interval_count integer;
begin
  if p_organization_id is null then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'ORGANIZATION_ID_REQUIRED_FAIL_CLOSED',
      'historical_interval_attribution_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select count(*)::integer into v_generation_count
  from public.avantiqo_intelligence_policy_activation_generations
  where organization_id = p_organization_id;

  select count(*)::integer into v_closure_count
  from public.avantiqo_intelligence_policy_activation_closures
  where organization_id = p_organization_id;

  select count(*)::integer into v_active_count
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id and state = 'ACTIVE';

  if v_generation_count = 0 then
    if v_closure_count <> 0 or v_active_count <> 0 then
      return jsonb_build_object(
        'success', false,
        'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
        'status', 'ACTIVATION_INTERVAL_LEDGER_ORPHANED_FAIL_CLOSED',
        'historical_interval_attribution_allowed', false,
        'research_generation_allowed', false,
        'execution_request_generation_allowed', false
      );
    end if;

    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'NO_PERSISTENT_POLICY_ACTIVATION_INTERVALS',
      'persistent_policy_active', false,
      'activation_generation_count', 0,
      'closed_interval_count', 0,
      'open_interval_count', 0,
      'historical_interval_attribution_allowed', true,
      'research_generation_allowed', true,
      'execution_request_generation_allowed', true
    );
  end if;

  if v_active_count > 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'ACTIVE_POLICY_AMBIGUOUS_FAIL_CLOSED',
      'historical_interval_attribution_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select max(activation_generation_index) into v_latest_generation_index
  from public.avantiqo_intelligence_policy_activation_generations
  where organization_id = p_organization_id;

  if v_latest_generation_index <> v_generation_count
    or not exists (
      select 1
      from public.avantiqo_intelligence_policy_activation_generations
      where organization_id = p_organization_id
        and activation_generation_index = 1
    )
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'ACTIVATION_GENERATION_SEQUENCE_GAP_FAIL_CLOSED',
      'historical_interval_attribution_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select activation_generation_fingerprint into v_latest_generation_fingerprint
  from public.avantiqo_intelligence_policy_activation_generations
  where organization_id = p_organization_id
    and activation_generation_index = v_latest_generation_index
  limit 1;

  if v_active_count = 1 then
    select
      id,
      lower(btrim(coalesce(metadata->>'phase43_activation_generation_fingerprint', '')))
    into v_active_policy_id, v_active_generation_fingerprint
    from public.avantiqo_intelligence_persistent_ordering_policies
    where organization_id = p_organization_id and state = 'ACTIVE'
    limit 1;

    if v_active_generation_fingerprint !~ '^[a-f0-9]{32,128}$'
      or v_active_generation_fingerprint <> v_latest_generation_fingerprint
      or not exists (
        select 1
        from public.avantiqo_intelligence_policy_activation_generations g
        where g.organization_id = p_organization_id
          and g.activation_generation_fingerprint = v_active_generation_fingerprint
          and g.policy_id = v_active_policy_id
      )
    then
      return jsonb_build_object(
        'success', false,
        'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
        'status', 'OPEN_INTERVAL_NOT_LATEST_ACTIVE_GENERATION_FAIL_CLOSED',
        'historical_interval_attribution_allowed', false,
        'research_generation_allowed', false,
        'execution_request_generation_allowed', false
      );
    end if;
  else
    v_active_generation_fingerprint := null;
  end if;

  select count(*)::integer into v_open_interval_count
  from public.avantiqo_intelligence_policy_activation_generations g
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
    and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where g.organization_id = p_organization_id
    and c.id is null;

  if v_open_interval_count <> v_active_count
    or v_closure_count <> v_generation_count - v_active_count
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'ACTIVATION_INTERVAL_OPEN_CLOSE_CARDINALITY_FAIL_CLOSED',
      'historical_interval_attribution_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  if exists (
    select 1
    from public.avantiqo_intelligence_policy_activation_generations g
    left join public.avantiqo_intelligence_policy_activation_closures c
      on c.organization_id = g.organization_id
      and c.activation_generation_fingerprint = g.activation_generation_fingerprint
    where g.organization_id = p_organization_id
      and (
        (g.activation_generation_fingerprint = v_active_generation_fingerprint and c.id is not null)
        or (g.activation_generation_fingerprint is distinct from v_active_generation_fingerprint and c.id is null)
        or (c.id is not null and c.policy_id <> g.policy_id)
        or (c.id is not null and c.policy_fingerprint <> g.policy_fingerprint)
        or (c.id is not null and c.activation_generation_index <> g.activation_generation_index)
        or (c.id is not null and c.activated_at <> g.activated_at)
        or (c.id is not null and c.closed_at < g.activated_at)
        or (c.id is not null and c.terminal_policy_state = 'ACTIVE')
        or (c.id is not null and c.closure_fingerprint !~ '^[a-f0-9]{32,128}$')
      )
  ) then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'ACTIVATION_INTERVAL_LINEAGE_MISMATCH_FAIL_CLOSED',
      'historical_interval_attribution_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  if exists (
    select 1
    from public.avantiqo_intelligence_policy_activation_generations current_g
    join public.avantiqo_intelligence_policy_activation_generations next_g
      on next_g.organization_id = current_g.organization_id
      and next_g.activation_generation_index = current_g.activation_generation_index + 1
    join public.avantiqo_intelligence_policy_activation_closures current_c
      on current_c.organization_id = current_g.organization_id
      and current_c.activation_generation_fingerprint = current_g.activation_generation_fingerprint
    where current_g.organization_id = p_organization_id
      and current_c.closed_at > next_g.activated_at
  ) then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
      'status', 'ACTIVATION_INTERVAL_OVERLAP_FAIL_CLOSED',
      'historical_interval_attribution_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_V1',
    'status', case
      when v_active_count = 1 then 'ACTIVE_INTERVAL_HISTORY_VERIFIED'
      else 'CLOSED_INTERVAL_HISTORY_VERIFIED'
    end,
    'persistent_policy_active', v_active_count = 1,
    'activation_generation_count', v_generation_count,
    'closed_interval_count', v_closure_count,
    'open_interval_count', v_open_interval_count,
    'latest_activation_generation_index', v_latest_generation_index,
    'latest_activation_generation_fingerprint', v_latest_generation_fingerprint,
    'active_activation_generation_fingerprint', v_active_generation_fingerprint,
    'interval_semantics', '[activated_at,closed_at)',
    'historical_interval_attribution_allowed', true,
    'research_generation_allowed', true,
    'execution_request_generation_allowed', true
  );
end;
$$;

revoke all on function public.verify_avantiqo_policy_activation_intervals_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_avantiqo_policy_activation_intervals_v1(uuid)
  to service_role;
