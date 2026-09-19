begin;

create or replace function public.market_promote_paper_high_water(
  p_organization_id uuid,
  p_portfolio_id uuid,
  p_observed_equity numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account public.market_paper_accounts%rowtype;
  v_promoted boolean := false;
begin
  if p_organization_id is null
     or p_portfolio_id is null
     or p_observed_equity is null
     or p_observed_equity < 0 then
    raise exception 'MARKET_HIGH_WATER_INPUT_REQUIRED';
  end if;

  select * into v_account
  from public.market_paper_accounts
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then
    raise exception 'PAPER_ACCOUNT_REQUIRED';
  end if;

  if p_observed_equity > coalesce(v_account.high_water_equity, 0) then
    update public.market_paper_accounts
    set high_water_equity = p_observed_equity,
        execution_revision = execution_revision + 1,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;

    v_promoted := true;
  end if;

  return jsonb_build_object(
    'promoted', v_promoted,
    'high_water_equity', v_account.high_water_equity,
    'execution_revision', v_account.execution_revision
  );
end;
$$;

revoke all on function public.market_promote_paper_high_water(uuid, uuid, numeric)
from public, anon, authenticated;
grant execute on function public.market_promote_paper_high_water(uuid, uuid, numeric)
to service_role;

comment on function public.market_promote_paper_high_water(uuid, uuid, numeric) is
  'Promotes only caller-certified authoritative PAPER marked-equity peaks under row lock and advances execution_revision. Existing historical equity snapshots are intentionally not backfilled because older snapshots may have used REST or stored-price fallback marks.';

commit;
