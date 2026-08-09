alter table public.organization_channel_connections
  drop constraint if exists organization_channel_connections_organization_provider_key;

alter table public.organization_channel_connections
  add constraint organization_channel_connections_organization_provider_key
  unique (organization_id, provider);

alter table public.organization_channel_assets
  drop constraint if exists organization_channel_assets_organization_provider_external_key;

alter table public.organization_channel_assets
  add constraint organization_channel_assets_organization_provider_external_key
  unique (organization_id, channel_provider, external_id);

drop index if exists public.reputation_reviews_org_platform_external_uidx;

create unique index reputation_reviews_org_platform_external_uidx
  on public.reputation_reviews (organization_id, platform, external_review_id);

alter table public.reputation_reviews
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null,
  add column if not exists party_id uuid references public.parties(id) on delete set null,
  add column if not exists channel_connection_id uuid references public.organization_channel_connections(id) on delete set null,
  add column if not exists channel_asset_id uuid references public.organization_channel_assets(id) on delete set null,
  add column if not exists language_code text,
  add column if not exists classification text,
  add column if not exists sentiment_score numeric,
  add column if not exists response_strategy text,
  add column if not exists response_generated_at timestamptz,
  add column if not exists response_published_at timestamptz,
  add column if not exists response_attempts integer not null default 0,
  add column if not exists last_response_error text,
  add column if not exists remote_reply_time timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.reputation_reviews
set response_status = 'NEEDS_REVIEW'
where response_status is null;

alter table public.reputation_reviews
  alter column response_status set default 'NEEDS_REVIEW',
  alter column response_status set not null;

alter table public.reputation_reviews
  drop constraint if exists reputation_reviews_response_status_check;

alter table public.reputation_reviews
  add constraint reputation_reviews_response_status_check
  check (
    response_status in (
      'NEEDS_REVIEW',
      'PROCESSING',
      'PENDING_APPROVAL',
      'ESCALATED',
      'PUBLISHING',
      'PUBLISHED',
      'FAILED',
      'SKIPPED'
    )
  );

alter table public.reputation_reviews
  drop constraint if exists reputation_reviews_sentiment_score_check;

alter table public.reputation_reviews
  add constraint reputation_reviews_sentiment_score_check
  check (sentiment_score is null or sentiment_score between -1 and 1);

create index if not exists reputation_reviews_automation_queue_idx
  on public.reputation_reviews (organization_id, response_status, review_time desc);

create table if not exists public.reputation_review_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  channel_asset_id uuid references public.organization_channel_assets(id) on delete cascade,
  enabled boolean not null default true,
  brand_name text not null,
  brand_voice text not null,
  default_language text not null default 'en',
  auto_publish_min_rating smallint not null default 4,
  approval_min_rating smallint not null default 1,
  critical_max_rating smallint not null default 2,
  max_reply_length integer not null default 900,
  backfill_started_at timestamptz,
  backfill_completed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reputation_review_policies_scope_key
    unique nulls not distinct (organization_id, entity_id, channel_asset_id),
  constraint reputation_review_policies_rating_check
    check (
      auto_publish_min_rating between 1 and 5
      and approval_min_rating between 1 and 5
      and critical_max_rating between 1 and 5
      and critical_max_rating < auto_publish_min_rating
      and approval_min_rating < auto_publish_min_rating
    ),
  constraint reputation_review_policies_reply_length_check
    check (max_reply_length between 120 and 4000)
);

create index if not exists reputation_review_policies_active_idx
  on public.reputation_review_policies (organization_id, enabled);

create table if not exists public.reputation_recovery_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid references public.legal_entities(id) on delete set null,
  party_id uuid references public.parties(id) on delete set null,
  review_id uuid not null references public.reputation_reviews(id) on delete cascade,
  status text not null default 'OPEN',
  priority text not null default 'CRITICAL',
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reputation_recovery_cases_review_key unique (review_id),
  constraint reputation_recovery_cases_status_check
    check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  constraint reputation_recovery_cases_priority_check
    check (priority in ('NORMAL', 'HIGH', 'CRITICAL'))
);

create index if not exists reputation_recovery_cases_open_idx
  on public.reputation_recovery_cases (organization_id, status, priority, opened_at desc);

alter table public.reputation_reviews enable row level security;
alter table public.review_platform_profiles enable row level security;
alter table public.reputation_review_policies enable row level security;
alter table public.reputation_recovery_cases enable row level security;

revoke all on table public.reputation_reviews from anon, authenticated;
revoke all on table public.review_platform_profiles from anon, authenticated;
revoke all on table public.reputation_review_policies from anon, authenticated;
revoke all on table public.reputation_recovery_cases from anon, authenticated;

grant select, insert, update, delete on table public.reputation_reviews to service_role;
grant select, insert, update, delete on table public.review_platform_profiles to service_role;
grant select, insert, update, delete on table public.reputation_review_policies to service_role;
grant select, insert, update, delete on table public.reputation_recovery_cases to service_role;

insert into public.reputation_review_policies (
  organization_id,
  entity_id,
  channel_asset_id,
  enabled,
  brand_name,
  brand_voice,
  default_language,
  auto_publish_min_rating,
  approval_min_rating,
  critical_max_rating,
  max_reply_length
)
select
  organizations.id,
  null,
  null,
  true,
  'Churchill Restaurant & Bar',
  'Warm, attentive and confident hospitality. Keep replies concise, personal and sincere. Never invent facts, promise compensation, admit liability or disclose private information.',
  'en',
  4,
  1,
  2,
  900
from public.organizations
where lower(organizations.name) = lower('Churchill Restaurant & Bar')
on conflict on constraint reputation_review_policies_scope_key
do update set
  enabled = excluded.enabled,
  brand_name = excluded.brand_name,
  brand_voice = excluded.brand_voice,
  default_language = excluded.default_language,
  auto_publish_min_rating = excluded.auto_publish_min_rating,
  approval_min_rating = excluded.approval_min_rating,
  critical_max_rating = excluded.critical_max_rating,
  max_reply_length = excluded.max_reply_length,
  updated_at = now();
