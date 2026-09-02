begin;

create table if not exists public.finance_review_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  period_id uuid,
  capability_id text not null,
  record_key text not null,
  record_type text,
  record_label text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PREPARATION','READY_FOR_REVIEW','CHANGES_REQUESTED','REVIEWED','CLEARED','LOCKED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  preparer_id uuid,
  reviewer_id uuid,
  due_at timestamptz,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_review_items_scope_record_uidx
  on public.finance_review_items (
    organization_id,
    capability_id,
    record_key,
    coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists finance_review_items_queue_idx
  on public.finance_review_items (organization_id, status, due_at, updated_at desc);

create index if not exists finance_review_items_entity_period_idx
  on public.finance_review_items (organization_id, entity_id, period_id, capability_id);

create table if not exists public.finance_review_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_item_id uuid not null references public.finance_review_items(id) on delete cascade,
  note_type text not null default 'REVIEW' check (note_type in ('REVIEW','QUERY','TODO','RESOLUTION')),
  body text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  assigned_to uuid,
  created_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_review_notes_item_idx
  on public.finance_review_notes (organization_id, review_item_id, status, created_at desc);

create table if not exists public.finance_review_signoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_item_id uuid not null references public.finance_review_items(id) on delete cascade,
  signoff_role text not null check (signoff_role in ('PREPARER','REVIEWER','PARTNER')),
  signed_by uuid not null,
  signed_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  unique (review_item_id, signoff_role)
);

create index if not exists finance_review_signoffs_item_idx
  on public.finance_review_signoffs (organization_id, review_item_id, signed_at desc);

create table if not exists public.finance_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  capability_id text not null,
  name text not null,
  configuration jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, capability_id, name)
);

create index if not exists finance_saved_views_lookup_idx
  on public.finance_saved_views (organization_id, user_id, capability_id, is_default desc, updated_at desc);

alter table public.finance_review_items enable row level security;
alter table public.finance_review_notes enable row level security;
alter table public.finance_review_signoffs enable row level security;
alter table public.finance_saved_views enable row level security;

comment on table public.finance_review_items is
  'Accountant review queue layered over governed Finance records. This table does not mutate accounting documents or posting state.';
comment on table public.finance_review_notes is
  'Review notes, queries, to-dos and resolutions attached to Finance review items.';
comment on table public.finance_review_signoffs is
  'Preparer, reviewer and partner sign-off evidence for Finance review items.';
comment on table public.finance_saved_views is
  'Per-user Finance explorer view configuration. Presentation preferences never change accounting logic or permissions.';

commit;
