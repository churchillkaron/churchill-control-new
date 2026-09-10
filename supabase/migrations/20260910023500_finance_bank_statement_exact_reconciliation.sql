begin;

create or replace function public.finance_reconcile_bank_statement_import_exact_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_bank_account_id uuid,
  p_statement_import_id uuid,
  p_reconciled_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import public.finance_bank_statement_imports%rowtype;
  v_statement record;
  v_ledger record;
  v_match_count integer := 0;
  v_unmatched_count integer := 0;
  v_candidate_count integer := 0;
  v_statement_candidate_count integer := 0;
  v_ledger_id uuid;
  v_now timestamptz := now();
begin
  if p_organization_id is null or p_entity_id is null or p_bank_account_id is null or p_statement_import_id is null then
    raise exception 'organization_id, entity_id, bank_account_id and statement_import_id required';
  end if;

  select * into v_import
  from public.finance_bank_statement_imports
  where id = p_statement_import_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and bank_account_id = p_bank_account_id
  for update;

  if not found then
    raise exception 'Bank statement import not found in selected organisation, entity and bank account';
  end if;

  for v_statement in
    select *
    from public.bank_statements
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and bank_account_id = p_bank_account_id
      and statement_import_id = p_statement_import_id
      and coalesce(matched, false) = false
    order by statement_line_number, id
    for update
  loop
    v_ledger := null;
    v_candidate_count := 0;
    select count(*), min(l.id)
    into v_candidate_count, v_ledger_id
    from public.bank_ledger l
    where l.organization_id = p_organization_id
      and l.entity_id = p_entity_id
      and l.bank_account_id = p_bank_account_id
      and l.reconciled_statement_id is null
      and l.amount = v_statement.amount
      and (
        (upper(btrim(v_statement.direction)) = 'IN' and upper(btrim(l.direction)) in ('IN','INFLOW','CREDIT','DEPOSIT'))
        or
        (upper(btrim(v_statement.direction)) = 'OUT' and upper(btrim(l.direction)) in ('OUT','OUTFLOW','DEBIT','PAYMENT','WITHDRAWAL'))
      )
      and (
        (
          nullif(btrim(v_statement.reference_number), '') is not null
          and nullif(btrim(l.reference_number), '') is not null
          and lower(btrim(l.reference_number)) = lower(btrim(v_statement.reference_number))
        )
        or (
          lower(coalesce(l.source_document, '')) = 'customer_payment'
          and exists (
            select 1 from public.customer_payments cp
            where cp.id = l.source_document_id
              and cp.organization_id = p_organization_id
              and cp.entity_id = p_entity_id
              and cp.bank_account_id = p_bank_account_id
              and cp.amount = v_statement.amount
              and cp.payment_date::date = v_statement.transaction_date
              and upper(coalesce(cp.status, '')) in ('APPLIED','POSTED','PAID')
          )
        )
      );
    if v_candidate_count = 1 and v_ledger_id is not null then
      select count(*) into v_statement_candidate_count
      from public.bank_statements s
      where s.organization_id = p_organization_id
        and s.entity_id = p_entity_id
        and s.bank_account_id = p_bank_account_id
        and s.statement_import_id = p_statement_import_id
        and coalesce(s.matched, false) = false
        and s.amount = v_statement.amount
        and upper(btrim(s.direction)) = upper(btrim(v_statement.direction))
        and (
          (
            nullif(btrim(v_statement.reference_number), '') is not null
            and nullif(btrim(s.reference_number), '') is not null
            and lower(btrim(s.reference_number)) = lower(btrim(v_statement.reference_number))
          )
          or (
            nullif(btrim(v_statement.reference_number), '') is null
            and s.transaction_date = v_statement.transaction_date
          )
        );

      if v_statement_candidate_count = 1 then
        update public.bank_statements
        set matched = true,
            matched_at = v_now,
            ledger_reference_id = v_ledger_id
        where id = v_statement.id;

        update public.bank_ledger
        set reconciled_statement_id = v_statement.id,
            reconciled_at = v_now,
            reconciled_by = p_reconciled_by,
            updated_at = v_now
        where id = v_ledger_id
          and organization_id = p_organization_id
          and entity_id = p_entity_id
          and bank_account_id = p_bank_account_id
          and reconciled_statement_id is null;

        if found then
          v_match_count := v_match_count + 1;
        end if;
      end if;
    end if;
  end loop;

  select count(*) into v_unmatched_count
  from public.bank_statements
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and bank_account_id = p_bank_account_id
    and statement_import_id = p_statement_import_id
    and coalesce(matched, false) = false;

  return jsonb_build_object(
    'success', true,
    'statement_import_id', p_statement_import_id,
    'matched_count', v_match_count,
    'unmatched_count', v_unmatched_count,
    'reconciliation_complete', v_unmatched_count = 0,
    'matching_policy', 'EXACT_UNIQUE_REFERENCE_OR_SOURCE_PAYMENT_DATE_V1'
  );
end;
$$;

revoke all on function public.finance_reconcile_bank_statement_import_exact_atomic(uuid,uuid,uuid,uuid,uuid) from public;
revoke all on function public.finance_reconcile_bank_statement_import_exact_atomic(uuid,uuid,uuid,uuid,uuid) from anon;
revoke all on function public.finance_reconcile_bank_statement_import_exact_atomic(uuid,uuid,uuid,uuid,uuid) from authenticated;
grant execute on function public.finance_reconcile_bank_statement_import_exact_atomic(uuid,uuid,uuid,uuid,uuid) to service_role;

commit;
