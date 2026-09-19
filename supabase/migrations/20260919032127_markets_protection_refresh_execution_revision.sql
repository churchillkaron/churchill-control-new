begin;

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
  v_account public.market_paper_accounts%rowtype;
  v_count integer := 0;
begin
  select * into v_account
  from public.market_paper_accounts
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id
  for update;

  if not found then
    raise exception 'PAPER_ACCOUNT_REQUIRED';
  end if;

  update public.market_paper_positions
  set quantity = quantity
  where organization_id = p_organization_id
    and portfolio_id = p_portfolio_id;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.market_paper_accounts
    set execution_revision = execution_revision + 1,
        updated_at = now()
    where id = v_account.id;
  end if;

  return v_count;
end;
$$;

revoke all on function public.market_refresh_portfolio_paper_protection(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.market_refresh_portfolio_paper_protection(uuid, uuid)
to service_role;

comment on function public.market_refresh_portfolio_paper_protection(uuid, uuid) is
  'Refreshes PAPER stop-loss and take-profit state under an account row lock and advances execution_revision once when open positions are mutated.';

commit;
