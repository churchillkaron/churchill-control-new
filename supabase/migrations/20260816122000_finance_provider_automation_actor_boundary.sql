begin;

alter table public.finance_customer_payment_allocations
  alter column allocated_by drop not null;

alter table public.finance_customer_unapplied_cash
  alter column received_by drop not null;

do $$
declare
  v_definition text;
  v_expected text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_post_customer_receipt_party_idempotent'
  limit 1;

  v_expected := '  if p_paid_by is null then raise exception ''authenticated paid_by required''; end if;' || chr(10);

  if v_definition is null or position(v_expected in v_definition) = 0 then
    raise exception 'finance_post_customer_receipt_party_idempotent actor guard not found';
  end if;

  execute replace(v_definition, v_expected, '');

  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_issue_customer_credit_note_idempotent'
  limit 1;

  v_expected := '  if p_created_by is null then raise exception ''created_by required''; end if;' || chr(10);

  if v_definition is null or position(v_expected in v_definition) = 0 then
    raise exception 'finance_issue_customer_credit_note_idempotent actor guard not found';
  end if;

  execute replace(v_definition, v_expected, '');

  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_refund_customer_credit_idempotent'
  limit 1;

  v_expected := '  if p_refunded_by is null then raise exception ''refunded_by required''; end if;' || chr(10);

  if v_definition is null or position(v_expected in v_definition) = 0 then
    raise exception 'finance_refund_customer_credit_idempotent actor guard not found';
  end if;

  execute replace(v_definition, v_expected, '');
end
$$;

revoke all on function public.finance_post_customer_receipt_party_idempotent(
  uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.finance_post_customer_receipt_party_idempotent(
  uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text
) to service_role;

revoke all on function public.finance_issue_customer_credit_note_idempotent(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.finance_issue_customer_credit_note_idempotent(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text
) to service_role;

revoke all on function public.finance_refund_customer_credit_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, text, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.finance_refund_customer_credit_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, text, uuid, jsonb, text
) to service_role;

comment on function public.finance_post_customer_receipt_party_idempotent(
  uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text
) is 'Canonical customer receipt posting. A null paid_by is allowed only for governed service-role provider/system automation; human application commands continue to require an authenticated actor.';

comment on function public.finance_issue_customer_credit_note_idempotent(
  uuid, uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text
) is 'Canonical customer credit-note posting. A null created_by is allowed only for governed service-role provider/system automation; human application commands continue to require an authenticated actor.';

comment on function public.finance_refund_customer_credit_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, text, uuid, jsonb, text
) is 'Canonical customer credit refund posting. A null refunded_by is allowed only for governed service-role provider/system automation; human application commands continue to require an authenticated actor.';

commit;
