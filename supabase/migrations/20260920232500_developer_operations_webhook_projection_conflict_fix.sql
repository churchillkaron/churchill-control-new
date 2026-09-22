begin;

create or replace function public.claim_developer_operations_webhook_projections(
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns table(
  operations_event_id uuid,
  organization_id uuid,
  environment_id uuid,
  event_type text,
  payload jsonb,
  occurred_at timestamptz,
  lease_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'DEVELOPER_OPERATIONS_WEBHOOK_LIMIT_INVALID';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'DEVELOPER_OPERATIONS_WEBHOOK_LEASE_INVALID';
  end if;

  insert into public.developer_operations_webhook_projections (
    operations_event_id,
    organization_id,
    status,
    attempt,
    next_attempt_at
  )
  select
    e.id,
    e.organization_id,
    'PENDING',
    0,
    now()
  from public.operations_events e
  where exists (
    select 1
    from public.developer_environments env
    join public.developer_webhook_endpoints ep
      on ep.environment_id = env.id
     and ep.organization_id = env.organization_id
     and ep.status = 'ACTIVE'
     and ep.created_at <= e.occurred_at
     and ('*' = any(ep.event_types) or e.event_type = any(ep.event_types))
    where env.organization_id = e.organization_id
      and env.environment_key = 'production'
      and env.status = 'ACTIVE'
  )
  and not exists (
    select 1
    from public.developer_operations_webhook_projections p
    where p.operations_event_id = e.id
  )
  order by e.occurred_at asc, e.id asc
  limit greatest(p_limit * 5, p_limit)
  on conflict on constraint developer_operations_webhook_projections_pkey do nothing;

  return query
  with due as (
    select p.operations_event_id
    from public.developer_operations_webhook_projections p
    where p.attempt < 20
      and (
        (p.status in ('PENDING','FAILED') and coalesce(p.next_attempt_at, now()) <= now())
        or
        (p.status = 'PROCESSING' and p.lease_expires_at is not null and p.lease_expires_at <= now())
      )
    order by coalesce(p.next_attempt_at, p.lease_expires_at, p.created_at) asc, p.operations_event_id asc
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.developer_operations_webhook_projections p
    set status = 'PROCESSING',
        attempt = p.attempt + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        next_attempt_at = null,
        last_error = null,
        updated_at = now()
    from due
    where p.operations_event_id = due.operations_event_id
    returning p.operations_event_id, p.organization_id, p.lease_token
  )
  select
    c.operations_event_id,
    c.organization_id,
    env.id as environment_id,
    e.event_type,
    e.payload,
    e.occurred_at,
    c.lease_token
  from claimed c
  join public.operations_events e on e.id = c.operations_event_id
  join public.developer_environments env
    on env.organization_id = c.organization_id
   and env.environment_key = 'production'
   and env.status = 'ACTIVE';
end;
$$;

revoke all on function public.claim_developer_operations_webhook_projections(integer,integer) from public, anon, authenticated;
grant execute on function public.claim_developer_operations_webhook_projections(integer,integer) to service_role;

commit;
