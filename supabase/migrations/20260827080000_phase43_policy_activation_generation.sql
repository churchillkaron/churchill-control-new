-- AVANTIQO PHASE 43
-- Persistent-policy active-interval generation lineage.
-- Separates Phase 42 policy-generation depth from each distinct ACTIVE interval.

create table if not exists public.avantiqo_intelligence_policy_activation_generations (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1',
  organization_id uuid not null,
  policy_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policies(id) on delete restrict,
  policy_fingerprint text not null,
  activation_generation_index bigint not null,
  activation_generation_fingerprint text not null,
  activation_reason text not null,
  previous_policy_state text,
  activator_fingerprint text,
  phase42_policy_generation_index integer,
  phase42_scoring_state_fingerprint text,
  activated_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint avantiqo_phase43_policy_fp_check
    check (policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase43_activation_fp_check
    check (activation_generation_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase43_generation_index_check
    check (activation_generation_index > 0),
  constraint avantiqo_phase43_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  unique (organization_id, activation_generation_index),
  unique (organization_id, activation_generation_fingerprint)
);

create index if not exists avantiqo_phase43_activation_policy_idx
  on public.avantiqo_intelligence_policy_activation_generations
  (organization_id, policy_id, activation_generation_index desc);

alter table public.avantiqo_intelligence_policy_activation_generations enable row level security;

revoke all on table public.avantiqo_intelligence_policy_activation_generations
  from public, anon, authenticated, service_role;
grant select, insert on table public.avantiqo_intelligence_policy_activation_generations
  to service_role;

create or replace function public.avantiqo_phase43_prepare_active_generation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_index bigint;
  v_at timestamptz;
  v_reason text;
  v_previous_state text;
  v_fingerprint text;
begin
  if new.state = 'ACTIVE'
    and (tg_op = 'INSERT' or old.state is distinct from 'ACTIVE')
  then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'avantiqo-policy-activation-generation-v1:' || new.organization_id::text,
        0
      )
    );

    select coalesce(max(g.activation_generation_index), 0) + 1
      into v_index
    from public.avantiqo_intelligence_policy_activation_generations g
    where g.organization_id = new.organization_id;

    v_at := now();
    v_previous_state := case when tg_op = 'INSERT' then null else old.state end;
    v_reason := case
      when tg_op = 'INSERT' then 'INITIAL_POLICY_ACTIVATION'
      when old.state = 'SUPERSEDED'
        and coalesce((new.metadata->>'phase41_reactivated_after_successor_rollback')::boolean, false) is true
        then 'REACTIVATED_AFTER_SUCCESSOR_ROLLBACK'
      when old.state = 'ROLLED_BACK' then 'REACTIVATED_AFTER_POLICY_ROLLBACK'
      else 'ACTIVE_STATE_TRANSITION'
    end;

    v_fingerprint := md5(
      'avantiqo-phase43-active-generation-v1|' ||
      new.organization_id::text || '|' ||
      new.id::text || '|' ||
      lower(new.policy_fingerprint) || '|' ||
      v_index::text || '|' ||
      v_at::text || '|' ||
      coalesce(new.activator_fingerprint, '') || '|' ||
      coalesce(new.metadata->>'phase41_rolled_back_successor_policy_fingerprint', '')
    );

    new.activated_at := v_at;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'phase43_activation_generation_contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1',
      'phase43_activation_generation_index', v_index,
      'phase43_activation_generation_fingerprint', v_fingerprint,
      'phase43_activation_reason', v_reason,
      'phase43_previous_policy_state', v_previous_state,
      'phase43_activation_started_at', v_at,
      'phase43_distinct_active_interval', true,
      'phase43_research_evidence_must_bind_activation_generation', true,
      'phase43_stale_research_reuse_allowed', false,
      'phase43_stale_canary_reuse_allowed', false,
      'phase43_stale_approval_reuse_allowed', false,
      'phase43_execution_authorized', false
    );
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_phase43_prepare_active_generation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase43_prepare_active_generation_v1()
  to service_role;

drop trigger if exists avantiqo_phase43_prepare_active_generation_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;
create trigger avantiqo_phase43_prepare_active_generation_v1
before insert or update of state on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_phase43_prepare_active_generation_v1();

create or replace function public.avantiqo_phase43_append_active_generation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_generation_index bigint;
  v_generation_fingerprint text;
  v_reason text;
  v_previous_state text;
begin
  if new.state = 'ACTIVE'
    and (tg_op = 'INSERT' or old.state is distinct from 'ACTIVE')
  then
    v_generation_index := (new.metadata->>'phase43_activation_generation_index')::bigint;
    v_generation_fingerprint := lower(btrim(coalesce(new.metadata->>'phase43_activation_generation_fingerprint', '')));
    v_reason := coalesce(new.metadata->>'phase43_activation_reason', 'ACTIVE_STATE_TRANSITION');
    v_previous_state := nullif(new.metadata->>'phase43_previous_policy_state', '');

    if v_generation_index is null or v_generation_index <= 0
      or v_generation_fingerprint !~ '^[a-f0-9]{32,128}$'
      or new.activated_at is null
    then
      raise exception 'AVANTIQO_PHASE43_ACTIVE_GENERATION_PREPARE_MISSING_FAIL_CLOSED';
    end if;

    insert into public.avantiqo_intelligence_policy_activation_generations (
      organization_id,
      policy_id,
      policy_fingerprint,
      activation_generation_index,
      activation_generation_fingerprint,
      activation_reason,
      previous_policy_state,
      activator_fingerprint,
      phase42_policy_generation_index,
      phase42_scoring_state_fingerprint,
      activated_at,
      metadata
    ) values (
      new.organization_id,
      new.id,
      new.policy_fingerprint,
      v_generation_index,
      v_generation_fingerprint,
      v_reason,
      v_previous_state,
      new.activator_fingerprint,
      case
        when coalesce(new.metadata->>'lineage_generation_index', '') ~ '^[0-9]+$'
          then (new.metadata->>'lineage_generation_index')::integer
        else null
      end,
      nullif(new.metadata->>'scoring_state_fingerprint', ''),
      new.activated_at,
      jsonb_build_object(
        'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1',
        'policy_generation_depth_is_distinct_from_activation_generation', true,
        'exact_policy_fingerprint', new.policy_fingerprint,
        'exact_activation_generation_fingerprint', v_generation_fingerprint,
        'activation_generation_index', v_generation_index,
        'activation_reason', v_reason,
        'previous_policy_state', v_previous_state,
        'research_epoch_must_bind_exact_activation_generation', true,
        'evidence_before_activation_started_at_eligible', false,
        'prior_active_interval_evidence_reusable', false,
        'execution_authorized', false,
        'provider_execution_authorized', false,
        'spend_authorized', false
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_phase43_append_active_generation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase43_append_active_generation_v1()
  to service_role;

drop trigger if exists avantiqo_phase43_append_active_generation_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;
create trigger avantiqo_phase43_append_active_generation_v1
after insert or update of state on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_phase43_append_active_generation_v1();

create or replace function public.avantiqo_phase43_reject_activation_generation_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'AVANTIQO_PHASE43_ACTIVATION_GENERATION_LEDGER_APPEND_ONLY';
end;
$$;

revoke all on function public.avantiqo_phase43_reject_activation_generation_mutation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase43_reject_activation_generation_mutation_v1()
  to service_role;

drop trigger if exists avantiqo_phase43_activation_ledger_append_only_v1
  on public.avantiqo_intelligence_policy_activation_generations;
create trigger avantiqo_phase43_activation_ledger_append_only_v1
before update or delete on public.avantiqo_intelligence_policy_activation_generations
for each row
execute function public.avantiqo_phase43_reject_activation_generation_mutation_v1();

-- Backfill any already-active policy exactly once. In the current production state this
-- is intentionally a zero-row operation, but it keeps forward environments coherent.
do $$
declare
  r record;
  v_index bigint;
  v_at timestamptz;
  v_fingerprint text;
begin
  for r in
    select *
    from public.avantiqo_intelligence_persistent_ordering_policies
    where state = 'ACTIVE'
      and coalesce(metadata->>'phase43_activation_generation_fingerprint', '') = ''
    order by organization_id, created_at, id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'avantiqo-policy-activation-generation-v1:' || r.organization_id::text,
        0
      )
    );

    select coalesce(max(g.activation_generation_index), 0) + 1
      into v_index
    from public.avantiqo_intelligence_policy_activation_generations g
    where g.organization_id = r.organization_id;

    v_at := coalesce(r.activated_at, now());
    v_fingerprint := md5(
      'avantiqo-phase43-active-generation-bootstrap-v1|' ||
      r.organization_id::text || '|' || r.id::text || '|' ||
      lower(r.policy_fingerprint) || '|' || v_index::text || '|' || v_at::text
    );

    update public.avantiqo_intelligence_persistent_ordering_policies
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'phase43_activation_generation_contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1',
      'phase43_activation_generation_index', v_index,
      'phase43_activation_generation_fingerprint', v_fingerprint,
      'phase43_activation_reason', 'BOOTSTRAP_EXISTING_ACTIVE_POLICY',
      'phase43_activation_started_at', v_at,
      'phase43_distinct_active_interval', true,
      'phase43_research_evidence_must_bind_activation_generation', true,
      'phase43_stale_research_reuse_allowed', false,
      'phase43_stale_canary_reuse_allowed', false,
      'phase43_stale_approval_reuse_allowed', false,
      'phase43_execution_authorized', false
    )
    where id = r.id;

    insert into public.avantiqo_intelligence_policy_activation_generations (
      organization_id, policy_id, policy_fingerprint,
      activation_generation_index, activation_generation_fingerprint,
      activation_reason, previous_policy_state, activator_fingerprint,
      phase42_policy_generation_index, phase42_scoring_state_fingerprint,
      activated_at, metadata
    ) values (
      r.organization_id, r.id, r.policy_fingerprint,
      v_index, v_fingerprint,
      'BOOTSTRAP_EXISTING_ACTIVE_POLICY', null, r.activator_fingerprint,
      case when coalesce(r.metadata->>'lineage_generation_index', '') ~ '^[0-9]+$'
        then (r.metadata->>'lineage_generation_index')::integer else null end,
      nullif(r.metadata->>'scoring_state_fingerprint', ''),
      v_at,
      jsonb_build_object(
        'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_V1',
        'bootstrap_existing_active_policy', true,
        'research_epoch_must_bind_exact_activation_generation', true,
        'prior_active_interval_evidence_reusable', false,
        'execution_authorized', false
      )
    );
  end loop;
end;
$$;

create or replace function public.verify_avantiqo_policy_activation_generation_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_count integer;
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_generation public.avantiqo_intelligence_policy_activation_generations;
  v_generation_count integer;
  v_latest_org_fingerprint text;
  v_expected_fingerprint text;
begin
  if p_organization_id is null then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
      'status', 'ORGANIZATION_ID_REQUIRED_FAIL_CLOSED',
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select count(*) into v_active_count
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id and state = 'ACTIVE';

  if v_active_count = 0 then
    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
      'status', 'NO_ACTIVE_PERSISTENT_POLICY',
      'persistent_policy_active', false,
      'research_generation_allowed', true,
      'execution_request_generation_allowed', true
    );
  end if;

  if v_active_count <> 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_POLICY_AMBIGUOUS_FAIL_CLOSED',
      'persistent_policy_active', true,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select * into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id and state = 'ACTIVE'
  limit 1;

  v_expected_fingerprint := lower(btrim(coalesce(v_policy.metadata->>'phase43_activation_generation_fingerprint', '')));
  if v_expected_fingerprint !~ '^[a-f0-9]{32,128}$'
    or coalesce(v_policy.metadata->>'phase43_activation_generation_index', '') !~ '^[0-9]+$'
    or v_policy.activated_at is null
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_POLICY_GENERATION_METADATA_INVALID_FAIL_CLOSED',
      'persistent_policy_active', true,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select count(*) into v_generation_count
  from public.avantiqo_intelligence_policy_activation_generations
  where organization_id = p_organization_id
    and activation_generation_fingerprint = v_expected_fingerprint;

  if v_generation_count <> 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_GENERATION_LEDGER_AMBIGUOUS_FAIL_CLOSED',
      'persistent_policy_active', true,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select * into v_generation
  from public.avantiqo_intelligence_policy_activation_generations
  where organization_id = p_organization_id
    and activation_generation_fingerprint = v_expected_fingerprint
  limit 1;

  select activation_generation_fingerprint into v_latest_org_fingerprint
  from public.avantiqo_intelligence_policy_activation_generations
  where organization_id = p_organization_id
  order by activation_generation_index desc
  limit 1;

  if v_generation.policy_id <> v_policy.id
    or v_generation.policy_fingerprint <> v_policy.policy_fingerprint
    or v_generation.activation_generation_index <> (v_policy.metadata->>'phase43_activation_generation_index')::bigint
    or v_generation.activated_at <> v_policy.activated_at
    or v_latest_org_fingerprint <> v_expected_fingerprint
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_GENERATION_LINEAGE_MISMATCH_FAIL_CLOSED',
      'persistent_policy_active', true,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1',
    'status', 'ACTIVE_POLICY_GENERATION_VERIFIED',
    'persistent_policy_active', true,
    'policy_fingerprint', v_policy.policy_fingerprint,
    'activation_generation_index', v_generation.activation_generation_index,
    'activation_generation_fingerprint', v_generation.activation_generation_fingerprint,
    'activation_started_at', v_generation.activated_at,
    'activation_reason', v_generation.activation_reason,
    'research_generation_allowed', true,
    'execution_request_generation_allowed', true
  );
end;
$$;

revoke all on function public.verify_avantiqo_policy_activation_generation_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_avantiqo_policy_activation_generation_v1(uuid)
  to service_role;
