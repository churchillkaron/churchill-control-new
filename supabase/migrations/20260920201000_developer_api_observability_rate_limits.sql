begin;

create table if not exists public.developer_api_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.developer_environments(id) on delete cascade,
  credential_id uuid not null references public.developer_api_credentials(id) on delete cascade,
  capability_id text not null,
  method text not null,
  command text null,
  status_code integer not null,
  latency_ms integer not null default 0,
  error_code text null,
  idempotency_key text null,
  created_at timestamptz not null default now()
);

create index if not exists developer_api_requests_org_time_idx
  on public.developer_api_requests (organization_id, created_at desc);
create index if not exists developer_api_requests_credential_time_idx
  on public.developer_api_requests (credential_id, created_at desc);

create table if not exists public.developer_api_rate_buckets (
  credential_id uuid not null references public.developer_api_credentials(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (credential_id, window_start)
);

alter table public.developer_api_requests enable row level security;
alter table public.developer_api_rate_buckets enable row level security;
revoke all on table public.developer_api_requests from anon, authenticated;
revoke all on table public.developer_api_rate_buckets from anon, authenticated;
grant select, insert, update, delete on table public.developer_api_requests to service_role;
grant select, insert, update, delete on table public.developer_api_rate_buckets to service_role;

create or replace function public.claim_developer_api_rate_limit(
  p_credential_id uuid,
  p_limit integer default 120
)
returns table(allowed boolean, request_count integer, window_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_limit < 1 or p_limit > 10000 then raise exception 'DEVELOPER_RATE_LIMIT_INVALID'; end if;
  insert into public.developer_api_rate_buckets(credential_id, window_start, request_count)
  values (p_credential_id, v_window, 1)
  on conflict (credential_id, window_start)
  do update set request_count = public.developer_api_rate_buckets.request_count + 1
  returning public.developer_api_rate_buckets.request_count into v_count;
  return query select (v_count <= p_limit), v_count, v_window;
end;
$$;

revoke all on function public.claim_developer_api_rate_limit(uuid,integer) from public;
revoke all on function public.claim_developer_api_rate_limit(uuid,integer) from anon;
revoke all on function public.claim_developer_api_rate_limit(uuid,integer) from authenticated;
grant execute on function public.claim_developer_api_rate_limit(uuid,integer) to service_role;

commit;
