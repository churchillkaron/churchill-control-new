begin;

alter table public.intelligence_memories
  add column if not exists valid_until timestamptz null,
  add column if not exists superseded_by uuid null references public.intelligence_memories(id) on delete set null,
  add column if not exists superseded_at timestamptz null,
  add column if not exists forgotten_at timestamptz null;

create index if not exists intelligence_memories_validity_idx
  on public.intelligence_memories (organization_id, active, valid_until, updated_at desc);

comment on column public.intelligence_memories.valid_until is
  'Optional expiry for mutable memories. Null means durable until superseded or forgotten.';
comment on column public.intelligence_memories.superseded_by is
  'Newer memory that replaces this memory without deleting provenance.';
comment on column public.intelligence_memories.forgotten_at is
  'Server-side forget timestamp; forgotten memories are inactive and excluded from recall.';

commit;
