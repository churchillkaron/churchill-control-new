begin;

create table if not exists public.intelligence_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  party_id uuid null,
  entity_id uuid null,
  conversation_id uuid null references public.intelligence_conversations(id) on delete set null,
  source_turn_id uuid null references public.intelligence_turns(id) on delete set null,
  memory_scope text not null,
  memory_key text not null,
  memory_type text not null check (memory_type in (
    'goal',
    'decision',
    'constraint',
    'preference',
    'fact',
    'lesson',
    'completed_step',
    'blocker',
    'relationship'
  )),
  subject text null,
  content text not null,
  importance numeric(4,3) not null default 0.500 check (importance >= 0 and importance <= 1),
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  source text not null default 'operator',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  recall_count integer not null default 0 check (recall_count >= 0),
  last_recalled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, memory_scope, memory_key)
);

create index if not exists intelligence_memories_recall_idx
  on public.intelligence_memories (
    organization_id,
    memory_scope,
    active,
    importance desc,
    updated_at desc
  );

create index if not exists intelligence_memories_party_idx
  on public.intelligence_memories (
    organization_id,
    party_id,
    active,
    updated_at desc
  );

create index if not exists intelligence_memories_entity_idx
  on public.intelligence_memories (
    organization_id,
    entity_id,
    active,
    updated_at desc
  );

alter table public.intelligence_memories enable row level security;

revoke all on table public.intelligence_memories from anon, authenticated;
grant select, insert, update, delete on table public.intelligence_memories to service_role;

comment on table public.intelligence_memories is
  'Server-owned long-term memory for Avantiqo Synthetic Intelligence. Conversation turns remain in intelligence_turns; this table stores durable, scoped facts, goals, decisions, constraints and learned operating context.';

commit;
