create table if not exists public.organization_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section_key text not null check (char_length(btrim(section_key)) > 0),
  workflow_state text not null default 'IN_PROGRESS' check (workflow_state in ('IN_PROGRESS','SKIPPED','COMPLETE')),
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, section_key)
);

create index if not exists organization_onboarding_progress_org_idx
  on public.organization_onboarding_progress (organization_id, updated_at desc);

comment on table public.organization_onboarding_progress is
  'Organization-scoped progressive onboarding workflow state. Configuration readiness remains derived from canonical business data; this table records only human setup workflow decisions such as skipped or complete.';

alter table public.organization_onboarding_progress enable row level security;

revoke all on table public.organization_onboarding_progress from public, anon, authenticated;
