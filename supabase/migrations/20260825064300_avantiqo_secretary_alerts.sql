begin;

create table if not exists public.secretary_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_party_id uuid null,
  contact_party_id uuid null,
  alert_kind text not null
    check (alert_kind in ('TASK','FOLLOW_UP','CALENDAR_EVENT','MISSED_CALL')),
  source_id uuid not null,
  dedupe_key text not null,
  title text not null,
  message text null,
  priority text not null default 'NORMAL'
    check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  due_at timestamptz null,
  status text not null default 'PENDING'
    check (status in ('PENDING','SEEN','DISMISSED','RESOLVED')),
  surfaced_at timestamptz null,
  seen_at timestamptz null,
  resolved_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, dedupe_key),
  constraint secretary_alert_owner_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  constraint secretary_alert_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_alerts_pending_idx
  on public.secretary_alerts (organization_id, owner_party_id, priority, due_at)
  where status = 'PENDING';

alter table public.secretary_alerts enable row level security;
revoke all on public.secretary_alerts from anon, authenticated;
grant select, insert, update, delete on public.secretary_alerts to service_role;

create or replace function public.secretary_materialize_due_alerts(
  p_now timestamptz default now(),
  p_horizon_minutes integer default 60
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_horizon timestamptz;
  v_tasks integer := 0;
  v_follow_ups integer := 0;
  v_events integer := 0;
  v_calls integer := 0;
begin
  v_horizon := p_now + make_interval(mins => greatest(1, least(coalesce(p_horizon_minutes, 60), 1440)));

  insert into public.secretary_alerts (
    organization_id, owner_party_id, contact_party_id, alert_kind, source_id,
    dedupe_key, title, message, priority, due_at, metadata
  )
  select
    t.organization_id,
    t.owner_party_id,
    t.contact_party_id,
    'TASK',
    t.id,
    'task:' || t.id::text || ':' || coalesce(t.remind_at, t.due_at)::text,
    t.title,
    t.details,
    t.priority,
    coalesce(t.remind_at, t.due_at),
    jsonb_build_object('task_status', t.status, 'calendar_event_id', t.calendar_event_id)
  from public.secretary_tasks t
  where t.status in ('OPEN','IN_PROGRESS')
    and coalesce(t.remind_at, t.due_at) is not null
    and coalesce(t.remind_at, t.due_at) <= v_horizon
  on conflict (organization_id, dedupe_key) do nothing;
  get diagnostics v_tasks = row_count;

  insert into public.secretary_alerts (
    organization_id, owner_party_id, contact_party_id, alert_kind, source_id,
    dedupe_key, title, message, priority, due_at, metadata
  )
  select
    f.organization_id,
    f.owner_party_id,
    f.contact_party_id,
    'FOLLOW_UP',
    f.id,
    'follow_up:' || f.id::text || ':' || f.due_at::text,
    f.reason,
    'Follow-up due: ' || f.reason,
    case when f.due_at <= p_now then 'HIGH' else 'NORMAL' end,
    f.due_at,
    jsonb_build_object('action_type', f.action_type, 'task_id', f.task_id, 'call_id', f.call_id, 'conversation_id', f.conversation_id)
  from public.secretary_follow_ups f
  where f.status = 'PENDING'
    and f.due_at <= v_horizon
  on conflict (organization_id, dedupe_key) do nothing;
  get diagnostics v_follow_ups = row_count;

  insert into public.secretary_alerts (
    organization_id, owner_party_id, contact_party_id, alert_kind, source_id,
    dedupe_key, title, message, priority, due_at, metadata
  )
  select
    e.organization_id,
    e.owner_party_id,
    e.contact_party_id,
    'CALENDAR_EVENT',
    e.id,
    'calendar:' || e.id::text || ':' || e.starts_at::text,
    e.title,
    case when e.location is null then 'Upcoming ' || lower(e.event_type) else 'Upcoming ' || lower(e.event_type) || ' at ' || e.location end,
    case when e.starts_at <= p_now + interval '15 minutes' then 'HIGH' else 'NORMAL' end,
    e.starts_at,
    jsonb_build_object('event_type', e.event_type, 'timezone', e.timezone, 'location', e.location)
  from public.secretary_calendar_events e
  where e.status in ('TENTATIVE','CONFIRMED')
    and e.starts_at >= p_now
    and e.starts_at <= v_horizon
  on conflict (organization_id, dedupe_key) do nothing;
  get diagnostics v_events = row_count;

  insert into public.secretary_alerts (
    organization_id, owner_party_id, contact_party_id, alert_kind, source_id,
    dedupe_key, title, message, priority, due_at, metadata
  )
  select
    c.organization_id,
    l.owner_party_id,
    c.contact_party_id,
    'MISSED_CALL',
    c.id,
    'missed_call:' || c.id::text,
    case when c.remote_address is null then 'Missed call' else 'Missed call from ' || c.remote_address end,
    c.summary,
    'HIGH',
    c.started_at,
    jsonb_build_object('call_status', c.status, 'conversation_id', c.conversation_id)
  from public.secretary_calls c
  left join public.secretary_phone_lines l
    on l.id = c.phone_line_id and l.organization_id = c.organization_id
  where c.direction = 'INBOUND'
    and c.status in ('MISSED','VOICEMAIL')
    and c.started_at >= p_now - interval '7 days'
  on conflict (organization_id, dedupe_key) do nothing;
  get diagnostics v_calls = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'now', p_now,
    'horizon', v_horizon,
    'created', jsonb_build_object(
      'tasks', v_tasks,
      'follow_ups', v_follow_ups,
      'calendar_events', v_events,
      'missed_calls', v_calls,
      'total', v_tasks + v_follow_ups + v_events + v_calls
    ),
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_materialize_due_alerts(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.secretary_materialize_due_alerts(timestamptz, integer)
  to service_role;

comment on table public.secretary_alerts is
  'Avantiqo-owned durable Secretary reminder/attention ledger. Alerts are materialized from native tasks, follow-ups, calendar and calls without an external scheduler or reminder authority.';
comment on function public.secretary_materialize_due_alerts(timestamptz, integer) is
  'Deterministically materializes due Secretary alerts with idempotent organization-scoped dedupe keys.';

commit;
