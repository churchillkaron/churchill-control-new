create table if not exists public.marketing_campaign_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_group_name text not null,
  campaign_group_type text not null default 'multi_organization',
  campaign_status text not null default 'draft',
  objective text,
  start_date date,
  end_date date,
  budget numeric not null default 0,
  currency_code text,
  campaign_content jsonb not null default '{}'::jsonb,
  performance_metrics jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_groups_budget_nonnegative check (budget >= 0)
);

create table if not exists public.marketing_campaign_group_members (
  id uuid primary key default gen_random_uuid(),
  campaign_group_id uuid not null references public.marketing_campaign_groups(id) on delete cascade,
  marketing_campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  member_role text not null default 'participant',
  member_status text not null default 'active',
  sequence_no integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_group_members_unique_campaign unique (marketing_campaign_id),
  constraint marketing_campaign_group_members_unique_group_campaign unique (campaign_group_id, marketing_campaign_id)
);

create index if not exists marketing_campaign_groups_organization_idx
  on public.marketing_campaign_groups (organization_id, campaign_status, created_at desc);

create index if not exists marketing_campaign_group_members_group_idx
  on public.marketing_campaign_group_members (campaign_group_id, sequence_no, created_at);

create index if not exists marketing_campaign_group_members_organization_idx
  on public.marketing_campaign_group_members (organization_id, campaign_group_id);

alter table public.marketing_campaign_groups enable row level security;
alter table public.marketing_campaign_group_members enable row level security;

revoke all on table public.marketing_campaign_groups from anon, authenticated;
revoke all on table public.marketing_campaign_group_members from anon, authenticated;
