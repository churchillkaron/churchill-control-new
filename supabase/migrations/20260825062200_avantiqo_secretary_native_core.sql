begin;

create table if not exists public.secretary_contact_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null,
  relationship_label text null,
  preferred_language text null,
  timezone text null,
  preferred_channel text null,
  allow_calls boolean not null default true,
  allow_messages boolean not null default true,
  do_not_disturb jsonb not null default '{}'::jsonb,
  important_notes text null,
  last_contact_at timestamptz null,
  next_follow_up_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, party_id),
  constraint secretary_contact_profiles_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade
);

create index if not exists secretary_contact_profiles_follow_up_idx
  on public.secretary_contact_profiles (organization_id, next_follow_up_at)
  where next_follow_up_at is not null;

create table if not exists public.secretary_calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  owner_party_id uuid null,
  contact_party_id uuid null,
  title text not null,
  description text null,
  event_type text not null default 'MEETING'
    check (event_type in ('MEETING','APPOINTMENT','CALL','BLOCK','REMINDER','OTHER')),
  status text not null default 'CONFIRMED'
    check (status in ('TENTATIVE','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  all_day boolean not null default false,
  location text null,
  recurrence jsonb not null default '{}'::jsonb,
  source text not null default 'secretary',
  created_by_party_id uuid null,
  updated_by_party_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint secretary_calendar_owner_party_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  constraint secretary_calendar_contact_party_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_calendar_events_window_idx
  on public.secretary_calendar_events (organization_id, starts_at, ends_at)
  where status <> 'CANCELLED';
create index if not exists secretary_calendar_events_owner_idx
  on public.secretary_calendar_events (organization_id, owner_party_id, starts_at)
  where owner_party_id is not null and status <> 'CANCELLED';
create index if not exists secretary_calendar_events_contact_idx
  on public.secretary_calendar_events (organization_id, contact_party_id, starts_at desc)
  where contact_party_id is not null;

create table if not exists public.secretary_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  owner_party_id uuid null,
  contact_party_id uuid null,
  calendar_event_id uuid null references public.secretary_calendar_events(id) on delete set null,
  title text not null,
  details text null,
  status text not null default 'OPEN'
    check (status in ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  priority text not null default 'NORMAL'
    check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  due_at timestamptz null,
  remind_at timestamptz null,
  completed_at timestamptz null,
  source text not null default 'secretary',
  created_by_party_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_tasks_owner_party_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  constraint secretary_tasks_contact_party_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_tasks_due_idx
  on public.secretary_tasks (organization_id, status, due_at)
  where status in ('OPEN','IN_PROGRESS');
create index if not exists secretary_tasks_reminder_idx
  on public.secretary_tasks (organization_id, remind_at)
  where status in ('OPEN','IN_PROGRESS') and remind_at is not null;

create table if not exists public.secretary_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  contact_party_id uuid null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  direction text not null check (direction in ('INBOUND','OUTBOUND')),
  remote_address text null,
  status text not null default 'ANSWERED'
    check (status in ('RINGING','ANSWERED','MISSED','DECLINED','VOICEMAIL','FAILED','COMPLETED')),
  started_at timestamptz not null default now(),
  answered_at timestamptz null,
  ended_at timestamptz null,
  transcript text null,
  summary text null,
  recording_storage_path text null,
  raw_audio_persisted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_calls_contact_party_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists secretary_calls_recent_idx
  on public.secretary_calls (organization_id, started_at desc);
create index if not exists secretary_calls_contact_idx
  on public.secretary_calls (organization_id, contact_party_id, started_at desc)
  where contact_party_id is not null;
create index if not exists secretary_calls_status_idx
  on public.secretary_calls (organization_id, status, started_at desc);

create table if not exists public.secretary_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  owner_party_id uuid null,
  contact_party_id uuid null,
  task_id uuid null references public.secretary_tasks(id) on delete set null,
  calendar_event_id uuid null references public.secretary_calendar_events(id) on delete set null,
  call_id uuid null references public.secretary_calls(id) on delete set null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  action_type text not null default 'REVIEW'
    check (action_type in ('CALL','MESSAGE','EMAIL','MEETING','REVIEW','OTHER')),
  reason text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','COMPLETED','CANCELLED')),
  due_at timestamptz not null,
  result text null,
  completed_at timestamptz null,
  created_by_party_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_follow_ups_owner_party_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  constraint secretary_follow_ups_contact_party_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_follow_ups_due_idx
  on public.secretary_follow_ups (organization_id, status, due_at)
  where status = 'PENDING';
create index if not exists secretary_follow_ups_contact_idx
  on public.secretary_follow_ups (organization_id, contact_party_id, due_at desc)
  where contact_party_id is not null;

create table if not exists public.secretary_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  default_timezone text not null default 'UTC',
  default_language text null,
  appointment_duration_minutes integer not null default 30
    check (appointment_duration_minutes between 5 and 1440),
  business_hours jsonb not null default '{}'::jsonb,
  call_handling_policy jsonb not null default '{}'::jsonb,
  message_handling_policy jsonb not null default '{}'::jsonb,
  booking_policy jsonb not null default '{}'::jsonb,
  memory_policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.secretary_contact_profiles enable row level security;
alter table public.secretary_calendar_events enable row level security;
alter table public.secretary_tasks enable row level security;
alter table public.secretary_calls enable row level security;
alter table public.secretary_follow_ups enable row level security;
alter table public.secretary_settings enable row level security;

revoke all on public.secretary_contact_profiles from anon, authenticated;
revoke all on public.secretary_calendar_events from anon, authenticated;
revoke all on public.secretary_tasks from anon, authenticated;
revoke all on public.secretary_calls from anon, authenticated;
revoke all on public.secretary_follow_ups from anon, authenticated;
revoke all on public.secretary_settings from anon, authenticated;

grant select, insert, update, delete on public.secretary_contact_profiles to service_role;
grant select, insert, update, delete on public.secretary_calendar_events to service_role;
grant select, insert, update, delete on public.secretary_tasks to service_role;
grant select, insert, update, delete on public.secretary_calls to service_role;
grant select, insert, update, delete on public.secretary_follow_ups to service_role;
grant select, insert, update, delete on public.secretary_settings to service_role;

comment on table public.secretary_contact_profiles is
  'Avantiqo-owned Secretary relationship context layered on canonical organization parties. Identity remains in public.parties.';
comment on table public.secretary_calendar_events is
  'Avantiqo-owned organization calendar for meetings, appointments, calls, blocks and reminders. No external calendar is authoritative.';
comment on table public.secretary_tasks is
  'Avantiqo-owned Secretary tasks and reminders.';
comment on table public.secretary_calls is
  'Avantiqo-owned normalized phone-call history and transcript/summary evidence. Telecom transport does not own Secretary state.';
comment on table public.secretary_follow_ups is
  'Avantiqo-owned due follow-ups linked to contacts, calls, conversations, tasks or calendar events.';
comment on table public.secretary_settings is
  'Organization-scoped Secretary operating policy. External services, if used as transport, are not authoritative for this policy.';

commit;
