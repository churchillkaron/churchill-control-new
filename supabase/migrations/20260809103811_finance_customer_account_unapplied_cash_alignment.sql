do $$
declare
  v_sql text;
begin
  select pg_get_functiondef(p.oid)
  into v_sql
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='finance_get_customer_account_party'
    and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_entity_id uuid, p_party_id uuid, p_as_of_date date';

  if v_sql is null then
    raise exception 'finance_get_customer_account_party not found';
  end if;

  v_sql := replace(v_sql, 'sum(uc.amount)', 'sum(uc.available_amount)');
  execute v_sql;

  select pg_get_functiondef(p.oid)
  into v_sql
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='finance_generate_customer_statement_party_idempotent'
    and pg_get_function_identity_arguments(p.oid)='p_statement_id uuid, p_organization_id uuid, p_entity_id uuid, p_party_id uuid, p_statement_date date, p_period_start date, p_period_end date, p_currency_code text, p_generated_by uuid, p_idempotency_key text, p_prefix text';

  if v_sql is null then
    raise exception 'finance_generate_customer_statement_party_idempotent not found';
  end if;

  v_sql := replace(v_sql, 'sum(uc.amount)', 'sum(uc.available_amount)');
  execute v_sql;
end;
$$;
