begin;

-- Period-close functions introduced in the next migration operate on
-- organization, entity and accounting-period scope. Older production tables
-- may predate those columns, so converge the required schema first.

alter table public.accounting_periods
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists status text default 'open',
  add column if not exists end_date date,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid;

alter table public.fixed_assets
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists purchase_cost numeric(20,4),
  add column if not exists salvage_value numeric(20,4) default 0,
  add column if not exists accumulated_depreciation numeric(20,4) default 0,
  add column if not exists current_book_value numeric(20,4),
  add column if not exists status text default 'active',
  add column if not exists updated_at timestamptz default now();

update public.fixed_assets
set accumulated_depreciation = coalesce(accumulated_depreciation, 0),
    salvage_value = coalesce(salvage_value, 0),
    current_book_value = greatest(
      coalesce(current_book_value, purchase_cost, 0),
      coalesce(salvage_value, 0)
    ),
    status = coalesce(nullif(btrim(status), ''), 'active'),
    updated_at = coalesce(updated_at, now())
where accumulated_depreciation is null
   or salvage_value is null
   or current_book_value is null
   or status is null
   or btrim(status) = ''
   or updated_at is null;

alter table public.depreciation_entries
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists fixed_asset_id uuid,
  add column if not exists depreciation_date date,
  add column if not exists depreciation_amount numeric(20,4),
  add column if not exists journal_entry_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.depreciation_entries depreciation
set organization_id = coalesce(depreciation.organization_id, asset.organization_id),
    entity_id = coalesce(depreciation.entity_id, asset.entity_id),
    updated_at = coalesce(depreciation.updated_at, now())
from public.fixed_assets asset
where depreciation.fixed_asset_id = asset.id
  and (
    depreciation.organization_id is null
    or depreciation.entity_id is null
    or depreciation.updated_at is null
  );

create index if not exists depreciation_entries_scope_lookup_idx
  on public.depreciation_entries (
    organization_id,
    entity_id,
    period_id,
    fixed_asset_id
  );

commit;
