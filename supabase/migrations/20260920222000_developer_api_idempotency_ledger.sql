begin;

create table if not exists public.developer_api_idempotency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.developer_environments(id) on delete cascade,
  credential_id uuid null references public.developer_api_credentials(id) on delete set null,
  idempotency_key text not null,
  capability_id text not null,
  command text not null,
  request_hash text not null,
  state text not null default 'IN_PROGRESS' check (state in ('IN_PROGRESS','SETTLED')),
  response_status integer null,
  response_body jsonb null,
  created_at timestamptz not null default now(),
  settled_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (organization_id, environment_id, idempotency_key)
);

create index if not exists developer_api_idempotency_expiry_idx
  on public.developer_api_idempotency (expires_at) where state = 'SETTLED';
create index if not exists developer_api_idempotency_org_time_idx
  on public.developer_api_idempotency (organization_id, created_at desc);

alter table public.developer_api_idempotency enable row level security;
revoke all on table public.developer_api_idempotency from anon, authenticated;
grant select, insert, update, delete on table public.developer_api_idempotency to service_role;

create or replace function public.claim_developer_api_idempotency(
  p_organization_id uuid,
  p_environment_id uuid,
  p_credential_id uuid,
  p_idempotency_key text,
  p_capability_id text,
  p_command text,
  p_request_hash text
)
returns table(record_id uuid,claimed boolean,matching_request boolean,record_state text,response_status integer,response_body jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.developer_api_idempotency%rowtype;
begin
  if length(coalesce(p_idempotency_key,'')) < 8 or length(p_idempotency_key) > 200 then raise exception 'DEVELOPER_IDEMPOTENCY_KEY_INVALID'; end if;
  if length(coalesce(p_request_hash,'')) <> 64 then raise exception 'DEVELOPER_IDEMPOTENCY_HASH_INVALID'; end if;

  insert into public.developer_api_idempotency(
    organization_id,environment_id,credential_id,idempotency_key,capability_id,command,request_hash
  )
  values (
    p_organization_id,p_environment_id,p_credential_id,p_idempotency_key,p_capability_id,p_command,p_request_hash
  )
  on conflict (organization_id, environment_id, idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is not null then
    return query select v_row.id,true,true,v_row.state,v_row.response_status,v_row.response_body;
    return;
  end if;

  select * into v_row
  from public.developer_api_idempotency
  where organization_id=p_organization_id
    and environment_id=p_environment_id
    and idempotency_key=p_idempotency_key
  for update;

  return query select
    v_row.id,
    false,
    (v_row.request_hash=p_request_hash and v_row.capability_id=p_capability_id and v_row.command=p_command),
    v_row.state,
    v_row.response_status,
    v_row.response_body;
end;
$$;

create or replace function public.settle_developer_api_idempotency(
  p_organization_id uuid,
  p_environment_id uuid,
  p_record_id uuid,
  p_request_hash text,
  p_response_status integer,
  p_response_body jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_updated integer;
begin
  update public.developer_api_idempotency
  set state='SETTLED',
      response_status=p_response_status,
      response_body=coalesce(p_response_body,'{}'::jsonb),
      settled_at=now(),
      expires_at=now()+interval '24 hours'
  where id=p_record_id
    and organization_id=p_organization_id
    and environment_id=p_environment_id
    and request_hash=p_request_hash
    and state='IN_PROGRESS';
  get diagnostics v_updated = row_count;
  return v_updated=1;
end;
$$;

create or replace function public.purge_expired_developer_api_idempotency()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.developer_api_idempotency
  where state='SETTLED' and expires_at<=now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_developer_api_idempotency(uuid,uuid,uuid,text,text,text,text) from public;
revoke all on function public.claim_developer_api_idempotency(uuid,uuid,uuid,text,text,text,text) from anon;
revoke all on function public.claim_developer_api_idempotency(uuid,uuid,uuid,text,text,text,text) from authenticated;
grant execute on function public.claim_developer_api_idempotency(uuid,uuid,uuid,text,text,text,text) to service_role;

revoke all on function public.settle_developer_api_idempotency(uuid,uuid,uuid,text,integer,jsonb) from public;
revoke all on function public.settle_developer_api_idempotency(uuid,uuid,uuid,text,integer,jsonb) from anon;
revoke all on function public.settle_developer_api_idempotency(uuid,uuid,uuid,text,integer,jsonb) from authenticated;
grant execute on function public.settle_developer_api_idempotency(uuid,uuid,uuid,text,integer,jsonb) to service_role;

revoke all on function public.purge_expired_developer_api_idempotency() from public;
revoke all on function public.purge_expired_developer_api_idempotency() from anon;
revoke all on function public.purge_expired_developer_api_idempotency() from authenticated;
grant execute on function public.purge_expired_developer_api_idempotency() to service_role;

commit;
