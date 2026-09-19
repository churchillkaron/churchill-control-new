begin;

create table if not exists public.finance_provider_verification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  provider_credential_id uuid not null references public.provider_credentials(id) on delete restrict,
  provider_id text not null,
  verification_status text not null check (verification_status in ('VERIFIED','CONFIGURED_UNVERIFIED','VERIFICATION_FAILED')),
  verification_mode text,
  non_mutating boolean not null default true,
  detail jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  verified_by uuid references public.staff_accounts(id) on delete set null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists finance_provider_verification_events_scope_idx
  on public.finance_provider_verification_events (organization_id, provider_id, verified_at desc);
create index if not exists finance_provider_verification_events_credential_idx
  on public.finance_provider_verification_events (provider_credential_id, verified_at desc);

alter table public.finance_provider_verification_events enable row level security;
revoke all on table public.finance_provider_verification_events from anon, authenticated;
grant select, insert on table public.finance_provider_verification_events to service_role;

create or replace function public.record_finance_provider_verification(
  p_organization_id uuid,
  p_credential_id uuid,
  p_status text,
  p_mode text default null,
  p_detail jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null,
  p_verified_by uuid default null
)
returns table (
  event_id uuid,
  verification_status text,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_status text := upper(btrim(coalesce(p_status,'')));
  v_credential public.provider_credentials%rowtype;
  v_stamp timestamptz := now();
  v_event_id uuid;
  v_metadata jsonb;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'FINANCE_PROVIDER_VERIFICATION_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_organization_id is null or p_credential_id is null then
    raise exception 'FINANCE_PROVIDER_VERIFICATION_SCOPE_REQUIRED';
  end if;
  if v_status not in ('VERIFIED','CONFIGURED_UNVERIFIED','VERIFICATION_FAILED') then
    raise exception 'FINANCE_PROVIDER_VERIFICATION_STATUS_INVALID';
  end if;
  if coalesce(p_detail,'{}'::jsonb) ?| array['api_key','access_token','password','secret','server_key','private_key','client_secret','secret_reference'] then
    raise exception 'FINANCE_PROVIDER_VERIFICATION_SECRET_DETAIL_FORBIDDEN';
  end if;

  select pc.* into v_credential
  from public.provider_credentials pc
  where pc.id = p_credential_id
    and upper(coalesce(pc.status,'')) = 'ACTIVE'
    and (coalesce(pc.metadata->>'organization_id','') = '' or coalesce(pc.metadata->>'organization_id','') = p_organization_id::text)
  for update;
  if not found then raise exception 'FINANCE_PROVIDER_VERIFICATION_CREDENTIAL_NOT_FOUND'; end if;

  v_metadata := coalesce(v_credential.metadata,'{}'::jsonb) || jsonb_build_object(
    'verification_status', v_status,
    'last_verification_attempt_at', v_stamp,
    'verification_detail', coalesce(p_detail,'{}'::jsonb),
    'last_verification_error', case when p_error_code is not null or p_error_message is not null then jsonb_build_object('code',p_error_code,'message',p_error_message) else null end
  );
  if v_status = 'VERIFIED' then
    v_metadata := v_metadata || jsonb_build_object('last_verified_at', v_stamp);
  end if;

  update public.provider_credentials
  set metadata = v_metadata, updated_at = v_stamp
  where id = p_credential_id;

  insert into public.finance_provider_verification_events (
    organization_id, provider_credential_id, provider_id, verification_status,
    verification_mode, non_mutating, detail, error_code, error_message, verified_by, verified_at, created_at
  ) values (
    p_organization_id, p_credential_id, v_credential.provider_id, v_status,
    nullif(btrim(coalesce(p_mode,'')),''), true, coalesce(p_detail,'{}'::jsonb),
    nullif(btrim(coalesce(p_error_code,'')),''), nullif(left(btrim(coalesce(p_error_message,'')),1000),''),
    p_verified_by, v_stamp, v_stamp
  ) returning id into v_event_id;

  return query select v_event_id, v_status, v_stamp;
end;
$$;

revoke all on function public.record_finance_provider_verification(uuid,uuid,text,text,jsonb,text,text,uuid) from public;
revoke all on function public.record_finance_provider_verification(uuid,uuid,text,text,jsonb,text,text,uuid) from anon;
revoke all on function public.record_finance_provider_verification(uuid,uuid,text,text,jsonb,text,text,uuid) from authenticated;
grant execute on function public.record_finance_provider_verification(uuid,uuid,text,text,jsonb,text,text,uuid) to service_role;

comment on table public.finance_provider_verification_events is
  'Append-only evidence for non-mutating Finance provider connection verification. Every verification attempt is durable and carries no accounting mutation authority.';

notify pgrst, 'reload schema';
commit;
