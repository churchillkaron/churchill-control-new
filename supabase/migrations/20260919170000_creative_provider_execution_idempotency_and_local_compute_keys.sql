create extension if not exists pgcrypto with schema extensions;

alter table public.avantiqo_local_compute_jobs
  add column if not exists execution_key text,
  add column if not exists request_hash text;

create unique index if not exists avantiqo_local_compute_jobs_execution_key_uidx
  on public.avantiqo_local_compute_jobs (organization_id, execution_key)
  where execution_key is not null;

comment on column public.avantiqo_local_compute_jobs.execution_key is
  'Durable caller-supplied idempotency key. The same organization/execution key may create at most one local compute job.';

create unique index if not exists creative_asset_nodes_image_production_proof_hash_uidx
  on public.creative_asset_nodes (
    organization_id,
    type,
    (metadata->>'image_production_proof_hash')
  )
  where metadata->>'image_production_proof_hash' is not null;

comment on index public.creative_asset_nodes_image_production_proof_hash_uidx is
  'Immutable Image Studio production proof manifests are unique by organization/type/content hash.';

create or replace function public.submit_avantiqo_local_compute_job_idempotent(
  p_organization_id uuid,
  p_usage_id text,
  p_capability text,
  p_lane text,
  p_workload text,
  p_model text,
  p_payload jsonb,
  p_priority integer,
  p_max_attempts integer,
  p_execution_key text,
  p_request_hash text
)
returns public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job public.avantiqo_local_compute_jobs;
  v_key text := nullif(btrim(coalesce(p_execution_key,'')),'');
  v_hash text := lower(btrim(coalesce(p_request_hash,'')));
begin
  if p_organization_id is null then raise exception 'AVANTIQO_LOCAL_JOB_ORGANIZATION_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_capability,'')),'') is null then raise exception 'AVANTIQO_LOCAL_JOB_CAPABILITY_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_workload,'')),'') is null then raise exception 'AVANTIQO_LOCAL_JOB_WORKLOAD_REQUIRED'; end if;
  if v_key is null then raise exception 'AVANTIQO_LOCAL_JOB_EXECUTION_KEY_REQUIRED'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'AVANTIQO_LOCAL_JOB_REQUEST_HASH_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '|' || v_key, 0));

  select * into v_job
  from public.avantiqo_local_compute_jobs j
  where j.organization_id = p_organization_id
    and j.execution_key = v_key
  for update;

  if found then
    if coalesce(v_job.request_hash,'') <> v_hash
       or v_job.capability <> btrim(p_capability)
       or v_job.workload <> btrim(p_workload) then
      raise exception 'AVANTIQO_LOCAL_JOB_EXECUTION_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    return v_job;
  end if;

  insert into public.avantiqo_local_compute_jobs (
    organization_id,
    usage_id,
    capability,
    lane,
    workload,
    model,
    payload,
    priority,
    max_attempts,
    execution_key,
    request_hash
  ) values (
    p_organization_id,
    nullif(btrim(coalesce(p_usage_id,'')),''),
    btrim(p_capability),
    coalesce(nullif(btrim(coalesce(p_lane,'')),''),'utility'),
    btrim(p_workload),
    nullif(btrim(coalesce(p_model,'')),''),
    coalesce(p_payload,'{}'::jsonb),
    coalesce(p_priority,0),
    greatest(1,least(coalesce(p_max_attempts,2),10)),
    v_key,
    v_hash
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.submit_avantiqo_local_compute_job_idempotent(uuid,text,text,text,text,text,jsonb,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_avantiqo_local_compute_job_idempotent(uuid,text,text,text,text,text,jsonb,integer,integer,text,text) to service_role;


create table if not exists public.creative_provider_execution_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid references public.creative_production_tasks(id) on delete cascade,
  execution_key text not null,
  request_hash text not null,
  capability text not null,
  provider text,
  model text,
  usage_id text,
  provider_job_id text,
  status text not null default 'PREPARED',
  ambiguous_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  ambiguous_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint creative_provider_execution_claims_execution_key_check
    check (length(btrim(execution_key)) between 8 and 300),
  constraint creative_provider_execution_claims_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint creative_provider_execution_claims_status_check
    check (status in ('PREPARED','SUBMITTING','SUBMITTED','COMPLETED','FAILED','AMBIGUOUS'))
);

create unique index if not exists creative_provider_execution_claims_org_key_uidx
  on public.creative_provider_execution_claims (organization_id, execution_key);

create unique index if not exists creative_provider_execution_claims_task_uidx
  on public.creative_provider_execution_claims (task_id)
  where task_id is not null;

create unique index if not exists creative_provider_execution_claims_provider_job_uidx
  on public.creative_provider_execution_claims (provider, provider_job_id)
  where provider is not null and provider_job_id is not null;

alter table public.creative_provider_execution_claims enable row level security;
revoke all on table public.creative_provider_execution_claims from public, anon, authenticated;
grant all on table public.creative_provider_execution_claims to service_role;

create or replace function public.claim_creative_provider_execution(
  p_organization_id uuid,
  p_task_id uuid,
  p_execution_key text,
  p_request_hash text,
  p_capability text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  claim_id uuid,
  status text,
  submission_allowed boolean,
  provider text,
  model text,
  usage_id text,
  provider_job_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims%rowtype;
  v_key text := btrim(coalesce(p_execution_key,''));
  v_hash text := lower(btrim(coalesce(p_request_hash,'')));
  v_capability text := btrim(coalesce(p_capability,''));
begin
  if p_organization_id is null then raise exception 'CREATIVE_PROVIDER_EXECUTION_ORGANIZATION_REQUIRED'; end if;
  if length(v_key) < 8 then raise exception 'CREATIVE_PROVIDER_EXECUTION_KEY_REQUIRED'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'CREATIVE_PROVIDER_EXECUTION_REQUEST_HASH_INVALID'; end if;
  if v_capability = '' then raise exception 'CREATIVE_PROVIDER_EXECUTION_CAPABILITY_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '|' || v_key, 0));

  select * into v_claim
  from public.creative_provider_execution_claims c
  where c.organization_id = p_organization_id
    and c.execution_key = v_key
  for update;

  if found then
    if v_claim.request_hash <> v_hash or v_claim.capability <> v_capability then
      raise exception 'CREATIVE_PROVIDER_EXECUTION_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    if v_claim.status = 'PREPARED' then
      return query
      select v_claim.id, v_claim.status, true, v_claim.provider, v_claim.model, v_claim.usage_id, v_claim.provider_job_id;
      return;
    end if;
    if (
      v_claim.status = 'FAILED'
      and v_claim.submitted_at is null
      and v_claim.provider_job_id is null
      and v_claim.provider is null
    ) then
      update public.creative_provider_execution_claims
      set
        status = 'PREPARED',
        failed_at = null,
        ambiguous_reason = null,
        updated_at = now(),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'safe_pre_submission_retry_at', now(),
          'safe_pre_submission_retry', true
        )
      where id = v_claim.id
      returning * into v_claim;
      return query
      select v_claim.id, v_claim.status, true, v_claim.provider, v_claim.model, v_claim.usage_id, v_claim.provider_job_id;
      return;
    end if;
    return query
    select v_claim.id, v_claim.status, false, v_claim.provider, v_claim.model, v_claim.usage_id, v_claim.provider_job_id;
    return;
  end if;

  insert into public.creative_provider_execution_claims (
    organization_id, task_id, execution_key, request_hash, capability, status, metadata
  ) values (
    p_organization_id, p_task_id, v_key, v_hash, v_capability, 'PREPARED',
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
      'contract','CREATIVE_PROVIDER_EXECUTION_EXACTLY_ONCE_V1',
      'automatic_resubmission_after_ambiguous_forbidden',true
    )
  )
  returning * into v_claim;

  return query
  select v_claim.id, v_claim.status, true, v_claim.provider, v_claim.model, v_claim.usage_id, v_claim.provider_job_id;
end;
$$;

create or replace function public.mark_creative_provider_execution_submitting(
  p_claim_id uuid
)
returns public.creative_provider_execution_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims;
begin
  update public.creative_provider_execution_claims
  set
    status = 'SUBMITTING',
    updated_at = now(),
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'provider_call_started_at', now(),
      'provider_call_started', true
    )
  where id = p_claim_id
    and status = 'PREPARED'
  returning * into v_claim;
  if v_claim.id is null then
    select * into v_claim from public.creative_provider_execution_claims where id = p_claim_id;
  end if;
  return v_claim;
end;
$$;

create or replace function public.mark_creative_provider_execution_submitted(
  p_claim_id uuid,
  p_provider text,
  p_model text,
  p_usage_id text,
  p_provider_job_id text
)
returns public.creative_provider_execution_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims;
begin
  update public.creative_provider_execution_claims
  set
    status = 'SUBMITTED',
    provider = nullif(btrim(coalesce(p_provider,'')),''),
    model = nullif(btrim(coalesce(p_model,'')),''),
    usage_id = nullif(btrim(coalesce(p_usage_id,'')),''),
    provider_job_id = nullif(btrim(coalesce(p_provider_job_id,'')),''),
    submitted_at = coalesce(submitted_at, now()),
    updated_at = now()
  where id = p_claim_id
    and status in ('SUBMITTING','SUBMITTED')
  returning * into v_claim;
  if v_claim.id is null then raise exception 'CREATIVE_PROVIDER_EXECUTION_NOT_SUBMITTABLE'; end if;
  return v_claim;
end;
$$;

create or replace function public.mark_creative_provider_execution_completed(
  p_claim_id uuid,
  p_provider text,
  p_model text,
  p_usage_id text,
  p_provider_job_id text default null
)
returns public.creative_provider_execution_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims;
begin
  update public.creative_provider_execution_claims
  set
    status = 'COMPLETED',
    provider = coalesce(nullif(btrim(coalesce(p_provider,'')),''), provider),
    model = coalesce(nullif(btrim(coalesce(p_model,'')),''), model),
    usage_id = coalesce(nullif(btrim(coalesce(p_usage_id,'')),''), usage_id),
    provider_job_id = coalesce(nullif(btrim(coalesce(p_provider_job_id,'')),''), provider_job_id),
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where id = p_claim_id
    and status in ('SUBMITTING','SUBMITTED','COMPLETED')
  returning * into v_claim;
  if v_claim.id is null then raise exception 'CREATIVE_PROVIDER_EXECUTION_NOT_COMPLETABLE'; end if;
  return v_claim;
end;
$$;

create or replace function public.mark_creative_provider_execution_ambiguous(
  p_claim_id uuid,
  p_reason text
)
returns public.creative_provider_execution_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims;
begin
  update public.creative_provider_execution_claims
  set
    status = 'AMBIGUOUS',
    ambiguous_reason = left(coalesce(nullif(btrim(p_reason),''),'UNKNOWN_PROVIDER_SUBMISSION_STATE'),500),
    ambiguous_at = coalesce(ambiguous_at, now()),
    updated_at = now()
  where id = p_claim_id
    and status in ('SUBMITTING','SUBMITTED')
  returning * into v_claim;
  if v_claim.id is null then
    select * into v_claim from public.creative_provider_execution_claims where id = p_claim_id;
  end if;
  return v_claim;
end;
$$;

create or replace function public.mark_creative_provider_execution_failed_terminal(
  p_claim_id uuid,
  p_reason text
)
returns public.creative_provider_execution_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims;
begin
  update public.creative_provider_execution_claims
  set
    status = 'FAILED',
    ambiguous_reason = left(coalesce(nullif(btrim(p_reason),''),'PROVIDER_EXECUTION_FAILED'),500),
    failed_at = coalesce(failed_at, now()),
    updated_at = now(),
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'provider_submission_attempted', true,
      'automatic_resubmission_forbidden', true
    )
  where id = p_claim_id
    and status in ('SUBMITTING','SUBMITTED')
  returning * into v_claim;
  if v_claim.id is null then
    select * into v_claim from public.creative_provider_execution_claims where id = p_claim_id;
  end if;
  return v_claim;
end;
$$;

create or replace function public.mark_creative_provider_execution_failed_pre_submission(
  p_claim_id uuid,
  p_reason text
)
returns public.creative_provider_execution_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.creative_provider_execution_claims;
begin
  update public.creative_provider_execution_claims
  set
    status = 'FAILED',
    ambiguous_reason = left(coalesce(nullif(btrim(p_reason),''),'PRE_SUBMISSION_FAILURE'),500),
    failed_at = coalesce(failed_at, now()),
    updated_at = now()
  where id = p_claim_id
    and status = 'PREPARED'
  returning * into v_claim;
  if v_claim.id is null then
    select * into v_claim from public.creative_provider_execution_claims where id = p_claim_id;
  end if;
  return v_claim;
end;
$$;

revoke all on function public.claim_creative_provider_execution(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.mark_creative_provider_execution_submitting(uuid) from public,anon,authenticated;
revoke all on function public.mark_creative_provider_execution_submitted(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_creative_provider_execution_completed(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_creative_provider_execution_ambiguous(uuid,text) from public,anon,authenticated;
revoke all on function public.mark_creative_provider_execution_failed_terminal(uuid,text) from public,anon,authenticated;
revoke all on function public.mark_creative_provider_execution_failed_pre_submission(uuid,text) from public,anon,authenticated;

grant execute on function public.claim_creative_provider_execution(uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.mark_creative_provider_execution_submitting(uuid) to service_role;
grant execute on function public.mark_creative_provider_execution_submitted(uuid,text,text,text,text) to service_role;
grant execute on function public.mark_creative_provider_execution_completed(uuid,text,text,text,text) to service_role;
grant execute on function public.mark_creative_provider_execution_ambiguous(uuid,text) to service_role;
grant execute on function public.mark_creative_provider_execution_failed_terminal(uuid,text) to service_role;
grant execute on function public.mark_creative_provider_execution_failed_pre_submission(uuid,text) to service_role;

comment on table public.creative_provider_execution_claims is
  'Durable exactly-once provider submission fence. SUBMITTING/AMBIGUOUS claims are never automatically resubmitted.';
