begin;

create table if not exists public.market_corporate_action_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  portfolio_id uuid not null references public.market_portfolios(id) on delete cascade,
  corporate_action_id uuid not null references public.market_corporate_actions(id) on delete cascade,
  symbol text not null,
  adjustment_type text not null,
  status text not null,
  effective_date date,
  entitlement_date date,
  entitlement_quantity numeric(24,8),
  split_ratio numeric(24,12),
  cash_rate numeric(24,12),
  cash_amount numeric(24,8),
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  authority_effect text not null default 'PAPER_ONLY',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint market_ca_adjustment_type_check check (
    adjustment_type in ('SPLIT','CASH_DIVIDEND','UNSUPPORTED')
  ),
  constraint market_ca_adjustment_status_check check (
    status in ('APPLIED','UNRESOLVED','SKIPPED')
  ),
  constraint market_ca_adjustment_authority_check check (authority_effect = 'PAPER_ONLY'),
  constraint market_ca_adjustment_ratio_check check (
    split_ratio is null or split_ratio > 0
  ),
  constraint market_ca_adjustment_cash_check check (
    cash_rate is null or cash_rate >= 0
  )
);

create unique index if not exists market_ca_adjustment_action_unique
  on public.market_corporate_action_adjustments (
    organization_id,
    portfolio_id,
    corporate_action_id
  );

create index if not exists market_ca_adjustment_scope_idx
  on public.market_corporate_action_adjustments (
    organization_id,
    portfolio_id,
    created_at desc
  );

alter table public.market_corporate_action_adjustments enable row level security;

comment on table public.market_corporate_action_adjustments is
  'Durable PAPER-only accounting result for a corporate action. Ambiguous or late events are recorded UNRESOLVED and never guessed.';
comment on column public.market_corporate_action_adjustments.authority_effect is
  'Fixed PAPER_ONLY. Corporate-action accounting cannot grant or imply live-broker authority.';

create or replace function public.market_apply_paper_split_adjustment(
  p_organization_id uuid,
  p_portfolio_id uuid,
  p_corporate_action_id uuid,
  p_symbol text,
  p_ratio numeric,
  p_effective_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.market_corporate_action_adjustments%rowtype;
  v_action public.market_corporate_actions%rowtype;
  v_position public.market_paper_positions%rowtype;
  v_account public.market_paper_accounts%rowtype;
  v_new_quantity numeric;
  v_new_average numeric;
  v_new_market_price numeric;
  v_new_market_value numeric;
  v_adjustment public.market_corporate_action_adjustments%rowtype;
begin
  if p_ratio is null or p_ratio <= 0 then
    raise exception 'INVALID_SPLIT_RATIO';
  end if;

  select * into v_existing
  from public.market_corporate_action_adjustments
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
    and corporate_action_id = p_corporate_action_id;

  if found then
    return jsonb_build_object(
      'status','ALREADY_RECORDED',
      'adjustment_id',v_existing.id,
      'adjustment_status',v_existing.status
    );
  end if;

  select * into v_action
  from public.market_corporate_actions
  where id = p_corporate_action_id
    and organization_id = p_organization_id
    and portfolio_id = p_portfolio_id;

  if not found then raise exception 'CORPORATE_ACTION_NOT_FOUND'; end if;

  select * into v_position
  from public.market_paper_positions
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
    and symbol = upper(btrim(p_symbol))
  for update;

  if not found or coalesce(v_position.quantity, 0) <= 0 then
    insert into public.market_corporate_action_adjustments (
      organization_id,portfolio_id,corporate_action_id,symbol,
      adjustment_type,status,effective_date,split_ratio,reason,applied_at
    ) values (
      p_organization_id,p_portfolio_id,p_corporate_action_id,upper(btrim(p_symbol)),
      'SPLIT','SKIPPED',p_effective_date,p_ratio,'NO_OPEN_PAPER_POSITION',now()
    )
    returning * into v_adjustment;

    return jsonb_build_object(
      'status','SKIPPED',
      'reason','NO_OPEN_PAPER_POSITION',
      'adjustment_id',v_adjustment.id
    );
  end if;

  select * into v_account
  from public.market_paper_accounts
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then raise exception 'PAPER_ACCOUNT_REQUIRED'; end if;

  v_new_quantity := v_position.quantity * p_ratio;
  v_new_average := case
    when v_position.average_entry_price is null then null
    else v_position.average_entry_price / p_ratio
  end;
  v_new_market_price := case
    when v_position.market_price is null then null
    else v_position.market_price / p_ratio
  end;
  v_new_market_value := case
    when v_new_market_price is null then v_position.market_value
    else v_new_quantity * v_new_market_price
  end;

  update public.market_paper_positions
  set quantity = v_new_quantity,
      average_entry_price = v_new_average,
      market_price = v_new_market_price,
      market_value = v_new_market_value,
      unrealized_pnl = case
        when v_new_average is null or v_new_market_price is null then unrealized_pnl
        else (v_new_market_price - v_new_average) * v_new_quantity
      end,
      updated_at = now()
  where id = v_position.id;

  update public.market_paper_accounts
  set equity = cash_balance + (
        select coalesce(sum(market_value), 0)
        from public.market_paper_positions
        where organization_id = p_organization_id
          and portfolio_id = p_portfolio_id
      ),
      high_water_equity = greatest(
        high_water_equity,
        cash_balance + (
          select coalesce(sum(market_value), 0)
          from public.market_paper_positions
          where organization_id = p_organization_id
            and portfolio_id = p_portfolio_id
        )
      ),
      updated_at = now()
  where id = v_account.id;

  insert into public.market_corporate_action_adjustments (
    organization_id,portfolio_id,corporate_action_id,symbol,
    adjustment_type,status,effective_date,split_ratio,
    before_snapshot,after_snapshot,applied_at
  ) values (
    p_organization_id,p_portfolio_id,p_corporate_action_id,upper(btrim(p_symbol)),
    'SPLIT','APPLIED',p_effective_date,p_ratio,
    jsonb_build_object(
      'quantity',v_position.quantity,
      'average_entry_price',v_position.average_entry_price,
      'market_price',v_position.market_price,
      'market_value',v_position.market_value
    ),
    jsonb_build_object(
      'quantity',v_new_quantity,
      'average_entry_price',v_new_average,
      'market_price',v_new_market_price,
      'market_value',v_new_market_value
    ),
    now()
  )
  returning * into v_adjustment;

  return jsonb_build_object(
    'status','APPLIED',
    'adjustment_id',v_adjustment.id,
    'old_quantity',v_position.quantity,
    'new_quantity',v_new_quantity,
    'old_average_entry_price',v_position.average_entry_price,
    'new_average_entry_price',v_new_average,
    'old_market_price',v_position.market_price,
    'new_market_price',v_new_market_price
  );
end;
$$;

revoke all on function public.market_apply_paper_split_adjustment(uuid,uuid,uuid,text,numeric,date)
from public, anon, authenticated;
grant execute on function public.market_apply_paper_split_adjustment(uuid,uuid,uuid,text,numeric,date)
to service_role;

create or replace function public.market_apply_paper_cash_adjustment(
  p_organization_id uuid,
  p_portfolio_id uuid,
  p_corporate_action_id uuid,
  p_symbol text,
  p_entitlement_date date,
  p_effective_date date,
  p_entitlement_quantity numeric,
  p_cash_rate numeric,
  p_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.market_corporate_action_adjustments%rowtype;
  v_action public.market_corporate_actions%rowtype;
  v_account public.market_paper_accounts%rowtype;
  v_new_cash numeric;
  v_new_equity numeric;
  v_adjustment public.market_corporate_action_adjustments%rowtype;
begin
  if p_entitlement_quantity is null or p_entitlement_quantity < 0 then
    raise exception 'INVALID_ENTITLEMENT_QUANTITY';
  end if;
  if p_cash_rate is null or p_cash_rate < 0 then
    raise exception 'INVALID_CASH_RATE';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'INVALID_CASH_ADJUSTMENT';
  end if;

  select * into v_existing
  from public.market_corporate_action_adjustments
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
    and corporate_action_id = p_corporate_action_id;

  if found then
    return jsonb_build_object(
      'status','ALREADY_RECORDED',
      'adjustment_id',v_existing.id,
      'adjustment_status',v_existing.status
    );
  end if;

  select * into v_action
  from public.market_corporate_actions
  where id = p_corporate_action_id
    and organization_id = p_organization_id
    and portfolio_id = p_portfolio_id;

  if not found then raise exception 'CORPORATE_ACTION_NOT_FOUND'; end if;

  if p_entitlement_quantity <= 0 or p_amount <= 0 then
    insert into public.market_corporate_action_adjustments (
      organization_id,portfolio_id,corporate_action_id,symbol,
      adjustment_type,status,effective_date,entitlement_date,
      entitlement_quantity,cash_rate,cash_amount,reason,applied_at
    ) values (
      p_organization_id,p_portfolio_id,p_corporate_action_id,upper(btrim(p_symbol)),
      'CASH_DIVIDEND','SKIPPED',p_effective_date,p_entitlement_date,
      p_entitlement_quantity,p_cash_rate,p_amount,'NO_ENTITLED_PAPER_QUANTITY',now()
    )
    returning * into v_adjustment;

    return jsonb_build_object(
      'status','SKIPPED',
      'reason','NO_ENTITLED_PAPER_QUANTITY',
      'adjustment_id',v_adjustment.id
    );
  end if;

  select * into v_account
  from public.market_paper_accounts
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then raise exception 'PAPER_ACCOUNT_REQUIRED'; end if;

  v_new_cash := v_account.cash_balance + p_amount;
  v_new_equity := v_new_cash + (
    select coalesce(sum(market_value), 0)
    from public.market_paper_positions
    where organization_id = p_organization_id
      and portfolio_id = p_portfolio_id
  );

  update public.market_paper_accounts
  set cash_balance = v_new_cash,
      equity = v_new_equity,
      realized_pnl = realized_pnl + p_amount,
      high_water_equity = greatest(high_water_equity, v_new_equity),
      updated_at = now()
  where id = v_account.id;

  insert into public.market_corporate_action_adjustments (
    organization_id,portfolio_id,corporate_action_id,symbol,
    adjustment_type,status,effective_date,entitlement_date,
    entitlement_quantity,cash_rate,cash_amount,
    before_snapshot,after_snapshot,applied_at
  ) values (
    p_organization_id,p_portfolio_id,p_corporate_action_id,upper(btrim(p_symbol)),
    'CASH_DIVIDEND','APPLIED',p_effective_date,p_entitlement_date,
    p_entitlement_quantity,p_cash_rate,p_amount,
    jsonb_build_object(
      'cash_balance',v_account.cash_balance,
      'equity',v_account.equity
    ),
    jsonb_build_object(
      'cash_balance',v_new_cash,
      'equity',v_new_equity
    ),
    now()
  )
  returning * into v_adjustment;

  return jsonb_build_object(
    'status','APPLIED',
    'adjustment_id',v_adjustment.id,
    'old_cash_balance',v_account.cash_balance,
    'new_cash_balance',v_new_cash,
    'cash_amount',p_amount,
    'new_equity',v_new_equity
  );
end;
$$;

revoke all on function public.market_apply_paper_cash_adjustment(uuid,uuid,uuid,text,date,date,numeric,numeric,numeric)
from public, anon, authenticated;
grant execute on function public.market_apply_paper_cash_adjustment(uuid,uuid,uuid,text,date,date,numeric,numeric,numeric)
to service_role;

commit;
