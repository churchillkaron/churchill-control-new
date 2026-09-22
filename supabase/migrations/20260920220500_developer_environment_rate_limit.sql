begin;

create table if not exists public.developer_environment_rate_buckets (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.developer_environments(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (organization_id, environment_id, window_start)
);

alter table public.developer_environment_rate_buckets enable row level security;
revoke all on table public.developer_environment_rate_buckets from anon, authenticated;
grant select, insert, update, delete on table public.developer_environment_rate_buckets to service_role;

create or replace function public.claim_developer_environment_rate_limit(
  p_organization_id uuid,
  p_environment_id uuid,
  p_limit integer
)
returns table(
  allowed boolean,
  request_count integer,
  window_start timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_limit < 1 or p_limit > 10000 then raise exception 'DEVELOPER_RATE_LIMIT_INVALID'; end if;

  if not exists (
    select 1 from public.developer_environments
    where id = p_environment_id
      and organization_id = p_organization_id
      and status = 'ACTIVE'
  ) then raise exception 'DEVELOPER_ENVIRONMENT_INACTIVE'; end if;

  insert into public.developer_environment_rate_buckets as buckets(
    organization_id, environment_id, window_start, request_count
  )
  values (p_organization_id, p_environment_id, v_window, 1)
  on conflict on constraint developer_environment_rate_buckets_pkey
  do update set request_count = buckets.request_count + 1
    where buckets.request_count < p_limit
  returning buckets.request_count into v_count;

  if v_count is null then
    select buckets.request_count into v_count
    from public.developer_environment_rate_buckets as buckets
    where buckets.organization_id = p_organization_id
      and buckets.environment_id = p_environment_id
      and buckets.window_start = v_window;
    return query select false, coalesce(v_count, p_limit), v_window;
    return;
  end if;

  return query select true, v_count, v_window;
end;
$$;

revoke all on function public.claim_developer_environment_rate_limit(uuid,uuid,integer) from public;
revoke all on function public.claim_developer_environment_rate_limit(uuid,uuid,integer) from anon;
revoke all on function public.claim_developer_environment_rate_limit(uuid,uuid,integer) from authenticated;
grant execute on function public.claim_developer_environment_rate_limit(uuid,uuid,integer) to service_role;

commit;
