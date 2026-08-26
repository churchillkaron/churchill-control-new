-- Phase 25: make Intelligence RunPod lease provenance non-bypassable at claim/receipt insert.

create or replace function public.avantiqo_enforce_intelligence_runpod_lease_provenance()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_endpoint_id text;
  v_claim_fingerprint text;
  v_claim_metadata jsonb;
  v_lease public.avantiqo_intelligence_runpod_leases;
  v_execution_started_at timestamptz;
begin
  v_mode := upper(btrim(coalesce(new.metadata->>'execution_mode', '')));
  if v_mode <> 'RUNPOD_GPU' then
    return new;
  end if;

  if new.memory_scope = 'platform_learning_experiment_execution_claims' then
    v_endpoint_id := btrim(coalesce(new.metadata->>'runpod_endpoint_id', ''));
    if v_endpoint_id = '' then
      raise exception 'AVANTIQO_PHASE25_RUNPOD_ENDPOINT_REQUIRED';
    end if;

    select * into v_lease
    from public.avantiqo_intelligence_runpod_leases
    where organization_id = new.organization_id
      and endpoint_id = v_endpoint_id
      and lane = 'intelligence-experiment'
      and contract = 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1'
      and safe_lease_contract = 'AVANTIQO_RUNPOD_SAFE_LEASE_V2'
      and state = 'ACTIVE'
      and expires_at > now()
    order by acquired_at desc
    limit 1;

    if v_lease.id is null then
      raise exception 'AVANTIQO_PHASE25_ACTIVE_PERSISTED_RUNPOD_LEASE_REQUIRED';
    end if;

    new.metadata := new.metadata || jsonb_build_object(
      'runpod_intelligence_lease_contract', v_lease.contract,
      'runpod_intelligence_lease_id', v_lease.id::text,
      'runpod_intelligence_lease_owner_request_id', v_lease.owner_request_id::text,
      'runpod_intelligence_lease_acquired_at', v_lease.acquired_at,
      'runpod_intelligence_lease_expires_at', v_lease.expires_at,
      'runpod_safe_lease_db_persisted', true,
      'runpod_safe_lease_db_verified_at_claim_insert', true,
      'phase25_runpod_lease_provenance_enforced_by_database', true
    );
    return new;
  end if;

  if new.memory_scope = 'platform_learning_experiment_execution_receipts' then
    v_endpoint_id := btrim(coalesce(new.metadata->>'runpod_endpoint_id', ''));
    v_claim_fingerprint := btrim(coalesce(new.metadata->>'claim_fingerprint', ''));
    if v_endpoint_id = '' or v_claim_fingerprint = '' then
      raise exception 'AVANTIQO_PHASE25_RUNPOD_RECEIPT_BINDING_REQUIRED';
    end if;

    select metadata into v_claim_metadata
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_claims'
      and metadata->>'claim_fingerprint' = v_claim_fingerprint
    order by created_at desc
    limit 1;

    if v_claim_metadata is null
      or coalesce((v_claim_metadata->>'runpod_safe_lease_db_persisted')::boolean, false) is not true
      or btrim(coalesce(v_claim_metadata->>'runpod_intelligence_lease_id', '')) = ''
      or btrim(coalesce(v_claim_metadata->>'runpod_endpoint_id', '')) <> v_endpoint_id
    then
      raise exception 'AVANTIQO_PHASE25_CLAIM_PERSISTED_RUNPOD_LEASE_BINDING_REQUIRED';
    end if;

    select * into v_lease
    from public.avantiqo_intelligence_runpod_leases
    where id = (v_claim_metadata->>'runpod_intelligence_lease_id')::uuid
      and organization_id = new.organization_id
      and endpoint_id = v_endpoint_id
      and contract = 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1'
      and safe_lease_contract = 'AVANTIQO_RUNPOD_SAFE_LEASE_V2'
    limit 1;

    if v_lease.id is null then
      raise exception 'AVANTIQO_PHASE25_PERSISTED_RUNPOD_LEASE_NOT_FOUND';
    end if;

    begin
      v_execution_started_at := (new.metadata->>'execution_started_at')::timestamptz;
    exception when others then
      raise exception 'AVANTIQO_PHASE25_EXECUTION_START_REQUIRED';
    end;

    if v_execution_started_at < v_lease.acquired_at - interval '5 minutes'
      or v_execution_started_at > v_lease.expires_at
    then
      raise exception 'AVANTIQO_PHASE25_EXECUTION_START_OUTSIDE_PERSISTED_LEASE_WINDOW';
    end if;

    new.metadata := new.metadata || jsonb_build_object(
      'runpod_intelligence_lease_contract', v_lease.contract,
      'runpod_intelligence_lease_id', v_lease.id::text,
      'runpod_intelligence_lease_owner_request_id', v_lease.owner_request_id::text,
      'runpod_intelligence_lease_state_at_receipt', v_lease.state,
      'runpod_intelligence_lease_acquired_at', v_lease.acquired_at,
      'runpod_intelligence_lease_expires_at', v_lease.expires_at,
      'runpod_safe_lease_db_persisted', true,
      'runpod_safe_lease_db_verified_at_receipt_insert', true,
      'runpod_execution_started_inside_persisted_lease_window', true,
      'phase25_runpod_lease_provenance_enforced_by_database', true
    );
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_enforce_intelligence_runpod_lease_provenance() from public, anon, authenticated;

drop trigger if exists avantiqo_intelligence_runpod_lease_provenance_guard on public.intelligence_memories;
create trigger avantiqo_intelligence_runpod_lease_provenance_guard
before insert on public.intelligence_memories
for each row
when (new.memory_scope in (
  'platform_learning_experiment_execution_claims',
  'platform_learning_experiment_execution_receipts'
))
execute function public.avantiqo_enforce_intelligence_runpod_lease_provenance();
