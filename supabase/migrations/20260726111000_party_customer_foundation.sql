begin;

-- Canonical party foundation used by customer, supplier, employee and finance
-- runtimes. These tables were introduced by retired migrations and are absent
-- from some production histories, so restore the current organization-scoped
-- contract before supplier_profiles and Finance acceptance migrations run.

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  party_type text not null,
  legal_name text,
  display_name text not null,
  tax_id text,
  email text,
  phone text,
  address text,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parties
  add column if not exists organization_id uuid,
  add column if not exists party_type text,
  add column if not exists legal_name text,
  add column if not exists display_name text,
  add column if not exists tax_id text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.parties
set party_type = coalesce(nullif(btrim(party_type), ''), 'person'),
    display_name = coalesce(
      nullif(btrim(display_name), ''),
      nullif(btrim(legal_name), ''),
      nullif(btrim(email), ''),
      'Unnamed party'
    ),
    status = upper(coalesce(nullif(btrim(status), ''), 'ACTIVE')),
    metadata = coalesce(metadata, '{}'::jsonb),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now())
where party_type is null
   or btrim(party_type) = ''
   or display_name is null
   or btrim(display_name) = ''
   or status is null
   or btrim(status) = ''
   or metadata is null
   or created_at is null
   or updated_at is null;

create index if not exists parties_organization_name_idx
  on public.parties (organization_id, display_name, created_at desc);

create index if not exists parties_organization_email_idx
  on public.parties (organization_id, lower(email))
  where nullif(btrim(email), '') is not null;

create index if not exists parties_organization_phone_idx
  on public.parties (organization_id, phone)
  where nullif(btrim(phone), '') is not null;

create table if not exists public.party_relationships (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null,
  organization_id uuid not null,
  relationship_type text not null,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint party_relationships_party_id_fkey
    foreign key (party_id)
    references public.parties(id)
    on delete cascade,
  constraint party_relationships_scope_unique
    unique (organization_id, party_id, relationship_type)
);

alter table public.party_relationships
  add column if not exists party_id uuid,
  add column if not exists organization_id uuid,
  add column if not exists relationship_type text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.party_relationships
set status = upper(coalesce(nullif(btrim(status), ''), 'ACTIVE')),
    metadata = coalesce(metadata, '{}'::jsonb),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, created_at, now())
where status is null
   or btrim(status) = ''
   or metadata is null
   or created_at is null
   or updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'party_relationships_party_id_fkey'
      and conrelid = 'public.party_relationships'::regclass
  ) then
    alter table public.party_relationships
      add constraint party_relationships_party_id_fkey
      foreign key (party_id)
      references public.parties(id)
      on delete cascade
      not valid;
  end if;
end
$$;

create index if not exists party_relationships_scope_idx
  on public.party_relationships (
    organization_id,
    relationship_type,
    status,
    party_id
  );

create table if not exists public.customer_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  party_id uuid not null,
  customer_number text,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_type text not null default 'PERSON',
  company_name text,
  tax_number text,
  billing_address text,
  shipping_address text,
  city text,
  state text,
  postal_code text,
  country text,
  preferred_language text,
  preferred_currency text,
  credit_limit numeric(20,4) not null default 0,
  payment_terms text,
  birthday date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_loyalty_accounts_party_id_fkey
    foreign key (party_id)
    references public.parties(id)
    on delete restrict,
  constraint customer_loyalty_accounts_organization_party_unique
    unique (organization_id, party_id)
);

alter table public.customer_loyalty_accounts
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists party_id uuid,
  add column if not exists customer_number text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists customer_type text default 'PERSON',
  add column if not exists company_name text,
  add column if not exists tax_number text,
  add column if not exists billing_address text,
  add column if not exists shipping_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists preferred_language text,
  add column if not exists preferred_currency text,
  add column if not exists credit_limit numeric(20,4) default 0,
  add column if not exists payment_terms text,
  add column if not exists birthday date,
  add column if not exists notes text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.customer_loyalty_accounts customer
set customer_name = coalesce(
      nullif(btrim(customer.customer_name), ''),
      party.display_name,
      party.legal_name,
      'Unnamed customer'
    ),
    customer_phone = coalesce(customer.customer_phone, party.phone),
    customer_email = coalesce(customer.customer_email, party.email),
    customer_type = upper(coalesce(nullif(btrim(customer.customer_type), ''), 'PERSON')),
    credit_limit = coalesce(customer.credit_limit, 0),
    metadata = coalesce(customer.metadata, '{}'::jsonb),
    created_at = coalesce(customer.created_at, now()),
    updated_at = coalesce(customer.updated_at, customer.created_at, now())
from public.parties party
where party.id = customer.party_id
  and (
    customer.customer_name is null
    or btrim(customer.customer_name) = ''
    or customer.customer_phone is null
    or customer.customer_email is null
    or customer.customer_type is null
    or btrim(customer.customer_type) = ''
    or customer.credit_limit is null
    or customer.metadata is null
    or customer.created_at is null
    or customer.updated_at is null
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_loyalty_accounts_party_id_fkey'
      and conrelid = 'public.customer_loyalty_accounts'::regclass
  ) then
    alter table public.customer_loyalty_accounts
      add constraint customer_loyalty_accounts_party_id_fkey
      foreign key (party_id)
      references public.parties(id)
      on delete restrict
      not valid;
  end if;
end
$$;

create index if not exists customer_loyalty_accounts_scope_idx
  on public.customer_loyalty_accounts (
    organization_id,
    entity_id,
    created_at desc
  );

create index if not exists customer_loyalty_accounts_party_idx
  on public.customer_loyalty_accounts (organization_id, party_id);

create or replace function public.party_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.parties party
    where party.id = new.party_id
      and party.organization_id = new.organization_id
  ) then
    raise exception 'party is outside organization scope';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists party_relationships_scope_guard
  on public.party_relationships;

create trigger party_relationships_scope_guard
before insert or update of organization_id, party_id
on public.party_relationships
for each row
execute function public.party_scope_guard();

drop trigger if exists customer_loyalty_accounts_scope_guard
  on public.customer_loyalty_accounts;

create trigger customer_loyalty_accounts_scope_guard
before insert or update of organization_id, party_id
on public.customer_loyalty_accounts
for each row
execute function public.party_scope_guard();

alter table public.parties enable row level security;
alter table public.party_relationships enable row level security;
alter table public.customer_loyalty_accounts enable row level security;

grant select, insert, update, delete on table public.parties to service_role;
grant select, insert, update, delete on table public.party_relationships to service_role;
grant select, insert, update, delete on table public.customer_loyalty_accounts to service_role;
grant execute on function public.party_scope_guard() to service_role;

comment on table public.parties is
  'Canonical organization-scoped party master for people and organizations.';

comment on table public.party_relationships is
  'Organization-scoped roles held by a canonical party, including customer, supplier, employee and owner.';

comment on table public.customer_loyalty_accounts is
  'Customer profile linked to the canonical party master and optional legal entity scope.';

notify pgrst, 'reload schema';

commit;
