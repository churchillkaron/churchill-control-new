-- Phase 42: persistent-policy generation lineage and constant-size scoring compaction.
--
-- Phase 41 already provides governed succession from a certified rebased canary into an
-- explicitly activated persistent policy. Its residual composition is mathematically safe,
-- but an indefinitely successful learning system must not accumulate an unbounded active
-- array of historical residual layers. Phase 42 folds those layers exactly into constant-size
-- current/parent multipliers while retaining every generation in an append-only lineage ledger.
--
-- This is deliberately additive around the certified Phase 41 activation path:
--   * the Phase 41 approval/release/activation authority remains unchanged;
--   * a BEFORE INSERT trigger compacts the successor atomically before it becomes active;
--   * an AFTER INSERT trigger appends the immutable scientific generation record;
--   * the Phase 41 scoring helper understands the compacted state, preserving the existing
--     application evidence shape consumed by Phase 36;
--   * a service-role-only integrity RPC independently recomputes the fold and fails closed.

create table if not exists public.avantiqo_intelligence_persistent_policy_generations (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1',
  organization_id uuid not null,
  lineage_root_policy_fingerprint text not null,
  generation_index integer not null check (generation_index > 0),
  parent_policy_id uuid not null,
  parent_policy_fingerprint text not null,
  successor_policy_id uuid not null,
  successor_policy_fingerprint text not null,
  source_phase38_proposal_fingerprint text not null,
  source_phase40_certification_fingerprint text not null,
  source_phase40_activation_fingerprint text not null,
  source_phase41_release_candidate_fingerprint text not null,
  legacy_phase30_challenger_policy_version text not null,
  legacy_phase30_influence_fraction numeric not null check (
    legacy_phase30_influence_fraction > 0 and legacy_phase30_influence_fraction <= 0.25
  ),
  incremental_influence_fraction numeric not null check (
    incremental_influence_fraction > 0 and incremental_influence_fraction <= 0.25
  ),
  global_residual_calibration_factor numeric not null check (
    global_residual_calibration_factor >= 0.25 and global_residual_calibration_factor <= 1
  ),
  family_residual_calibration_factors jsonb not null default '{}'::jsonb check (
    jsonb_typeof(family_residual_calibration_factors) = 'object'
  ),
  parent_compacted_global_residual_multiplier numeric not null check (
    parent_compacted_global_residual_multiplier > 0 and parent_compacted_global_residual_multiplier <= 1
  ),
  parent_compacted_family_residual_multipliers jsonb not null default '{}'::jsonb check (
    jsonb_typeof(parent_compacted_family_residual_multipliers) = 'object'
  ),
  compacted_global_residual_multiplier numeric not null check (
    compacted_global_residual_multiplier > 0 and compacted_global_residual_multiplier <= 1
  ),
  compacted_family_residual_multipliers jsonb not null default '{}'::jsonb check (
    jsonb_typeof(compacted_family_residual_multipliers) = 'object'
  ),
  scoring_state_fingerprint text not null,
  activator_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint avantiqo_phase42_root_fingerprint_check check (
    lineage_root_policy_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_parent_fingerprint_check check (
    parent_policy_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_successor_fingerprint_check check (
    successor_policy_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_proposal_fingerprint_check check (
    source_phase38_proposal_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_certification_fingerprint_check check (
    source_phase40_certification_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_activation_fingerprint_check check (
    source_phase40_activation_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_release_fingerprint_check check (
    source_phase41_release_candidate_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_state_fingerprint_check check (
    scoring_state_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_activator_fingerprint_check check (
    activator_fingerprint ~ '^[a-f0-9]{32,128}$'
  ),
  constraint avantiqo_phase42_successor_generation_unique unique (
    organization_id,
    successor_policy_fingerprint
  ),
  constraint avantiqo_phase42_successor_id_unique unique (
    successor_policy_id
  ),
  constraint avantiqo_phase42_scoring_state_unique unique (
    organization_id,
    scoring_state_fingerprint
  )
);

create index if not exists avantiqo_phase42_generation_lineage_idx
  on public.avantiqo_intelligence_persistent_policy_generations (
    organization_id,
    lineage_root_policy_fingerprint,
    generation_index,
    created_at
  );

create index if not exists avantiqo_phase42_generation_parent_idx
  on public.avantiqo_intelligence_persistent_policy_generations (
    organization_id,
    parent_policy_fingerprint,
    created_at
  );

alter table public.avantiqo_intelligence_persistent_policy_generations enable row level security;
revoke all on table public.avantiqo_intelligence_persistent_policy_generations
  from public, anon, authenticated;
grant select, insert on table public.avantiqo_intelligence_persistent_policy_generations
  to service_role;

create or replace function public.avantiqo_phase42_fold_residual_layer_v1(
  p_parent_global_multiplier numeric,
  p_parent_family_multipliers jsonb,
  p_incremental_influence_fraction numeric,
  p_global_residual_calibration_factor numeric,
  p_family_residual_calibration_factors jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parent_global numeric := p_parent_global_multiplier;
  v_parent_families jsonb := coalesce(p_parent_family_multipliers, '{}'::jsonb);
  v_influence numeric := p_incremental_influence_fraction;
  v_global_factor numeric := p_global_residual_calibration_factor;
  v_family_factors jsonb := coalesce(p_family_residual_calibration_factors, '{}'::jsonb);
  v_global_multiplier numeric;
  v_family_multipliers jsonb := '{}'::jsonb;
  v_key text;
  v_normalized_key text;
  v_parent_multiplier numeric;
  v_layer_factor numeric;
  v_next_multiplier numeric;
  v_raw_count integer;
  v_normalized_count integer;
begin
  if v_parent_global is null or v_parent_global <= 0 or v_parent_global > 1 then
    raise exception 'AVANTIQO_PHASE42_PARENT_GLOBAL_MULTIPLIER_INVALID';
  end if;
  if jsonb_typeof(v_parent_families) <> 'object' then
    raise exception 'AVANTIQO_PHASE42_PARENT_FAMILY_MULTIPLIERS_INVALID';
  end if;
  if v_influence is null or v_influence <= 0 or v_influence > 0.25 then
    raise exception 'AVANTIQO_PHASE42_INCREMENTAL_INFLUENCE_INVALID';
  end if;
  if v_global_factor is null or v_global_factor < 0.25 or v_global_factor > 1 then
    raise exception 'AVANTIQO_PHASE42_GLOBAL_RESIDUAL_FACTOR_INVALID';
  end if;
  if jsonb_typeof(v_family_factors) <> 'object' then
    raise exception 'AVANTIQO_PHASE42_FAMILY_RESIDUAL_FACTORS_INVALID';
  end if;

  select count(*), count(distinct upper(btrim(key)))
  into v_raw_count, v_normalized_count
  from jsonb_object_keys(v_parent_families) as keys(key);
  if v_raw_count <> v_normalized_count then
    raise exception 'AVANTIQO_PHASE42_PARENT_FAMILY_KEY_COLLISION';
  end if;

  select count(*), count(distinct upper(btrim(key)))
  into v_raw_count, v_normalized_count
  from jsonb_object_keys(v_family_factors) as keys(key);
  if v_raw_count <> v_normalized_count then
    raise exception 'AVANTIQO_PHASE42_LAYER_FAMILY_KEY_COLLISION';
  end if;

  for v_key in
    select key from jsonb_object_keys(v_parent_families) as keys(key)
  loop
    v_normalized_key := upper(btrim(v_key));
    if not (coalesce(v_parent_families->>v_key, '') ~ '^[0-9]+([.][0-9]+)?$') then
      raise exception 'AVANTIQO_PHASE42_PARENT_FAMILY_MULTIPLIER_NON_NUMERIC';
    end if;
    v_parent_multiplier := (v_parent_families->>v_key)::numeric;
    if v_parent_multiplier <= 0 or v_parent_multiplier > 1 then
      raise exception 'AVANTIQO_PHASE42_PARENT_FAMILY_MULTIPLIER_OUT_OF_RANGE';
    end if;
    if v_normalized_key = '' then
      raise exception 'AVANTIQO_PHASE42_PARENT_FAMILY_KEY_EMPTY';
    end if;
  end loop;

  for v_key in
    select key from jsonb_object_keys(v_family_factors) as keys(key)
  loop
    v_normalized_key := upper(btrim(v_key));
    if not (coalesce(v_family_factors->>v_key, '') ~ '^[0-9]+([.][0-9]+)?$') then
      raise exception 'AVANTIQO_PHASE42_LAYER_FAMILY_FACTOR_NON_NUMERIC';
    end if;
    v_layer_factor := (v_family_factors->>v_key)::numeric;
    if v_layer_factor < 0.25 or v_layer_factor > 1 then
      raise exception 'AVANTIQO_PHASE42_LAYER_FAMILY_FACTOR_OUT_OF_RANGE';
    end if;
    if v_normalized_key = '' then
      raise exception 'AVANTIQO_PHASE42_LAYER_FAMILY_KEY_EMPTY';
    end if;
  end loop;

  v_global_multiplier := v_parent_global * ((1 - v_influence) + v_global_factor * v_influence);
  if v_global_multiplier <= 0 or v_global_multiplier > 1 then
    raise exception 'AVANTIQO_PHASE42_COMPACTED_GLOBAL_MULTIPLIER_INVALID';
  end if;

  for v_normalized_key in
    select family_key
    from (
      select upper(btrim(key)) as family_key
      from jsonb_object_keys(v_parent_families) as parent_keys(key)
      union
      select upper(btrim(key)) as family_key
      from jsonb_object_keys(v_family_factors) as layer_keys(key)
    ) families
    order by family_key
  loop
    select coalesce(
      (
        select value::numeric
        from jsonb_each_text(v_parent_families) parent_pair(key, value)
        where upper(btrim(parent_pair.key)) = v_normalized_key
        limit 1
      ),
      v_parent_global
    ) into v_parent_multiplier;

    select coalesce(
      (
        select value::numeric
        from jsonb_each_text(v_family_factors) factor_pair(key, value)
        where upper(btrim(factor_pair.key)) = v_normalized_key
        limit 1
      ),
      v_global_factor
    ) into v_layer_factor;

    v_next_multiplier := v_parent_multiplier * ((1 - v_influence) + v_layer_factor * v_influence);
    if v_next_multiplier <= 0 or v_next_multiplier > 1 then
      raise exception 'AVANTIQO_PHASE42_COMPACTED_FAMILY_MULTIPLIER_INVALID';
    end if;
    v_family_multipliers := v_family_multipliers || jsonb_build_object(
      v_normalized_key,
      to_jsonb(v_next_multiplier)
    );
  end loop;

  return jsonb_build_object(
    'global_multiplier', v_global_multiplier,
    'family_multipliers', v_family_multipliers,
    'exact_multiplicative_fold', true,
    'source_layer_influence_fraction', v_influence,
    'source_layer_global_factor', v_global_factor
  );
end;
$$;

revoke all on function public.avantiqo_phase42_fold_residual_layer_v1(
  numeric, jsonb, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.avantiqo_phase42_fold_residual_layer_v1(
  numeric, jsonb, numeric, numeric, jsonb
) to service_role;

create or replace function public.avantiqo_phase42_scoring_state_fingerprint_v1(
  p_organization_id uuid,
  p_lineage_root_policy_fingerprint text,
  p_generation_index integer,
  p_legacy_phase30_challenger_policy_version text,
  p_legacy_phase30_influence_fraction numeric,
  p_parent_global_multiplier numeric,
  p_parent_family_multipliers jsonb,
  p_current_global_multiplier numeric,
  p_current_family_multipliers jsonb,
  p_source_phase38_proposal_fingerprint text,
  p_incremental_influence_fraction numeric
)
returns text
language sql
security invoker
set search_path = public
as $$
  select md5(
    'AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1|' ||
    coalesce(p_organization_id::text, '') || '|' ||
    lower(btrim(coalesce(p_lineage_root_policy_fingerprint, ''))) || '|' ||
    coalesce(p_generation_index::text, '') || '|' ||
    btrim(coalesce(p_legacy_phase30_challenger_policy_version, '')) || '|' ||
    coalesce(p_legacy_phase30_influence_fraction::text, '') || '|' ||
    coalesce(p_parent_global_multiplier::text, '') || '|' ||
    coalesce(p_parent_family_multipliers, '{}'::jsonb)::text || '|' ||
    coalesce(p_current_global_multiplier::text, '') || '|' ||
    coalesce(p_current_family_multipliers, '{}'::jsonb)::text || '|' ||
    lower(btrim(coalesce(p_source_phase38_proposal_fingerprint, ''))) || '|' ||
    coalesce(p_incremental_influence_fraction::text, '')
  );
$$;

revoke all on function public.avantiqo_phase42_scoring_state_fingerprint_v1(
  uuid, text, integer, text, numeric, numeric, jsonb, numeric, jsonb, text, numeric
) from public, anon, authenticated;
grant execute on function public.avantiqo_phase42_scoring_state_fingerprint_v1(
  uuid, text, integer, text, numeric, numeric, jsonb, numeric, jsonb, text, numeric
) to service_role;

create or replace function public.avantiqo_phase42_compact_successor_before_insert_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parent public.avantiqo_intelligence_persistent_ordering_policies;
  v_layers jsonb;
  v_layer_count integer;
  v_latest_layer jsonb;
  v_source_proposal_fingerprint text;
  v_challenger_version text;
  v_incremental_influence numeric;
  v_global_factor numeric;
  v_family_factors jsonb;
  v_legacy_version text;
  v_legacy_influence numeric;
  v_lineage_root text;
  v_generation_index integer;
  v_parent_global numeric;
  v_parent_families jsonb;
  v_folded jsonb;
  v_current_global numeric;
  v_current_families jsonb;
  v_state_fingerprint text;
begin
  if coalesce(new.metadata->>'policy_generation_kind', '') <> 'REBASED_SUCCESSOR_COMPOSITE_V1' then
    return new;
  end if;

  if new.contract <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1'
    or new.state <> 'ACTIVE'
    or new.policy_fingerprint !~ '^[a-f0-9]{32,128}$'
    or new.baseline_policy_fingerprint !~ '^[a-f0-9]{32,128}$'
    or new.activator_fingerprint !~ '^[a-f0-9]{32,128}$'
    or new.ordering_influence_fraction <= 0
    or new.ordering_influence_fraction > 0.25
    or coalesce((new.metadata->>'exact_phase40_tested_composite_promoted')::boolean, false) is not true
    or coalesce((new.metadata->>'raw_challenger_full_cutover_applied')::boolean, true) is not false
    or coalesce((new.metadata->>'recursive_runtime_policy_stack')::boolean, true) is not false
    or coalesce((new.metadata->>'phase36_monitor_compatible')::boolean, false) is not true
  then
    raise exception 'AVANTIQO_PHASE42_SUCCESSOR_AUTHORITY_BOUNDARY_INVALID';
  end if;

  select * into v_parent
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = new.organization_id
    and policy_fingerprint = new.baseline_policy_fingerprint
  limit 1;

  if v_parent.id is null
    or v_parent.contract <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1'
    or v_parent.state <> 'SUPERSEDED'
    or coalesce((v_parent.metadata->>'phase41_successor_activation_in_progress')::boolean, false) is not true
    or coalesce(v_parent.metadata->>'phase41_successor_policy_fingerprint', '') <> new.policy_fingerprint
  then
    raise exception 'AVANTIQO_PHASE42_EXACT_SUPERSEDED_PARENT_REQUIRED';
  end if;

  v_layers := coalesce(new.metadata->'flattened_residual_layers', '[]'::jsonb);
  if jsonb_typeof(v_layers) <> 'array' then
    raise exception 'AVANTIQO_PHASE42_PHASE41_RESIDUAL_LAYER_ARRAY_INVALID';
  end if;
  v_layer_count := jsonb_array_length(v_layers);
  if v_layer_count < 1 then
    raise exception 'AVANTIQO_PHASE42_LATEST_RESIDUAL_LAYER_REQUIRED';
  end if;
  v_latest_layer := v_layers->(v_layer_count - 1);
  if jsonb_typeof(v_latest_layer) <> 'object' then
    raise exception 'AVANTIQO_PHASE42_LATEST_RESIDUAL_LAYER_INVALID';
  end if;

  v_source_proposal_fingerprint := lower(btrim(coalesce(v_latest_layer->>'source_proposal_fingerprint', '')));
  v_challenger_version := btrim(coalesce(v_latest_layer->>'challenger_policy_version', ''));
  v_incremental_influence := (v_latest_layer->>'incremental_influence_fraction')::numeric;
  v_global_factor := (v_latest_layer->>'global_residual_calibration_factor')::numeric;
  v_family_factors := coalesce(v_latest_layer->'family_residual_calibration_factors', '{}'::jsonb);

  if v_source_proposal_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_source_proposal_fingerprint <> lower(btrim(coalesce(new.metadata->>'latest_phase38_proposal_fingerprint', '')))
    or v_challenger_version <> new.challenger_policy_version
    or v_incremental_influence <> new.ordering_influence_fraction
    or v_incremental_influence <= 0
    or v_incremental_influence > 0.25
    or v_global_factor < 0.25
    or v_global_factor > 1
    or jsonb_typeof(v_family_factors) <> 'object'
  then
    raise exception 'AVANTIQO_PHASE42_LATEST_RESIDUAL_LAYER_LINEAGE_INVALID';
  end if;

  v_legacy_version := btrim(coalesce(new.metadata->>'legacy_phase30_challenger_policy_version', ''));
  v_legacy_influence := (new.metadata->>'legacy_phase30_influence_fraction')::numeric;
  if length(v_legacy_version) < 3 or v_legacy_influence <= 0 or v_legacy_influence > 0.25 then
    raise exception 'AVANTIQO_PHASE42_LEGACY_ROOT_POLICY_STATE_INVALID';
  end if;

  if coalesce((v_parent.metadata->>'phase42_compaction_authoritative')::boolean, false) is true then
    if coalesce(v_parent.metadata->>'phase42_compaction_contract', '') <>
        'AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_V1'
      or coalesce(v_parent.metadata->>'lineage_root_policy_fingerprint', '') !~ '^[a-f0-9]{32,128}$'
      or coalesce(v_parent.metadata->>'lineage_generation_index', '') !~ '^[0-9]+$'
      or jsonb_typeof(coalesce(v_parent.metadata->'compacted_family_residual_multipliers', '{}'::jsonb)) <> 'object'
    then
      raise exception 'AVANTIQO_PHASE42_PARENT_COMPACTED_STATE_INVALID';
    end if;
    v_lineage_root := lower(btrim(v_parent.metadata->>'lineage_root_policy_fingerprint'));
    v_generation_index := (v_parent.metadata->>'lineage_generation_index')::integer + 1;
    v_parent_global := (v_parent.metadata->>'compacted_global_residual_multiplier')::numeric;
    v_parent_families := coalesce(v_parent.metadata->'compacted_family_residual_multipliers', '{}'::jsonb);
    if v_parent_global <= 0 or v_parent_global > 1 then
      raise exception 'AVANTIQO_PHASE42_PARENT_COMPACTED_GLOBAL_INVALID';
    end if;
    if btrim(coalesce(v_parent.metadata->>'legacy_phase30_challenger_policy_version', '')) <> v_legacy_version
      or (v_parent.metadata->>'legacy_phase30_influence_fraction')::numeric <> v_legacy_influence
    then
      raise exception 'AVANTIQO_PHASE42_LINEAGE_ROOT_POLICY_STATE_CHANGED';
    end if;
  elsif coalesce(v_parent.metadata->>'policy_generation_kind', '') = 'REBASED_SUCCESSOR_COMPOSITE_V1' then
    -- Production had zero active Phase 41 successors when Phase 42 was introduced.
    -- Any later successor parent must therefore carry Phase 42's compacted authority.
    -- Refuse silent reconstruction of an unledgered historical branch.
    raise exception 'AVANTIQO_PHASE42_UNCOMPACTED_SUCCESSOR_PARENT_FAIL_CLOSED';
  else
    v_lineage_root := v_parent.policy_fingerprint;
    v_generation_index := 1;
    v_parent_global := 1;
    v_parent_families := '{}'::jsonb;
    if v_parent.challenger_policy_version <> v_legacy_version
      or v_parent.ordering_influence_fraction <> v_legacy_influence
    then
      raise exception 'AVANTIQO_PHASE42_ROOT_PARENT_POLICY_STATE_MISMATCH';
    end if;
  end if;

  v_folded := public.avantiqo_phase42_fold_residual_layer_v1(
    v_parent_global,
    v_parent_families,
    v_incremental_influence,
    v_global_factor,
    v_family_factors
  );
  v_current_global := (v_folded->>'global_multiplier')::numeric;
  v_current_families := coalesce(v_folded->'family_multipliers', '{}'::jsonb);

  v_state_fingerprint := public.avantiqo_phase42_scoring_state_fingerprint_v1(
    new.organization_id,
    v_lineage_root,
    v_generation_index,
    v_legacy_version,
    v_legacy_influence,
    v_parent_global,
    v_parent_families,
    v_current_global,
    v_current_families,
    v_source_proposal_fingerprint,
    v_incremental_influence
  );

  new.metadata := new.metadata || jsonb_build_object(
    'phase42_compaction_contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_V1',
    'phase42_generation_ledger_contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1',
    'phase42_compaction_authoritative', true,
    'phase42_exact_multiplicative_residual_fold', true,
    'phase42_active_scoring_state_constant_size', true,
    'phase42_full_history_in_generation_ledger', true,
    'phase42_unbounded_active_layer_accumulation', false,
    'phase42_recursive_runtime_policy_stack', false,
    'lineage_root_policy_fingerprint', v_lineage_root,
    'lineage_generation_index', v_generation_index,
    'parent_compacted_global_residual_multiplier', v_parent_global,
    'parent_compacted_family_residual_multipliers', v_parent_families,
    'compacted_global_residual_multiplier', v_current_global,
    'compacted_family_residual_multipliers', v_current_families,
    'scoring_state_fingerprint', v_state_fingerprint,
    -- Keep exactly one latest layer only. This preserves Phase 41's schema/guards while
    -- making active metadata O(1) with respect to generation depth.
    'flattened_residual_layers', jsonb_build_array(v_latest_layer),
    'flattened_residual_layer_count', 1,
    'phase42_latest_layer_source_proposal_fingerprint', v_source_proposal_fingerprint,
    'phase42_latest_layer_incremental_influence_fraction', v_incremental_influence,
    'phase42_latest_layer_global_residual_calibration_factor', v_global_factor,
    'phase42_latest_layer_family_residual_calibration_factors', v_family_factors,
    'phase36_monitor_compatible', true,
    'exact_parent_policy_reactivation_on_rollback', true,
    'raw_challenger_full_cutover_applied', false,
    'execution_authorized', false,
    'provider_execution_authorized', false,
    'spend_authorized', false,
    'platform_knowledge_written', false,
    'automatic_training_started', false,
    'automatic_model_weight_mutation', false
  );

  return new;
end;
$$;

revoke all on function public.avantiqo_phase42_compact_successor_before_insert_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase42_compact_successor_before_insert_v1()
  to service_role;

drop trigger if exists avantiqo_phase42_compact_successor_before_insert_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;
create trigger avantiqo_phase42_compact_successor_before_insert_v1
before insert on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_phase42_compact_successor_before_insert_v1();

create or replace function public.avantiqo_phase42_append_generation_after_insert_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_latest_layer jsonb;
  v_layer_count integer;
begin
  if coalesce((new.metadata->>'phase42_compaction_authoritative')::boolean, false) is not true then
    return new;
  end if;

  if new.metadata->>'phase42_compaction_contract' <>
      'AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_V1'
    or new.metadata->>'phase42_generation_ledger_contract' <>
      'AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1'
    or coalesce((new.metadata->>'phase42_active_scoring_state_constant_size')::boolean, false) is not true
    or coalesce((new.metadata->>'phase42_full_history_in_generation_ledger')::boolean, false) is not true
    or coalesce((new.metadata->>'phase42_unbounded_active_layer_accumulation')::boolean, true) is not false
  then
    raise exception 'AVANTIQO_PHASE42_COMPACTED_SUCCESSOR_METADATA_INVALID';
  end if;

  if jsonb_typeof(new.metadata->'flattened_residual_layers') <> 'array' then
    raise exception 'AVANTIQO_PHASE42_LATEST_LAYER_ARRAY_INVALID';
  end if;
  v_layer_count := jsonb_array_length(new.metadata->'flattened_residual_layers');
  if v_layer_count <> 1 then
    raise exception 'AVANTIQO_PHASE42_ACTIVE_LAYER_COUNT_NOT_CONSTANT';
  end if;
  v_latest_layer := new.metadata->'flattened_residual_layers'->0;

  insert into public.avantiqo_intelligence_persistent_policy_generations (
    organization_id,
    lineage_root_policy_fingerprint,
    generation_index,
    parent_policy_id,
    parent_policy_fingerprint,
    successor_policy_id,
    successor_policy_fingerprint,
    source_phase38_proposal_fingerprint,
    source_phase40_certification_fingerprint,
    source_phase40_activation_fingerprint,
    source_phase41_release_candidate_fingerprint,
    legacy_phase30_challenger_policy_version,
    legacy_phase30_influence_fraction,
    incremental_influence_fraction,
    global_residual_calibration_factor,
    family_residual_calibration_factors,
    parent_compacted_global_residual_multiplier,
    parent_compacted_family_residual_multipliers,
    compacted_global_residual_multiplier,
    compacted_family_residual_multipliers,
    scoring_state_fingerprint,
    activator_fingerprint,
    metadata
  ) values (
    new.organization_id,
    lower(btrim(new.metadata->>'lineage_root_policy_fingerprint')),
    (new.metadata->>'lineage_generation_index')::integer,
    (
      select id
      from public.avantiqo_intelligence_persistent_ordering_policies
      where organization_id = new.organization_id
        and policy_fingerprint = new.baseline_policy_fingerprint
      limit 1
    ),
    new.baseline_policy_fingerprint,
    new.id,
    new.policy_fingerprint,
    lower(btrim(new.metadata->>'phase42_latest_layer_source_proposal_fingerprint')),
    new.source_certification_fingerprint,
    new.source_activation_fingerprint,
    new.release_candidate_fingerprint,
    new.metadata->>'legacy_phase30_challenger_policy_version',
    (new.metadata->>'legacy_phase30_influence_fraction')::numeric,
    (new.metadata->>'phase42_latest_layer_incremental_influence_fraction')::numeric,
    (new.metadata->>'phase42_latest_layer_global_residual_calibration_factor')::numeric,
    coalesce(new.metadata->'phase42_latest_layer_family_residual_calibration_factors', '{}'::jsonb),
    (new.metadata->>'parent_compacted_global_residual_multiplier')::numeric,
    coalesce(new.metadata->'parent_compacted_family_residual_multipliers', '{}'::jsonb),
    (new.metadata->>'compacted_global_residual_multiplier')::numeric,
    coalesce(new.metadata->'compacted_family_residual_multipliers', '{}'::jsonb),
    lower(btrim(new.metadata->>'scoring_state_fingerprint')),
    new.activator_fingerprint,
    jsonb_build_object(
      'exact_tested_composite_only', true,
      'exact_multiplicative_residual_fold', true,
      'active_scoring_state_constant_size', true,
      'full_history_append_only', true,
      'same_selected_portfolio_only', true,
      'raw_challenger_full_cutover_applied', false,
      'recursive_runtime_policy_stack', false,
      'phase36_monitor_compatible', true,
      'exact_parent_policy_reactivation_on_rollback', true,
      'source_latest_layer', v_latest_layer,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false,
      'platform_knowledge_written', false,
      'automatic_training_started', false,
      'automatic_model_weight_mutation', false
    )
  );

  return new;
end;
$$;

revoke all on function public.avantiqo_phase42_append_generation_after_insert_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase42_append_generation_after_insert_v1()
  to service_role;

drop trigger if exists avantiqo_phase42_append_generation_after_insert_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;
create trigger avantiqo_phase42_append_generation_after_insert_v1
after insert on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_phase42_append_generation_after_insert_v1();

create or replace function public.avantiqo_phase42_reject_generation_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'AVANTIQO_PHASE42_GENERATION_LEDGER_APPEND_ONLY';
end;
$$;

revoke all on function public.avantiqo_phase42_reject_generation_mutation_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase42_reject_generation_mutation_v1()
  to service_role;

drop trigger if exists avantiqo_phase42_generation_ledger_append_only_v1
  on public.avantiqo_intelligence_persistent_policy_generations;
create trigger avantiqo_phase42_generation_ledger_append_only_v1
before update or delete on public.avantiqo_intelligence_persistent_policy_generations
for each row
execute function public.avantiqo_phase42_reject_generation_mutation_v1();

-- Replace only the scoring helper, not Phase 41's governance/activation authority.
-- The helper preserves the old array path for historical compatibility but uses O(1)
-- compacted current/parent multipliers whenever Phase 42 authority is present.
create or replace function public.avantiqo_phase41_composite_score_v1(
  p_baseline_score numeric,
  p_legacy_challenger_score numeric,
  p_candidate_family text,
  p_policy_metadata jsonb,
  p_include_last_layer boolean default true
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_score numeric;
  v_legacy_influence numeric;
  v_layers jsonb;
  v_layer jsonb;
  v_layer_count integer;
  v_layer_index integer := 0;
  v_influence numeric;
  v_factor numeric;
  v_multiplier numeric;
  v_global_multiplier numeric;
  v_family_multipliers jsonb;
  v_family text := upper(btrim(coalesce(p_candidate_family, 'UNSPECIFIED')));
begin
  if p_baseline_score is null or p_baseline_score <= 0
    or p_legacy_challenger_score is null or p_legacy_challenger_score < 0
  then
    raise exception 'AVANTIQO_PHASE41_COMPOSITE_SOURCE_SCORE_INVALID';
  end if;

  v_legacy_influence := (p_policy_metadata->>'legacy_phase30_influence_fraction')::numeric;
  if v_legacy_influence <= 0 or v_legacy_influence > 0.25 then
    raise exception 'AVANTIQO_PHASE41_LEGACY_INFLUENCE_INVALID';
  end if;

  v_score := p_baseline_score * (1 - v_legacy_influence)
    + p_legacy_challenger_score * v_legacy_influence;

  if coalesce((p_policy_metadata->>'phase42_compaction_authoritative')::boolean, false) is true then
    if p_policy_metadata->>'phase42_compaction_contract' <>
        'AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_V1'
      or coalesce((p_policy_metadata->>'phase42_exact_multiplicative_residual_fold')::boolean, false) is not true
      or coalesce((p_policy_metadata->>'phase42_active_scoring_state_constant_size')::boolean, false) is not true
      or coalesce((p_policy_metadata->>'phase42_unbounded_active_layer_accumulation')::boolean, true) is not false
    then
      raise exception 'AVANTIQO_PHASE42_COMPACTED_SCORING_AUTHORITY_INVALID';
    end if;

    if p_include_last_layer is true then
      v_global_multiplier := (p_policy_metadata->>'compacted_global_residual_multiplier')::numeric;
      v_family_multipliers := coalesce(
        p_policy_metadata->'compacted_family_residual_multipliers',
        '{}'::jsonb
      );
    else
      v_global_multiplier := (p_policy_metadata->>'parent_compacted_global_residual_multiplier')::numeric;
      v_family_multipliers := coalesce(
        p_policy_metadata->'parent_compacted_family_residual_multipliers',
        '{}'::jsonb
      );
    end if;

    if v_global_multiplier <= 0 or v_global_multiplier > 1
      or jsonb_typeof(v_family_multipliers) <> 'object'
    then
      raise exception 'AVANTIQO_PHASE42_COMPACTED_SCORING_STATE_INVALID';
    end if;

    v_multiplier := coalesce((v_family_multipliers->>v_family)::numeric, v_global_multiplier);
    if v_multiplier <= 0 or v_multiplier > 1 then
      raise exception 'AVANTIQO_PHASE42_COMPACTED_FAMILY_SCORING_MULTIPLIER_INVALID';
    end if;
    return v_score * v_multiplier;
  end if;

  -- Historical Phase 41 fallback. Future active successors are compacted before insert.
  v_layers := coalesce(p_policy_metadata->'flattened_residual_layers', '[]'::jsonb);
  if jsonb_typeof(v_layers) <> 'array' then
    raise exception 'AVANTIQO_PHASE41_FLATTENED_LAYERS_INVALID';
  end if;
  v_layer_count := jsonb_array_length(v_layers);

  for v_layer in select value from jsonb_array_elements(v_layers)
  loop
    v_layer_index := v_layer_index + 1;
    if p_include_last_layer is false and v_layer_index = v_layer_count then
      exit;
    end if;

    v_influence := (v_layer->>'incremental_influence_fraction')::numeric;
    if v_influence <= 0 or v_influence > 0.25 then
      raise exception 'AVANTIQO_PHASE41_RESIDUAL_LAYER_INFLUENCE_INVALID';
    end if;

    v_factor := coalesce(
      (v_layer->'family_residual_calibration_factors'->>v_family)::numeric,
      (v_layer->>'global_residual_calibration_factor')::numeric
    );
    if v_factor < 0.25 or v_factor > 1 then
      raise exception 'AVANTIQO_PHASE41_RESIDUAL_LAYER_FACTOR_INVALID';
    end if;

    v_score := v_score * (1 - v_influence) + (v_score * v_factor) * v_influence;
  end loop;

  return v_score;
end;
$$;

revoke all on function public.avantiqo_phase41_composite_score_v1(
  numeric, numeric, text, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.avantiqo_phase41_composite_score_v1(
  numeric, numeric, text, jsonb, boolean
) to service_role;

create or replace function public.verify_avantiqo_persistent_policy_generation_v1(
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
  v_parent public.avantiqo_intelligence_persistent_ordering_policies;
  v_ledger_count integer;
  v_ledger public.avantiqo_intelligence_persistent_policy_generations;
  v_folded jsonb;
  v_expected_global numeric;
  v_expected_families jsonb;
  v_expected_fingerprint text;
  v_generation_index integer;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE42_ORGANIZATION_REQUIRED';
  end if;

  select count(*)::integer into v_active_count
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id
    and state = 'ACTIVE';

  if v_active_count = 0 then
    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'NO_ACTIVE_PERSISTENT_POLICY',
      'compacted_successor_active', false,
      'execution_request_generation_allowed', true
    );
  end if;
  if v_active_count <> 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_PERSISTENT_POLICY_AMBIGUOUS_FAIL_CLOSED',
      'compacted_successor_active', false,
      'execution_request_generation_allowed', false
    );
  end if;

  select * into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id
    and state = 'ACTIVE'
  limit 1;

  if coalesce(v_policy.metadata->>'policy_generation_kind', '') <> 'REBASED_SUCCESSOR_COMPOSITE_V1' then
    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_ROOT_PERSISTENT_POLICY_DOES_NOT_REQUIRE_GENERATION_LEDGER',
      'compacted_successor_active', false,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'execution_request_generation_allowed', true
    );
  end if;

  if coalesce((v_policy.metadata->>'phase42_compaction_authoritative')::boolean, false) is not true
    or v_policy.metadata->>'phase42_compaction_contract' <>
      'AVANTIQO_PERSISTENT_POLICY_GENERATION_COMPACTION_V1'
    or v_policy.metadata->>'phase42_generation_ledger_contract' <>
      'AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1'
    or coalesce((v_policy.metadata->>'phase42_exact_multiplicative_residual_fold')::boolean, false) is not true
    or coalesce((v_policy.metadata->>'phase42_active_scoring_state_constant_size')::boolean, false) is not true
    or coalesce((v_policy.metadata->>'phase42_full_history_in_generation_ledger')::boolean, false) is not true
    or coalesce((v_policy.metadata->>'phase42_unbounded_active_layer_accumulation')::boolean, true) is not false
    or coalesce((v_policy.metadata->>'recursive_runtime_policy_stack')::boolean, true) is not false
    or jsonb_typeof(v_policy.metadata->'flattened_residual_layers') <> 'array'
    or jsonb_array_length(v_policy.metadata->'flattened_residual_layers') <> 1
    or coalesce(v_policy.metadata->>'lineage_root_policy_fingerprint', '') !~ '^[a-f0-9]{32,128}$'
    or coalesce(v_policy.metadata->>'lineage_generation_index', '') !~ '^[0-9]+$'
    or coalesce(v_policy.metadata->>'scoring_state_fingerprint', '') !~ '^[a-f0-9]{32,128}$'
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_SUCCESSOR_COMPACTION_METADATA_INVALID_FAIL_CLOSED',
      'compacted_successor_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'execution_request_generation_allowed', false
    );
  end if;

  v_generation_index := (v_policy.metadata->>'lineage_generation_index')::integer;
  select count(*)::integer into v_ledger_count
  from public.avantiqo_intelligence_persistent_policy_generations
  where organization_id = p_organization_id
    and successor_policy_fingerprint = v_policy.policy_fingerprint;

  if v_ledger_count <> 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_SUCCESSOR_GENERATION_LEDGER_AMBIGUOUS_FAIL_CLOSED',
      'compacted_successor_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'generation_ledger_count', v_ledger_count,
      'execution_request_generation_allowed', false
    );
  end if;

  select * into v_ledger
  from public.avantiqo_intelligence_persistent_policy_generations
  where organization_id = p_organization_id
    and successor_policy_fingerprint = v_policy.policy_fingerprint
  limit 1;

  if v_ledger.contract <> 'AVANTIQO_PERSISTENT_POLICY_GENERATION_LEDGER_V1'
    or v_ledger.successor_policy_id <> v_policy.id
    or v_ledger.parent_policy_fingerprint <> v_policy.baseline_policy_fingerprint
    or v_ledger.lineage_root_policy_fingerprint <> v_policy.metadata->>'lineage_root_policy_fingerprint'
    or v_ledger.generation_index <> v_generation_index
    or v_ledger.source_phase38_proposal_fingerprint <> v_policy.metadata->>'phase42_latest_layer_source_proposal_fingerprint'
    or v_ledger.source_phase40_certification_fingerprint <> v_policy.source_certification_fingerprint
    or v_ledger.source_phase40_activation_fingerprint <> v_policy.source_activation_fingerprint
    or v_ledger.source_phase41_release_candidate_fingerprint <> v_policy.release_candidate_fingerprint
    or v_ledger.legacy_phase30_challenger_policy_version <> v_policy.metadata->>'legacy_phase30_challenger_policy_version'
    or v_ledger.legacy_phase30_influence_fraction <> (v_policy.metadata->>'legacy_phase30_influence_fraction')::numeric
    or v_ledger.incremental_influence_fraction <> (v_policy.metadata->>'phase42_latest_layer_incremental_influence_fraction')::numeric
    or v_ledger.global_residual_calibration_factor <> (v_policy.metadata->>'phase42_latest_layer_global_residual_calibration_factor')::numeric
    or v_ledger.family_residual_calibration_factors <> coalesce(v_policy.metadata->'phase42_latest_layer_family_residual_calibration_factors', '{}'::jsonb)
    or v_ledger.parent_compacted_global_residual_multiplier <> (v_policy.metadata->>'parent_compacted_global_residual_multiplier')::numeric
    or v_ledger.parent_compacted_family_residual_multipliers <> coalesce(v_policy.metadata->'parent_compacted_family_residual_multipliers', '{}'::jsonb)
    or v_ledger.compacted_global_residual_multiplier <> (v_policy.metadata->>'compacted_global_residual_multiplier')::numeric
    or v_ledger.compacted_family_residual_multipliers <> coalesce(v_policy.metadata->'compacted_family_residual_multipliers', '{}'::jsonb)
    or v_ledger.scoring_state_fingerprint <> v_policy.metadata->>'scoring_state_fingerprint'
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_SUCCESSOR_LEDGER_METADATA_MISMATCH_FAIL_CLOSED',
      'compacted_successor_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'execution_request_generation_allowed', false
    );
  end if;

  select * into v_parent
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id
    and policy_fingerprint = v_policy.baseline_policy_fingerprint
  limit 1;

  if v_parent.id is null
    or v_parent.id <> v_ledger.parent_policy_id
    or v_parent.state <> 'SUPERSEDED'
    or coalesce(v_parent.metadata->>'phase41_successor_policy_fingerprint', '') <> v_policy.policy_fingerprint
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'ACTIVE_SUCCESSOR_PARENT_LINEAGE_INVALID_FAIL_CLOSED',
      'compacted_successor_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'execution_request_generation_allowed', false
    );
  end if;

  if v_generation_index = 1 then
    if coalesce((v_parent.metadata->>'phase42_compaction_authoritative')::boolean, false) is true
      or v_ledger.lineage_root_policy_fingerprint <> v_parent.policy_fingerprint
      or v_ledger.parent_compacted_global_residual_multiplier <> 1
      or v_ledger.parent_compacted_family_residual_multipliers <> '{}'::jsonb
    then
      return jsonb_build_object(
        'success', false,
        'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
        'status', 'GENERATION_ONE_ROOT_LINEAGE_INVALID_FAIL_CLOSED',
        'compacted_successor_active', true,
        'policy_fingerprint', v_policy.policy_fingerprint,
        'execution_request_generation_allowed', false
      );
    end if;
  else
    if coalesce((v_parent.metadata->>'phase42_compaction_authoritative')::boolean, false) is not true
      or (v_parent.metadata->>'lineage_generation_index')::integer <> v_generation_index - 1
      or v_parent.metadata->>'lineage_root_policy_fingerprint' <> v_ledger.lineage_root_policy_fingerprint
      or (v_parent.metadata->>'compacted_global_residual_multiplier')::numeric <>
        v_ledger.parent_compacted_global_residual_multiplier
      or coalesce(v_parent.metadata->'compacted_family_residual_multipliers', '{}'::jsonb) <>
        v_ledger.parent_compacted_family_residual_multipliers
    then
      return jsonb_build_object(
        'success', false,
        'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
        'status', 'MULTI_GENERATION_PARENT_COMPACTED_STATE_INVALID_FAIL_CLOSED',
        'compacted_successor_active', true,
        'policy_fingerprint', v_policy.policy_fingerprint,
        'execution_request_generation_allowed', false
      );
    end if;
  end if;

  v_folded := public.avantiqo_phase42_fold_residual_layer_v1(
    v_ledger.parent_compacted_global_residual_multiplier,
    v_ledger.parent_compacted_family_residual_multipliers,
    v_ledger.incremental_influence_fraction,
    v_ledger.global_residual_calibration_factor,
    v_ledger.family_residual_calibration_factors
  );
  v_expected_global := (v_folded->>'global_multiplier')::numeric;
  v_expected_families := coalesce(v_folded->'family_multipliers', '{}'::jsonb);

  if v_expected_global <> v_ledger.compacted_global_residual_multiplier
    or v_expected_families <> v_ledger.compacted_family_residual_multipliers
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'COMPACTED_RESIDUAL_FOLD_RECOMPUTATION_MISMATCH_FAIL_CLOSED',
      'compacted_successor_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'execution_request_generation_allowed', false
    );
  end if;

  v_expected_fingerprint := public.avantiqo_phase42_scoring_state_fingerprint_v1(
    p_organization_id,
    v_ledger.lineage_root_policy_fingerprint,
    v_ledger.generation_index,
    v_ledger.legacy_phase30_challenger_policy_version,
    v_ledger.legacy_phase30_influence_fraction,
    v_ledger.parent_compacted_global_residual_multiplier,
    v_ledger.parent_compacted_family_residual_multipliers,
    v_ledger.compacted_global_residual_multiplier,
    v_ledger.compacted_family_residual_multipliers,
    v_ledger.source_phase38_proposal_fingerprint,
    v_ledger.incremental_influence_fraction
  );

  if v_expected_fingerprint <> v_ledger.scoring_state_fingerprint then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
      'status', 'SCORING_STATE_FINGERPRINT_MISMATCH_FAIL_CLOSED',
      'compacted_successor_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'execution_request_generation_allowed', false
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1',
    'status', 'ACTIVE_SUCCESSOR_GENERATION_INTEGRITY_VERIFIED',
    'compacted_successor_active', true,
    'policy_fingerprint', v_policy.policy_fingerprint,
    'lineage_root_policy_fingerprint', v_ledger.lineage_root_policy_fingerprint,
    'generation_index', v_ledger.generation_index,
    'scoring_state_fingerprint', v_ledger.scoring_state_fingerprint,
    'active_scoring_state_constant_size', true,
    'exact_multiplicative_residual_fold', true,
    'full_history_append_only', true,
    'execution_request_generation_allowed', true,
    'execution_authorized', false,
    'provider_execution_authorized', false,
    'spend_authorized', false
  );
end;
$$;

revoke all on function public.verify_avantiqo_persistent_policy_generation_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_avantiqo_persistent_policy_generation_v1(uuid)
  to service_role;
