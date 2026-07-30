begin;

-- supplier_profiles is the canonical supplier/vendor profile used by
-- Procurement, Finance vendor APIs, VendorRepository and the total acceptance
-- probe. Some production environments never received its retired base
-- migration, so establish the complete current contract before the Finance
-- acceptance repair executes.

create table if not exists public.supplier_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  party_id uuid not null,
  vendor_code text,
  payment_terms text,
  default_expense_account uuid,
  default_ap_account uuid,
  risk_level text not null default 'LOW',
  is_active boolean not null default true,
  is_blocked boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_profiles_party_id_fkey
    foreign key (party_id)
    references public.parties(id)
    on delete restrict,
  constraint supplier_profiles_organization_party_unique
    unique (organization_id, party_id)
);

create unique index if not exists supplier_profiles_vendor_code_unique
  on public.supplier_profiles (
    organization_id,
    lower(btrim(vendor_code))
  )
  where nullif(btrim(vendor_code), '') is not null;

create index if not exists supplier_profiles_organization_active_idx
  on public.supplier_profiles (
    organization_id,
    is_active,
    is_blocked,
    created_at desc
  );

create index if not exists supplier_profiles_party_idx
  on public.supplier_profiles (party_id);

create or replace function public.supplier_profiles_assert_party_scope()
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
    raise exception 'supplier profile party is outside organization scope';
  end if;

  new.vendor_code := nullif(btrim(new.vendor_code), '');
  new.risk_level := upper(coalesce(nullif(btrim(new.risk_level), ''), 'LOW'));
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists supplier_profiles_party_scope_guard
  on public.supplier_profiles;

create trigger supplier_profiles_party_scope_guard
before insert or update of organization_id, party_id, vendor_code, risk_level
on public.supplier_profiles
for each row
execute function public.supplier_profiles_assert_party_scope();

alter table public.supplier_profiles enable row level security;

grant select, insert, update, delete
  on table public.supplier_profiles
  to service_role;

grant execute
  on function public.supplier_profiles_assert_party_scope()
  to service_role;

comment on table public.supplier_profiles is
  'Organization-scoped supplier configuration linked to the canonical party master.';

comment on column public.supplier_profiles.party_id is
  'Canonical supplier party. Finance and procurement documents reference the party identifier, not the supplier profile identifier.';

notify pgrst, 'reload schema';

commit;
