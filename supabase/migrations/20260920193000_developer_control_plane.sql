begin;

create table if not exists public.developer_environments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_key text not null check (environment_key in ('development','staging','production')),
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, environment_key)
);

create table if not exists public.developer_api_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.developer_environments(id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  token_last_four text not null,
  scopes text[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  expires_at timestamptz null,
  last_used_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint developer_api_credentials_scope_count check (cardinality(scopes) <= 64)
);

create table if not exists public.developer_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.developer_environments(id) on delete cascade,
  name text not null,
  url text not null,
  event_types text[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  secret_vault_id uuid null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_webhook_https check (url ~ '^https://')
);

create table if not exists public.developer_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id uuid not null references public.developer_webhook_endpoints(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  status text not null default 'PENDING' check (status in ('PENDING','DELIVERED','FAILED','RETRYING')),
  attempt integer not null default 0 check (attempt >= 0 and attempt <= 20),
  response_status integer null,
  error text null,
  payload_hash text null,
  next_attempt_at timestamptz null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz null
);

create index if not exists developer_api_credentials_org_idx on public.developer_api_credentials (organization_id, status, created_at desc);
create index if not exists developer_webhook_endpoints_org_idx on public.developer_webhook_endpoints (organization_id, status, created_at desc);
create index if not exists developer_webhook_deliveries_endpoint_idx on public.developer_webhook_deliveries (endpoint_id, created_at desc);

alter table public.developer_environments enable row level security;
alter table public.developer_api_credentials enable row level security;
alter table public.developer_webhook_endpoints enable row level security;
alter table public.developer_webhook_deliveries enable row level security;

revoke all on table public.developer_environments from anon, authenticated;
revoke all on table public.developer_api_credentials from anon, authenticated;
revoke all on table public.developer_webhook_endpoints from anon, authenticated;
revoke all on table public.developer_webhook_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.developer_environments to service_role;
grant select, insert, update, delete on table public.developer_api_credentials to service_role;
grant select, insert, update, delete on table public.developer_webhook_endpoints to service_role;
grant select, insert, update, delete on table public.developer_webhook_deliveries to service_role;

create or replace function public.provision_developer_webhook_secret(
  p_organization_id uuid,
  p_endpoint_id uuid,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_vault_id uuid;
begin
  if length(coalesce(p_secret,'')) < 32 then raise exception 'DEVELOPER_WEBHOOK_SECRET_TOO_SHORT'; end if;
  if not exists (
    select 1 from public.developer_webhook_endpoints
    where id = p_endpoint_id and organization_id = p_organization_id
  ) then raise exception 'DEVELOPER_WEBHOOK_ENDPOINT_NOT_FOUND'; end if;
  v_vault_id := vault.create_secret(
    p_secret,
    'developer-webhook:' || p_organization_id::text || ':' || p_endpoint_id::text,
    'Avantiqo developer webhook signing secret'
  );
  update public.developer_webhook_endpoints set secret_vault_id=v_vault_id, updated_at=now() where id=p_endpoint_id;
  return v_vault_id;
end;
$$;

revoke all on function public.provision_developer_webhook_secret(uuid,uuid,text) from public;
grant execute on function public.provision_developer_webhook_secret(uuid,uuid,text) to service_role;

commit;

create or replace function public.read_developer_webhook_secret(
  p_organization_id uuid,
  p_endpoint_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
begin
  select ds.decrypted_secret into v_secret
  from public.developer_webhook_endpoints e
  join vault.decrypted_secrets ds on ds.id = e.secret_vault_id
  where e.id = p_endpoint_id
    and e.organization_id = p_organization_id
    and e.status = 'ACTIVE';
  if v_secret is null then raise exception 'DEVELOPER_WEBHOOK_SECRET_UNAVAILABLE'; end if;
  return v_secret;
end;
$$;
revoke all on function public.read_developer_webhook_secret(uuid,uuid) from public;
grant execute on function public.read_developer_webhook_secret(uuid,uuid) to service_role;
