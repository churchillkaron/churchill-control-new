begin;

alter table public.market_risk_policies
  add column if not exists trailing_stop_enabled boolean not null default true,
  add column if not exists default_trailing_stop_pct numeric(8,4) not null default 7.5,
  add column if not exists time_exit_enabled boolean not null default true,
  add column if not exists max_holding_days integer not null default 30;

alter table public.market_risk_policies
  drop constraint if exists market_risk_trailing_stop_pct_check;
alter table public.market_risk_policies
  add constraint market_risk_trailing_stop_pct_check
  check (default_trailing_stop_pct > 0 and default_trailing_stop_pct <= 50);

alter table public.market_risk_policies
  drop constraint if exists market_risk_max_holding_days_check;
alter table public.market_risk_policies
  add constraint market_risk_max_holding_days_check
  check (max_holding_days between 1 and 3650);

alter table public.market_paper_positions
  add column if not exists opened_at timestamptz,
  add column if not exists high_water_price numeric(24,8);

alter table public.market_paper_positions
  drop constraint if exists market_paper_position_high_water_price_check;
alter table public.market_paper_positions
  add constraint market_paper_position_high_water_price_check
  check (high_water_price is null or high_water_price > 0);

create or replace function public.market_track_paper_position_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reference_price numeric;
  v_prior_high_water numeric;
  v_old_basis numeric;
  v_new_basis numeric;
begin
  if coalesce(new.quantity, 0) <= 0 then
    new.opened_at := null;
    new.high_water_price := null;
    return new;
  end if;

  v_reference_price := greatest(
    coalesce(new.average_entry_price, 0),
    coalesce(new.market_price, 0)
  );

  if tg_op = 'INSERT'
    or coalesce(old.quantity, 0) <= 0
    or old.opened_at is null then
    new.opened_at := coalesce(new.opened_at, now());
    if v_reference_price > 0 then
      new.high_water_price := v_reference_price;
    end if;
    return new;
  end if;

  new.opened_at := old.opened_at;
  v_prior_high_water := coalesce(old.high_water_price, 0);

  if coalesce(old.average_entry_price, 0) > 0
    and coalesce(new.average_entry_price, 0) > 0
    and coalesce(old.quantity, 0) > 0
    and coalesce(new.quantity, 0) > 0
    and old.quantity is distinct from new.quantity then
    v_old_basis := old.quantity * old.average_entry_price;
    v_new_basis := new.quantity * new.average_entry_price;

    if abs(v_old_basis - v_new_basis)
      <= greatest(0.01, abs(v_old_basis) * 0.000001) then
      v_prior_high_water := v_prior_high_water
        * (new.average_entry_price / old.average_entry_price);
    end if;
  end if;

  new.high_water_price := greatest(
    v_prior_high_water,
    coalesce(new.high_water_price, 0),
    v_reference_price
  );
  if coalesce(new.high_water_price, 0) <= 0 then
    new.high_water_price := null;
  end if;

  return new;
end;
$$;

revoke all on function public.market_track_paper_position_lifecycle()
from public, anon, authenticated;
grant execute on function public.market_track_paper_position_lifecycle()
to service_role;

drop trigger if exists market_paper_position_lifecycle_track
  on public.market_paper_positions;
create trigger market_paper_position_lifecycle_track
before insert or update of quantity, average_entry_price, market_price
on public.market_paper_positions
for each row execute function public.market_track_paper_position_lifecycle();

update public.market_paper_positions
set
  opened_at = coalesce(opened_at, updated_at),
  high_water_price = nullif(greatest(
    coalesce(high_water_price, 0),
    coalesce(average_entry_price, 0),
    coalesce(market_price, 0)
  ), 0)
where quantity > 0;

comment on column public.market_paper_positions.opened_at is
  'Lifecycle timestamp for the current PAPER long position. Reset when a flat position opens again.';
comment on column public.market_paper_positions.high_water_price is
  'Highest admitted PAPER market/reference price observed during the current long-position lifecycle.';
comment on column public.market_risk_policies.trailing_stop_enabled is
  'Enables deterministic PAPER-only trailing-stop protection. This does not grant live execution authority.';
comment on column public.market_risk_policies.time_exit_enabled is
  'Enables deterministic PAPER-only maximum holding-period exits.';

commit;
