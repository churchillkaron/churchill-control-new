begin;

create table if not exists public.accounting_practice_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  billing_method text not null default 'TIME_AND_MATERIALS'
    check (billing_method in ('TIME_AND_MATERIALS','FIXED_FEE','HYBRID','NON_BILLABLE')),
  currency_code text not null default 'THB',
  default_hourly_rate numeric(18,4) check (default_hourly_rate is null or default_hourly_rate >= 0),
  fixed_fee_amount numeric(18,4) check (fixed_fee_amount is null or fixed_fee_amount >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  updated_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accounting_firm_id, engagement_id)
);

create index if not exists accounting_practice_billing_profiles_client_idx
  on public.accounting_practice_billing_profiles (accounting_firm_id, organization_id, status, engagement_id);

create table if not exists public.accounting_practice_time_entries (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete set null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  run_id uuid references public.accounting_engagement_runs(id) on delete set null,
  work_item_id uuid references public.accounting_engagement_work_items(id) on delete set null,
  staff_account_id uuid not null references public.staff_accounts(id) on delete restrict,
  work_date date not null default current_date,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  billable boolean not null default true,
  billing_rate numeric(18,4) check (billing_rate is null or billing_rate >= 0),
  currency_code text not null default 'THB',
  description text,
  status text not null default 'SUBMITTED'
    check (status in ('DRAFT','SUBMITTED','APPROVED','BILLED','VOID')),
  approved_by uuid references public.staff_accounts(id) on delete set null,
  approved_at timestamptz,
  billing_reference text,
  billed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'APPROVED' and status <> 'BILLED') or approved_at is not null),
  check (status <> 'BILLED' or billed_at is not null)
);

create index if not exists accounting_practice_time_entries_firm_date_idx
  on public.accounting_practice_time_entries (accounting_firm_id, work_date desc, created_at desc);
create index if not exists accounting_practice_time_entries_client_wip_idx
  on public.accounting_practice_time_entries (accounting_firm_id, organization_id, engagement_id, status, billable, work_date desc);
create index if not exists accounting_practice_time_entries_work_item_idx
  on public.accounting_practice_time_entries (work_item_id, status, work_date desc)
  where work_item_id is not null;
create index if not exists accounting_practice_time_entries_staff_idx
  on public.accounting_practice_time_entries (accounting_firm_id, staff_account_id, work_date desc, status);

alter table public.accounting_practice_billing_profiles enable row level security;
alter table public.accounting_practice_time_entries enable row level security;

revoke all on table public.accounting_practice_billing_profiles from anon, authenticated;
revoke all on table public.accounting_practice_time_entries from anon, authenticated;
grant select, insert, update, delete on table public.accounting_practice_billing_profiles to service_role;
grant select, insert, update, delete on table public.accounting_practice_time_entries to service_role;

comment on table public.accounting_practice_billing_profiles is
  'Accounting-practice engagement billing policy. Rates and fixed fees are explicit human-controlled policy and are never inferred.';
comment on table public.accounting_practice_time_entries is
  'Auditable actual staff time against governed accounting client work. Supports budget-to-actual, utilization, WIP and billing readiness without granting invoice authority.';

commit;
