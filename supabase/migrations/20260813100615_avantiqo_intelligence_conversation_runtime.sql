create table if not exists public.intelligence_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  entity_id uuid null,
  period_id uuid null,
  conversation_key text not null,
  title text null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED','CLOSED')),
  agreement_state jsonb not null default '{}'::jsonb,
  project_state jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, party_id, conversation_key)
);

create table if not exists public.intelligence_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.intelligence_conversations(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  source text not null default 'text',
  content text not null,
  decision jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  navigation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_conversations_scope_idx
  on public.intelligence_conversations (organization_id, party_id, status, updated_at desc);
create index if not exists intelligence_turns_conversation_idx
  on public.intelligence_turns (organization_id, conversation_id, created_at desc);
create index if not exists intelligence_turns_party_idx
  on public.intelligence_turns (organization_id, party_id, created_at desc);

alter table public.intelligence_conversations enable row level security;
alter table public.intelligence_turns enable row level security;

revoke all on table public.intelligence_conversations from anon, authenticated;
revoke all on table public.intelligence_turns from anon, authenticated;
grant all on table public.intelligence_conversations to service_role;
grant all on table public.intelligence_turns to service_role;
