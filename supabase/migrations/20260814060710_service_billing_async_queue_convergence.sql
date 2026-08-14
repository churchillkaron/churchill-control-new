create unique index if not exists billing_invoice_lines_usage_id_uidx
  on public.billing_invoice_lines (usage_id)
  where usage_id is not null;

create table if not exists public.service_billing_queue (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.platform_service_usage(id) on delete cascade,
  organization_id uuid not null,
  entity_id uuid null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'completed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz null,
  completed_at timestamptz null,
  billing_invoice_id uuid null references public.billing_invoices(id) on delete set null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usage_id)
);

create index if not exists service_billing_queue_ready_idx
  on public.service_billing_queue (status, available_at, created_at)
  where status in ('pending', 'retry', 'processing');

alter table public.service_billing_queue enable row level security;

revoke all on table public.service_billing_queue from anon, authenticated;
grant select, insert, update, delete on table public.service_billing_queue to service_role;

create or replace function public.queue_successful_service_usage_for_billing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'SUCCESS' then
    insert into public.service_billing_queue (
      usage_id,
      organization_id,
      entity_id,
      status,
      available_at,
      created_at,
      updated_at
    ) values (
      new.id,
      new.organization_id,
      new.entity_id,
      'pending',
      now(),
      now(),
      now()
    )
    on conflict (usage_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.queue_successful_service_usage_for_billing() from public;

drop trigger if exists platform_service_usage_queue_billing on public.platform_service_usage;
create trigger platform_service_usage_queue_billing
after insert or update of status on public.platform_service_usage
for each row
when (new.status = 'SUCCESS')
execute function public.queue_successful_service_usage_for_billing();

create or replace function public.claim_service_billing_jobs(
  p_limit integer default 25
)
returns setof public.service_billing_queue
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with candidates as (
    select q.id
    from public.service_billing_queue q
    where (
      (
        q.status in ('pending', 'retry')
        and q.available_at <= now()
      )
      or (
        q.status = 'processing'
        and q.locked_at < now() - interval '10 minutes'
      )
    )
    order by q.available_at asc, q.created_at asc, q.id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.service_billing_queue q
  set status = 'processing',
      attempts = q.attempts + 1,
      locked_at = now(),
      last_error = null,
      updated_at = now()
  from candidates c
  where q.id = c.id
  returning q.*;
end;
$$;

revoke all on function public.claim_service_billing_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_service_billing_jobs(integer) to service_role;

insert into public.service_billing_queue (
  usage_id,
  organization_id,
  entity_id,
  status,
  available_at,
  created_at,
  updated_at
)
select
  u.id,
  u.organization_id,
  u.entity_id,
  'pending',
  now(),
  now(),
  now()
from public.platform_service_usage u
where u.status = 'SUCCESS'
  and (u.invoice_status is distinct from 'INVOICED' or u.invoice_id is null)
on conflict (usage_id) do nothing;

comment on table public.service_billing_queue is
  'Durable Service Domain billing work queue. Successful service usage is enqueued transactionally and processed asynchronously with retry/dead-letter semantics.';

comment on function public.claim_service_billing_jobs(integer) is
  'Atomically claims ready Service billing jobs with SKIP LOCKED and recovers stale processing claims.';
