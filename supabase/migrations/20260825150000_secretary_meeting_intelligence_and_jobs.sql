begin;

create table if not exists public.secretary_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  calendar_event_id uuid null references public.secretary_calendar_events(id) on delete set null,
  title text not null,
  status text not null default 'CAPTURING'
    check (status in ('CAPTURING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  timezone text not null default 'UTC',
  primary_language text null,
  capture_authorized boolean not null default false,
  executive_summary text null,
  protocol text null,
  decisions jsonb not null default '[]'::jsonb,
  unresolved_questions jsonb not null default '[]'::jsonb,
  attendee_summary jsonb not null default '[]'::jsonb,
  recording_storage_path text null,
  raw_audio_persisted boolean not null default false,
  processed_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists secretary_meetings_recent_idx
  on public.secretary_meetings (organization_id, started_at desc);
create index if not exists secretary_meetings_status_idx
  on public.secretary_meetings (organization_id, status, started_at desc);
create index if not exists secretary_meetings_calendar_event_idx
  on public.secretary_meetings (organization_id, calendar_event_id)
  where calendar_event_id is not null;

create table if not exists public.secretary_meeting_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.secretary_meetings(id) on delete cascade,
  party_id uuid null,
  display_name text not null,
  participant_role text null,
  speaker_key text null,
  attended_from timestamptz null,
  attended_until timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_meeting_participants_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (meeting_id, party_id),
  unique (meeting_id, speaker_key)
);

create index if not exists secretary_meeting_participants_meeting_idx
  on public.secretary_meeting_participants (organization_id, meeting_id, display_name);

create table if not exists public.secretary_meeting_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.secretary_meetings(id) on delete cascade,
  sequence_number bigint not null,
  speaker_party_id uuid null,
  speaker_label text null,
  transcript text not null,
  language text null,
  started_offset_ms integer null check (started_offset_ms is null or started_offset_ms >= 0),
  ended_offset_ms integer null check (ended_offset_ms is null or ended_offset_ms >= 0),
  source_kind text not null default 'AUDIO'
    check (source_kind in ('AUDIO','MANUAL','IMPORT')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint secretary_meeting_segments_speaker_party_fkey
    foreign key (organization_id, speaker_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (meeting_id, sequence_number),
  check (ended_offset_ms is null or started_offset_ms is null or ended_offset_ms >= started_offset_ms)
);

create index if not exists secretary_meeting_segments_order_idx
  on public.secretary_meeting_segments (organization_id, meeting_id, sequence_number);

create table if not exists public.secretary_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  requested_by_party_id uuid null,
  source_kind text not null default 'MANUAL'
    check (source_kind in ('MEETING','CALL','MESSAGE','MANUAL','OTHER')),
  source_id uuid null,
  source_meeting_id uuid null references public.secretary_meetings(id) on delete set null,
  objective text not null,
  success_criteria jsonb not null default '[]'::jsonb,
  status text not null default 'QUEUED'
    check (status in ('QUEUED','PLANNING','ACTIVE','WAITING','REVIEW_REQUIRED','COMPLETED','FAILED','CANCELLED')),
  autonomy_level text not null default 'EXECUTE_WITH_GATES'
    check (autonomy_level in ('PLAN_ONLY','EXECUTE_WITH_GATES','EXECUTE_WITHIN_POLICY')),
  approval_policy jsonb not null default '{}'::jsonb,
  execution_plan jsonb not null default '[]'::jsonb,
  result_summary text null,
  next_action_at timestamptz null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 20 check (max_attempts between 1 and 200),
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint secretary_jobs_requested_by_party_fkey
    foreign key (organization_id, requested_by_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_jobs_due_idx
  on public.secretary_jobs (organization_id, status, next_action_at)
  where status in ('QUEUED','PLANNING','ACTIVE','WAITING','REVIEW_REQUIRED');
create index if not exists secretary_jobs_meeting_idx
  on public.secretary_jobs (organization_id, source_meeting_id, created_at)
  where source_meeting_id is not null;

create table if not exists public.secretary_job_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.secretary_jobs(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 1),
  action_type text not null
    check (action_type in ('RESEARCH','CALL','MESSAGE','EMAIL','CREATE_TASK','CREATE_EVENT','REVIEW','OTHER')),
  instruction text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','RUNNING','WAITING','APPROVAL_REQUIRED','COMPLETED','FAILED','SKIPPED')),
  target_party_id uuid null,
  due_at timestamptz null,
  requires_approval boolean not null default false,
  result text null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_job_steps_target_party_fkey
    foreign key (organization_id, target_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (job_id, sequence_number)
);

create index if not exists secretary_job_steps_pending_idx
  on public.secretary_job_steps (organization_id, job_id, status, sequence_number);

create table if not exists public.secretary_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.secretary_meetings(id) on delete cascade,
  owner_kind text not null default 'UNKNOWN'
    check (owner_kind in ('SECRETARY','STAFF','CONTACT','UNKNOWN')),
  owner_party_id uuid null,
  title text not null,
  details text null,
  priority text not null default 'NORMAL'
    check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  due_at timestamptz null,
  execution_ready boolean not null default false,
  status text not null default 'OPEN'
    check (status in ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  task_id uuid null references public.secretary_tasks(id) on delete set null,
  job_id uuid null references public.secretary_jobs(id) on delete set null,
  evidence_segment_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_meeting_action_items_owner_party_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_meeting_action_items_open_idx
  on public.secretary_meeting_action_items (organization_id, meeting_id, status, due_at)
  where status in ('OPEN','IN_PROGRESS');
create index if not exists secretary_meeting_action_items_owner_idx
  on public.secretary_meeting_action_items (organization_id, owner_party_id, status, due_at)
  where owner_party_id is not null and status in ('OPEN','IN_PROGRESS');

alter table public.secretary_meetings enable row level security;
alter table public.secretary_meeting_participants enable row level security;
alter table public.secretary_meeting_segments enable row level security;
alter table public.secretary_jobs enable row level security;
alter table public.secretary_job_steps enable row level security;
alter table public.secretary_meeting_action_items enable row level security;

revoke all on public.secretary_meetings from anon, authenticated;
revoke all on public.secretary_meeting_participants from anon, authenticated;
revoke all on public.secretary_meeting_segments from anon, authenticated;
revoke all on public.secretary_jobs from anon, authenticated;
revoke all on public.secretary_job_steps from anon, authenticated;
revoke all on public.secretary_meeting_action_items from anon, authenticated;

grant select, insert, update, delete on public.secretary_meetings to service_role;
grant select, insert, update, delete on public.secretary_meeting_participants to service_role;
grant select, insert, update, delete on public.secretary_meeting_segments to service_role;
grant select, insert, update, delete on public.secretary_jobs to service_role;
grant select, insert, update, delete on public.secretary_job_steps to service_role;
grant select, insert, update, delete on public.secretary_meeting_action_items to service_role;

comment on table public.secretary_meetings is
  'Avantiqo-owned durable meeting record and protocol. Meeting capture is organization-scoped and requires explicit capture authorization.';
comment on table public.secretary_meeting_segments is
  'Ordered meeting transcript evidence used to derive protocol, decisions and action items. Raw audio persistence is not required.';
comment on table public.secretary_jobs is
  'Long-running Secretary work objectives that may span research, calls, messages, email, follow-ups and approvals. Avantiqo owns execution state.';
comment on table public.secretary_job_steps is
  'Durable execution plan for Secretary jobs. Individual steps may wait for outside replies or require approval without losing the objective.';
comment on table public.secretary_meeting_action_items is
  'Meeting-derived action items linked to native Secretary tasks and, for Secretary-owned work, autonomous jobs.';

commit;
