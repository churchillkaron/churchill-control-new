begin;

alter table public.developer_webhook_events
  add column if not exists environment_id uuid null
    references public.developer_environments(id) on delete cascade;

create index if not exists developer_webhook_events_org_environment_time_idx
  on public.developer_webhook_events (organization_id, environment_id, created_at desc);

commit;
