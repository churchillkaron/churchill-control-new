begin;

create or replace function public.finance_run_total_acceptance_probe(
  p_organization_id uuid,
  p_entity_id uuid,
  p_actor_id uuid,
  p_posting_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_asset_account_id uuid,
  p_revenue_account_id uuid,
  p_expense_account_id uuid,
  p_liability_account_id uuid,
  p_bank_account_id uuid,
  p_customer_id uuid,
  p_vendor_party_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_results jsonb := '[]'::jsonb;
  v_run_id uuid := gen_random_uuid();
  v_journal jsonb;
  v_journal_replay jsonb;
  v_journal_id uuid;
  v_invoice jsonb;
  v_invoice_id uuid;
  v_receivable_id uuid;
  v_receipt jsonb;
  v_payment_id uuid := gen_random_uuid();
  v_vendor_invoice jsonb;
  v_vendor_invoice_id uuid := gen_random_uuid();
  v_payable_id uuid;
  v_count integer;
  v_debit numeric;
  v_credit numeric;
  v_before integer;
  v_after integer;
  v_error text;
  v_tag text := 'AVANTIQO-FINANCE-ACCEPTANCE-' || gen_random_uuid()::text;

  procedure pass(p_name text, p_details jsonb default '{}'::jsonb)
  language plpgsql
  as $p$
  begin
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('name', p_name, 'passed', true, 'details', p_details)
    );
  end;
  $p$;

  procedure fail(p_name text, p_message text, p_details jsonb default '{}'::jsonb)
  language plpgsql
  as $p$
  begin
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('name', p_name, 'passed', false, 'message', p_message, 'details', p_details)
    );
  end;
  $p$;

begin
  if p_organization_id is null or p_entity_id is null or p_actor_id is null then
    raise exception 'organization_id, entity_id and actor_id required';
  end if;

  if p_posting_date is null or nullif(btrim(p_currency_code), '') is null then
    raise exception 'posting_date and currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;
  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  perform 1
  from public.accounting_periods
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and p_posting_date between start_date and end_date
    and lower(status) in ('open', 'active');
  if not found then
    raise exception 'No open accounting period covers posting date';
  end if;

  perform 1
  from public.chart_of_accounts
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and id in (
      p_asset_account_id,
      p_revenue_account_id,
      p_expense_account_id,
      p_liability_account_id
    )
  group by organization_id, entity_id
  having count(distinct id) = 4;
  if not found then
    raise exception 'Four scoped acceptance accounts are required';
  end if;

  perform 1
  from public.bank_accounts
  where id = p_bank_account_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;
  if not found then
    raise exception 'Scoped bank account required';
  end if;

  begin
    select public.finance_post_journal_atomic(
      p_organization_id => p_organization_id,
      p_entity_id => p_entity_id,
      p_posting_date => p_posting_date,
      p_document_date => p_posting_date,
      p_journal_type => 'ACCEPTANCE',
      p_reference => v_tag || ':JOURNAL',
      p_source_module => 'finance_acceptance',
      p_source_document => 'acceptance_probe',
      p_source_document_id => v_run_id,
      p_description => 'Rollback-safe Finance acceptance journal',
      p_currency_code => upper(btrim(p_currency_code)),
      p_exchange_rate => p_exchange_rate,
      p_lines => jsonb_build_array(
        jsonb_build_object(
          'account_id', p_asset_account_id,
          'description', 'Acceptance debit',
          'debit', 100,
          'credit', 0
        ),
        jsonb_build_object(
          'account_id', p_revenue_account_id,
          'description', 'Acceptance credit',
          'debit', 0,
          'credit', 100
        )
      ),
      p_created_by => p_actor_id::text,
      p_idempotency_key => v_tag || ':JOURNAL'
    ) into v_journal;

    v_journal_id := nullif(v_journal->'journal'->>'id', '')::uuid;
    if v_journal_id is null then
      raise exception 'Atomic journal did not return journal id';
    end if;

    select count(*) into v_count
    from public.journal_entry_lines
    where journal_entry_id = v_journal_id;
    if v_count <> 2 then
      raise exception 'Expected 2 journal lines, found %', v_count;
    end if;

    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_debit, v_credit
    from public.general_ledger
    where journal_entry_id = v_journal_id;
    if round(v_debit, 2) <> 100 or round(v_credit, 2) <> 100 then
      raise exception 'Ledger totals are incorrect: debit %, credit %', v_debit, v_credit;
    end if;

    call pass('journal.atomic_post', jsonb_build_object(
      'journal_id', v_journal_id,
      'debit', v_debit,
      'credit', v_credit
    ));
  exception when others then
    call fail('journal.atomic_post', sqlerrm);
  end;

  begin
    if v_journal_id is null then
      raise exception 'Atomic journal prerequisite failed';
    end if;

    select count(*) into v_before
    from public.journal_entries
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and idempotency_key = v_tag || ':JOURNAL';

    select public.finance_post_journal_atomic(
      p_organization_id => p_organization_id,
      p_entity_id => p_entity_id,
      p_posting_date => p_posting_date,
      p_document_date => p_posting_date,
      p_journal_type => 'ACCEPTANCE',
      p_reference => v_tag || ':JOURNAL',
      p_source_module => 'finance_acceptance',
      p_source_document => 'acceptance_probe',
      p_source_document_id => v_run_id,
      p_description => 'Rollback-safe Finance acceptance journal',
      p_currency_code => upper(btrim(p_currency_code)),
      p_exchange_rate => p_exchange_rate,
      p_lines => jsonb_build_array(
        jsonb_build_object('account_id', p_asset_account_id, 'debit', 100, 'credit', 0),
        jsonb_build_object('account_id', p_revenue_account_id, 'debit', 0, 'credit', 100)
      ),
      p_created_by => p_actor_id::text,
      p_idempotency_key => v_tag || ':JOURNAL'
    ) into v_journal_replay;

    select count(*) into v_after
    from public.journal_entries
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and idempotency_key = v_tag || ':JOURNAL';

    if v_before <> 1 or v_after <> 1 then
      raise exception 'Idempotent replay created a duplicate journal';
    end if;
    if nullif(v_journal_replay->'journal'->>'id', '')::uuid <> v_journal_id then
      raise exception 'Idempotent replay returned another journal';
    end if;
    call pass('journal.idempotent_replay');
  exception when others then
    call fail('journal.idempotent_replay', sqlerrm);
  end;

  begin
    select count(*) into v_before
    from public.journal_entries
    where reference = v_tag || ':UNBALANCED';

    begin
      perform public.finance_post_journal_atomic(
        p_organization_id => p_organization_id,
        p_entity_id => p_entity_id,
        p_posting_date => p_posting_date,
        p_document_date => p_posting_date,
        p_journal_type => 'ACCEPTANCE',
        p_reference => v_tag || ':UNBALANCED',
        p_source_module => 'finance_acceptance',
        p_source_document => 'acceptance_probe',
        p_source_document_id => gen_random_uuid(),
        p_description => 'Must fail',
        p_currency_code => upper(btrim(p_currency_code)),
        p_exchange_rate => p_exchange_rate,
        p_lines => jsonb_build_array(
          jsonb_build_object('account_id', p_asset_account_id, 'debit', 100, 'credit', 0),
          jsonb_build_object('account_id', p_revenue_account_id, 'debit', 0, 'credit', 90)
        ),
        p_created_by => p_actor_id::text,
        p_idempotency_key => v_tag || ':UNBALANCED'
      );
      raise exception 'Unbalanced journal was accepted';
    exception when others then
      if sqlerrm = 'Unbalanced journal was accepted' then
        raise;
      end if;
    end;

    select count(*) into v_after
    from public.journal_entries
    where reference = v_tag || ':UNBALANCED';
    if v_before <> v_after then
      raise exception 'Rejected unbalanced journal left persistent rows';
    end if;
    call pass('journal.reject_unbalanced');
  exception when others then
    call fail('journal.reject_unbalanced', sqlerrm);
  end;

  begin
    v_invoice_id := gen_random_uuid();
    select public.finance_create_customer_invoice_idempotent(
      p_invoice_id => v_invoice_id,
      p_organization_id => p_organization_id,
      p_entity_id => p_entity_id,
      p_customer_id => p_customer_id,
      p_invoice_date => p_posting_date,
      p_due_date => p_posting_date + 30,
      p_currency_code => upper(btrim(p_currency_code)),
      p_exchange_rate => p_exchange_rate,
      p_subtotal => 200,
      p_tax_amount => 0,
      p_total_amount => 200,
      p_notes => v_tag,
      p_lines => jsonb_build_array(
        jsonb_build_object('description', 'Acceptance service', 'quantity', 1, 'unit_price', 200, 'line_total', 200)
      ),
      p_journal_lines => jsonb_build_array(
        jsonb_build_object('account_id', p_asset_account_id, 'debit', 200, 'credit', 0),
        jsonb_build_object('account_id', p_revenue_account_id, 'debit', 0, 'credit', 200)
      ),
      p_created_by => p_actor_id,
      p_idempotency_key => v_tag || ':CUSTOMER-INVOICE',
      p_prefix => 'TST'
    ) into v_invoice;

    select id into v_receivable_id
    from public.accounts_receivable
    where customer_invoice_id = v_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    if v_receivable_id is null then
      raise exception 'Customer invoice did not create accounts receivable';
    end if;

    select count(*) into v_count
    from public.general_ledger
    where source_document_id = v_invoice_id;
    if v_count < 2 then
      raise exception 'Customer invoice did not create ledger rows';
    end if;

    call pass('receivables.invoice_to_ledger', jsonb_build_object(
      'invoice_id', v_invoice_id,
      'receivable_id', v_receivable_id
    ));
  exception when others then
    call fail('receivables.invoice_to_ledger', sqlerrm);
  end;

  begin
    if v_invoice_id is null or v_receivable_id is null then
      raise exception 'Customer invoice prerequisite failed';
    end if;

    select public.finance_post_customer_receipt_allocation_idempotent(
      p_payment_id => v_payment_id,
      p_organization_id => p_organization_id,
      p_entity_id => p_entity_id,
      p_customer_id => p_customer_id,
      p_payment_date => p_posting_date,
      p_payment_amount => 125,
      p_bank_account_id => p_bank_account_id,
      p_payment_method => 'BANK_TRANSFER',
      p_reference_number => v_tag || ':RECEIPT',
      p_paid_by => p_actor_id,
      p_currency_code => upper(btrim(p_currency_code)),
      p_exchange_rate => p_exchange_rate,
      p_allocations => jsonb_build_array(
        jsonb_build_object('customer_invoice_id', v_invoice_id, 'amount', 100)
      ),
      p_journal_lines => jsonb_build_array(
        jsonb_build_object('account_id', p_asset_account_id, 'debit', 125, 'credit', 0),
        jsonb_build_object('account_id', p_asset_account_id, 'debit', 0, 'credit', 125)
      ),
      p_idempotency_key => v_tag || ':RECEIPT'
    ) into v_receipt;

    select outstanding_balance into v_debit
    from public.accounts_receivable
    where id = v_receivable_id;
    if round(v_debit, 2) <> 100 then
      raise exception 'Expected receivable balance 100 after allocation, found %', v_debit;
    end if;

    select count(*) into v_count
    from public.finance_customer_unapplied_cash
    where customer_payment_id = v_payment_id
      and available_amount = 25;
    if v_count <> 1 then
      raise exception 'Expected 25 unapplied cash';
    end if;

    call pass('receivables.receipt_allocation', jsonb_build_object(
      'payment_id', v_payment_id,
      'remaining_receivable', v_debit,
      'unapplied_cash', 25
    ));
  exception when others then
    call fail('receivables.receipt_allocation', sqlerrm);
  end;

  begin
    v_vendor_invoice_id := gen_random_uuid();
    select public.finance_create_vendor_invoice_atomic(
      p_invoice_id => v_vendor_invoice_id,
      p_organization_id => p_organization_id,
      p_entity_id => p_entity_id,
      p_vendor_party_id => p_vendor_party_id,
      p_purchase_order_id => null,
      p_goods_receipt_id => null,
      p_document_id => null,
      p_invoice_number => v_tag || '-VB',
      p_invoice_date => p_posting_date,
      p_due_date => p_posting_date + 30,
      p_currency_code => upper(btrim(p_currency_code)),
      p_exchange_rate => p_exchange_rate,
      p_subtotal => 150,
      p_tax_amount => 0,
      p_discount_amount => 0,
      p_total_amount => 150,
      p_source => 'acceptance',
      p_ai_extracted => false,
      p_ocr_confidence => 0,
      p_created_by => p_actor_id,
      p_lines => jsonb_build_array(
        jsonb_build_object(
          'description', 'Acceptance expense',
          'quantity', 1,
          'unit_price', 150,
          'discount_amount', 0,
          'tax_amount', 0,
          'line_total', 150,
          'expense_account_id', p_expense_account_id
        )
      ),
      p_journal_lines => jsonb_build_array(
        jsonb_build_object('account_id', p_expense_account_id, 'debit', 150, 'credit', 0),
        jsonb_build_object('account_id', p_liability_account_id, 'debit', 0, 'credit', 150)
      )
    ) into v_vendor_invoice;

    select id into v_payable_id
    from public.accounts_payable
    where vendor_invoice_id = v_vendor_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    if v_payable_id is null then
      raise exception 'Vendor invoice did not create accounts payable';
    end if;

    select count(*) into v_count
    from public.accounts_payable
    where id = v_payable_id
      and payment_hold = true
      and outstanding_balance = 150;
    if v_count <> 1 then
      raise exception 'Vendor payable was not held pending approval';
    end if;

    select count(*) into v_count
    from public.general_ledger
    where source_document_id = v_vendor_invoice_id;
    if v_count <> 0 then
      raise exception 'Unapproved vendor bill posted to ledger';
    end if;

    call pass('payables.bill_hold_before_approval', jsonb_build_object(
      'vendor_invoice_id', v_vendor_invoice_id,
      'payable_id', v_payable_id
    ));
  exception when others then
    call fail('payables.bill_hold_before_approval', sqlerrm);
  end;

  begin
    if v_payable_id is null then
      raise exception 'Vendor payable prerequisite failed';
    end if;

    begin
      perform public.finance_post_vendor_payment_allocation_idempotent(
        p_payment_id => gen_random_uuid(),
        p_organization_id => p_organization_id,
        p_entity_id => p_entity_id,
        p_accounts_payable_id => v_payable_id,
        p_payment_amount => 50,
        p_bank_account_id => p_bank_account_id,
        p_payment_method => 'BANK_TRANSFER',
        p_reference_number => v_tag || ':HELD-PAYMENT',
        p_paid_by => p_actor_id,
        p_paid_at => now(),
        p_currency_code => upper(btrim(p_currency_code)),
        p_exchange_rate => p_exchange_rate,
        p_journal_lines => jsonb_build_array(
          jsonb_build_object('account_id', p_liability_account_id, 'debit', 50, 'credit', 0),
          jsonb_build_object('account_id', p_asset_account_id, 'debit', 0, 'credit', 50)
        ),
        p_idempotency_key => v_tag || ':HELD-PAYMENT'
      );
      raise exception 'Payment against held payable was accepted';
    exception when others then
      if sqlerrm = 'Payment against held payable was accepted' then
        raise;
      end if;
      if position('payment hold' in lower(sqlerrm)) = 0 then
        raise exception 'Unexpected held-payment rejection: %', sqlerrm;
      end if;
    end;

    call pass('payables.reject_payment_on_hold');
  exception when others then
    call fail('payables.reject_payment_on_hold', sqlerrm);
  end;

  begin
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_debit, v_credit
    from public.general_ledger
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and posting_date = p_posting_date;

    if round(v_debit, 2) <> round(v_credit, 2) then
      raise exception 'Entity ledger is unbalanced: debit %, credit %', v_debit, v_credit;
    end if;
    call pass('integrity.entity_ledger_balanced', jsonb_build_object(
      'debit', v_debit,
      'credit', v_credit
    ));
  exception when others then
    call fail('integrity.entity_ledger_balanced', sqlerrm);
  end;

  raise exception '__FINANCE_ACCEPTANCE_ROLLBACK__';
exception
  when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> '__FINANCE_ACCEPTANCE_ROLLBACK__' then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'name', 'probe.unexpected_failure',
          'passed', false,
          'message', v_error
        )
      );
    end if;

    return jsonb_build_object(
      'success', not jsonb_path_exists(v_results, '$[*] ? (@.passed == false)'),
      'rolled_back', true,
      'run_id', v_run_id,
      'tag', v_tag,
      'results', v_results,
      'passed', (
        select count(*)
        from jsonb_array_elements(v_results) result
        where (result->>'passed')::boolean = true
      ),
      'failed', (
        select count(*)
        from jsonb_array_elements(v_results) result
        where (result->>'passed')::boolean = false
      )
    );
end;
$$;

revoke all on function public.finance_run_total_acceptance_probe(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.finance_run_total_acceptance_probe(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
