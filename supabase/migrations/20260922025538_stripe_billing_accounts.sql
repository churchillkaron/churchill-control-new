create table if not exists public.stripe_billing_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_key text,
  status text not null default 'INACTIVE',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  automatic_tax_enabled boolean not null default false,
  latest_invoice_id text,
  latest_invoice_status text,
  last_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_billing_accounts_status_nonempty
    check (btrim(status) <> '')
);

alter table public.stripe_billing_accounts enable row level security;
revoke all on table public.stripe_billing_accounts from anon, authenticated;
grant all on table public.stripe_billing_accounts to service_role;
create index if not exists stripe_billing_accounts_subscription_idx
  on public.stripe_billing_accounts (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  status text not null default 'PROCESSING',
  attempt_count integer not null default 1,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_status_check
    check (status in ('PROCESSING', 'PROCESSED', 'FAILED')),
  constraint stripe_webhook_events_attempt_count_check
    check (attempt_count >= 1)
);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, created_at);
