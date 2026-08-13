create or replace function public.finance_post_journal_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_posting_date date,
  p_document_date date,
  p_journal_type text,
  p_reference text,
  p_source_module text,
  p_source_document text,
  p_source_document_id uuid,
  p_description text,
  p_currency_code text,
  p_exchange_rate numeric,
  p_lines jsonb,
  p_created_by text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_period_id uuid;
  v_period_status text;
  v_idempotency_key text;
  v_journal_number text;
  v_total_debit numeric;
  v_total_credit numeric;
  v_line record;
  v_line_row public.journal_entry_lines%rowtype;
  v_journal public.journal_entries%rowtype;
  v_existing_journal public.journal_entries%rowtype;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_balance numeric;
  v_entries jsonb;
  v_ledger_count integer;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if p_posting_date is null then
    raise exception 'posting_date required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 2
  then
    raise exception 'A journal requires at least two lines';
  end if;

  v_idempotency_key := nullif(btrim(p_idempotency_key), '');

  if v_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        concat_ws(
          '|',
          'finance-journal-idempotency',
          p_organization_id::text,
          p_entity_id::text,
          v_idempotency_key
        ),
        0
      )
    );
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity does not belong to organization';
  end if;

  select accounting_periods.id, accounting_periods.status
  into v_period_id, v_period_status
  from public.accounting_periods
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and p_posting_date between start_date and end_date
  order by start_date desc
  limit 1
  for share;

  if v_period_id is null then
    raise exception 'No accounting period covers posting date %', p_posting_date;
  end if;

  if lower(coalesce(v_period_status, '')) not in ('open', 'active') then
    raise exception 'Accounting period is not open';
  end if;

  if v_idempotency_key is not null then
    select *
    into v_existing_journal
    from public.journal_entries
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and idempotency_key = v_idempotency_key
    limit 1;

    if found then
      select coalesce(
        jsonb_agg(to_jsonb(journal_entry_lines) order by line_number),
        '[]'::jsonb
      )
      into v_entries
      from public.journal_entry_lines
      where journal_entry_id = v_existing_journal.id;

      select count(*)
      into v_ledger_count
      from public.general_ledger
      where journal_entry_id = v_existing_journal.id;

      return jsonb_build_object(
        'journal', to_jsonb(v_existing_journal),
        'entries', v_entries,
        'ledger', jsonb_build_object(
          'success', true,
          'idempotentReplay', true,
          'journalEntryId', v_existing_journal.id,
          'ledgerLines', v_ledger_count
        )
      );
    end if;
  end if;

  select
    coalesce(sum(coalesce(nullif(line_item->>'debit', '')::numeric, 0)), 0),
    coalesce(sum(coalesce(nullif(line_item->>'credit', '')::numeric, 0)), 0)
  into v_total_debit, v_total_credit
  from jsonb_array_elements(p_lines) as source_lines(line_item);

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'UNBALANCED JOURNAL: debit=% credit=%',
      round(v_total_debit, 2), round(v_total_credit, 2);
  end if;

  if round(v_total_debit, 2) <= 0 then
    raise exception 'Journal total must be positive';
  end if;

  v_journal_number := public.finance_next_document_number(
    p_organization_id,
    p_entity_id,
    'JOURNAL_ENTRY',
    'JE',
    p_posting_date
  );

  insert into public.journal_entries (
    organization_id,
    entity_id,
    legal_entity_id,
    period_id,
    journal_number,
    entry_number,
    entry_date,
    posting_date,
    document_date,
    journal_type,
    reference,
    source_type,
    source_id,
    source_module,
    source_document,
    source_document_id,
    description,
    currency_code,
    exchange_rate,
    status,
    created_by,
    idempotency_key
  ) values (
    p_organization_id,
    p_entity_id,
    p_entity_id,
    v_period_id,
    v_journal_number,
    v_journal_number,
    p_posting_date,
    p_posting_date,
    coalesce(p_document_date, p_posting_date),
    coalesce(nullif(btrim(p_journal_type), ''), 'GENERAL'),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_source_module), ''),
    p_source_document_id,
    nullif(btrim(p_source_module), ''),
    nullif(btrim(p_source_document), ''),
    p_source_document_id,
    nullif(btrim(p_description), ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    'POSTED',
    p_created_by,
    v_idempotency_key
  )
  returning * into v_journal;

  for v_line in
    select line_item, line_number
    from jsonb_array_elements(p_lines) with ordinality
      as source_lines(line_item, line_number)
  loop
    if nullif(btrim(v_line.line_item->>'account_id'), '') is null then
      raise exception 'account_id required on line %', v_line.line_number;
    end if;

    v_account_id := (v_line.line_item->>'account_id')::uuid;
    v_debit := coalesce(nullif(v_line.line_item->>'debit', '')::numeric, 0);
    v_credit := coalesce(nullif(v_line.line_item->>'credit', '')::numeric, 0);

    if v_debit < 0 or v_credit < 0 then
      raise exception 'Negative amount on line %', v_line.line_number;
    end if;

    if (v_debit > 0 and v_credit > 0)
       or (v_debit = 0 and v_credit = 0)
    then
      raise exception 'Line % must contain either debit or credit', v_line.line_number;
    end if;

    perform 1
    from public.chart_of_accounts
    where id = v_account_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    if not found then
      raise exception 'Account % is outside organization/entity scope', v_account_id;
    end if;

    insert into public.journal_entry_lines (
      organization_id,
      entity_id,
      legal_entity_id,
      period_id,
      journal_entry_id,
      line_number,
      account_id,
      department_id,
      cost_center_id,
      party_id,
      project_id,
      description,
      currency_code,
      exchange_rate,
      debit,
      credit,
      created_by
    ) values (
      p_organization_id,
      p_entity_id,
      p_entity_id,
      v_period_id,
      v_journal.id,
      v_line.line_number,
      v_account_id,
      nullif(v_line.line_item->>'department_id', '')::uuid,
      nullif(v_line.line_item->>'cost_center_id', '')::uuid,
      nullif(v_line.line_item->>'party_id', '')::uuid,
      nullif(v_line.line_item->>'project_id', '')::uuid,
      nullif(btrim(v_line.line_item->>'description'), ''),
      upper(btrim(p_currency_code)),
      p_exchange_rate,
      v_debit,
      v_credit,
      p_created_by
    )
    returning * into v_line_row;

    v_balance := v_debit - v_credit;

    insert into public.general_ledger (
      organization_id,
      entity_id,
      period_id,
      journal_entry_id,
      journal_entry_line_id,
      account_id,
      department_id,
      cost_center_id,
      party_id,
      project_id,
      description,
      debit,
      credit,
      balance,
      amount,
      entry_type,
      currency,
      currency_code,
      exchange_rate,
      transaction_date,
      posting_date,
      posting_period,
      reference_type,
      reference_id,
      created_by
    ) values (
      p_organization_id,
      p_entity_id,
      v_period_id,
      v_journal.id,
      v_line_row.id,
      v_account_id,
      v_line_row.department_id,
      v_line_row.cost_center_id,
      v_line_row.party_id,
      v_line_row.project_id,
      v_line_row.description,
      v_debit,
      v_credit,
      v_balance,
      abs(v_balance),
      case when v_debit > 0 then 'debit' else 'credit' end,
      upper(btrim(p_currency_code)),
      upper(btrim(p_currency_code)),
      p_exchange_rate,
      p_posting_date,
      p_posting_date,
      to_char(p_posting_date, 'YYYY-MM'),
      nullif(btrim(p_source_module), ''),
      p_source_document_id,
      p_created_by
    );
  end loop;

  select coalesce(
    jsonb_agg(to_jsonb(journal_entry_lines) order by line_number),
    '[]'::jsonb
  )
  into v_entries
  from public.journal_entry_lines
  where journal_entry_id = v_journal.id;

  select count(*)
  into v_ledger_count
  from public.general_ledger
  where journal_entry_id = v_journal.id;

  return jsonb_build_object(
    'journal', to_jsonb(v_journal),
    'entries', v_entries,
    'ledger', jsonb_build_object(
      'success', true,
      'idempotentReplay', false,
      'journalEntryId', v_journal.id,
      'ledgerLines', v_ledger_count
    )
  );
end;
$function$;

revoke all on function public.finance_post_journal_atomic(uuid, uuid, date, date, text, text, text, text, uuid, text, text, numeric, jsonb, text, text) from public;
grant execute on function public.finance_post_journal_atomic(uuid, uuid, date, date, text, text, text, text, uuid, text, text, numeric, jsonb, text, text) to service_role;

notify pgrst, 'reload schema';
