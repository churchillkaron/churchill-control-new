begin;

create table if not exists public.onboarding_provision_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  request_id uuid not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  state text not null default 'PROCESSING'
    check (state in ('PROCESSING','PROVISIONED','SUCCEEDED','FAILED')),
  attempt_id uuid not null,
  organization_id uuid not null,
  response_payload jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  provisioned_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (state <> 'SUCCEEDED' or (response_payload is not null and completed_at is not null)),
  check (state <> 'FAILED' or failed_at is not null),
  unique (auth_user_id, request_id)
);

create index if not exists onboarding_provision_requests_state_started_idx
  on public.onboarding_provision_requests(state, started_at);

alter table public.onboarding_provision_requests enable row level security;
revoke all on table public.onboarding_provision_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.onboarding_provision_requests to service_role;

comment on table public.onboarding_provision_requests is
  'Server-only exact-request idempotency ledger for Business and Accounting Firm organization onboarding.';

create or replace function public.retire_stale_onboarding_provision_request(
  p_request_row_id uuid,
  p_attempt_id uuid,
  p_organization_id uuid,
  p_stale_before timestamptz
)
returns table (
  outcome text,
  request_state text,
  organization_status text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.onboarding_provision_requests%rowtype;
  v_org public.organizations%rowtype;
  v_now timestamptz := now();
begin
  select *
  into v_request
  from public.onboarding_provision_requests
  where id = p_request_row_id
    and attempt_id = p_attempt_id
    and organization_id = p_organization_id
  for update;

  if not found then
    return query select 'REQUEST_CHANGED'::text, null::text, null::text;
    return;
  end if;

  if v_request.state <> 'PROCESSING' or v_request.started_at > p_stale_before then
    return query select 'REQUEST_NOT_STALE'::text, v_request.state, null::text;
    return;
  end if;

  select *
  into v_org
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then
    return query select 'ORGANIZATION_MISSING'::text, v_request.state, null::text;
    return;
  end if;

  if v_org.organization_status = 'ACTIVE' then
    update public.onboarding_provision_requests
    set state = 'PROVISIONED',
        provisioned_at = coalesce(provisioned_at, v_now),
        failed_at = null,
        error_message = null,
        updated_at = v_now
    where id = v_request.id
      and attempt_id = p_attempt_id
      and state = 'PROCESSING';

    return query select 'RESUME_PROVISIONED'::text, 'PROVISIONED'::text, 'ACTIVE'::text;
    return;
  end if;

  if v_org.organization_status <> 'PROVISIONING' then
    return query select 'ORGANIZATION_STATE_CHANGED'::text, v_request.state, v_org.organization_status;
    return;
  end if;

  update public.organizations
  set status = 'setup_failed',
      organization_status = 'SETUP_FAILED'
  where id = p_organization_id
    and organization_status = 'PROVISIONING';

  if not found then
    raise exception 'ONBOARDING_STALE_ORGANIZATION_RETIRE_CONFLICT';
  end if;

  update public.onboarding_provision_requests
  set state = 'FAILED',
      error_message = 'Onboarding provisioning was interrupted before completion',
      failed_at = v_now,
      updated_at = v_now
  where id = v_request.id
    and attempt_id = p_attempt_id
    and state = 'PROCESSING';

  if not found then
    raise exception 'ONBOARDING_STALE_REQUEST_RETIRE_CONFLICT';
  end if;

  return query select 'RETIRED_FAILED'::text, 'FAILED'::text, 'SETUP_FAILED'::text;
end;
$$;

revoke all on function public.retire_stale_onboarding_provision_request(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.retire_stale_onboarding_provision_request(uuid,uuid,uuid,timestamptz) to service_role;

commit;
