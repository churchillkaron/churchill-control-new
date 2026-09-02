begin;

create table if not exists public.analytics_metric_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  metric_id text not null,
  display_name text,
  enabled boolean not null default true,
  target_value numeric,
  target_direction text not null default 'NONE',
  warning_threshold numeric,
  critical_threshold numeric,
  lower_bound numeric,
  upper_bound numeric,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_metric_config_target_direction_check
    check (target_direction in ('NONE','HIGHER_IS_BETTER','LOWER_IS_BETTER','RANGE')),
  constraint analytics_metric_config_range_check
    check (lower_bound is null or upper_bound is null or upper_bound >= lower_bound)
);

create unique index if not exists analytics_metric_config_org_unique
  on public.analytics_metric_configurations (organization_id, metric_id)
  where entity_id is null;
create unique index if not exists analytics_metric_config_entity_unique
  on public.analytics_metric_configurations (organization_id, entity_id, metric_id)
  where entity_id is not null;
create index if not exists analytics_metric_config_lookup_idx
  on public.analytics_metric_configurations (organization_id, entity_id, enabled, metric_id);

create table if not exists public.analytics_metric_follows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  staff_account_id uuid not null references public.staff_accounts(id) on delete cascade,
  metric_id text not null,
  favorite boolean not null default false,
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists analytics_metric_follows_org_unique
  on public.analytics_metric_follows (organization_id, staff_account_id, metric_id)
  where entity_id is null;
create unique index if not exists analytics_metric_follows_entity_unique
  on public.analytics_metric_follows (organization_id, entity_id, staff_account_id, metric_id)
  where entity_id is not null;
create index if not exists analytics_metric_follows_staff_idx
  on public.analytics_metric_follows (organization_id, staff_account_id, favorite desc, metric_id);

create table if not exists public.analytics_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  staff_account_id uuid references public.staff_accounts(id) on delete cascade,
  name text not null,
  view_type text not null default 'METRIC_BOARD',
  definition jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  is_shared boolean not null default false,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_saved_views_type_check
    check (view_type in ('METRIC_BOARD','REPORT','EXPLORATION','FORECAST'))
);

create index if not exists analytics_saved_views_lookup_idx
  on public.analytics_saved_views (organization_id, entity_id, staff_account_id, view_type, updated_at desc);

create table if not exists public.analytics_metric_alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  metric_id text not null,
  name text not null,
  condition_type text not null,
  threshold_value numeric,
  threshold_upper numeric,
  comparison_period text,
  active boolean not null default true,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  notification_channels text[] not null default '{}',
  cooldown_minutes integer not null default 60,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_metric_alert_condition_check
    check (condition_type in ('ABOVE','BELOW','OUTSIDE_RANGE','CHANGE_ABOVE','CHANGE_BELOW','OFF_TARGET')),
  constraint analytics_metric_alert_range_check
    check (condition_type <> 'OUTSIDE_RANGE' or (threshold_value is not null and threshold_upper is not null and threshold_upper >= threshold_value)),
  constraint analytics_metric_alert_cooldown_check check (cooldown_minutes >= 0)
);

create index if not exists analytics_metric_alert_rules_lookup_idx
  on public.analytics_metric_alert_rules (organization_id, entity_id, active, metric_id);

create table if not exists public.analytics_metric_alert_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  rule_id uuid references public.analytics_metric_alert_rules(id) on delete set null,
  metric_id text not null,
  observed_value numeric,
  comparison_value numeric,
  threshold_value numeric,
  status text not null default 'OPEN',
  triggered_at timestamptz not null default now(),
  acknowledged_by uuid references public.staff_accounts(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  constraint analytics_metric_alert_event_status_check
    check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED'))
);

create index if not exists analytics_metric_alert_events_queue_idx
  on public.analytics_metric_alert_events (organization_id, entity_id, status, triggered_at desc);
create index if not exists analytics_metric_alert_events_metric_idx
  on public.analytics_metric_alert_events (organization_id, metric_id, triggered_at desc);

create table if not exists public.analytics_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  metric_id text not null,
  snapshot_date date not null,
  value numeric,
  unit text not null,
  currency_code text,
  metric_status text,
  source_watermark timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists analytics_metric_snapshots_org_unique
  on public.analytics_metric_snapshots (organization_id, metric_id, snapshot_date)
  where entity_id is null;
create unique index if not exists analytics_metric_snapshots_entity_unique
  on public.analytics_metric_snapshots (organization_id, entity_id, metric_id, snapshot_date)
  where entity_id is not null;
create index if not exists analytics_metric_snapshots_history_idx
  on public.analytics_metric_snapshots (organization_id, entity_id, metric_id, snapshot_date desc);

create table if not exists public.analytics_annotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  metric_id text not null,
  annotation_date date not null,
  title text,
  note text not null,
  reference_type text,
  reference_id uuid,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_annotations_metric_idx
  on public.analytics_annotations (organization_id, entity_id, metric_id, annotation_date desc);

create table if not exists public.analytics_forecast_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  metric_id text not null,
  name text not null,
  method text not null default 'LINEAR_TREND',
  lookback_days integer not null default 90,
  horizon_days integer not null default 30,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_forecast_method_check
    check (method in ('LINEAR_TREND','MOVING_AVERAGE','SEASONAL_NAIVE')),
  constraint analytics_forecast_lookback_check check (lookback_days between 7 and 1095),
  constraint analytics_forecast_horizon_check check (horizon_days between 1 and 365)
);

create index if not exists analytics_forecast_definitions_lookup_idx
  on public.analytics_forecast_definitions (organization_id, entity_id, active, metric_id);

create table if not exists public.analytics_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  definition_id uuid references public.analytics_forecast_definitions(id) on delete set null,
  metric_id text not null,
  method text not null,
  as_of_date date not null,
  forecast_date date not null,
  predicted_value numeric not null,
  lower_bound numeric,
  upper_bound numeric,
  actual_value numeric,
  model_version text not null default 'analytics-statistical-v1',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_forecast_run_bounds_check
    check (lower_bound is null or upper_bound is null or upper_bound >= lower_bound)
);

create index if not exists analytics_forecast_runs_metric_idx
  on public.analytics_forecast_runs (organization_id, entity_id, metric_id, as_of_date desc, forecast_date);

alter table public.analytics_metric_configurations enable row level security;
alter table public.analytics_metric_follows enable row level security;
alter table public.analytics_saved_views enable row level security;
alter table public.analytics_metric_alert_rules enable row level security;
alter table public.analytics_metric_alert_events enable row level security;
alter table public.analytics_metric_snapshots enable row level security;
alter table public.analytics_annotations enable row level security;
alter table public.analytics_forecast_definitions enable row level security;
alter table public.analytics_forecast_runs enable row level security;

comment on table public.analytics_metric_configurations is
  'Organization/entity presentation, target and threshold configuration for deterministic semantic metrics. Source business truth remains in owning domains.';
comment on table public.analytics_metric_snapshots is
  'Immutable point-in-time metric evidence for trend comparison. Snapshots are analytical evidence, not source business truth.';
comment on table public.analytics_metric_alert_events is
  'Condition evaluation evidence for semantic metrics; alert rows do not change source business records.';
comment on table public.analytics_forecast_runs is
  'Reproducible statistical forecast evidence with method and input provenance; forecasts never replace actual business truth.';

commit;
