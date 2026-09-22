begin;

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

  if not found then raise exception 'DEVELOPER_ENVIRONMENT_INACTIVE'; end if;

  if v_limit is null then
    insert into public.developer_api_monthly_usage as usage(
      organization_id, environment_id, month_start, request_count
    )
    values (p_organization_id, p_environment_id, v_month, 1)
    on conflict on constraint developer_api_monthly_usage_pkey
    do update set request_count = usage.request_count + 1
    returning usage.request_count into v_count;
    return query select true, v_count, null::bigint, v_month;
    return;
  end if;

  insert into public.developer_api_monthly_usage as usage(
    organization_id, environment_id, month_start, request_count
  )
  values (p_organization_id, p_environment_id, v_month, 1)
  on conflict on constraint developer_api_monthly_usage_pkey
  do update set request_count = usage.request_count + 1
    where usage.request_count < v_limit
  returning usage.request_count into v_count;

  if v_count is null then
    select usage.request_count into v_count
    from public.developer_api_monthly_usage as usage
    where usage.organization_id = p_organization_id
      and usage.environment_id = p_environment_id
      and usage.month_start = v_month;
    return query select false, coalesce(v_count, 0), v_limit, v_month;
    return;
  end if;

  return query select true, v_count, v_limit, v_month;
end;
$$;

revoke all on function public.claim_developer_environment_quota(uuid,uuid) from public;
revoke all on function public.claim_developer_environment_quota(uuid,uuid) from anon;
revoke all on function public.claim_developer_environment_quota(uuid,uuid) from authenticated;
grant execute on function public.claim_developer_environment_quota(uuid,uuid) to service_role;

create or replace function public.enforce_developer_active_resource_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.status <> 'ACTIVE' then return new; end if;

  perform 1 from public.developer_environments
  where id = new.environment_id and organization_id = new.organization_id
  for update;

  if tg_table_name = 'developer_api_credentials' then
    select max_active_credentials into v_limit from public.developer_environments
    where id = new.environment_id and organization_id = new.organization_id;
    select count(*) into v_count from public.developer_api_credentials
    where environment_id = new.environment_id and organization_id = new.organization_id
      and status = 'ACTIVE' and revoked_at is null and id is distinct from new.id;
    if v_count >= v_limit then raise exception 'DEVELOPER_ACTIVE_CREDENTIAL_LIMIT_REACHED'; end if;
  elsif tg_table_name = 'developer_webhook_endpoints' then
    select max_active_webhooks into v_limit from public.developer_environments
    where id = new.environment_id and organization_id = new.organization_id;
    select count(*) into v_count from public.developer_webhook_endpoints
    where environment_id = new.environment_id and organization_id = new.organization_id
      and status = 'ACTIVE' and id is distinct from new.id;
    if v_count >= v_limit then raise exception 'DEVELOPER_ACTIVE_WEBHOOK_LIMIT_REACHED'; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists developer_api_credentials_active_limit on public.developer_api_credentials;
create trigger developer_api_credentials_active_limit before insert or update of status, environment_id
on public.developer_api_credentials for each row execute function public.enforce_developer_active_resource_limits();

drop trigger if exists developer_webhook_endpoints_active_limit on public.developer_webhook_endpoints;
create trigger developer_webhook_endpoints_active_limit before insert or update of status, environment_id
on public.developer_webhook_endpoints for each row execute function public.enforce_developer_active_resource_limits();

revoke all on function public.enforce_developer_active_resource_limits() from public;
revoke all on function public.enforce_developer_active_resource_limits() from anon;
revoke all on function public.enforce_developer_active_resource_limits() from authenticated;

commit;
