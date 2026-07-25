begin;

create or replace function public.finance_create_customer_invoice_atomic(
  p_invoice_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_notes text,
  p_lines jsonb,
  p_journal_lines jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_line jsonb;
  v_journal jsonb;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  if p_invoice_id is null then
    raise exception 'invoice_id required';
  end if;

  if coalesce(jsonb_array_length(p_lines), 0) = 0 then
    raise exception 'invoice lines required';
  end if;

  if coalesce(jsonb_array_length(p_journal_lines), 0) = 0 then
    raise exception 'journal lines required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  insert into public.customer_invoices (
    id,
    organization_id,
    entity_id,
    customer_id,
    invoice_number,
    invoice_date,
    due_date,
    currency_code,
    exchange_rate,
    subtotal,
    tax_amount,
    total_amount,
    outstanding_balance,
    status,
    notes
  ) values (
    p_invoice_id,
    p_organization_id,
    p_entity_id,
    p_customer_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    p_subtotal,
    p_tax_amount,
    p_total_amount,
    p_total_amount,
    'OPEN',
    p_notes
  )
  returning * into v_invoice;

  for v_line in
    select value
    from jsonb_array_elements(p_lines)
  loop
    insert into public.customer_invoice_lines (
      organization_id,
      entity_id,
      customer_invoice_id,
      description,
      quantity,
      unit_price,
      line_total
    ) values (
      p_organization_id,
      p_entity_id,
      p_invoice_id,
      nullif(btrim(v_line->>'description'), ''),
      coalesce(nullif(v_line->>'quantity', '')::numeric, 0),
      coalesce(nullif(v_line->>'unit_price', '')::numeric, 0),
      coalesce(nullif(v_line->>'line_total', '')::numeric, 0)
    );
  end loop;

  insert into public.accounts_receivable (
    organization_id,
    entity_id,
    customer_id,
    customer_invoice_id,
    amount,
    outstanding_balance,
    due_date,
    status
  ) values (
    p_organization_id,
    p_entity_id,
    p_customer_id,
    p_invoice_id,
    p_total_amount,
    p_total_amount,
    p_due_date,
    'OPEN'
  )
  returning * into v_receivable;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_invoice_date,
    p_document_date => p_invoice_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:' || p_invoice_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_INVOICE_CREATED',
    p_source_document_id => p_invoice_id,
    p_description => 'Customer Invoice ' || p_invoice_number,
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_INVOICE_CREATED:accounts_receivable:' || p_invoice_id::text
  ) into v_journal;

  return jsonb_build_object(
    'success', true,
    'invoice', to_jsonb(v_invoice),
    'receivable', to_jsonb(v_receivable),
    'journal', v_journal
  );
end;
$$;

create or replace function public.finance_create_vendor_invoice_atomic(
  p_invoice_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_vendor_party_id uuid,
  p_purchase_order_id uuid,
  p_goods_receipt_id uuid,
  p_document_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_discount_amount numeric,
  p_total_amount numeric,
  p_source text,
  p_ai_extracted boolean,
  p_ocr_confidence numeric,
  p_created_by uuid,
  p_journal_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_journal jsonb;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_vendor_party_id is null then
    raise exception 'vendor_party_id required';
  end if;

  if coalesce(jsonb_array_length(p_journal_lines), 0) = 0 then
    raise exception 'journal lines required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  insert into public.vendor_invoices (
    id,
    organization_id,
    entity_id,
    vendor_party_id,
    purchase_order_id,
    goods_receipt_id,
    document_id,
    invoice_number,
    invoice_date,
    due_date,
    currency_code,
    exchange_rate,
    subtotal,
    tax_amount,
    discount_amount,
    total_amount,
    outstanding_amount,
    source,
    ai_extracted,
    ocr_confidence,
    status,
    received_at,
    created_by
  ) values (
    p_invoice_id,
    p_organization_id,
    p_entity_id,
    p_vendor_party_id,
    p_purchase_order_id,
    p_goods_receipt_id,
    p_document_id,
    p_invoice_number,
    p_invoice_date,
    p_due_date,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    p_subtotal,
    p_tax_amount,
    p_discount_amount,
    p_total_amount,
    p_total_amount,
    coalesce(nullif(btrim(p_source), ''), 'manual'),
    coalesce(p_ai_extracted, false),
    coalesce(p_ocr_confidence, 0),
    'RECEIVED',
    now(),
    p_created_by
  )
  returning * into v_invoice;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_invoice_date,
    p_document_date => p_invoice_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_payable:' || p_invoice_id::text,
    p_source_module => 'accounts_payable',
    p_source_document => 'VENDOR_INVOICE_CREATED',
    p_source_document_id => p_invoice_id,
    p_description => 'Vendor Invoice ' || p_invoice_number,
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'accounting-event:VENDOR_INVOICE_CREATED:accounts_payable:' || p_invoice_id::text
  ) into v_journal;

  return jsonb_build_object(
    'success', true,
    'invoice', to_jsonb(v_invoice),
    'journal', v_journal
  );
end;
$$;

create or replace function public.finance_post_customer_payment_atomic(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_id uuid,
  p_customer_invoice_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference_number text,
  p_paid_by uuid,
  p_currency_code text,
  p_exchange_rate numeric,
  p_journal_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receivable public.accounts_receivable%rowtype;
  v_payment public.customer_payments%rowtype;
  v_new_balance numeric;
  v_status text;
  v_journal jsonb;
begin
  select *
  into v_receivable
  from public.accounts_receivable
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and customer_invoice_id = p_customer_invoice_id
  for update;

  if not found then
    raise exception 'Accounts receivable entry not found';
  end if;

  if p_customer_id is not null
     and v_receivable.customer_id is not null
     and p_customer_id <> v_receivable.customer_id then
    raise exception 'Customer does not match the selected invoice';
  end if;

  if p_amount <= 0 or p_amount > v_receivable.outstanding_balance then
    raise exception 'Invalid payment amount';
  end if;

  v_new_balance := v_receivable.outstanding_balance - p_amount;
  v_status := case when v_new_balance = 0 then 'PAID' else 'PARTIAL' end;

  insert into public.customer_payments (
    id,
    organization_id,
    entity_id,
    customer_id,
    customer_invoice_id,
    payment_date,
    amount,
    payment_method,
    reference_number,
    paid_by
  ) values (
    p_payment_id,
    p_organization_id,
    p_entity_id,
    coalesce(v_receivable.customer_id, p_customer_id),
    p_customer_invoice_id,
    p_payment_date,
    p_amount,
    p_payment_method,
    p_reference_number,
    p_paid_by
  )
  returning * into v_payment;

  update public.accounts_receivable
  set outstanding_balance = v_new_balance,
      status = v_status
  where id = v_receivable.id;

  update public.customer_invoices
  set outstanding_balance = v_new_balance,
      status = v_status
  where id = p_customer_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Customer invoice not found';
  end if;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_payment_date,
    p_document_date => p_payment_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:' || p_payment_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_PAYMENT_RECEIVED',
    p_source_document_id => p_payment_id,
    p_description => 'Customer Payment ' || coalesce(p_reference_number, p_payment_id::text),
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_paid_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_PAYMENT_RECEIVED:accounts_receivable:' || p_payment_id::text
  ) into v_journal;

  return jsonb_build_object(
    'success', true,
    'payment', to_jsonb(v_payment),
    'outstanding_balance', v_new_balance,
    'status', v_status,
    'journal', v_journal
  );
end;
$$;

create or replace function public.finance_post_vendor_payment_atomic(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_accounts_payable_id uuid,
  p_payment_method text,
  p_paid_by uuid,
  p_paid_at timestamptz,
  p_currency_code text,
  p_exchange_rate numeric,
  p_journal_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ap public.accounts_payable%rowtype;
  v_payment public.vendor_payments%rowtype;
  v_journal jsonb;
begin
  select *
  into v_ap
  from public.accounts_payable
  where id = p_accounts_payable_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Accounts payable entry not found';
  end if;

  if upper(coalesce(v_ap.status, '')) = 'PAID' then
    raise exception 'Accounts payable entry is already paid';
  end if;

  insert into public.vendor_payments (
    id,
    organization_id,
    entity_id,
    accounts_payable_id,
    vendor_party_id,
    amount,
    payment_method,
    paid_by,
    paid_at,
    created_at
  ) values (
    p_payment_id,
    p_organization_id,
    p_entity_id,
    p_accounts_payable_id,
    v_ap.vendor_party_id,
    v_ap.amount,
    p_payment_method,
    p_paid_by,
    p_paid_at,
    now()
  )
  returning * into v_payment;

  update public.accounts_payable
  set status = 'PAID',
      payment_date = p_paid_at
  where id = v_ap.id;

  insert into public.bank_ledger (
    organization_id,
    entity_id,
    transaction_type,
    reference_id,
    amount,
    direction,
    created_at
  ) values (
    p_organization_id,
    p_entity_id,
    'VENDOR_PAYMENT',
    p_payment_id,
    v_ap.amount,
    'OUTFLOW',
    p_paid_at
  );

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_paid_at::date,
    p_document_date => p_paid_at::date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_payable:' || p_payment_id::text,
    p_source_module => 'accounts_payable',
    p_source_document => 'VENDOR_PAYMENT_POSTED',
    p_source_document_id => p_payment_id,
    p_description => 'Vendor Payment ' || p_payment_id::text,
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_paid_by,
    p_idempotency_key => 'accounting-event:VENDOR_PAYMENT_POSTED:accounts_payable:' || p_payment_id::text
  ) into v_journal;

  return jsonb_build_object(
    'success', true,
    'payment', to_jsonb(v_payment),
    'journal', v_journal
  );
end;
$$;

revoke all on function public.finance_create_customer_invoice_atomic(uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric, numeric, text, jsonb, jsonb, uuid) from public;
revoke all on function public.finance_create_vendor_invoice_atomic(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric, numeric, numeric, text, boolean, numeric, uuid, jsonb) from public;
revoke all on function public.finance_post_customer_payment_atomic(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb) from public;
revoke all on function public.finance_post_vendor_payment_atomic(uuid, uuid, uuid, uuid, text, uuid, timestamptz, text, numeric, jsonb) from public;

grant execute on function public.finance_create_customer_invoice_atomic(uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric, numeric, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.finance_create_vendor_invoice_atomic(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric, numeric, numeric, text, boolean, numeric, uuid, jsonb) to service_role;
grant execute on function public.finance_post_customer_payment_atomic(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb) to service_role;
grant execute on function public.finance_post_vendor_payment_atomic(uuid, uuid, uuid, uuid, text, uuid, timestamptz, text, numeric, jsonb) to service_role;

commit;
