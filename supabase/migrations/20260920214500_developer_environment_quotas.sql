begin;

alter table public.developer_environments
  add column if not exists requests_per_minute integer not null default 120 check (requests_per_minute between 1 and 10000),
  add column if not exists monthly_request_limit bigint null check (monthly_request_limit is null or monthly_request_limit >= 0),
  add column if not exists max_active_credentials integer not null default 20 check (max_active_credentials between 1 and 1000),
  add column if not exists max_active_webhooks integer not null default 20 check (max_active_webhooks between 0 and 1000);

create table if not exists public.developer_api_monthly_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.developer_environments(id) on delete cascade,
  month_start date not null,
  request_count bigint not null default 0 check (request_count >= 0),
  primary key (organization_id, environment_id, month_start)
);

alter table public.developer_api_monthly_usage enable row level security;
revoke all on table public.developer_api_monthly_usage from anon, authenticated;
grant select, insert, update, delete on table public.developer_api_monthly_usage to service_role;

create or replace function public.claim_developer_environment_quota(
  p_organization_id uuid,
  p_environment_id uuid
)
returns table(
  allowed boolean,
  request_count bigint,
  monthly_limit bigint,
  month_start date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_limit bigint;
  v_count bigint;
begin
  select monthly_request_limit into v_limit
  from public.developer_environments
  where id = p_environment_id
    and organization_id = p_organization_id
    and status = 'ACTIVE';

  if not found then
    raise exception 'DEVELOPER_ENVIRONMENT_INACTIVE';
  end if;

  insert into public.developer_api_monthly_usage as usage(
    organization_id,
    environment_id,
    month_start,
    request_count
  )
  values (p_organization_id, p_environment_id, v_month, 1)
  on conflict on constraint developer_api_monthly_usage_pkey
  do update set request_count = usage.request_count + 1
  returning usage.request_count into v_count;

  return query
  select
    (v_limit is null or v_count <= v_limit),
    v_count,
    v_limit,
    v_month;
end;
$$;

revoke all on function public.claim_developer_environment_quota(uuid,uuid) from public;
revoke all on function public.claim_developer_environment_quota(uuid,uuid) from anon;
revoke all on function public.claim_developer_environment_quota(uuid,uuid) from authenticated;
grant execute on function public.claim_developer_environment_quota(uuid,uuid) to service_role;

commit;
