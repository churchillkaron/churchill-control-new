create table if not exists public.platform_acquisition_records (
  id uuid primary key default gen_random_uuid(),
  seller_organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid null references public.organization_leads(id) on delete set null,
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  customer_organization_id uuid null references public.organizations(id) on delete set null,
  stage text not null check (stage in (
    'PROSPECT',
    'QUALIFIED',
    'COMMITMENT_PENDING',
    'COMMITTED',
    'CUSTOMER_CREATED',
    'HUMAN_ACTIVE',
    'FIRST_VALUE',
    'LOST'
  )),
  source text null,
  source_reference text null,
  first_value_at timestamptz null,
  stage_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_acquisition_first_value_requires_customer check (
    first_value_at is null or customer_organization_id is not null
  )
);

create unique index if not exists platform_acquisition_records_seller_lead_unique
  on public.platform_acquisition_records(seller_organization_id, lead_id)
  where lead_id is not null;

create unique index if not exists platform_acquisition_records_seller_subscription_unique
  on public.platform_acquisition_records(seller_organization_id, subscription_id)
  where subscription_id is not null;

create index if not exists platform_acquisition_records_seller_stage_idx
  on public.platform_acquisition_records(seller_organization_id, stage, stage_updated_at desc);

create index if not exists platform_acquisition_records_customer_idx
  on public.platform_acquisition_records(customer_organization_id)
  where customer_organization_id is not null;

create table if not exists public.platform_acquisition_events (
  id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null references public.platform_acquisition_records(id) on delete cascade,
  seller_organization_id uuid not null references public.organizations(id) on delete restrict,
  from_stage text null check (from_stage is null or from_stage in (
    'PROSPECT',
    'QUALIFIED',
    'COMMITMENT_PENDING',
    'COMMITTED',
    'CUSTOMER_CREATED',
    'HUMAN_ACTIVE',
    'FIRST_VALUE',
    'LOST'
  )),
  to_stage text not null check (to_stage in (
    'PROSPECT',
    'QUALIFIED',
    'COMMITMENT_PENDING',
    'COMMITTED',
    'CUSTOMER_CREATED',
    'HUMAN_ACTIVE',
    'FIRST_VALUE',
    'LOST'
  )),
  evidence_type text not null,
  evidence_reference text null,
  note text null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists platform_acquisition_events_acquisition_idx
  on public.platform_acquisition_events(acquisition_id, occurred_at asc);

create index if not exists platform_acquisition_events_seller_idx
  on public.platform_acquisition_events(seller_organization_id, occurred_at desc);

alter table public.platform_acquisition_records enable row level security;
alter table public.platform_acquisition_events enable row level security;

revoke all on table public.platform_acquisition_records from anon, authenticated;
revoke all on table public.platform_acquisition_events from anon, authenticated;
grant select, insert, update, delete on table public.platform_acquisition_records to service_role;
grant select, insert on table public.platform_acquisition_events to service_role;
