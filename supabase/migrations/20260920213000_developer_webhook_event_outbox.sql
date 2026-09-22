begin;

create table if not exists public.developer_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (organization_id, event_id)
);

alter table public.developer_webhook_deliveries
  add column if not exists event_record_id uuid null references public.developer_webhook_events(id) on delete cascade;

create index if not exists developer_webhook_events_org_time_idx
  on public.developer_webhook_events (organization_id, created_at desc);
create index if not exists developer_webhook_events_expiry_idx
  on public.developer_webhook_events (expires_at);
create index if not exists developer_webhook_deliveries_event_record_idx
  on public.developer_webhook_deliveries (event_record_id);

alter table public.developer_webhook_events enable row level security;
revoke all on table public.developer_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.developer_webhook_events to service_role;

create or replace function public.purge_expired_developer_webhook_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.developer_webhook_events
  where expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_developer_webhook_events() from public;
revoke all on function public.purge_expired_developer_webhook_events() from anon;
revoke all on function public.purge_expired_developer_webhook_events() from authenticated;
grant execute on function public.purge_expired_developer_webhook_events() to service_role;

commit;
