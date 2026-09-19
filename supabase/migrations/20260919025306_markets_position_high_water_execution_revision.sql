begin;

create or replace function public.market_raise_paper_position_high_water(
  p_organization_id uuid,
  p_portfolio_id uuid,
  p_position_id uuid,
  p_high_water_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account public.market_paper_accounts%rowtype;
  v_position public.market_paper_positions%rowtype;
  v_promoted boolean := false;
begin
  if p_organization_id is null
     or p_portfolio_id is null
     or p_position_id is null
     or p_high_water_price is null
     or p_high_water_price <= 0 then
    raise exception 'PAPER_POSITION_HIGH_WATER_INPUT_REQUIRED';
  end if;

  select * into v_account
  from public.market_paper_accounts
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then
    raise exception 'PAPER_ACCOUNT_REQUIRED';
  end if;

  select * into v_position
  from public.market_paper_positions
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
    and id = p_position_id
  for update;

  if not found then
    raise exception 'PAPER_POSITION_REQUIRED';
  end if;

  if p_high_water_price > coalesce(v_position.high_water_price, 0) then
    update public.market_paper_positions
    set high_water_price = p_high_water_price,
        updated_at = now()
    where id = v_position.id
    returning * into v_position;

    update public.market_paper_accounts
    set execution_revision = execution_revision + 1,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;

    v_promoted := true;
  end if;

  return jsonb_build_object(
    'promoted', v_promoted,
    'position_id', v_position.id,
    'high_water_price', v_position.high_water_price,
    'execution_revision', v_account.execution_revision
  );
end;
$$;

revoke all on function public.market_raise_paper_position_high_water(
  uuid, uuid, uuid, numeric
) from public, anon, authenticated;
grant execute on function public.market_raise_paper_position_high_water(
  uuid, uuid, uuid, numeric
) to service_role;

comment on function public.market_raise_paper_position_high_water(uuid, uuid, uuid, numeric) is
  'Atomically ratchets PAPER position high-water price and advances portfolio execution_revision so in-flight execution cannot ignore newly tightened protective-exit state.';

commit;
