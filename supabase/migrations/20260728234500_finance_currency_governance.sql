begin;

alter table public.currencies
  add column if not exists organization_id uuid,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

update public.currencies
set
  code = upper(trim(code)),
  name = nullif(trim(name), ''),
  symbol = nullif(trim(symbol), ''),
  decimal_places = coalesce(decimal_places, 2),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, now());

with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id, upper(code)
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as row_rank
  from public.currencies
)
delete from public.currencies currency
using ranked
where ranked.id = currency.id
  and ranked.row_rank > 1;

alter table public.currencies
  drop constraint if exists currencies_code_format_check,
  drop constraint if exists currencies_decimal_places_check;

alter table public.currencies
  add constraint currencies_code_format_check
    check (code ~ '^[A-Z]{3}$'),
  add constraint currencies_decimal_places_check
    check (decimal_places between 0 and 6);

create unique index if not exists currencies_organization_code_unique
  on public.currencies (organization_id, code)
  where organization_id is not null;

create unique index if not exists currencies_global_code_unique
  on public.currencies (code)
  where organization_id is null;

create index if not exists currencies_effective_lookup_idx
  on public.currencies (organization_id, code, is_active);

create or replace function public.finance_set_currency_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.code := upper(trim(new.code));
  new.name := nullif(trim(new.name), '');
  new.symbol := nullif(trim(new.symbol), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_currencies_updated_at on public.currencies;
create trigger finance_currencies_updated_at
before insert or update on public.currencies
for each row
execute function public.finance_set_currency_updated_at();

comment on table public.currencies is
  'Effective Finance currency configuration. Global rows are system references; organisation rows are governed overrides.';

comment on column public.currencies.decimal_places is
  'Minor-unit decimal precision used for validation, display and document totals.';

comment on column public.currencies.is_active is
  'Controls whether the currency is available to Finance lookups and new transactions.';

commit;
