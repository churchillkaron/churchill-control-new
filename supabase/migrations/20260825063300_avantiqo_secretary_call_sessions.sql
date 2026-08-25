begin;

create table if not exists public.secretary_phone_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_party_id uuid null,
  line_address text not null,
  transport_kind text not null default 'INTERNAL'
    check (transport_kind in ('INTERNAL','WEBRTC','SIP','PSTN')),
  display_name text null,
  default_language text null,
  timezone text not null default 'UTC',
  inbound_enabled boolean not null default true,
  outbound_enabled boolean not null default true,
  greeting text null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, line_address),
  constraint secretary_phone_lines_owner_party_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

alter table public.secretary_calls
  add column if not exists phone_line_id uuid null references public.secretary_phone_lines(id) on delete set null;

create index if not exists secretary_calls_phone_line_idx
  on public.secretary_calls (organization_id, phone_line_id, started_at desc)
  where phone_line_id is not null;

create table if not exists public.secretary_call_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.secretary_calls(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  speaker text not null check (speaker in ('CALLER','SECRETARY','SYSTEM')),
  transcript text not null,
  language text null,
  intent text null,
  decision jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  raw_audio_persisted boolean not null default false,
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (call_id, sequence_number),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index if not exists secretary_call_turns_call_idx
  on public.secretary_call_turns (organization_id, call_id, sequence_number);

alter table public.secretary_phone_lines enable row level security;
alter table public.secretary_call_turns enable row level security;

revoke all on public.secretary_phone_lines from anon, authenticated;
revoke all on public.secretary_call_turns from anon, authenticated;
grant select, insert, update, delete on public.secretary_phone_lines to service_role;
grant select, insert, update, delete on public.secretary_call_turns to service_role;

comment on table public.secretary_phone_lines is
  'Avantiqo-owned phone-line registry. INTERNAL, WEBRTC, SIP or PSTN describes byte transport only; no carrier owns Secretary policy, intelligence, contacts, calendar, memory or call state.';
comment on table public.secretary_call_turns is
  'Avantiqo-owned normalized conversation turns for Secretary calls. Raw audio is not persisted by default.';

commit;
