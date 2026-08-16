-- Generic Operations cash-custody foundation.
-- Legal-entity-specific safe/petty-cash accounts are Finance configuration and are never seeded here.

create table if not exists public.operations_cash_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  name text not null,
  location_type text not null,
  finance_account_id uuid not null references public.chart_of_accounts(id),
  currency_code text not null,
  current_balance numeric(18,2) not null default 0,
  is_active boolean not null default true,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.staff_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_cash_locations_type_check
    check (upper(location_type) in ('SAFE','PETTY_CASH','CASH_OFFICE','BANK_DEPOSIT','OTHER')),
  constraint operations_cash_locations_balance_check check (current_balance >= 0),
  constraint operations_cash_locations_name_check check (nullif(btrim(name),'') is not null)
);

create unique index if not exists operations_cash_locations_name_uidx
  on public.operations_cash_locations (organization_id, entity_id, lower(btrim(name)));
create unique index if not exists operations_cash_locations_account_uidx
  on public.operations_cash_locations (organization_id, entity_id, finance_account_id)
  where is_active = true;
create unique index if not exists operations_cash_locations_idempotency_uidx
  on public.operations_cash_locations (organization_id, entity_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.operations_cash_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  application_id text not null,
  transfer_type text not null,
  source_location_id uuid references public.operations_cash_locations(id),
  destination_location_id uuid references public.operations_cash_locations(id),
  source_cash_session_id uuid references public.pos_shifts(id),
  destination_cash_session_id uuid references public.pos_shifts(id),
  amount numeric(18,2) not null,
  currency_code text not null,
  source_account_id uuid not null references public.chart_of_accounts(id),
  destination_account_id uuid not null references public.chart_of_accounts(id),
  journal_entry_id uuid not null references public.journal_entries(id),
  drawer_movement_id uuid,
  reason text not null,
  status text not null default 'POSTED',
  created_by uuid not null references public.staff_accounts(id),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operations_cash_transfers_type_check
    check (upper(transfer_type) in ('DRAWER_TO_LOCATION','LOCATION_TO_DRAWER','LOCATION_TO_LOCATION')),
  constraint operations_cash_transfers_amount_check check (amount > 0),
  constraint operations_cash_transfers_status_check check (upper(status) = 'POSTED'),
  constraint operations_cash_transfers_accounts_check check (source_account_id <> destination_account_id),
  constraint operations_cash_transfers_reason_check check (nullif(btrim(reason),'') is not null)
);

create unique index if not exists operations_cash_transfers_idempotency_uidx
  on public.operations_cash_transfers (organization_id, entity_id, idempotency_key);
create index if not exists operations_cash_transfers_scope_created_idx
  on public.operations_cash_transfers (organization_id, entity_id, application_id, created_at desc);
create index if not exists operations_cash_transfers_source_location_idx
  on public.operations_cash_transfers (source_location_id, created_at desc)
  where source_location_id is not null;
create index if not exists operations_cash_transfers_destination_location_idx
  on public.operations_cash_transfers (destination_location_id, created_at desc)
  where destination_location_id is not null;

alter table public.pos_cash_movements
  add column if not exists cash_transfer_id uuid references public.operations_cash_transfers(id);
create unique index if not exists pos_cash_movements_cash_transfer_uidx
  on public.pos_cash_movements (cash_transfer_id)
  where cash_transfer_id is not null;

alter table public.operations_cash_locations enable row level security;
alter table public.operations_cash_transfers enable row level security;
revoke all on table public.operations_cash_locations from public, anon, authenticated;
revoke all on table public.operations_cash_transfers from public, anon, authenticated;
grant all on table public.operations_cash_locations to service_role;
grant all on table public.operations_cash_transfers to service_role;

create or replace function public.operations_resolve_pos_cash_account(
  p_organization_id uuid,
  p_entity_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  select m.debit_account_id
  into v_account_id
  from public.finance_posting_mappings m
  where m.organization_id = p_organization_id
    and (m.entity_id = p_entity_id or m.entity_id is null)
    and m.event_type = 'POS_CASH_PAYMENT_RECEIVED'
    and upper(coalesce(m.status,'')) = 'ACTIVE'
  order by case when m.entity_id = p_entity_id then 0 else 1 end,
           m.priority,
           m.created_at
  limit 1;

  if v_account_id is null then
    raise exception 'Finance cash account is not configured for this legal entity';
  end if;

  return v_account_id;
end;
$$;

revoke all on function public.operations_resolve_pos_cash_account(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.operations_resolve_pos_cash_account(uuid,uuid)
  to service_role;

create or replace function public.operations_create_cash_location_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_name text,
  p_location_type text,
  p_finance_account_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_type text := upper(pg_catalog.btrim(coalesce(p_location_type,'')));
  v_role text;
  v_currency text;
  v_drawer_account_id uuid;
  v_account public.chart_of_accounts%rowtype;
  v_existing public.operations_cash_locations%rowtype;
  v_location public.operations_cash_locations%rowtype;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if p_actor_id is null then raise exception 'Authenticated manager required'; end if;
  if nullif(v_name,'') is null then raise exception 'Cash location name required'; end if;
  if v_type not in ('SAFE','PETTY_CASH','CASH_OFFICE','BANK_DEPOSIT','OTHER') then raise exception 'Unsupported cash location type'; end if;
  if p_finance_account_id is null then raise exception 'Finance cash account required'; end if;

  select upper(pg_catalog.btrim(coalesce(ou.role,sa.role,p_actor_role,'')))
  into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status,'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active,true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then
    raise exception 'Manager or owner role required for cash location setup';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select * into v_existing
    from public.operations_cash_locations l
    where l.organization_id = p_organization_id
      and l.entity_id = p_entity_id
      and l.idempotency_key = pg_catalog.btrim(p_idempotency_key)
    limit 1;
    if found then
      return jsonb_build_object('success',true,'duplicate',true,'location',to_jsonb(v_existing));
    end if;
  end if;

  select * into v_account
  from public.chart_of_accounts a
  where a.id = p_finance_account_id
    and a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and coalesce(a.is_active,true) = true;
  if not found then raise exception 'Finance account is outside the selected legal entity or inactive'; end if;
  if upper(coalesce(v_account.account_category,'')) not like 'ASSET%'
     and upper(coalesce(v_account.account_type,'')) not like 'ASSET%' then
    raise exception 'Cash locations must use an active asset account';
  end if;

  select upper(e.currency) into v_currency
  from public.legal_entities e
  where e.id = p_entity_id
    and e.organization_id = p_organization_id
    and coalesce(e.is_active,true) = true;
  if v_currency is null then raise exception 'Legal entity currency is unavailable'; end if;
  if nullif(upper(coalesce(v_account.currency_code,'')),'') is not null
     and upper(v_account.currency_code) <> v_currency then
    raise exception 'Cash location account currency must match the legal entity currency';
  end if;

  v_drawer_account_id := public.operations_resolve_pos_cash_account(p_organization_id,p_entity_id);
  if v_drawer_account_id = p_finance_account_id then
    raise exception 'A controlled cash location must use a Finance account separate from the POS drawer account';
  end if;

  insert into public.operations_cash_locations(
    organization_id,entity_id,name,location_type,finance_account_id,currency_code,
    current_balance,is_active,idempotency_key,created_by
  ) values(
    p_organization_id,p_entity_id,v_name,v_type,p_finance_account_id,v_currency,
    0,true,nullif(pg_catalog.btrim(coalesce(p_idempotency_key,'')),''),p_actor_id
  )
  returning * into v_location;

  return jsonb_build_object('success',true,'duplicate',false,'location',to_jsonb(v_location));
end;
$$;

revoke all on function public.operations_create_cash_location_atomic(uuid,uuid,text,text,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.operations_create_cash_location_atomic(uuid,uuid,text,text,uuid,uuid,text,text)
  to service_role;

-- The transfer executor is installed in the immediately-following hardening migration,
-- which adds live drawer-evidence calculation before any transfer may leave a drawer.
