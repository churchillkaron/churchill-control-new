create table if not exists public.creative_one_time_execution_claims (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.creative_production_tasks(id) on delete cascade,
  organization_id uuid not null,
  execution_contract text not null,
  token_sha256 text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  requested_via text not null default 'SERVICE_ROLE',
  publication_authorized boolean not null default false,
  media_regeneration_authorized boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_one_time_execution_claim_token_sha256_check
    check (token_sha256 ~ '^[0-9a-f]{64}$'),
  constraint creative_one_time_execution_claim_contract_check
    check (length(btrim(execution_contract)) > 0),
  constraint creative_one_time_execution_claim_expiry_check
    check (expires_at > created_at),
  constraint creative_one_time_execution_claim_not_both_consumed_revoked_check
    check (not (consumed_at is not null and revoked_at is not null)),
  unique (task_id, execution_contract, token_sha256)
);

create index if not exists creative_one_time_execution_claims_task_idx
  on public.creative_one_time_execution_claims (task_id, execution_contract, created_at desc);

create unique index if not exists creative_one_time_execution_claims_active_idx
  on public.creative_one_time_execution_claims (task_id, execution_contract)
  where consumed_at is null and revoked_at is null;

alter table public.creative_one_time_execution_claims enable row level security;

revoke all on table public.creative_one_time_execution_claims from public;
revoke all on table public.creative_one_time_execution_claims from anon;
revoke all on table public.creative_one_time_execution_claims from authenticated;
grant all on table public.creative_one_time_execution_claims to service_role;

create or replace function public.prepare_creative_one_time_task_execution(
  p_task_id uuid,
  p_token_sha256 text,
  p_execution_contract text,
  p_expires_at timestamptz,
  p_requested_via text default 'SERVICE_ROLE'
)
returns table (
  claim_id uuid,
  task_id uuid,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.creative_production_tasks%rowtype;
  v_claim public.creative_one_time_execution_claims%rowtype;
  v_contract text := btrim(coalesce(p_execution_contract, ''));
  v_requested_via text := btrim(coalesce(p_requested_via, ''));
begin
  if lower(coalesce(p_token_sha256, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'ONE_TIME_EXECUTION_TOKEN_SHA256_INVALID';
  end if;
  if v_contract = '' then
    raise exception 'ONE_TIME_EXECUTION_CONTRACT_REQUIRED';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'ONE_TIME_EXECUTION_EXPIRY_REQUIRED';
  end if;
  if p_expires_at > now() + interval '1 hour' then
    raise exception 'ONE_TIME_EXECUTION_EXPIRY_TOO_LONG';
  end if;
  if v_requested_via = '' then
    v_requested_via := 'SERVICE_ROLE';
  end if;

  select *
  into v_task
  from public.creative_production_tasks t
  where t.id = p_task_id
  for update;

  if not found then
    raise exception 'ONE_TIME_EXECUTION_TASK_NOT_FOUND';
  end if;
  if v_task.status not in ('FAILED', 'WAITING') then
    raise exception 'ONE_TIME_EXECUTION_TASK_NOT_PREPARABLE:%', v_task.status;
  end if;

  update public.creative_one_time_execution_claims c
  set
    revoked_at = now(),
    updated_at = now(),
    metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
      'revocation_reason', 'REPLACED_BY_NEW_ONE_TIME_EXECUTION_CLAIM'
    )
  where c.task_id = p_task_id
    and c.execution_contract = v_contract
    and c.consumed_at is null
    and c.revoked_at is null;

  insert into public.creative_one_time_execution_claims (
    task_id,
    organization_id,
    execution_contract,
    token_sha256,
    expires_at,
    requested_via,
    publication_authorized,
    media_regeneration_authorized,
    metadata
  ) values (
    p_task_id,
    v_task.organization_id,
    v_contract,
    lower(p_token_sha256),
    p_expires_at,
    v_requested_via,
    false,
    false,
    jsonb_build_object(
      'prepared_from_status', v_task.status,
      'security_contract', 'CREATIVE_ONE_TIME_EXECUTION_CLAIM_LEDGER_V1'
    )
  )
  returning * into v_claim;

  update public.creative_production_tasks t
  set
    status = 'WAITING',
    error = null,
    metadata = (
      coalesce(t.metadata, '{}'::jsonb)
      - 'one_time_execution_token_sha256'
      - 'one_time_execution_expires_epoch_ms'
      - 'one_time_execution_expires_at_epoch'
      - 'one_time_execution_consumed_at'
    ) || jsonb_build_object(
      'one_time_execution_contract', v_contract,
      'one_time_execution_claim_id', v_claim.id,
      'one_time_execution_prepared_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'one_time_execution_expires_at', to_char(p_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'one_time_execution_token_validated', false,
      'one_time_execution_requested_via', v_requested_via,
      'one_time_execution_publication_authorized', false,
      'one_time_execution_media_regeneration_authorized', false,
      'publication_authorized', false,
      'media_regeneration_authorized', false
    ),
    updated_at = now()
  where t.id = p_task_id;

  return query
  select v_claim.id, v_claim.task_id, 'WAITING'::text, v_claim.expires_at;
end;
$$;

create or replace function public.claim_creative_one_time_task_execution(
  p_task_id uuid,
  p_token_sha256 text,
  p_execution_contract text
)
returns table (
  id uuid,
  status text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.creative_production_tasks%rowtype;
  v_claim public.creative_one_time_execution_claims%rowtype;
begin
  select *
  into v_task
  from public.creative_production_tasks t
  where t.id = p_task_id
  for update;

  if not found or v_task.status <> 'WAITING' then
    return;
  end if;

  update public.creative_one_time_execution_claims c
  set
    consumed_at = now(),
    updated_at = now()
  where c.task_id = p_task_id
    and c.organization_id = v_task.organization_id
    and c.execution_contract = btrim(coalesce(p_execution_contract, ''))
    and c.token_sha256 = lower(coalesce(p_token_sha256, ''))
    and c.consumed_at is null
    and c.revoked_at is null
    and c.expires_at > now()
    and c.publication_authorized = false
    and c.media_regeneration_authorized = false
  returning c.* into v_claim;

  if v_claim.id is null then
    return;
  end if;

  return query
  update public.creative_production_tasks t
  set
    status = 'READY',
    metadata = (
      coalesce(t.metadata, '{}'::jsonb)
      - 'one_time_execution_token_sha256'
      - 'one_time_execution_expires_epoch_ms'
      - 'one_time_execution_expires_at_epoch'
    ) || jsonb_build_object(
      'one_time_execution_contract', v_claim.execution_contract,
      'one_time_execution_claim_id', v_claim.id,
      'one_time_execution_consumed_at', to_char(v_claim.consumed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'one_time_execution_token_validated', true,
      'one_time_execution_requested_via', v_claim.requested_via,
      'one_time_execution_publication_authorized', false,
      'one_time_execution_media_regeneration_authorized', false
    ),
    updated_at = now()
  where t.id = p_task_id
    and t.status = 'WAITING'
  returning t.id, t.status, t.metadata;

  if not found then
    raise exception 'ONE_TIME_EXECUTION_TASK_STATE_CHANGED';
  end if;
end;
$$;

revoke all on function public.prepare_creative_one_time_task_execution(uuid, text, text, timestamptz, text) from public;
revoke all on function public.prepare_creative_one_time_task_execution(uuid, text, text, timestamptz, text) from anon;
revoke all on function public.prepare_creative_one_time_task_execution(uuid, text, text, timestamptz, text) from authenticated;
grant execute on function public.prepare_creative_one_time_task_execution(uuid, text, text, timestamptz, text) to service_role;

revoke all on function public.claim_creative_one_time_task_execution(uuid, text, text) from public;
revoke all on function public.claim_creative_one_time_task_execution(uuid, text, text) from anon;
revoke all on function public.claim_creative_one_time_task_execution(uuid, text, text) from authenticated;
grant execute on function public.claim_creative_one_time_task_execution(uuid, text, text) to service_role;
