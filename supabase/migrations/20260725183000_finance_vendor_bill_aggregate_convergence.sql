begin;

alter table if exists public.finance_posting_mappings
  add column if not exists tax_posting_side text;

alter table if exists public.finance_posting_mappings
  drop constraint if exists finance_posting_mappings_tax_posting_side_check;

alter table if exists public.finance_posting_mappings
  add constraint finance_posting_mappings_tax_posting_side_check
  check (
    tax_posting_side is null
    or upper(tax_posting_side) in ('DEBIT', 'CREDIT')
  );

create table if not exists public.vendor_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vendor_invoice_id uuid not null,
  line_number integer not null,
  item_id uuid,
  description text not null,
  quantity numeric not null,
  unit_price numeric not null,
  discount_amount numeric not null default 0,
  tax_code_id uuid,
  tax_amount numeric not null default 0,
  line_total numeric not null,
  expense_account_id uuid,
  asset_account_id uuid,
  inventory_account_id uuid,
  cost_center_id uuid,
  department_id uuid,
  project_id uuid,
  purchase_order_item_id uuid,
  goods_receipt_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_invoice_id, line_number)
);

create index if not exists vendor_invoice_lines_scope_idx
on public.vendor_invoice_lines (
  organization_id,
  entity_id,
  vendor_invoice_id
);

alter table if exists public.accounts_payable
  add column if not exists vendor_invoice_id uuid,
  add column if not exists vendor_party_id uuid,
  add column if not exists outstanding_balance numeric,
  add column if not exists due_date date,
  add column if not exists currency_code text,
  add column if not exists exchange_rate numeric,
  add column if not exists updated_at timestamptz default now();

update public.accounts_payable
set outstanding_balance = coalesce(outstanding_balance, amount, 0),
    updated_at = coalesce(updated_at, now());

create unique index if not exists accounts_payable_vendor_invoice_uq
on public.accounts_payable (
  organization_id,
  entity_id,
  vendor_invoice_id
)
where vendor_invoice_id is not null;

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
  p_lines jsonb,
  p_journal_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_payable public.accounts_payable%rowtype;
  v_line jsonb;
  v_line_number integer := 0;
  v_calculated_subtotal numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_discount numeric := 0;
  v_calculated_total numeric := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_discount numeric;
  v_tax numeric;
  v_line_total numeric;
  v_journal jsonb;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_vendor_party_id is null then
    raise exception 'vendor_party_id required';
  end if;

  if nullif(btrim(p_invoice_number), '') is null then
    raise exception 'invoice_number required';
  end if;

  if p_invoice_date is null then
    raise exception 'invoice_date required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice lines required';
  end if;

  if p_journal_lines is null
     or jsonb_typeof(p_journal_lines) <> 'array'
     or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'journal lines required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_quantity := coalesce(nullif(v_line->>'quantity', '')::numeric, 0);
    v_unit_price := coalesce(nullif(v_line->>'unit_price', '')::numeric, 0);
    v_discount := coalesce(nullif(v_line->>'discount_amount', '')::numeric, 0);
    v_tax := coalesce(nullif(v_line->>'tax_amount', '')::numeric, 0);
    v_line_total := coalesce(
      nullif(v_line->>'line_total', '')::numeric,
      (v_quantity * v_unit_price) - v_discount + v_tax
    );

    if nullif(btrim(v_line->>'description'), '') is null then
      raise exception 'Vendor invoice line description required';
    end if;

    if v_quantity <= 0 then
      raise exception 'Vendor invoice line quantity must be positive';
    end if;

    if v_unit_price < 0 or v_discount < 0 or v_tax < 0 then
      raise exception 'Vendor invoice line amounts cannot be negative';
    end if;

    if abs(v_line_total - ((v_quantity * v_unit_price) - v_discount + v_tax)) > 0.005 then
      raise exception 'Vendor invoice line total is inconsistent';
    end if;

    v_calculated_subtotal := v_calculated_subtotal + (v_quantity * v_unit_price);
    v_calculated_discount := v_calculated_discount + v_discount;
    v_calculated_tax := v_calculated_tax + v_tax;
    v_calculated_total := v_calculated_total + v_line_total;
  end loop;

  if abs(v_calculated_subtotal - p_subtotal) > 0.005
     or abs(v_calculated_discount - p_discount_amount) > 0.005
     or abs(v_calculated_tax - p_tax_amount) > 0.005
     or abs(v_calculated_total - p_total_amount) > 0.005 then
    raise exception 'Vendor invoice totals do not reconcile to lines';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':' || p_vendor_party_id::text || ':' || lower(btrim(p_invoice_number)),
      0
    )
  );

  perform 1
  from public.vendor_invoices
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and vendor_party_id = p_vendor_party_id
    and lower(btrim(invoice_number)) = lower(btrim(p_invoice_number));

  if found then
    raise exception 'Duplicate vendor invoice number for vendor and entity';
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
    btrim(p_invoice_number),
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

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_line_number := v_line_number + 1;
    v_quantity := nullif(v_line->>'quantity', '')::numeric;
    v_unit_price := nullif(v_line->>'unit_price', '')::numeric;
    v_discount := coalesce(nullif(v_line->>'discount_amount', '')::numeric, 0);
    v_tax := coalesce(nullif(v_line->>'tax_amount', '')::numeric, 0);
    v_line_total := coalesce(
      nullif(v_line->>'line_total', '')::numeric,
      (v_quantity * v_unit_price) - v_discount + v_tax
    );

    insert into public.vendor_invoice_lines (
      organization_id,
      entity_id,
      vendor_invoice_id,
      line_number,
      item_id,
      description,
      quantity,
      unit_price,
      discount_amount,
      tax_code_id,
      tax_amount,
      line_total,
      expense_account_id,
      asset_account_id,
      inventory_account_id,
      cost_center_id,
      department_id,
      project_id,
      purchase_order_item_id,
      goods_receipt_item_id
    ) values (
      p_organization_id,
      p_entity_id,
      p_invoice_id,
      v_line_number,
      nullif(v_line->>'item_id', '')::uuid,
      btrim(v_line->>'description'),
      v_quantity,
      v_unit_price,
      v_discount,
      nullif(v_line->>'tax_code_id', '')::uuid,
      v_tax,
      v_line_total,
      nullif(v_line->>'expense_account_id', '')::uuid,
      nullif(v_line->>'asset_account_id', '')::uuid,
      nullif(v_line->>'inventory_account_id', '')::uuid,
      nullif(v_line->>'cost_center_id', '')::uuid,
      nullif(v_line->>'department_id', '')::uuid,
      nullif(v_line->>'project_id', '')::uuid,
      nullif(v_line->>'purchase_order_item_id', '')::uuid,
      nullif(v_line->>'goods_receipt_item_id', '')::uuid
    );
  end loop;

  insert into public.accounts_payable (
    organization_id,
    entity_id,
    vendor_party_id,
    vendor_invoice_id,
    amount,
    outstanding_balance,
    due_date,
    currency_code,
    exchange_rate,
    status,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_vendor_party_id,
    p_invoice_id,
    p_total_amount,
    p_total_amount,
    p_due_date,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    'PENDING_PAYMENT',
    now(),
    now()
  )
  returning * into v_payable;

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

  update public.vendor_invoices
  set journal_entry_id = nullif(v_journal->'journal'->>'id', '')::uuid,
      updated_at = now()
  where id = p_invoice_id;

  return jsonb_build_object(
    'success', true,
    'invoice', to_jsonb(v_invoice),
    'payable', to_jsonb(v_payable),
    'lines', p_lines,
    'journal', v_journal
  );
end;
$$;

create or replace function public.finance_create_vendor_invoice_idempotent(
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
  p_lines jsonb,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result jsonb;
  v_request_hash text;
begin
  v_request_hash := md5(concat_ws(
    '|',
    p_vendor_party_id::text,
    coalesce(p_purchase_order_id::text, ''),
    coalesce(p_goods_receipt_id::text, ''),
    coalesce(p_document_id::text, ''),
    btrim(p_invoice_number),
    p_invoice_date::text,
    coalesce(p_due_date::text, ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    p_subtotal::text,
    p_tax_amount::text,
    p_discount_amount::text,
    p_total_amount::text,
    coalesce(p_source, ''),
    coalesce(p_lines, '[]'::jsonb)::text,
    coalesce(p_journal_lines, '[]'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_INVOICE_CREATE',
    p_idempotency_key,
    v_request_hash,
    p_invoice_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  v_result := public.finance_create_vendor_invoice_atomic(
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
    p_currency_code,
    p_exchange_rate,
    p_subtotal,
    p_tax_amount,
    p_discount_amount,
    p_total_amount,
    p_source,
    p_ai_extracted,
    p_ocr_confidence,
    p_created_by,
    p_lines,
    p_journal_lines
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_INVOICE_CREATE',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_create_vendor_invoice_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text,
  numeric, numeric, numeric, numeric, numeric, text, boolean, numeric,
  uuid, jsonb, jsonb
) from public;

revoke all on function public.finance_create_vendor_invoice_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text,
  numeric, numeric, numeric, numeric, numeric, text, boolean, numeric,
  uuid, jsonb, jsonb, text
) from public;

grant execute on function public.finance_create_vendor_invoice_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text,
  numeric, numeric, numeric, numeric, numeric, text, boolean, numeric,
  uuid, jsonb, jsonb, text
) to service_role;

notify pgrst, 'reload schema';

commit;
