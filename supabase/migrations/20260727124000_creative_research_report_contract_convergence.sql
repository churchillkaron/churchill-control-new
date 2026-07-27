begin;

create table if not exists public.creative_research_reports (
  id uuid primary key,
  organization_id uuid not null,
  creative_project_id uuid,
  creative_brief_id uuid,
  summary text not null default '',
  audience jsonb not null default '{}'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  trends jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  messaging jsonb not null default '{}'::jsonb,
  visual_direction jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0,
  reasoning jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creative_research_reports
  add column if not exists organization_id uuid,
  add column if not exists creative_project_id uuid,
  add column if not exists creative_brief_id uuid,
  add column if not exists summary text default '',
  add column if not exists audience jsonb default '{}'::jsonb,
  add column if not exists competitors jsonb default '[]'::jsonb,
  add column if not exists trends jsonb default '[]'::jsonb,
  add column if not exists keywords jsonb default '[]'::jsonb,
  add column if not exists messaging jsonb default '{}'::jsonb,
  add column if not exists visual_direction jsonb default '{}'::jsonb,
  add column if not exists recommendations jsonb default '[]'::jsonb,
  add column if not exists confidence numeric default 0,
  add column if not exists reasoning jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Preserve legacy scope columns when older deployments used project_id or brief_id.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creative_research_reports'
      and column_name = 'project_id'
  ) then
    execute $sql$
      update public.creative_research_reports
      set creative_project_id = project_id
      where creative_project_id is null
        and project_id is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creative_research_reports'
      and column_name = 'brief_id'
  ) then
    execute $sql$
      update public.creative_research_reports
      set creative_brief_id = brief_id
      where creative_brief_id is null
        and brief_id is not null
    $sql$;
  end if;
end
$$;

-- Recover project scope through the canonical brief relation where possible.
do $$
begin
  if to_regclass('public.creative_briefs') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'creative_briefs'
         and column_name = 'creative_project_id'
     ) then
    update public.creative_research_reports report
    set creative_project_id = brief.creative_project_id
    from public.creative_briefs brief
    where report.creative_project_id is null
      and report.creative_brief_id = brief.id
      and brief.creative_project_id is not null;
  end if;
end
$$;

-- Recover organisation scope from the canonical project when an old row lacks it.
do $$
begin
  if to_regclass('public.creative_projects') is not null then
    update public.creative_research_reports report
    set organization_id = project.organization_id
    from public.creative_projects project
    where report.organization_id is null
      and report.creative_project_id = project.id
      and project.organization_id is not null;
  end if;
end
$$;

update public.creative_research_reports
set
  summary = coalesce(summary, ''),
  audience = coalesce(audience, '{}'::jsonb),
  competitors = coalesce(competitors, '[]'::jsonb),
  trends = coalesce(trends, '[]'::jsonb),
  keywords = coalesce(keywords, '[]'::jsonb),
  messaging = coalesce(messaging, '{}'::jsonb),
  visual_direction = coalesce(visual_direction, '{}'::jsonb),
  recommendations = coalesce(recommendations, '[]'::jsonb),
  confidence = coalesce(confidence, 0),
  reasoning = coalesce(reasoning, '{}'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

-- Keep unresolved legacy rows without pretending that their scope is known.
update public.creative_research_reports
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'scope_status', 'LEGACY_UNRESOLVED',
  'scope_convergence_migration', '20260727124000'
)
where creative_project_id is null;

alter table public.creative_research_reports
  alter column summary set default '',
  alter column summary set not null,
  alter column audience set default '{}'::jsonb,
  alter column audience set not null,
  alter column competitors set default '[]'::jsonb,
  alter column competitors set not null,
  alter column trends set default '[]'::jsonb,
  alter column trends set not null,
  alter column keywords set default '[]'::jsonb,
  alter column keywords set not null,
  alter column messaging set default '{}'::jsonb,
  alter column messaging set not null,
  alter column visual_direction set default '{}'::jsonb,
  alter column visual_direction set not null,
  alter column recommendations set default '[]'::jsonb,
  alter column recommendations set not null,
  alter column confidence set default 0,
  alter column confidence set not null,
  alter column reasoning set default '{}'::jsonb,
  alter column reasoning set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- Enforce required scope only when all preserved legacy rows can satisfy it.
do $$
begin
  if not exists (
    select 1
    from public.creative_research_reports
    where organization_id is null
  ) then
    alter table public.creative_research_reports
      alter column organization_id set not null;
  end if;

  if not exists (
    select 1
    from public.creative_research_reports
    where creative_project_id is null
  ) then
    alter table public.creative_research_reports
      alter column creative_project_id set not null;
  end if;
end
$$;

create index if not exists creative_research_reports_organization_idx
  on public.creative_research_reports (organization_id, created_at desc);

create index if not exists creative_research_reports_project_idx
  on public.creative_research_reports (
    organization_id,
    creative_project_id,
    created_at desc
  )
  where creative_project_id is not null;

create index if not exists creative_research_reports_brief_idx
  on public.creative_research_reports (
    organization_id,
    creative_brief_id,
    created_at desc
  )
  where creative_brief_id is not null;

alter table public.creative_research_reports enable row level security;

comment on table public.creative_research_reports is
  'Source-backed Creative company and market research reports scoped to an organisation, project and optional brief.';

comment on column public.creative_research_reports.reasoning is
  'Provider, model, usage, billing and reasoning provenance for the research execution.';

comment on column public.creative_research_reports.metadata is
  'Validated research evidence, sources, claims, policy, confidence and contract metadata.';

commit;
