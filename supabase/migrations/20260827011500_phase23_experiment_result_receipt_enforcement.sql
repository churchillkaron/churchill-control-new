-- Avantiqo Intelligence Phase 23
-- Fail closed on experiment execution provenance at the database boundary.

create or replace function public.avantiqo_enforce_learning_execution_provenance()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_consumed_at timestamptz;
  v_receipt_count integer := 0;
  v_receipt_fingerprint text;
  v_claim_fingerprint text;
  v_version_fingerprint text;
  v_requested_receipt_fingerprint text;
begin
  if new.memory_scope = 'platform_learning_experiment_execution_receipts' then
    if coalesce(new.metadata->>'execution_started_at', '') = '' then
      raise exception 'AVANTIQO_PHASE23_EXECUTION_STARTED_AT_REQUIRED';
    end if;
    if coalesce(new.metadata->>'execution_completed_at', '') = '' then
      raise exception 'AVANTIQO_PHASE23_EXECUTION_COMPLETED_AT_REQUIRED';
    end if;
    if coalesce(new.metadata->>'claim_consumed_at', '') = '' then
      raise exception 'AVANTIQO_PHASE23_CLAIM_CONSUMED_AT_REQUIRED';
    end if;

    v_started_at := (new.metadata->>'execution_started_at')::timestamptz;
    v_completed_at := (new.metadata->>'execution_completed_at')::timestamptz;
    v_consumed_at := (new.metadata->>'claim_consumed_at')::timestamptz;

    if v_completed_at < v_started_at then
      raise exception 'AVANTIQO_PHASE23_EXECUTION_COMPLETED_BEFORE_START';
    end if;
    if v_started_at < v_consumed_at - interval '5 minutes'
       or v_started_at > v_consumed_at + interval '5 minutes' then
      raise exception 'AVANTIQO_PHASE23_EXECUTION_START_OUTSIDE_CLAIM_WINDOW';
    end if;
    if coalesce(new.metadata->>'executed_at', '') <> ''
       and (new.metadata->>'executed_at')::timestamptz <> v_completed_at then
      raise exception 'AVANTIQO_PHASE23_EXECUTED_AT_ALIAS_MISMATCH';
    end if;

    new.metadata := new.metadata || jsonb_build_object(
      'executed_at', new.metadata->>'execution_completed_at',
      'execution_start_bound_to_claim_consumption', true,
      'long_running_execution_completion_allowed', true,
      'phase23_provenance_enforced_by_database', true
    );
    return new;
  end if;

  if new.memory_scope in (
    'platform_learning_experiment_results',
    'platform_learning_transfer_experiment_results'
  ) then
    if coalesce(new.metadata->>'experiment_fingerprint', '') = ''
       or coalesce(new.metadata->>'evidence_fingerprint', '') = '' then
      raise exception 'AVANTIQO_PHASE23_RESULT_PROVENANCE_KEYS_REQUIRED';
    end if;

    v_requested_receipt_fingerprint := coalesce(
      new.metadata->>'execution_receipt_fingerprint',
      ''
    );

    select
      count(*)::integer,
      max(r.metadata->>'execution_receipt_fingerprint'),
      max(r.metadata->>'claim_fingerprint'),
      max(r.metadata->>'experiment_version_fingerprint')
    into
      v_receipt_count,
      v_receipt_fingerprint,
      v_claim_fingerprint,
      v_version_fingerprint
    from public.intelligence_memories r
    where r.organization_id = new.organization_id
      and r.memory_scope = 'platform_learning_experiment_execution_receipts'
      and r.active = true
      and r.metadata @> jsonb_build_object(
        'contract', 'AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1',
        'status', 'IMMUTABLE_EXECUTION_RECEIPT_RECORDED',
        'immutable_provenance_record', true,
        'execution_status', 'COMPLETED'
      )
      and r.metadata->>'experiment_fingerprint' = new.metadata->>'experiment_fingerprint'
      and r.metadata->>'evidence_fingerprint' = new.metadata->>'evidence_fingerprint'
      and (
        v_requested_receipt_fingerprint = ''
        or r.metadata->>'execution_receipt_fingerprint' = v_requested_receipt_fingerprint
      )
      and (
        new.memory_scope <> 'platform_learning_experiment_results'
        or r.metadata->>'measurement_fingerprint' = new.metadata->>'measurement_fingerprint'
      )
      and (
        new.memory_scope <> 'platform_learning_transfer_experiment_results'
        or r.metadata->>'executed_at' = new.metadata->>'executed_at'
      );

    if v_receipt_count <> 1 then
      raise exception 'AVANTIQO_PHASE23_EXACT_COMPLETED_EXECUTION_RECEIPT_REQUIRED count=%', v_receipt_count;
    end if;

    new.metadata := new.metadata || jsonb_build_object(
      'execution_receipt_fingerprint', v_receipt_fingerprint,
      'execution_claim_fingerprint', v_claim_fingerprint,
      'experiment_version_fingerprint', v_version_fingerprint,
      'execution_provenance_verified', true,
      'receipt_enforced_by_database', true,
      'result_ingress_bypass_allowed', false
    );
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_enforce_learning_execution_provenance() from public;
revoke all on function public.avantiqo_enforce_learning_execution_provenance() from anon;
revoke all on function public.avantiqo_enforce_learning_execution_provenance() from authenticated;

comment on function public.avantiqo_enforce_learning_execution_provenance() is
'Avantiqo Phase 23 fail-closed execution provenance guard. Receipt rows require claim-bound start/completion timestamps; scientific and transfer result rows require exactly one completed immutable execution receipt.';

drop trigger if exists avantiqo_learning_execution_provenance_guard on public.intelligence_memories;
create trigger avantiqo_learning_execution_provenance_guard
before insert on public.intelligence_memories
for each row
execute function public.avantiqo_enforce_learning_execution_provenance();
