begin;

create table if not exists public.pos_payment_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  application_id text not null,
  cash_session_id uuid not null references public.pos_shifts(id),
  original_cash_session_id uuid references public.pos_shifts(id),
  original_payment_id uuid not null references public.payments(id),
  correction_type text not null,
  amount numeric(18,2) not null,
  currency_code text not null,
  payment_method text not null,
  reason text not null,
  original_payment_journal_id uuid not null references public.journal_entries(id),
  payment_reversal_journal_id uuid not null references public.journal_entries(id),
  original_sale_journal_id uuid not null references public.journal_entries(id),
  sale_reversal_journal_id uuid not null references public.journal_entries(id),
  source_document text,
  source_document_id uuid,
  status text not null default 'POSTED',
  created_by uuid not null references public.staff_accounts(id),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_payment_corrections_type_check check (upper(correction_type) in ('REFUND','REVERSAL')),
  constraint pos_payment_corrections_amount_check check (amount > 0),
  constraint pos_payment_corrections_status_check check (upper(status) = 'POSTED')
);

create unique index if not exists pos_payment_corrections_idempotency_uidx
  on public.pos_payment_corrections (organization_id, entity_id, idempotency_key);
create unique index if not exists pos_payment_corrections_one_posted_per_payment_uidx
  on public.pos_payment_corrections (organization_id, entity_id, original_payment_id)
  where upper(status) = 'POSTED';
create index if not exists pos_payment_corrections_session_created_idx
  on public.pos_payment_corrections (organization_id, entity_id, application_id, cash_session_id, created_at desc);
create index if not exists pos_payment_corrections_original_payment_idx
  on public.pos_payment_corrections (organization_id, entity_id, original_payment_id);

alter table public.pos_payment_corrections enable row level security;
revoke all on table public.pos_payment_corrections from public, anon, authenticated;
grant all on table public.pos_payment_corrections to service_role;

create or replace function public.finance_reverse_posted_journal_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_original_journal_id uuid,
  p_correction_id uuid,
  p_source_document text,
  p_actor_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_original public.journal_entries%rowtype;
  v_lines jsonb;
  v_reversal jsonb;
  v_reversal_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_original_journal_id is null or p_correction_id is null then raise exception 'original_journal_id and correction_id required'; end if;
  if p_actor_id is null then raise exception 'actor_id required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_source_document, '')), '') is null then raise exception 'source_document required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason, '')), '') is null then raise exception 'reversal reason required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'idempotency_key required'; end if;

  select * into v_original
  from public.journal_entries
  where id = p_original_journal_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then raise exception 'Original journal not found in scope'; end if;
  if upper(coalesce(v_original.status, '')) <> 'POSTED' then raise exception 'Only posted journals can be reversed'; end if;
  if coalesce(v_original.reversed, false) or v_original.reversal_journal_id is not null or v_original.reversed_journal_entry_id is not null then raise exception 'Original journal is already reversed'; end if;
  if nullif(pg_catalog.btrim(coalesce(v_original.currency_code, '')), '') is null then raise exception 'Original journal currency is missing'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'account_id', line.account_id,
        'debit', coalesce(line.credit, 0),
        'credit', coalesce(line.debit, 0),
        'department_id', line.department_id,
        'cost_center_id', line.cost_center_id,
        'party_id', line.party_id,
        'project_id', line.project_id,
        'description', coalesce(line.description, 'POS correction reversal')
      )) order by line.line_number, line.id
    ),
    '[]'::jsonb
  ) into v_lines
  from public.journal_entry_lines line
  where line.journal_entry_id = p_original_journal_id
    and line.organization_id = p_organization_id
    and line.entity_id = p_entity_id;

  if jsonb_array_length(v_lines) < 2 then raise exception 'Original journal has no reversible journal lines'; end if;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => current_date,
    p_document_date => current_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'pos-correction:' || p_correction_id::text,
    p_source_module => 'pos',
    p_source_document => upper(pg_catalog.btrim(p_source_document)),
    p_source_document_id => p_correction_id,
    p_description => pg_catalog.btrim(p_reason),
    p_currency_code => upper(pg_catalog.btrim(v_original.currency_code)),
    p_exchange_rate => coalesce(v_original.exchange_rate, 1),
    p_lines => v_lines,
    p_created_by => p_actor_id,
    p_idempotency_key => pg_catalog.btrim(p_idempotency_key)
  ) into v_reversal;

  v_reversal_id := nullif(v_reversal->'journal'->>'id', '')::uuid;
  if v_reversal_id is null then raise exception 'Journal reversal did not return a journal entry'; end if;

  update public.journal_entries
  set reversed = true,
      reversal_status = 'REVERSED',
      reversal_journal_id = v_reversal_id,
      reversed_journal_entry_id = v_reversal_id,
      reversed_at = now(),
      reversal_created_at = now(),
      reversed_by = p_actor_id::text,
      reversal_reason = pg_catalog.btrim(p_reason),
      updated_at = now()
  where id = p_original_journal_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  return jsonb_build_object('success', true, 'original_journal_id', p_original_journal_id, 'reversal_journal_id', v_reversal_id, 'reversal', v_reversal);
end;
$$;

revoke all on function public.finance_reverse_posted_journal_atomic(uuid,uuid,uuid,uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finance_reverse_posted_journal_atomic(uuid,uuid,uuid,uuid,text,uuid,text,text) to service_role;

create or replace function public.guard_payment_cash_session_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid;
  v_org_id uuid;
  v_entity_id uuid;
  v_app text;
begin
  if tg_op = 'UPDATE'
     and new.cash_session_id is not distinct from old.cash_session_id
     and new.organization_id is not distinct from old.organization_id
     and new.entity_id is not distinct from old.entity_id
     and lower(trim(coalesce(new.application_id, ''))) is not distinct from lower(trim(coalesce(old.application_id, ''))) then
    return new;
  end if;

  v_session_id := new.cash_session_id;
  if v_session_id is null then return new; end if;
  v_org_id := new.organization_id;
  v_entity_id := new.entity_id;
  v_app := lower(trim(coalesce(new.application_id, '')));
  if v_org_id is null or v_entity_id is null or nullif(v_app, '') is null then raise exception 'Cash-session payment requires organization, entity and application scope'; end if;

  perform 1
  from public.pos_shifts s
  where s.id = v_session_id
    and s.organization_id = v_org_id
    and s.entity_id = v_entity_id
    and lower(trim(coalesce(s.application_id, ''))) = v_app
    and upper(coalesce(s.status, '')) in ('OPEN','ACTIVE')
    and coalesce(s.locked, false) = false
  for share;
  if not found then raise exception 'Selected POS cash session is not active in this organization, entity and application'; end if;
  return new;
end;
$$;

revoke all on function public.guard_payment_cash_session_scope() from public, anon, authenticated;
grant execute on function public.guard_payment_cash_session_scope() to service_role;

create or replace function public.pos_correct_payment_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_cash_session_id uuid,
  p_payment_id uuid,
  p_correction_type text,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_app text := lower(pg_catalog.btrim(coalesce(p_application_id, '')));
  v_type text := upper(pg_catalog.btrim(coalesce(p_correction_type, '')));
  v_role text;
  v_shift public.pos_shifts%rowtype;
  v_payment public.payments%rowtype;
  v_existing public.pos_payment_corrections%rowtype;
  v_payment_journal public.journal_entries%rowtype;
  v_sale_journal public.journal_entries%rowtype;
  v_order public.orders%rowtype;
  v_sales_order public.sales_orders%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_order_ids uuid[];
  v_order_count int := 0;
  v_allocation_total numeric(18,2) := 0;
  v_invoice_count int := 0;
  v_correction_id uuid := gen_random_uuid();
  v_currency text;
  v_entity_currency text;
  v_payment_reversal jsonb;
  v_sale_reversal jsonb;
  v_payment_reversal_id uuid;
  v_sale_reversal_id uuid;
  v_event jsonb;
  v_event_id text;
  v_gross_cash numeric(18,2) := 0;
  v_gross_card numeric(18,2) := 0;
  v_gross_qr numeric(18,2) := 0;
  v_gross_transfer numeric(18,2) := 0;
  v_gross_total numeric(18,2) := 0;
  v_refund_total numeric(18,2) := 0;
  v_reversal_total numeric(18,2) := 0;
  v_expected_before numeric(18,2) := 0;
  v_source_document text;
  v_source_document_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app, '') is null then raise exception 'applicationId required'; end if;
  if p_cash_session_id is null or p_payment_id is null then raise exception 'cashSessionId and paymentId required'; end if;
  if v_type not in ('REFUND','REVERSAL') then raise exception 'correctionType must be REFUND or REVERSAL'; end if;
  if p_actor_id is null then raise exception 'Authenticated manager required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason, '')), '') is null then raise exception 'Correction reason required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'idempotencyKey required'; end if;

  select upper(pg_catalog.btrim(coalesce(ou.role, sa.role, p_actor_role, '')))
  into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status, 'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active, true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role, '') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Manager or owner role required for POS payment corrections'; end if;

  select * into v_existing
  from public.pos_payment_corrections
  where organization_id = p_organization_id and entity_id = p_entity_id and idempotency_key = pg_catalog.btrim(p_idempotency_key)
  limit 1;
  if found then
    if v_existing.original_payment_id <> p_payment_id or upper(v_existing.correction_type) <> v_type then raise exception 'Idempotency key is already used by a different POS correction'; end if;
    return jsonb_build_object('success', true, 'duplicate', true, 'correction', to_jsonb(v_existing), 'session', (select to_jsonb(s) from public.pos_shifts s where s.id = v_existing.cash_session_id));
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || p_entity_id::text || ':pos-payment-correction:' || p_payment_id::text, 0));

  select * into v_existing
  from public.pos_payment_corrections
  where organization_id = p_organization_id and entity_id = p_entity_id and original_payment_id = p_payment_id and upper(status) = 'POSTED'
  limit 1;
  if found then raise exception 'POS payment is already corrected'; end if;

  select * into v_shift
  from public.pos_shifts
  where id = p_cash_session_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and lower(pg_catalog.btrim(coalesce(application_id, ''))) = v_app
    and upper(coalesce(status, '')) in ('OPEN','ACTIVE')
    and coalesce(locked, false) = false
  for update;
  if not found then raise exception 'Open a POS cash session before refund or reversal'; end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and lower(pg_catalog.btrim(coalesce(application_id, ''))) = v_app
  for update;
  if not found then raise exception 'POS payment not found in selected scope'; end if;
  if upper(coalesce(v_payment.status, '')) not in ('PAID','COMPLETED') then raise exception 'Only settled POS payments can be corrected'; end if;
  if round(coalesce(v_payment.amount, 0)::numeric, 2) <= 0 then raise exception 'POS payment amount must be greater than zero'; end if;
  if upper(pg_catalog.btrim(coalesce(v_payment.payment_method, ''))) <> 'CASH' then raise exception 'Non-cash refunds require provider-confirmed refund or reversal flow'; end if;

  select currency into v_entity_currency
  from public.legal_entities
  where id = p_entity_id and organization_id = p_organization_id and coalesce(is_active, true) = true;
  if not found then raise exception 'Selected legal entity is outside the organization or inactive'; end if;

  v_currency := upper(pg_catalog.btrim(coalesce(v_payment.currency, v_entity_currency, '')));
  if nullif(v_currency, '') is null then raise exception 'POS payment currency is missing'; end if;
  if upper(pg_catalog.btrim(coalesce(v_entity_currency, ''))) <> v_currency then raise exception 'POS payment currency does not match legal entity currency'; end if;

  select
    round(coalesce(sum(case when upper(pg_catalog.btrim(coalesce(payment_method, ''))) = 'CASH' then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(pg_catalog.btrim(coalesce(payment_method, ''))) in ('CARD','CREDIT_CARD') then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(pg_catalog.btrim(coalesce(payment_method, ''))) in ('QR','QR_PAYMENT') then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(pg_catalog.btrim(coalesce(payment_method, ''))) in ('TRANSFER','BANK_TRANSFER') then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(amount), 0)::numeric, 2)
  into v_gross_cash, v_gross_card, v_gross_qr, v_gross_transfer, v_gross_total
  from public.payments
  where organization_id = p_organization_id and entity_id = p_entity_id and lower(pg_catalog.btrim(coalesce(application_id, ''))) = v_app and cash_session_id = p_cash_session_id and upper(coalesce(status, '')) in ('PAID','COMPLETED');

  select
    round(coalesce(sum(case when upper(correction_type) = 'REFUND' then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(correction_type) = 'REVERSAL' then amount else 0 end), 0)::numeric, 2)
  into v_refund_total, v_reversal_total
  from public.pos_payment_corrections
  where organization_id = p_organization_id and entity_id = p_entity_id and application_id = v_app and cash_session_id = p_cash_session_id and upper(status) = 'POSTED';

  v_expected_before := round((coalesce(v_shift.opening_cash, 0) + v_gross_cash - v_refund_total - v_reversal_total)::numeric, 2);
  if v_expected_before + 0.005 < round(v_payment.amount::numeric, 2) then raise exception 'Active cash session does not have enough expected cash for this refund or reversal'; end if;

  if v_payment.journal_entry_id is not null then
    select * into v_payment_journal from public.journal_entries where id = v_payment.journal_entry_id and organization_id = p_organization_id and entity_id = p_entity_id;
    if not found then raise exception 'Original POS payment journal not found in scope'; end if;
  elsif v_app = 'restaurant' then
    select * into v_payment_journal
    from public.journal_entries
    where organization_id = p_organization_id and entity_id = p_entity_id and source_module = 'pos' and source_document_id = p_payment_id
      and source_document in ('POS_CASH_PAYMENT_RECEIVED','POS_CARD_PAYMENT_RECEIVED','POS_QR_PAYMENT_RECEIVED','POS_TRANSFER_PAYMENT_RECEIVED')
      and upper(coalesce(status, '')) = 'POSTED'
    order by created_at desc limit 1;
    if not found then raise exception 'Restaurant POS payment Finance journal is missing'; end if;
  else
    raise exception 'Original POS payment journal is missing';
  end if;

  if upper(coalesce(v_payment_journal.status, '')) <> 'POSTED' then raise exception 'Original POS payment journal is not posted'; end if;

  if v_app = 'restaurant' then
    select array_agg(distinct allocation.order_id), count(distinct allocation.order_id)::int, round(coalesce(sum(allocation.amount), 0)::numeric, 2)
    into v_order_ids, v_order_count, v_allocation_total
    from public.restaurant_payment_allocations allocation
    where allocation.organization_id = p_organization_id and allocation.payment_id = p_payment_id and allocation.allocation_type = 'ORDER' and allocation.order_id is not null;

    if v_order_count <> 1 or coalesce(array_length(v_order_ids, 1), 0) <> 1 then raise exception 'Split or item-level Restaurant payments require a credit-note correction flow'; end if;
    if abs(v_allocation_total - round(v_payment.amount::numeric, 2)) > 0.01 then raise exception 'Partial Restaurant payments require a credit-note correction flow'; end if;

    select * into v_order from public.orders where id = v_order_ids[1] and organization_id = p_organization_id and entity_id = p_entity_id for update;
    if not found then raise exception 'Restaurant source order not found in scope'; end if;
    if abs(round(coalesce(v_order.total_amount, v_order.total, 0)::numeric, 2) - round(v_payment.amount::numeric, 2)) > 0.01 then raise exception 'Only full Restaurant sale corrections are supported'; end if;
    if upper(coalesce(v_order.payment_status, '')) not in ('PAID','COMPLETED') then raise exception 'Restaurant source order is not fully paid'; end if;

    select * into v_sale_journal
    from public.journal_entries
    where organization_id = p_organization_id and entity_id = p_entity_id and source_module = 'pos' and source_document = 'POS_SALE_RECOGNIZED' and source_document_id = v_order.id and upper(coalesce(status, '')) = 'POSTED'
    order by created_at desc limit 1;
    if not found then raise exception 'Restaurant POS sale Finance journal is missing'; end if;
    v_source_document := 'restaurant_order';
    v_source_document_id := v_order.id;
  elsif v_app = 'retail' then
    if lower(coalesce(v_payment.source_document, '')) <> 'sales_order' or v_payment.source_document_id is null then raise exception 'Retail POS payment is not linked to a sales order'; end if;
    select * into v_sales_order from public.sales_orders where id = v_payment.source_document_id and organization_id = p_organization_id and entity_id = p_entity_id for update;
    if not found then raise exception 'Retail source sales order not found in scope'; end if;
    if abs(round(coalesce(v_sales_order.total_amount, 0)::numeric, 2) - round(v_payment.amount::numeric, 2)) > 0.01 then raise exception 'Only full Retail sale corrections are supported'; end if;
    if upper(coalesce(v_sales_order.payment_status, '')) <> 'PAID' then raise exception 'Retail source sales order is not fully paid'; end if;

    select count(*)::int into v_invoice_count
    from public.customer_invoices invoice
    where invoice.organization_id = p_organization_id and invoice.entity_id = p_entity_id and upper(coalesce(invoice.source_document_type, '')) = 'SALES_ORDER' and invoice.source_document_id = v_sales_order.id and invoice.journal_entry_id is not null;
    if v_invoice_count <> 1 then raise exception 'Retail sale must have exactly one posted sales-order invoice before correction'; end if;

    select * into v_invoice
    from public.customer_invoices invoice
    where invoice.organization_id = p_organization_id and invoice.entity_id = p_entity_id and upper(coalesce(invoice.source_document_type, '')) = 'SALES_ORDER' and invoice.source_document_id = v_sales_order.id and invoice.journal_entry_id is not null
    limit 1;
    if abs(round(coalesce(v_invoice.total_amount, 0)::numeric, 2) - round(v_payment.amount::numeric, 2)) > 0.01 then raise exception 'Retail invoice total does not match the full POS payment'; end if;

    select * into v_sale_journal from public.journal_entries where id = v_invoice.journal_entry_id and organization_id = p_organization_id and entity_id = p_entity_id;
    if not found or upper(coalesce(v_sale_journal.status, '')) <> 'POSTED' then raise exception 'Retail sale Finance journal is missing or not posted'; end if;
    v_source_document := 'sales_order';
    v_source_document_id := v_sales_order.id;
  else
    raise exception 'POS payment corrections are not configured for application %', v_app;
  end if;

  v_payment_reversal := public.finance_reverse_posted_journal_atomic(p_organization_id, p_entity_id, v_payment_journal.id, v_correction_id, case when v_type = 'REFUND' then 'POS_TENDER_REFUNDED' else 'POS_TENDER_REVERSED' end, p_actor_id, pg_catalog.btrim(p_reason), 'pos-correction:payment:' || v_correction_id::text);
  v_payment_reversal_id := nullif(v_payment_reversal->>'reversal_journal_id', '')::uuid;
  v_sale_reversal := public.finance_reverse_posted_journal_atomic(p_organization_id, p_entity_id, v_sale_journal.id, v_correction_id, case when v_type = 'REFUND' then 'POS_SALE_REFUNDED' else 'POS_SALE_REVERSED' end, p_actor_id, pg_catalog.btrim(p_reason), 'pos-correction:sale:' || v_correction_id::text);
  v_sale_reversal_id := nullif(v_sale_reversal->>'reversal_journal_id', '')::uuid;
  if v_payment_reversal_id is null or v_sale_reversal_id is null then raise exception 'POS correction did not produce both Finance reversal journals'; end if;

  insert into public.pos_payment_corrections (
    id, organization_id, entity_id, application_id, cash_session_id, original_cash_session_id, original_payment_id, correction_type, amount,
    currency_code, payment_method, reason, original_payment_journal_id, payment_reversal_journal_id, original_sale_journal_id, sale_reversal_journal_id,
    source_document, source_document_id, status, created_by, idempotency_key, metadata
  ) values (
    v_correction_id, p_organization_id, p_entity_id, v_app, p_cash_session_id, v_payment.cash_session_id, p_payment_id, v_type, round(v_payment.amount::numeric, 2),
    v_currency, 'CASH', pg_catalog.btrim(p_reason), v_payment_journal.id, v_payment_reversal_id, v_sale_journal.id, v_sale_reversal_id,
    v_source_document, v_source_document_id, 'POSTED', p_actor_id, pg_catalog.btrim(p_idempotency_key),
    jsonb_build_object('original_payment_reference', v_payment.payment_reference, 'original_document_number', v_payment.document_number, 'actor_role', v_role)
  ) returning * into v_existing;

  select
    round(coalesce(sum(case when upper(correction_type) = 'REFUND' then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(correction_type) = 'REVERSAL' then amount else 0 end), 0)::numeric, 2)
  into v_refund_total, v_reversal_total
  from public.pos_payment_corrections
  where organization_id = p_organization_id and entity_id = p_entity_id and application_id = v_app and cash_session_id = p_cash_session_id and upper(status) = 'POSTED';

  update public.pos_shifts
  set cash_total = v_gross_cash,
      card_total = v_gross_card,
      qr_total = v_gross_qr,
      transfer_total = v_gross_transfer,
      refund_total = v_refund_total,
      reversal_total = v_reversal_total,
      net_sales = round((v_gross_total - v_refund_total - v_reversal_total)::numeric, 2),
      expected_cash = round((coalesce(opening_cash, 0) + v_gross_cash - v_refund_total - v_reversal_total)::numeric, 2),
      updated_at = now()
  where id = p_cash_session_id
  returning * into v_shift;

  v_event := public.record_system_event_atomic(
    p_organization_id,
    case when v_type = 'REFUND' then 'POS_SALE_REFUNDED' else 'POS_SALE_REVERSED' end,
    jsonb_build_object(
      'organization_id', p_organization_id, 'entity_id', p_entity_id, 'application_id', v_app,
      'correction_id', v_correction_id, 'correction_type', v_type, 'cash_session_id', p_cash_session_id,
      'original_cash_session_id', v_payment.cash_session_id, 'payment_id', p_payment_id,
      'source_document', v_source_document, 'source_document_id', v_source_document_id,
      'amount', round(v_payment.amount::numeric, 2), 'currency_code', v_currency,
      'payment_reversal_journal_id', v_payment_reversal_id, 'sale_reversal_journal_id', v_sale_reversal_id,
      'reason', pg_catalog.btrim(p_reason), 'actor_id', p_actor_id
    ),
    'pos-correction:' || v_correction_id::text
  );
  v_event_id := v_event->'event'->>'id';

  return jsonb_build_object('success', true, 'duplicate', false, 'correction', to_jsonb(v_existing), 'session', to_jsonb(v_shift), 'event_id', v_event_id);
end;
$$;

revoke all on function public.pos_correct_payment_atomic(uuid,uuid,text,uuid,uuid,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.pos_correct_payment_atomic(uuid,uuid,text,uuid,uuid,text,uuid,text,text,text) to service_role;

create or replace function public.pos_close_cash_session_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_session_id uuid,
  p_closing_cash numeric,
  p_closed_by uuid,
  p_closed_by_name text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id text := lower(trim(coalesce(p_application_id, '')));
  v_closing_cash numeric(18,2) := round(coalesce(p_closing_cash, 0)::numeric, 2);
  v_cash_total numeric(18,2) := 0;
  v_card_total numeric(18,2) := 0;
  v_qr_total numeric(18,2) := 0;
  v_transfer_total numeric(18,2) := 0;
  v_gross_total numeric(18,2) := 0;
  v_refund_total numeric(18,2) := 0;
  v_reversal_total numeric(18,2) := 0;
  v_net_sales numeric(18,2) := 0;
  v_expected_cash numeric(18,2) := 0;
  v_variance numeric(18,2) := 0;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(v_application_id, '') is null then raise exception 'applicationId required'; end if;
  if p_session_id is null then raise exception 'sessionId required'; end if;
  if p_closed_by is null then raise exception 'Authenticated operator required'; end if;
  if v_closing_cash < 0 then raise exception 'Closing cash cannot be negative'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_entity_id::text || ':' || v_application_id || ':pos-cash-session', 0));
  select * into v_shift from public.pos_shifts where id = p_session_id and organization_id = p_organization_id and entity_id = p_entity_id and application_id = v_application_id for update;
  if not found then raise exception 'POS cash session not found in selected scope'; end if;
  if upper(coalesce(v_shift.status, '')) = 'CLOSED' then return jsonb_build_object('success', true, 'duplicate', true, 'session', to_jsonb(v_shift)); end if;
  if upper(coalesce(v_shift.status, '')) not in ('OPEN','ACTIVE') or coalesce(v_shift.locked, false) then raise exception 'POS cash session is not active'; end if;

  select
    round(coalesce(sum(case when upper(trim(coalesce(payment_method, ''))) = 'CASH' then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method, ''))) in ('CARD','CREDIT_CARD') then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method, ''))) in ('QR','QR_PAYMENT') then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method, ''))) in ('TRANSFER','BANK_TRANSFER') then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(amount), 0)::numeric, 2)
  into v_cash_total, v_card_total, v_qr_total, v_transfer_total, v_gross_total
  from public.payments
  where organization_id = p_organization_id and entity_id = p_entity_id and application_id = v_application_id and cash_session_id = p_session_id and upper(coalesce(status, '')) in ('PAID','COMPLETED');

  select
    round(coalesce(sum(case when upper(correction_type) = 'REFUND' then amount else 0 end), 0)::numeric, 2),
    round(coalesce(sum(case when upper(correction_type) = 'REVERSAL' then amount else 0 end), 0)::numeric, 2)
  into v_refund_total, v_reversal_total
  from public.pos_payment_corrections
  where organization_id = p_organization_id and entity_id = p_entity_id and application_id = v_application_id and cash_session_id = p_session_id and upper(status) = 'POSTED';

  v_net_sales := round((v_gross_total - v_refund_total - v_reversal_total)::numeric, 2);
  v_expected_cash := round((coalesce(v_shift.opening_cash, 0) + v_cash_total - v_refund_total - v_reversal_total)::numeric, 2);
  v_variance := round((v_closing_cash - v_expected_cash)::numeric, 2);

  update public.pos_shifts
  set cash_total = v_cash_total, card_total = v_card_total, qr_total = v_qr_total, transfer_total = v_transfer_total,
      refund_total = v_refund_total, reversal_total = v_reversal_total, net_sales = v_net_sales, expected_cash = v_expected_cash,
      closing_cash = v_closing_cash, variance = v_variance, status = 'CLOSED', closed_at = now(), reconciled_at = now(),
      closed_by = p_closed_by, closed_by_name = nullif(trim(coalesce(p_closed_by_name, '')), ''),
      reconciliation_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), reconciliation_notes), locked = true, updated_at = now()
  where id = p_session_id
  returning * into v_shift;

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'session', to_jsonb(v_shift),
    'reconciliation', jsonb_build_object(
      'opening_cash', coalesce(v_shift.opening_cash, 0), 'cash_total', v_cash_total, 'card_total', v_card_total,
      'qr_total', v_qr_total, 'transfer_total', v_transfer_total, 'refund_total', v_refund_total,
      'reversal_total', v_reversal_total, 'net_sales', v_net_sales, 'expected_cash', v_expected_cash,
      'closing_cash', v_closing_cash, 'variance', v_variance
    )
  );
end;
$$;

revoke all on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text) from public, anon, authenticated;
grant execute on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text) to service_role;

create or replace function public.pos_confirm_cash_session_accounting_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_session_id uuid,
  p_actor_staff_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := lower(trim(coalesce(p_application_id, '')));
  v_role text;
  v_finance_role text;
  v_gross_total numeric(18,2) := 0;
  v_correction_total numeric(18,2) := 0;
  v_missing_payments int := 0;
  v_missing_sales int := 0;
  v_missing_corrections int := 0;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app, '') is null or p_session_id is null then raise exception 'applicationId and sessionId required'; end if;
  if p_actor_staff_id is null or p_actor_user_id is null then raise exception 'Authenticated Finance actor required'; end if;

  select upper(trim(coalesce(ou.role, sa.role, p_actor_role, ''))) into v_role
  from public.staff_accounts sa
  left join public.organization_users ou on ou.staff_account_id=sa.id and ou.organization_id=p_organization_id and lower(coalesce(ou.status,'active'))='active'
  where sa.id=p_actor_staff_id and coalesce(sa.active,true)=true and (sa.auth_user_id is null or sa.auth_user_id=p_actor_user_id)
    and (sa.active_organization_id=p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last limit 1;

  if coalesce(v_role,'') in ('OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then
    v_finance_role := v_role;
  else
    select fr.role_code into v_finance_role
    from public.user_finance_roles ufr
    join public.finance_roles fr on fr.id=ufr.role_id and fr.organization_id=ufr.organization_id and coalesce(fr.is_active,true)=true
    join public.finance_permissions fp on fp.organization_id=ufr.organization_id and fp.role_id=ufr.role_id and fp.permission_key='finance.close.execute'
    where ufr.organization_id=p_organization_id and ufr.user_id=p_actor_user_id order by ufr.assigned_at desc limit 1;
    if v_finance_role is null then raise exception 'Permission denied: finance.close.execute'; end if;
  end if;

  select * into v_shift from public.pos_shifts
  where id=p_session_id and organization_id=p_organization_id and entity_id=p_entity_id and lower(trim(coalesce(application_id,'')))=v_app
  for update;
  if not found then raise exception 'POS cash session not found in selected scope'; end if;
  if upper(coalesce(v_shift.accounting_status,'PENDING'))='CONFIRMED' and coalesce(v_shift.period_closed,false) then return jsonb_build_object('success',true,'duplicate',true,'session',to_jsonb(v_shift)); end if;
  if upper(coalesce(v_shift.status,''))<>'CLOSED' or v_shift.reconciled_at is null or coalesce(v_shift.locked,false)=false then raise exception 'POS cash session must be reconciled and closed before accounting confirmation'; end if;
  if upper(coalesce(v_shift.approval_status,'PENDING'))<>'APPROVED' then raise exception 'Manager approval is required before accounting confirmation'; end if;
  if upper(coalesce(v_shift.accounting_status,'PENDING'))='BLOCKED' then raise exception 'POS cash session is blocked from accounting confirmation'; end if;

  select round(coalesce(sum(p.amount),0)::numeric,2) into v_gross_total
  from public.payments p
  where p.organization_id=p_organization_id and p.entity_id=p_entity_id and lower(trim(coalesce(p.application_id,'')))=v_app
    and p.cash_session_id=p_session_id and upper(coalesce(p.status,'')) in ('PAID','COMPLETED');

  select round(coalesce(sum(c.amount),0)::numeric,2) into v_correction_total
  from public.pos_payment_corrections c
  where c.organization_id=p_organization_id and c.entity_id=p_entity_id and c.application_id=v_app and c.cash_session_id=p_session_id and upper(c.status)='POSTED';

  if abs(round((v_gross_total-v_correction_total)::numeric,2)-round(coalesce(v_shift.net_sales,0)::numeric,2))>0.01 then raise exception 'POS cash-session gross payments less corrections no longer match reconciled net sales'; end if;
  if abs(v_correction_total-round((coalesce(v_shift.refund_total,0)+coalesce(v_shift.reversal_total,0))::numeric,2))>0.01 then raise exception 'POS cash-session correction totals no longer match the reconciled drawer'; end if;

  if v_app='restaurant' then
    select count(*)::int into v_missing_payments
    from public.payments p
    where p.organization_id=p_organization_id and p.entity_id=p_entity_id and lower(trim(coalesce(p.application_id,'')))=v_app and p.cash_session_id=p_session_id
      and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
      and not exists (
        select 1 from public.journal_entries j
        where j.organization_id=p_organization_id and j.entity_id=p_entity_id and j.source_module='pos' and j.source_document_id=p.id
          and j.source_document in ('POS_CASH_PAYMENT_RECEIVED','POS_CARD_PAYMENT_RECEIVED','POS_QR_PAYMENT_RECEIVED','POS_TRANSFER_PAYMENT_RECEIVED')
          and upper(coalesce(j.status,''))='POSTED'
      );
    if v_missing_payments>0 then raise exception 'Restaurant POS payment Finance posting is incomplete for % payment(s)',v_missing_payments; end if;

    select count(*)::int into v_missing_sales
    from (
      select distinct a.order_id
      from public.restaurant_payment_allocations a
      join public.payments p on p.id=a.payment_id and p.organization_id=a.organization_id
      where p.organization_id=p_organization_id and p.entity_id=p_entity_id and lower(trim(coalesce(p.application_id,'')))=v_app
        and p.cash_session_id=p_session_id and upper(coalesce(p.status,'')) in ('PAID','COMPLETED') and a.order_id is not null
    ) o
    where not exists (
      select 1 from public.journal_entries j
      where j.organization_id=p_organization_id and j.entity_id=p_entity_id and j.source_module='pos' and j.source_document='POS_SALE_RECOGNIZED'
        and j.source_document_id=o.order_id and upper(coalesce(j.status,''))='POSTED'
    );
    if v_missing_sales>0 then raise exception 'Restaurant POS sale Finance posting is incomplete for % order(s)',v_missing_sales; end if;
  elsif v_app='retail' then
    select count(*)::int into v_missing_payments
    from public.payments p
    where p.organization_id=p_organization_id and p.entity_id=p_entity_id and lower(trim(coalesce(p.application_id,'')))=v_app and p.cash_session_id=p_session_id
      and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
      and (p.journal_entry_id is null or not exists (
        select 1 from public.journal_entries j
        where j.id=p.journal_entry_id and j.organization_id=p_organization_id and j.entity_id=p_entity_id and j.source_module='commercial'
          and j.source_document='PAYMENT_RECEIVED' and j.source_document_id=p.id and upper(coalesce(j.status,''))='POSTED'
      ));
    if v_missing_payments>0 then raise exception 'Retail POS payment Finance posting is incomplete for % payment(s)',v_missing_payments; end if;
  else
    raise exception 'Accounting confirmation proof is not configured for POS application %',v_app;
  end if;

  select count(*)::int into v_missing_corrections
  from public.pos_payment_corrections c
  where c.organization_id=p_organization_id and c.entity_id=p_entity_id and c.application_id=v_app and c.cash_session_id=p_session_id and upper(c.status)='POSTED'
    and (
      not exists (select 1 from public.journal_entries j where j.id=c.payment_reversal_journal_id and j.organization_id=p_organization_id and j.entity_id=p_entity_id and upper(coalesce(j.status,''))='POSTED')
      or not exists (select 1 from public.journal_entries j where j.id=c.sale_reversal_journal_id and j.organization_id=p_organization_id and j.entity_id=p_entity_id and upper(coalesce(j.status,''))='POSTED')
      or not exists (select 1 from public.journal_entries j where j.id=c.original_payment_journal_id and j.organization_id=p_organization_id and j.entity_id=p_entity_id and coalesce(j.reversed,false)=true and j.reversal_journal_id=c.payment_reversal_journal_id)
      or not exists (select 1 from public.journal_entries j where j.id=c.original_sale_journal_id and j.organization_id=p_organization_id and j.entity_id=p_entity_id and coalesce(j.reversed,false)=true and j.reversal_journal_id=c.sale_reversal_journal_id)
    );
  if v_missing_corrections>0 then raise exception 'POS correction Finance posting is incomplete for % correction(s)',v_missing_corrections; end if;

  update public.pos_shifts
  set accounting_status='CONFIRMED', accounting_confirmed_by=p_actor_staff_id, accounting_confirmed_at=now(),
      accounting_notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),accounting_notes), period_closed=true, updated_at=now()
  where id=p_session_id returning * into v_shift;

  insert into public.approval_logs(organization_id,entity_type,entity_id,from_status,to_status,acted_by,role,notes,created_at)
  values (p_organization_id,'pos_cash_session_accounting',p_session_id,'PENDING','CONFIRMED',p_actor_staff_id,v_finance_role,nullif(trim(coalesce(p_notes,'')),''),now());

  return jsonb_build_object(
    'success',true,'duplicate',false,
    'posting_evidence',jsonb_build_object(
      'application_id',v_app,'gross_settled_total',v_gross_total,'correction_total',v_correction_total,
      'net_settled_total',round((v_gross_total-v_correction_total)::numeric,2),
      'missing_payment_journals',v_missing_payments,'missing_sale_journals',v_missing_sales,'missing_correction_journals',v_missing_corrections
    ),
    'session',to_jsonb(v_shift)
  );
end;
$$;

revoke all on function public.pos_confirm_cash_session_accounting_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.pos_confirm_cash_session_accounting_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text) to service_role;

commit;
