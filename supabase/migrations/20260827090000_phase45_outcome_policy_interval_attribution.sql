-- AVANTIQO PHASE 45
-- Immutable experiment-outcome attribution to the exact persistent-policy activation
-- interval that governed the execution request, or explicitly to no persistent policy.

create table if not exists public.avantiqo_intelligence_policy_outcome_attributions (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1',
  organization_id uuid not null,
  outcome_memory_id uuid not null references public.intelligence_memories(id) on delete restrict,
  outcome_fingerprint text not null,
  execution_receipt_fingerprint text not null,
  request_fingerprint text not null,
  selection_fingerprint text not null,
  attribution_kind text not null,
  policy_id uuid references public.avantiqo_intelligence_persistent_ordering_policies(id) on delete restrict,
  policy_fingerprint text,
  activation_generation_index bigint,
  activation_generation_fingerprint text,
  activation_started_at timestamptz,
  activation_closed_at timestamptz,
  binding_observed_at timestamptz not null,
  execution_started_at timestamptz not null,
  execution_completed_at timestamptz not null,
  attribution_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint avantiqo_phase45_outcome_fp_check
    check (outcome_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase45_receipt_fp_check
    check (execution_receipt_fingerprint ~ '^[a-f0-9]{16,128}$'),
  constraint avantiqo_phase45_request_fp_check
    check (request_fingerprint ~ '^[a-f0-9]{16,128}$'),
  constraint avantiqo_phase45_selection_fp_check
    check (selection_fingerprint ~ '^[a-f0-9]{16,128}$'),
  constraint avantiqo_phase45_attribution_fp_check
    check (attribution_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_phase45_kind_check
    check (attribution_kind in ('PERSISTENT_POLICY_INTERVAL', 'NO_PERSISTENT_POLICY_INTERVAL')),
  constraint avantiqo_phase45_time_order_check
    check (execution_completed_at >= execution_started_at),
  constraint avantiqo_phase45_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint avantiqo_phase45_policy_binding_shape_check
    check (
      (
        attribution_kind = 'PERSISTENT_POLICY_INTERVAL'
        and policy_id is not null
        and policy_fingerprint ~ '^[a-f0-9]{32,128}$'
        and activation_generation_index > 0
        and activation_generation_fingerprint ~ '^[a-f0-9]{32,128}$'
        and activation_started_at is not null
        and binding_observed_at >= activation_started_at
        and (activation_closed_at is null or binding_observed_at < activation_closed_at)
      )
      or
      (
        attribution_kind = 'NO_PERSISTENT_POLICY_INTERVAL'
        and policy_id is null
        and policy_fingerprint is null
        and activation_generation_index is null
        and activation_generation_fingerprint is null
        and activation_started_at is null
        and activation_closed_at is null
      )
    ),
  constraint avantiqo_phase45_activation_generation_fk
    foreign key (organization_id, activation_generation_fingerprint)
    references public.avantiqo_intelligence_policy_activation_generations
      (organization_id, activation_generation_fingerprint)
    on delete restrict,
  unique (organization_id, outcome_memory_id),
  unique (organization_id, outcome_fingerprint),
  unique (organization_id, attribution_fingerprint)
);

create index if not exists avantiqo_phase45_outcome_attribution_generation_idx
  on public.avantiqo_intelligence_policy_outcome_attributions
  (organization_id, activation_generation_index, binding_observed_at);

alter table public.avantiqo_intelligence_policy_outcome_attributions enable row level security;
revoke all on table public.avantiqo_intelligence_policy_outcome_attributions
  from public, anon, authenticated, service_role;
grant select, insert on table public.avantiqo_intelligence_policy_outcome_attributions
  to service_role;

create or replace function public.avantiqo_phase45_reject_outcome_attribution_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'AVANTIQO_PHASE45_OUTCOME_ATTRIBUTION_LEDGER_APPEND_ONLY';
end;
$$;

revoke all on function public.avantiqo_phase45_reject_outcome_attribution_mutation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_reject_outcome_attribution_mutation_v1()
  to service_role;

drop trigger if exists avantiqo_phase45_outcome_attribution_append_only_v1
  on public.avantiqo_intelligence_policy_outcome_attributions;
create trigger avantiqo_phase45_outcome_attribution_append_only_v1
before update or delete on public.avantiqo_intelligence_policy_outcome_attributions
for each row execute function public.avantiqo_phase45_reject_outcome_attribution_mutation_v1();

create or replace function public.resolve_avantiqo_policy_activation_interval_v1(
  p_organization_id uuid,
  p_event_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_integrity jsonb;
  v_match_count integer;
  v_generation public.avantiqo_intelligence_policy_activation_generations;
  v_closed_at timestamptz;
begin
  if p_organization_id is null or p_event_at is null then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'ORGANIZATION_AND_EVENT_TIME_REQUIRED_FAIL_CLOSED',
      'exact_interval_resolution', false
    );
  end if;

  v_integrity := public.verify_avantiqo_policy_activation_intervals_v1(p_organization_id);
  if coalesce((v_integrity->>'success')::boolean, false) is not true
    or coalesce((v_integrity->>'historical_interval_attribution_allowed')::boolean, false) is not true
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'POLICY_ACTIVATION_INTERVAL_INTEGRITY_FAIL_CLOSED',
      'exact_interval_resolution', false,
      'activation_interval_integrity', v_integrity
    );
  end if;

  select count(*)::integer into v_match_count
  from public.avantiqo_intelligence_policy_activation_generations g
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
   and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where g.organization_id = p_organization_id
    and g.activated_at <= p_event_at
    and (c.closed_at is null or p_event_at < c.closed_at);

  if v_match_count > 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'POLICY_ACTIVATION_INTERVAL_AMBIGUOUS_FAIL_CLOSED',
      'exact_interval_resolution', false
    );
  end if;

  if v_match_count = 0 then
    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'NO_PERSISTENT_POLICY_INTERVAL_AT_EVENT',
      'attribution_kind', 'NO_PERSISTENT_POLICY_INTERVAL',
      'persistent_policy_interval_present', false,
      'event_at', p_event_at,
      'exact_interval_resolution', true
    );
  end if;

  select g.*, c.closed_at
    into v_generation, v_closed_at
  from public.avantiqo_intelligence_policy_activation_generations g
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
   and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where g.organization_id = p_organization_id
    and g.activated_at <= p_event_at
    and (c.closed_at is null or p_event_at < c.closed_at)
  limit 1;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
    'status', 'PERSISTENT_POLICY_INTERVAL_RESOLVED',
    'attribution_kind', 'PERSISTENT_POLICY_INTERVAL',
    'persistent_policy_interval_present', true,
    'policy_id', v_generation.policy_id,
    'policy_fingerprint', v_generation.policy_fingerprint,
    'activation_generation_index', v_generation.activation_generation_index,
    'activation_generation_fingerprint', v_generation.activation_generation_fingerprint,
    'activation_started_at', v_generation.activated_at,
    'activation_closed_at', v_closed_at,
    'event_at', p_event_at,
    'exact_interval_resolution', true
  );
end;
$$;

revoke all on function public.resolve_avantiqo_policy_activation_interval_v1(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_avantiqo_policy_activation_interval_v1(uuid, timestamptz)
  to service_role;

create or replace function public.verify_avantiqo_policy_outcome_attribution_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_outcome_count integer;
  v_attribution_count integer;
  v_invalid_count integer;
begin
  if p_organization_id is null then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_V1',
      'status', 'ORGANIZATION_ID_REQUIRED_FAIL_CLOSED',
      'historical_outcome_use_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select count(*)::integer into v_outcome_count
  from public.intelligence_memories m
  where m.organization_id = p_organization_id
    and m.memory_scope = 'platform_learning_experiment_portfolio_outcomes'
    and m.active = true
    and coalesce(m.metadata->>'contract', '') = 'AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1'
    and coalesce(m.metadata->>'status', '') = 'OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED';

  select count(*)::integer into v_attribution_count
  from public.avantiqo_intelligence_policy_outcome_attributions a
  where a.organization_id = p_organization_id;

  if v_outcome_count <> v_attribution_count then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_V1',
      'status', 'OUTCOME_ATTRIBUTION_CARDINALITY_MISMATCH_FAIL_CLOSED',
      'outcome_count', v_outcome_count,
      'attribution_count', v_attribution_count,
      'historical_outcome_use_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select count(*)::integer into v_invalid_count
  from public.avantiqo_intelligence_policy_outcome_attributions a
  join public.intelligence_memories m
    on m.id = a.outcome_memory_id and m.organization_id = a.organization_id
  left join public.avantiqo_intelligence_policy_activation_generations g
    on g.organization_id = a.organization_id
   and g.activation_generation_fingerprint = a.activation_generation_fingerprint
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
   and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where a.organization_id = p_organization_id
    and (
      m.memory_scope <> 'platform_learning_experiment_portfolio_outcomes'
      or coalesce(m.metadata->>'outcome_fingerprint', '') <> a.outcome_fingerprint
      or coalesce(m.metadata->>'execution_receipt_fingerprint', '') <> a.execution_receipt_fingerprint
      or coalesce(m.metadata->>'request_fingerprint', '') <> a.request_fingerprint
      or coalesce(m.metadata->>'selection_fingerprint', '') <> a.selection_fingerprint
      or coalesce(m.metadata->>'policy_activation_binding_kind', '') <> a.attribution_kind
      or coalesce(m.metadata->>'policy_activation_binding_observed_at', '')::timestamptz <> a.binding_observed_at
      or coalesce(m.metadata->>'execution_started_at', '')::timestamptz <> a.execution_started_at
      or coalesce(m.metadata->>'execution_completed_at', '')::timestamptz <> a.execution_completed_at
      or (
        a.attribution_kind = 'PERSISTENT_POLICY_INTERVAL'
        and (
          g.id is null
          or g.policy_id <> a.policy_id
          or g.policy_fingerprint <> a.policy_fingerprint
          or g.activation_generation_index <> a.activation_generation_index
          or g.activated_at <> a.activation_started_at
          or c.closed_at is distinct from a.activation_closed_at
          or a.binding_observed_at < g.activated_at
          or (c.closed_at is not null and a.binding_observed_at >= c.closed_at)
          or coalesce(m.metadata->>'activation_generation_fingerprint', '') <> a.activation_generation_fingerprint
          or coalesce(m.metadata->>'policy_fingerprint', '') <> a.policy_fingerprint
        )
      )
      or (
        a.attribution_kind = 'NO_PERSISTENT_POLICY_INTERVAL'
        and exists (
          select 1
          from public.avantiqo_intelligence_policy_activation_generations gx
          left join public.avantiqo_intelligence_policy_activation_closures cx
            on cx.organization_id = gx.organization_id
           and cx.activation_generation_fingerprint = gx.activation_generation_fingerprint
          where gx.organization_id = a.organization_id
            and gx.activated_at <= a.binding_observed_at
            and (cx.closed_at is null or a.binding_observed_at < cx.closed_at)
        )
      )
    );

  if v_invalid_count <> 0 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_V1',
      'status', 'OUTCOME_POLICY_INTERVAL_LINEAGE_MISMATCH_FAIL_CLOSED',
      'invalid_attribution_count', v_invalid_count,
      'historical_outcome_use_allowed', false,
      'research_generation_allowed', false,
      'execution_request_generation_allowed', false
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_V1',
    'status', case when v_outcome_count = 0 then 'NO_PORTFOLIO_OUTCOMES_TO_ATTRIBUTE' else 'OUTCOME_POLICY_INTERVAL_ATTRIBUTION_VERIFIED' end,
    'outcome_count', v_outcome_count,
    'attribution_count', v_attribution_count,
    'historical_outcome_use_allowed', true,
    'research_generation_allowed', true,
    'execution_request_generation_allowed', true,
    'cross_interval_outcome_reuse_allowed', false,
    'exact_policy_interval_attribution', true
  );
end;
$$;

revoke all on function public.verify_avantiqo_policy_outcome_attribution_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_avantiqo_policy_outcome_attribution_v1(uuid)
  to service_role;
