do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(
    'public.finance_generate_customer_statement_party_idempotent(uuid,uuid,uuid,uuid,date,date,date,text,uuid,text,text)'::regprocedure
  ) into v_def;

  v_new := replace(v_def,
    'and a.applied_at::date < p_period_start',
    'and a.allocated_at::date < p_period_start');

  v_new := replace(v_new,
    'and a.applied_at::date between p_period_start and p_period_end',
    'and a.allocated_at::date between p_period_start and p_period_end');

  v_new := replace(v_new,
    'from public.finance_customer_payment_allocations a where a.customer_invoice_id = ci.id and a.applied_at::date <= p_period_end',
    'from public.finance_customer_payment_allocations a where a.customer_invoice_id = ci.id and a.allocated_at::date <= p_period_end');

  if v_new = v_def then
    raise exception 'Customer statement timestamp repair made no changes';
  end if;

  execute v_new;
end;
$migration$;
