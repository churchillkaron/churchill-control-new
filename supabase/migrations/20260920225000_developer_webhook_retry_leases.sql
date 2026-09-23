begin;

alter table public.developer_webhook_deliveries
  add column if not exists retry_lease_token uuid null,
  add column if not exists retry_lease_expires_at timestamptz null;

create index if not exists developer_webhook_deliveries_due_retry_idx
  on public.developer_webhook_deliveries (next_attempt_at, id)
  where status = 'FAILED' and next_attempt_at is not null;

create or replace function public.claim_due_developer_webhook_retries(
  p_limit integer default 25,
  p_lease_seconds integer default 90
)
returns table(
  delivery_id uuid,
  organization_id uuid,
  lease_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'DEVELOPER_WEBHOOK_RETRY_LIMIT_INVALID';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'DEVELOPER_WEBHOOK_RETRY_LEASE_INVALID';
  end if;

  return query
  with due as (
    select d.id
    from public.developer_webhook_deliveries d
    where d.status = 'FAILED'
      and d.next_attempt_at is not null
      and d.next_attempt_at <= now()
      and d.attempt < 20
      and d.event_record_id is not null
      and (d.retry_lease_expires_at is null or d.retry_lease_expires_at <= now())
    order by d.next_attempt_at asc, d.created_at asc
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.developer_webhook_deliveries d
    set status = 'RETRYING',
        retry_lease_token = gen_random_uuid(),
        retry_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        next_attempt_at = null
    from due
    where d.id = due.id
    returning d.id, d.organization_id, d.retry_lease_token
  )
  select claimed.id, claimed.organization_id, claimed.retry_lease_token
  from claimed;
end;
$$;

revoke all on function public.claim_due_developer_webhook_retries(integer,integer) from public;
revoke all on function public.claim_due_developer_webhook_retries(integer,integer) from anon;
revoke all on function public.claim_due_developer_webhook_retries(integer,integer) from authenticated;
grant execute on function public.claim_due_developer_webhook_retries(integer,integer) to service_role;

commit;
