begin;

alter table public.market_risk_policies
  add column if not exists protective_exits_enabled boolean not null default true,
  add column if not exists default_stop_loss_pct numeric(8,4) not null default 5,
  add column if not exists default_take_profit_pct numeric(8,4) not null default 10;

alter table public.market_risk_policies
  drop constraint if exists market_risk_default_stop_loss_check;
alter table public.market_risk_policies
  add constraint market_risk_default_stop_loss_check
  check (default_stop_loss_pct > 0 and default_stop_loss_pct <= 50);

alter table public.market_risk_policies
  drop constraint if exists market_risk_default_take_profit_check;
alter table public.market_risk_policies
  add constraint market_risk_default_take_profit_check
  check (default_take_profit_pct > 0 and default_take_profit_pct <= 200);

alter table public.market_paper_positions
  add column if not exists stop_loss_price numeric(24,8),
  add column if not exists take_profit_price numeric(24,8),
  add column if not exists protection_source text,
  add column if not exists protection_updated_at timestamptz;

alter table public.market_paper_positions
  drop constraint if exists market_paper_position_stop_loss_check;
alter table public.market_paper_positions
  add constraint market_paper_position_stop_loss_check
  check (stop_loss_price is null or stop_loss_price > 0);

alter table public.market_paper_positions
  drop constraint if exists market_paper_position_take_profit_check;
alter table public.market_paper_positions
  add constraint market_paper_position_take_profit_check
  check (take_profit_price is null or take_profit_price > 0);

create or replace function public.market_refresh_paper_position_protection()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy public.market_risk_policies%rowtype;
begin
  if coalesce(new.quantity, 0) <= 0 or coalesce(new.average_entry_price, 0) <= 0 then
    new.stop_loss_price := null;
    new.take_profit_price := null;
    new.protection_source := null;
    new.protection_updated_at := now();
    return new;
  end if;

  select * into v_policy
  from public.market_risk_policies
  where organization_id = new.organization_id
    and portfolio_id = new.portfolio_id
  limit 1;

  if not found or coalesce(v_policy.protective_exits_enabled, true) = false then
    new.stop_loss_price := null;
    new.take_profit_price := null;
    new.protection_source := 'DISABLED_BY_POLICY';
    new.protection_updated_at := now();
    return new;
  end if;

  new.stop_loss_price := new.average_entry_price
    * (1 - (coalesce(v_policy.default_stop_loss_pct, 5) / 100));
  new.take_profit_price := new.average_entry_price
    * (1 + (coalesce(v_policy.default_take_profit_pct, 10) / 100));
  new.protection_source := 'RISK_POLICY_DEFAULT';
  new.protection_updated_at := now();

  return new;
end;
$$;

revoke all on function public.market_refresh_paper_position_protection()
from public, anon, authenticated;
grant execute on function public.market_refresh_paper_position_protection()
to service_role;

drop trigger if exists market_paper_position_protection_refresh
  on public.market_paper_positions;
create trigger market_paper_position_protection_refresh
before insert or update of quantity, average_entry_price
on public.market_paper_positions
for each row execute function public.market_refresh_paper_position_protection();

create or replace function public.market_refresh_portfolio_paper_protection(
  p_organization_id uuid,
  p_portfolio_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.market_paper_positions
  set quantity = quantity
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.market_refresh_portfolio_paper_protection(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.market_refresh_portfolio_paper_protection(uuid, uuid)
to service_role;

select public.market_refresh_portfolio_paper_protection(organization_id, portfolio_id)
from (
  select distinct organization_id, portfolio_id
  from public.market_paper_positions
) scopes;

comment on column public.market_risk_policies.protective_exits_enabled is
  'Enables deterministic PAPER-only stop-loss and take-profit levels. This does not grant live execution authority.';
comment on column public.market_paper_positions.stop_loss_price is
  'Deterministic PAPER stop-loss level derived from the current average entry price and owner risk policy.';
comment on column public.market_paper_positions.take_profit_price is
  'Deterministic PAPER take-profit level derived from the current average entry price and owner risk policy.';

commit;
