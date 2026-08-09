do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.finance_generate_customer_statement_party_idempotent(uuid,uuid,uuid,uuid,date,date,date,text,uuid,text,text)'::regprocedure
  ) into v_def;

  v_new := replace(
    v_def,
    $old$    from public.finance_customer_credit_applications a
    join public.finance_customer_credits c on c.id = a.customer_credit_id
    where a.organization_id = p_organization_id
      and a.entity_id = p_entity_id
      and a.party_id = p_party_id
      and upper(c.currency_code) = v_currency
      and a.allocated_at::date < p_period_start$old$,
    $new$    from public.finance_customer_credit_applications a
    join public.finance_customer_credits c on c.id = a.customer_credit_id
    where a.organization_id = p_organization_id
      and a.entity_id = p_entity_id
      and a.party_id = p_party_id
      and upper(c.currency_code) = v_currency
      and a.applied_at::date < p_period_start$new$
  );

  v_new := replace(
    v_new,
    $old$  from public.finance_customer_credit_applications a
  join public.finance_customer_credits c on c.id = a.customer_credit_id
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.party_id = p_party_id
    and upper(c.currency_code) = v_currency
    and a.allocated_at::date between p_period_start and p_period_end$old$,
    $new$  from public.finance_customer_credit_applications a
  join public.finance_customer_credits c on c.id = a.customer_credit_id
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.party_id = p_party_id
    and upper(c.currency_code) = v_currency
    and a.applied_at::date between p_period_start and p_period_end$new$
  );

  if v_new = v_def then
    raise exception 'Customer statement timestamp semantics repair made no changes';
  end if;

  execute v_new;
end;
$migration$;
