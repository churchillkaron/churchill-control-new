begin;

create table if not exists public.finance_invoice_matching_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  name text not null default 'Invoice matching policy',
  effective_from date not null default current_date,
  effective_to date,
  amount_tolerance numeric not null default 0,
  percent_tolerance numeric not null default 0,
  quantity_tolerance numeric not null default 0,
  unit_price_tolerance numeric not null default 0,
  unit_price_percent_tolerance numeric not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_tolerance >= 0),
  check (percent_tolerance >= 0),
  check (quantity_tolerance >= 0),
  check (unit_price_tolerance >= 0),
  check (unit_price_percent_tolerance >= 0),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists finance_invoice_matching_policies_scope_idx
on public.finance_invoice_matching_policies (
  organization_id,
  entity_id,
  active,
  effective_from desc
);

create table if not exists public.finance_invoice_match_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  invoice_match_id uuid not null,
  vendor_invoice_id uuid not null,
  vendor_invoice_line_id uuid,
  purchase_order_item_id uuid,
  goods_receipt_item_id uuid,
  exception_type text not null,
  severity text not null default 'BLOCKING',
  expected_value numeric,
  actual_value numeric,
  variance_value numeric,
  details jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_invoice_match_exceptions_scope_idx
on public.finance_invoice_match_exceptions (
  organization_id,
  entity_id,
  vendor_invoice_id,
  invoice_match_id,
  resolved
);

create table if not exists public.finance_vendor_invoice_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vendor_invoice_id uuid not null,
  invoice_match_id uuid,
  decision text not null,
  decision_reason text,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  journal_entry_id uuid,
  idempotency_key text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, entity_id, idempotency_key),
  check (upper(decision) in ('APPROVED', 'REJECTED'))
);

create index if not exists finance_vendor_invoice_approvals_invoice_idx
on public.finance_vendor_invoice_approvals (
  organization_id,
  entity_id,
  vendor_invoice_id,
  decided_at desc
);

alter table if exists public.invoice_matches
  add column if not exists policy_id uuid,
  add column if not exists matched_by_user_id uuid,
  add column if not exists match_version integer not null default 1,
  add column if not exists exception_count integer not null default 0,
  add column if not exists line_evidence jsonb not null default '[]'::jsonb,
  add column if not exists match_basis text,
  add column if not exists tolerance_amount numeric not null default 0,
  add column if not exists tolerance_percent numeric not null default 0,
  add column if not exists quantity_tolerance numeric not null default 0,
  add column if not exists unit_price_tolerance numeric not null default 0,
  add column if not exists unit_price_percent_tolerance numeric not null default 0,
  add column if not exists invoice_net_total numeric,
  add column if not exists receipt_net_total numeric,
  add column if not exists matched_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists invoice_matches_scope_invoice_idx
on public.invoice_matches (
  organization_id,
  entity_id,
  invoice_id,
  created_at desc
);

alter table if exists public.vendor_invoices
  add column if not exists posting_payload jsonb not null default '{}'::jsonb,
  add column if not exists approval_status text not null default 'PENDING_MATCH',
  add column if not exists approved_by_user_id uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists posted_at timestamptz,
  add column if not exists match_id uuid;

alter table if exists public.accounts_payable
  add column if not exists payment_hold boolean not null default false,
  add column if not exists hold_reason text,
  add column if not exists approved_at timestamptz;

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
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_vendor_party_id is null then
    raise exception 'vendor_party_id required';
  end if;

  if p_created_by is null then
    raise exception 'authenticated created_by required';
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

  if p_purchase_order_id is not null then
    perform 1
    from public.purchase_orders
    where id = p_purchase_order_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and supplier_party_id = p_vendor_party_id;

    if not found then
      raise exception 'Purchase order is outside invoice organization, entity, or vendor scope';
    end if;
  end if;

  if p_goods_receipt_id is not null then
    if p_purchase_order_id is null then
      raise exception 'purchase_order_id required when goods_receipt_id is supplied';
    end if;

    perform 1
    from public.goods_receipts
    where id = p_goods_receipt_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and purchase_order_id = p_purchase_order_id;

    if not found then
      raise exception 'Goods receipt is outside invoice organization, entity, or purchase order scope';
    end if;
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

    if p_purchase_order_id is not null
       and nullif(v_line->>'purchase_order_item_id', '') is null then
      raise exception 'Every purchase-order-backed invoice line requires purchase_order_item_id';
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
    approval_status,
    posting_payload,
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
    case
      when p_purchase_order_id is not null then 'PENDING_MATCH'
      else 'PENDING_APPROVAL'
    end,
    jsonb_build_object(
      'journal_lines', p_journal_lines,
      'prepared_at', now(),
      'event_type', 'VENDOR_INVOICE_APPROVED'
    ),
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
    payment_hold,
    hold_reason,
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
    true,
    'VENDOR_INVOICE_APPROVAL_REQUIRED',
    now(),
    now()
  )
  returning * into v_payable;

  return jsonb_build_object(
    'success', true,
    'invoice', to_jsonb(v_invoice),
    'payable', to_jsonb(v_payable),
    'lines', p_lines,
    'journal', null,
    'posting_deferred', true
  );
end;
$$;

create or replace function public.finance_run_vendor_invoice_match_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_vendor_invoice_id uuid,
  p_matched_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_po record;
  v_receipt record;
  v_policy record;
  v_line record;
  v_po_line record;
  v_match_id uuid;
  v_match_json jsonb;
  v_line_evidence jsonb := '[]'::jsonb;
  v_exception_count integer := 0;
  v_invoice_line_count integer := 0;
  v_receipt_quantity numeric;
  v_quantity_variance numeric;
  v_price_variance numeric;
  v_allowed_price_variance numeric;
  v_invoice_net_total numeric := 0;
  v_receipt_net_total numeric := 0;
  v_amount_variance numeric := 0;
  v_variance_percent numeric := 0;
  v_allowed_amount_variance numeric := 0;
  v_amount_tolerance numeric := 0;
  v_percent_tolerance numeric := 0;
  v_quantity_tolerance numeric := 0;
  v_unit_price_tolerance numeric := 0;
  v_unit_price_percent_tolerance numeric := 0;
  v_matched boolean := false;
  v_now timestamptz := now();
  v_duplicate record;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_vendor_invoice_id is null then
    raise exception 'vendor_invoice_id required';
  end if;

  if p_matched_by is null then
    raise exception 'authenticated matched_by required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':vendor-invoice-match:' || p_vendor_invoice_id::text,
      0
    )
  );

  select *
  into v_invoice
  from public.vendor_invoices
  where id = p_vendor_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Vendor invoice not found in organization and entity scope';
  end if;

  if v_invoice.purchase_order_id is null or v_invoice.goods_receipt_id is null then
    raise exception 'Vendor invoice requires purchase order and goods receipt lineage';
  end if;

  select *
  into v_po
  from public.purchase_orders
  where id = v_invoice.purchase_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Purchase order not found in vendor invoice scope';
  end if;

  if v_po.supplier_party_id is distinct from v_invoice.vendor_party_id then
    raise exception 'Purchase order vendor does not match vendor invoice';
  end if;

  select *
  into v_receipt
  from public.goods_receipts
  where id = v_invoice.goods_receipt_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and purchase_order_id = v_po.id;

  if not found then
    raise exception 'Goods receipt not found in vendor invoice and purchase order scope';
  end if;

  select *
  into v_policy
  from public.finance_invoice_matching_policies
  where organization_id = p_organization_id
    and active = true
    and (entity_id = p_entity_id or entity_id is null)
    and effective_from <= v_invoice.invoice_date
    and (effective_to is null or effective_to >= v_invoice.invoice_date)
  order by
    case when entity_id = p_entity_id then 0 else 1 end,
    effective_from desc,
    created_at desc
  limit 1;

  if found then
    v_amount_tolerance := coalesce(v_policy.amount_tolerance, 0);
    v_percent_tolerance := coalesce(v_policy.percent_tolerance, 0);
    v_quantity_tolerance := coalesce(v_policy.quantity_tolerance, 0);
    v_unit_price_tolerance := coalesce(v_policy.unit_price_tolerance, 0);
    v_unit_price_percent_tolerance := coalesce(v_policy.unit_price_percent_tolerance, 0);
  end if;

  select count(*)
  into v_invoice_line_count
  from public.vendor_invoice_lines
  where vendor_invoice_id = v_invoice.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if v_invoice_line_count = 0 then
    raise exception 'Vendor invoice lines required for matching';
  end if;

  select id
  into v_match_id
  from public.invoice_matches
  where invoice_id = v_invoice.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  order by created_at desc
  limit 1
  for update;

  if v_match_id is null then
    insert into public.invoice_matches (
      organization_id,
      entity_id,
      invoice_id,
      purchase_order_id,
      goods_receipt_id,
      match_status,
      po_total,
      grn_total,
      invoice_total,
      variance_amount,
      variance_percent,
      matched_by,
      matched_by_user_id,
      policy_id,
      match_version,
      exception_count,
      line_evidence,
      match_basis,
      tolerance_amount,
      tolerance_percent,
      quantity_tolerance,
      unit_price_tolerance,
      unit_price_percent_tolerance,
      invoice_net_total,
      receipt_net_total,
      matched_at,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      v_invoice.id,
      v_po.id,
      v_receipt.id,
      'IN_PROGRESS',
      coalesce(v_po.total_amount, 0),
      0,
      coalesce(v_invoice.total_amount, 0),
      0,
      0,
      p_matched_by::text,
      p_matched_by,
      v_policy.id,
      1,
      0,
      '[]'::jsonb,
      'PO_RECEIPT_INVOICE_NET_EXCLUDING_TAX',
      v_amount_tolerance,
      v_percent_tolerance,
      v_quantity_tolerance,
      v_unit_price_tolerance,
      v_unit_price_percent_tolerance,
      0,
      0,
      null,
      v_now,
      v_now
    )
    returning id into v_match_id;
  else
    delete from public.finance_invoice_match_exceptions
    where invoice_match_id = v_match_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;
  end if;

  for v_duplicate in
    select purchase_order_item_id, count(*) as line_count
    from public.vendor_invoice_lines
    where vendor_invoice_id = v_invoice.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and purchase_order_item_id is not null
    group by purchase_order_item_id
    having count(*) > 1
  loop
    insert into public.finance_invoice_match_exceptions (
      organization_id,
      entity_id,
      invoice_match_id,
      vendor_invoice_id,
      purchase_order_item_id,
      exception_type,
      expected_value,
      actual_value,
      variance_value,
      details
    ) values (
      p_organization_id,
      p_entity_id,
      v_match_id,
      v_invoice.id,
      v_duplicate.purchase_order_item_id,
      'DUPLICATE_PO_LINE_REFERENCE',
      1,
      v_duplicate.line_count,
      v_duplicate.line_count - 1,
      jsonb_build_object('message', 'Multiple invoice lines reference the same purchase order line')
    );

    v_exception_count := v_exception_count + 1;
  end loop;

  for v_line in
    select *
    from public.vendor_invoice_lines
    where vendor_invoice_id = v_invoice.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
    order by line_number
  loop
    if v_line.purchase_order_item_id is null then
      insert into public.finance_invoice_match_exceptions (
        organization_id,
        entity_id,
        invoice_match_id,
        vendor_invoice_id,
        vendor_invoice_line_id,
        exception_type,
        details
      ) values (
        p_organization_id,
        p_entity_id,
        v_match_id,
        v_invoice.id,
        v_line.id,
        'MISSING_PURCHASE_ORDER_LINE',
        jsonb_build_object('line_number', v_line.line_number)
      );

      v_exception_count := v_exception_count + 1;
      continue;
    end if;

    select *
    into v_po_line
    from public.purchase_order_items
    where id = v_line.purchase_order_item_id
      and purchase_order_id = v_po.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    if not found then
      insert into public.finance_invoice_match_exceptions (
        organization_id,
        entity_id,
        invoice_match_id,
        vendor_invoice_id,
        vendor_invoice_line_id,
        purchase_order_item_id,
        exception_type,
        details
      ) values (
        p_organization_id,
        p_entity_id,
        v_match_id,
        v_invoice.id,
        v_line.id,
        v_line.purchase_order_item_id,
        'PURCHASE_ORDER_LINE_OUT_OF_SCOPE',
        jsonb_build_object('line_number', v_line.line_number)
      );

      v_exception_count := v_exception_count + 1;
      continue;
    end if;

    if v_line.goods_receipt_item_id is not null then
      select coalesce(accepted_qty, 0)
      into v_receipt_quantity
      from public.goods_receipt_items
      where id = v_line.goods_receipt_item_id
        and goods_receipt_id = v_receipt.id
        and purchase_order_item_id = v_po_line.id
        and organization_id = p_organization_id
        and entity_id = p_entity_id;

      if not found then
        v_receipt_quantity := null;
      end if;
    else
      select coalesce(sum(accepted_qty), 0)
      into v_receipt_quantity
      from public.goods_receipt_items
      where goods_receipt_id = v_receipt.id
        and purchase_order_item_id = v_po_line.id
        and organization_id = p_organization_id
        and entity_id = p_entity_id;
    end if;

    if v_receipt_quantity is null or v_receipt_quantity <= 0 then
      insert into public.finance_invoice_match_exceptions (
        organization_id,
        entity_id,
        invoice_match_id,
        vendor_invoice_id,
        vendor_invoice_line_id,
        purchase_order_item_id,
        goods_receipt_item_id,
        exception_type,
        expected_value,
        actual_value,
        variance_value,
        details
      ) values (
        p_organization_id,
        p_entity_id,
        v_match_id,
        v_invoice.id,
        v_line.id,
        v_po_line.id,
        v_line.goods_receipt_item_id,
        'MISSING_ACCEPTED_RECEIPT_QUANTITY',
        v_line.quantity,
        coalesce(v_receipt_quantity, 0),
        v_line.quantity - coalesce(v_receipt_quantity, 0),
        jsonb_build_object('line_number', v_line.line_number)
      );

      v_exception_count := v_exception_count + 1;
      v_receipt_quantity := coalesce(v_receipt_quantity, 0);
    end if;

    v_quantity_variance := v_line.quantity - v_receipt_quantity;
    v_price_variance := v_line.unit_price - coalesce(v_po_line.unit_price, 0);
    v_allowed_price_variance := greatest(
      v_unit_price_tolerance,
      abs(coalesce(v_po_line.unit_price, 0)) * v_unit_price_percent_tolerance / 100
    );

    if abs(v_quantity_variance) > v_quantity_tolerance then
      insert into public.finance_invoice_match_exceptions (
        organization_id,
        entity_id,
        invoice_match_id,
        vendor_invoice_id,
        vendor_invoice_line_id,
        purchase_order_item_id,
        goods_receipt_item_id,
        exception_type,
        expected_value,
        actual_value,
        variance_value,
        details
      ) values (
        p_organization_id,
        p_entity_id,
        v_match_id,
        v_invoice.id,
        v_line.id,
        v_po_line.id,
        v_line.goods_receipt_item_id,
        'QUANTITY_VARIANCE',
        v_receipt_quantity,
        v_line.quantity,
        v_quantity_variance,
        jsonb_build_object(
          'line_number', v_line.line_number,
          'allowed_variance', v_quantity_tolerance
        )
      );

      v_exception_count := v_exception_count + 1;
    end if;

    if abs(v_price_variance) > v_allowed_price_variance then
      insert into public.finance_invoice_match_exceptions (
        organization_id,
        entity_id,
        invoice_match_id,
        vendor_invoice_id,
        vendor_invoice_line_id,
        purchase_order_item_id,
        goods_receipt_item_id,
        exception_type,
        expected_value,
        actual_value,
        variance_value,
        details
      ) values (
        p_organization_id,
        p_entity_id,
        v_match_id,
        v_invoice.id,
        v_line.id,
        v_po_line.id,
        v_line.goods_receipt_item_id,
        'UNIT_PRICE_VARIANCE',
        coalesce(v_po_line.unit_price, 0),
        v_line.unit_price,
        v_price_variance,
        jsonb_build_object(
          'line_number', v_line.line_number,
          'allowed_variance', v_allowed_price_variance
        )
      );

      v_exception_count := v_exception_count + 1;
    end if;

    v_invoice_net_total := v_invoice_net_total +
      (v_line.quantity * v_line.unit_price) - coalesce(v_line.discount_amount, 0);
    v_receipt_net_total := v_receipt_net_total +
      (v_receipt_quantity * coalesce(v_po_line.unit_price, 0));

    v_line_evidence := v_line_evidence || jsonb_build_array(
      jsonb_build_object(
        'vendor_invoice_line_id', v_line.id,
        'line_number', v_line.line_number,
        'purchase_order_item_id', v_po_line.id,
        'goods_receipt_item_id', v_line.goods_receipt_item_id,
        'invoice_quantity', v_line.quantity,
        'accepted_quantity', v_receipt_quantity,
        'quantity_variance', v_quantity_variance,
        'invoice_unit_price', v_line.unit_price,
        'purchase_order_unit_price', coalesce(v_po_line.unit_price, 0),
        'unit_price_variance', v_price_variance,
        'discount_amount', coalesce(v_line.discount_amount, 0),
        'tax_amount', coalesce(v_line.tax_amount, 0)
      )
    );
  end loop;

  v_amount_variance := v_invoice_net_total - v_receipt_net_total;
  v_variance_percent := case
    when v_receipt_net_total = 0 then
      case when v_invoice_net_total = 0 then 0 else 100 end
    else (v_amount_variance / v_receipt_net_total) * 100
  end;
  v_allowed_amount_variance := greatest(
    v_amount_tolerance,
    abs(v_receipt_net_total) * v_percent_tolerance / 100
  );

  if abs(v_amount_variance) > v_allowed_amount_variance then
    insert into public.finance_invoice_match_exceptions (
      organization_id,
      entity_id,
      invoice_match_id,
      vendor_invoice_id,
      exception_type,
      expected_value,
      actual_value,
      variance_value,
      details
    ) values (
      p_organization_id,
      p_entity_id,
      v_match_id,
      v_invoice.id,
      'NET_AMOUNT_VARIANCE',
      v_receipt_net_total,
      v_invoice_net_total,
      v_amount_variance,
      jsonb_build_object(
        'allowed_variance', v_allowed_amount_variance,
        'tax_excluded_from_match_basis', true
      )
    );

    v_exception_count := v_exception_count + 1;
  end if;

  v_matched := v_exception_count = 0;

  update public.invoice_matches
  set purchase_order_id = v_po.id,
      goods_receipt_id = v_receipt.id,
      match_status = case when v_matched then 'MATCHED' else 'MISMATCH' end,
      po_total = coalesce(v_po.total_amount, 0),
      grn_total = v_receipt_net_total,
      invoice_total = coalesce(v_invoice.total_amount, 0),
      variance_amount = v_amount_variance,
      variance_percent = v_variance_percent,
      matched_by = p_matched_by::text,
      matched_by_user_id = p_matched_by,
      policy_id = v_policy.id,
      match_version = coalesce(match_version, 0) + 1,
      exception_count = v_exception_count,
      line_evidence = v_line_evidence,
      match_basis = 'PO_RECEIPT_INVOICE_NET_EXCLUDING_TAX',
      tolerance_amount = v_amount_tolerance,
      tolerance_percent = v_percent_tolerance,
      quantity_tolerance = v_quantity_tolerance,
      unit_price_tolerance = v_unit_price_tolerance,
      unit_price_percent_tolerance = v_unit_price_percent_tolerance,
      invoice_net_total = v_invoice_net_total,
      receipt_net_total = v_receipt_net_total,
      matched_at = v_now,
      updated_at = v_now
  where id = v_match_id;

  update public.vendor_invoices
  set status = case when v_matched then 'MATCHED' else 'MISMATCH' end,
      approval_status = case when v_matched then 'PENDING_APPROVAL' else 'BLOCKED' end,
      match_id = v_match_id,
      matched_at = v_now,
      updated_at = v_now
  where id = v_invoice.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  select to_jsonb(invoice_match)
  into v_match_json
  from public.invoice_matches as invoice_match
  where id = v_match_id;

  return jsonb_build_object(
    'success', true,
    'matched', v_matched,
    'match', v_match_json,
    'exception_count', v_exception_count,
    'exceptions', coalesce(
      (
        select jsonb_agg(to_jsonb(match_exception) order by match_exception.created_at)
        from public.finance_invoice_match_exceptions as match_exception
        where match_exception.invoice_match_id = v_match_id
      ),
      '[]'::jsonb
    ),
    'invoice_status', case when v_matched then 'MATCHED' else 'MISMATCH' end,
    'approval_status', case when v_matched then 'PENDING_APPROVAL' else 'BLOCKED' end
  );
end;
$$;

create or replace function public.finance_approve_vendor_invoice_idempotent(
  p_organization_id uuid,
  p_entity_id uuid,
  p_vendor_invoice_id uuid,
  p_approved_by uuid,
  p_decision_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.vendor_invoices%rowtype;
  v_match record;
  v_existing jsonb;
  v_result jsonb;
  v_request_hash text;
  v_journal_lines jsonb;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_now timestamptz := now();
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_vendor_invoice_id is null then
    raise exception 'vendor_invoice_id required';
  end if;

  if p_approved_by is null then
    raise exception 'authenticated approved_by required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_vendor_invoice_id::text,
    p_approved_by::text,
    coalesce(btrim(p_decision_reason), '')
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_INVOICE_APPROVE',
    btrim(p_idempotency_key),
    v_request_hash,
    p_vendor_invoice_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':vendor-invoice-approve:' || p_vendor_invoice_id::text,
      0
    )
  );

  select *
  into v_invoice
  from public.vendor_invoices
  where id = p_vendor_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Vendor invoice not found in organization and entity scope';
  end if;

  if v_invoice.status = 'POSTED'
     and v_invoice.approval_status = 'APPROVED'
     and v_invoice.journal_entry_id is not null then
    v_result := jsonb_build_object(
      'success', true,
      'already_approved', true,
      'invoice', to_jsonb(v_invoice),
      'journal_entry_id', v_invoice.journal_entry_id
    );

    perform public.finance_complete_idempotency(
      p_organization_id,
      p_entity_id,
      'VENDOR_INVOICE_APPROVE',
      btrim(p_idempotency_key),
      v_result
    );

    return v_result;
  end if;

  select *
  into v_match
  from public.invoice_matches
  where id = v_invoice.match_id
    and invoice_id = v_invoice.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and match_status = 'MATCHED'
    and coalesce(exception_count, 0) = 0
  for update;

  if not found then
    raise exception 'A completed exception-free three-way match is required before approval';
  end if;

  if exists (
    select 1
    from public.finance_invoice_match_exceptions
    where invoice_match_id = v_match.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and resolved = false
      and severity = 'BLOCKING'
  ) then
    raise exception 'Unresolved blocking invoice match exceptions prevent approval';
  end if;

  if v_invoice.journal_entry_id is null then
    v_journal_lines := coalesce(v_invoice.posting_payload->'journal_lines', '[]'::jsonb);

    if jsonb_typeof(v_journal_lines) <> 'array'
       or jsonb_array_length(v_journal_lines) < 2 then
      raise exception 'Prepared journal lines are missing from vendor invoice posting evidence';
    end if;

    select public.finance_post_journal_atomic(
      p_organization_id => p_organization_id,
      p_entity_id => p_entity_id,
      p_posting_date => v_invoice.invoice_date,
      p_document_date => v_invoice.invoice_date,
      p_journal_type => 'SYSTEM',
      p_reference => 'accounts_payable:' || v_invoice.id::text,
      p_source_module => 'accounts_payable',
      p_source_document => 'VENDOR_INVOICE_APPROVED',
      p_source_document_id => v_invoice.id,
      p_description => 'Vendor Invoice ' || v_invoice.invoice_number,
      p_currency_code => upper(btrim(v_invoice.currency_code)),
      p_exchange_rate => v_invoice.exchange_rate,
      p_lines => v_journal_lines,
      p_created_by => p_approved_by,
      p_idempotency_key => 'accounting-event:VENDOR_INVOICE_APPROVED:accounts_payable:' || v_invoice.id::text
    ) into v_journal;

    v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;

    if v_journal_entry_id is null then
      raise exception 'Vendor invoice approval did not return a journal entry';
    end if;
  else
    v_journal_entry_id := v_invoice.journal_entry_id;
    v_journal := jsonb_build_object(
      'success', true,
      'already_posted', true,
      'journal', jsonb_build_object('id', v_journal_entry_id)
    );
  end if;

  insert into public.finance_vendor_invoice_approvals (
    organization_id,
    entity_id,
    vendor_invoice_id,
    invoice_match_id,
    decision,
    decision_reason,
    decided_by,
    decided_at,
    journal_entry_id,
    idempotency_key,
    evidence
  ) values (
    p_organization_id,
    p_entity_id,
    v_invoice.id,
    v_match.id,
    'APPROVED',
    nullif(btrim(p_decision_reason), ''),
    p_approved_by,
    v_now,
    v_journal_entry_id,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'match_status', v_match.match_status,
      'exception_count', v_match.exception_count,
      'match_version', v_match.match_version,
      'posting_payload_prepared_at', v_invoice.posting_payload->>'prepared_at'
    )
  );

  update public.vendor_invoices
  set status = 'POSTED',
      approval_status = 'APPROVED',
      approved_by_user_id = p_approved_by,
      approved_at = v_now,
      posted_at = coalesce(posted_at, v_now),
      journal_entry_id = v_journal_entry_id,
      updated_at = v_now
  where id = v_invoice.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  returning * into v_invoice;

  update public.accounts_payable
  set payment_hold = false,
      hold_reason = null,
      approved_at = v_now,
      updated_at = v_now
  where vendor_invoice_id = v_invoice.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'invoice', to_jsonb(v_invoice),
    'match', to_jsonb(v_match),
    'journal', v_journal,
    'journal_entry_id', v_journal_entry_id,
    'payment_hold_released', true
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_INVOICE_APPROVE',
    btrim(p_idempotency_key),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_run_vendor_invoice_match_atomic(
  uuid, uuid, uuid, uuid
) from public;

revoke all on function public.finance_approve_vendor_invoice_idempotent(
  uuid, uuid, uuid, uuid, text, text
) from public;

grant execute on function public.finance_run_vendor_invoice_match_atomic(
  uuid, uuid, uuid, uuid
) to service_role;

grant execute on function public.finance_approve_vendor_invoice_idempotent(
  uuid, uuid, uuid, uuid, text, text
) to service_role;

comment on table public.finance_invoice_matching_policies is
  'Effective-dated organization and legal-entity matching tolerances. No jurisdiction-specific values are embedded in runtime code.';

comment on table public.finance_invoice_match_exceptions is
  'Retained line and aggregate evidence for vendor invoice three-way match exceptions.';

comment on table public.finance_vendor_invoice_approvals is
  'Authenticated approval evidence linking an exception-free match to the posted vendor invoice journal.';

notify pgrst, 'reload schema';

commit;
