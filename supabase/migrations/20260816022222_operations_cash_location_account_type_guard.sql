-- Controlled custody locations may only use dedicated cash asset accounts.
-- This prevents receivables, inventory, fixed assets, or other generic assets from being selected as physical cash custody.

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
     or upper(coalesce(v_account.account_type,'')) <> 'CASH' then
    raise exception 'Controlled cash locations require an active ASSET account with account_type CASH';
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
