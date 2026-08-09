alter table public.sales_orders
  add column if not exists credited_amount numeric not null default 0;

alter table public.sales_orders
  drop constraint if exists sales_orders_credited_amount_nonnegative;

alter table public.sales_orders
  add constraint sales_orders_credited_amount_nonnegative
  check (credited_amount >= 0);

create table if not exists public.finance_customer_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  party_id uuid not null,
  credit_note_invoice_id uuid not null,
  source_invoice_id uuid not null,
  original_amount numeric not null check (original_amount > 0),
  available_amount numeric not null check (available_amount >= 0),
  applied_amount numeric not null default 0 check (applied_amount >= 0),
  refunded_amount numeric not null default 0 check (refunded_amount >= 0),
  currency_code text not null,
  exchange_rate numeric not null default 1 check (exchange_rate > 0),
  status text not null default 'OPEN' check (status in ('OPEN','PARTIALLY_USED','USED','REFUNDED')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_customer_credits_scope_party_fkey
    foreign key (organization_id, party_id)
    references public.parties(organization_id, id)
    on delete restrict,
  constraint finance_customer_credits_credit_note_fkey
    foreign key (credit_note_invoice_id)
    references public.customer_invoices(id)
    on delete restrict,
  constraint finance_customer_credits_source_invoice_fkey
    foreign key (source_invoice_id)
    references public.customer_invoices(id)
    on delete restrict,
  constraint finance_customer_credits_note_unique
    unique (organization_id, entity_id, credit_note_invoice_id),
  constraint finance_customer_credits_amount_integrity
    check (round(original_amount,2) = round(available_amount + applied_amount + refunded_amount,2))
);

create index if not exists finance_customer_credits_scope_party_idx
  on public.finance_customer_credits(organization_id, entity_id, party_id, status);
create index if not exists finance_customer_credits_source_invoice_idx
  on public.finance_customer_credits(organization_id, entity_id, source_invoice_id);

create table if not exists public.finance_customer_credit_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  party_id uuid not null,
  customer_credit_id uuid not null,
  target_invoice_id uuid not null,
  amount numeric not null check (amount > 0),
  balance_before numeric not null,
  balance_after numeric not null,
  applied_by uuid,
  idempotency_key text not null,
  applied_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  constraint finance_customer_credit_applications_scope_party_fkey
    foreign key (organization_id, party_id)
    references public.parties(organization_id, id)
    on delete restrict,
  constraint finance_customer_credit_applications_credit_fkey
    foreign key (customer_credit_id)
    references public.finance_customer_credits(id)
    on delete restrict,
  constraint finance_customer_credit_applications_invoice_fkey
    foreign key (target_invoice_id)
    references public.customer_invoices(id)
    on delete restrict,
  constraint finance_customer_credit_applications_idempotency_unique
    unique (organization_id, entity_id, idempotency_key)
);

create index if not exists finance_customer_credit_applications_invoice_idx
  on public.finance_customer_credit_applications(organization_id, entity_id, target_invoice_id)
  where reversed_at is null;
create index if not exists finance_customer_credit_applications_credit_idx
  on public.finance_customer_credit_applications(organization_id, entity_id, customer_credit_id)
  where reversed_at is null;

create table if not exists public.finance_customer_credit_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  party_id uuid not null,
  customer_credit_id uuid not null,
  bank_account_id uuid not null,
  amount numeric not null check (amount > 0),
  currency_code text not null,
  exchange_rate numeric not null default 1 check (exchange_rate > 0),
  journal_entry_id uuid,
  bank_ledger_id uuid,
  reference_number text,
  refunded_by uuid,
  idempotency_key text not null,
  refunded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint finance_customer_credit_refunds_scope_party_fkey
    foreign key (organization_id, party_id)
    references public.parties(organization_id, id)
    on delete restrict,
  constraint finance_customer_credit_refunds_credit_fkey
    foreign key (customer_credit_id)
    references public.finance_customer_credits(id)
    on delete restrict,
  constraint finance_customer_credit_refunds_bank_fkey
    foreign key (bank_account_id)
    references public.bank_accounts(id)
    on delete restrict,
  constraint finance_customer_credit_refunds_journal_fkey
    foreign key (journal_entry_id)
    references public.journal_entries(id)
    on delete restrict,
  constraint finance_customer_credit_refunds_ledger_fkey
    foreign key (bank_ledger_id)
    references public.bank_ledger(id)
    on delete restrict,
  constraint finance_customer_credit_refunds_idempotency_unique
    unique (organization_id, entity_id, idempotency_key)
);

create index if not exists finance_customer_credit_refunds_credit_idx
  on public.finance_customer_credit_refunds(organization_id, entity_id, customer_credit_id);

alter table public.finance_customer_credits enable row level security;
alter table public.finance_customer_credit_applications enable row level security;
alter table public.finance_customer_credit_refunds enable row level security;

revoke all on table public.finance_customer_credits from anon, authenticated;
revoke all on table public.finance_customer_credit_applications from anon, authenticated;
revoke all on table public.finance_customer_credit_refunds from anon, authenticated;

grant all on table public.finance_customer_credits to service_role;
grant all on table public.finance_customer_credit_applications to service_role;
grant all on table public.finance_customer_credit_refunds to service_role;

create or replace function public.commercial_reconcile_sales_order_payment_from_invoice(
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_invoice_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_order public.sales_orders%rowtype;
  v_cash_paid numeric := 0;
  v_credited numeric := 0;
  v_settled numeric := 0;
  v_remaining numeric := 0;
  v_status text := 'UNPAID';
begin
  select * into v_invoice
  from public.customer_invoices
  where id = p_customer_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Customer invoice not found for reconciliation';
  end if;

  if upper(coalesce(v_invoice.source_document_type, '')) <> 'SALES_ORDER'
     or v_invoice.source_document_id is null then
    return jsonb_build_object(
      'reconciled', false,
      'reason', 'invoice_not_sourced_from_sales_order',
      'customer_invoice_id', p_customer_invoice_id
    );
  end if;

  select * into v_order
  from public.sales_orders
  where id = v_invoice.source_document_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Source Sales Order not found in invoice scope';
  end if;

  if v_order.party_id is not null
     and v_invoice.party_id is distinct from v_order.party_id then
    raise exception 'Sales Order and invoice party mismatch';
  end if;

  select coalesce(sum(a.allocated_amount),0)
  into v_cash_paid
  from public.finance_customer_payment_allocations a
  join public.customer_payments p
    on p.id = a.customer_payment_id
   and p.organization_id = a.organization_id
   and p.entity_id = a.entity_id
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.customer_invoice_id = p_customer_invoice_id
    and a.reversed_at is null
    and upper(coalesce(p.status,'')) not in ('REVERSED','REFUNDED');

  select coalesce(sum(a.amount),0)
  into v_credited
  from public.finance_customer_credit_applications a
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.target_invoice_id = p_customer_invoice_id
    and a.reversed_at is null;

  v_cash_paid := greatest(0, least(coalesce(v_order.total_amount,0), v_cash_paid));
  v_credited := greatest(0, least(greatest(coalesce(v_order.total_amount,0)-v_cash_paid,0), v_credited));
  v_settled := least(coalesce(v_order.total_amount,0), v_cash_paid + v_credited);
  v_remaining := greatest(coalesce(v_order.total_amount,0) - v_settled, 0);

  v_status := case
    when abs(v_remaining) <= 0.005 then 'PAID'
    when v_settled > 0 then 'PARTIALLY_PAID'
    else 'UNPAID'
  end;

  update public.sales_orders
  set paid_amount = round(v_cash_paid,2),
      credited_amount = round(v_credited,2),
      remaining_balance = round(v_remaining,2),
      payment_status = v_status,
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  return jsonb_build_object(
    'reconciled', true,
    'sales_order_id', v_order.id,
    'customer_invoice_id', p_customer_invoice_id,
    'paid_amount', round(v_cash_paid,2),
    'credited_amount', round(v_credited,2),
    'remaining_balance', round(v_remaining,2),
    'payment_status', v_status
  );
end;
$$;

create or replace function public.finance_issue_customer_credit_note_idempotent(
  p_credit_note_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_source_invoice_id uuid,
  p_credit_date date,
  p_amount numeric,
  p_reason text,
  p_created_by uuid,
  p_idempotency_key text,
  p_prefix text default 'CN'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.customer_invoices%rowtype;
  v_ar public.accounts_receivable%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_prior_credit numeric := 0;
  v_direct_apply numeric := 0;
  v_available numeric := 0;
  v_before numeric := 0;
  v_after numeric := 0;
  v_ratio numeric;
  v_note_number text;
  v_journal_lines jsonb;
  v_journal jsonb;
  v_journal_id uuid;
  v_credit public.finance_customer_credits%rowtype;
  v_result jsonb;
begin
  if p_credit_note_id is null then raise exception 'credit_note_id required'; end if;
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_party_id is null then raise exception 'party_id required'; end if;
  if p_source_invoice_id is null then raise exception 'source_invoice_id required'; end if;
  if p_credit_date is null then raise exception 'credit_date required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'credit amount must be greater than zero'; end if;
  if p_created_by is null then raise exception 'created_by required'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws('|',p_source_invoice_id::text,p_party_id::text,p_credit_date::text,p_amount::text,coalesce(btrim(p_reason),''),coalesce(btrim(p_prefix),'CN')));
  v_existing := public.finance_claim_idempotency(p_organization_id,p_entity_id,'CUSTOMER_CREDIT_NOTE',btrim(p_idempotency_key),v_request_hash,p_credit_note_id);
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||p_entity_id::text||':customer-credit:'||p_party_id::text,0));

  select * into v_source
  from public.customer_invoices
  where id=p_source_invoice_id
    and organization_id=p_organization_id
    and entity_id=p_entity_id
    and party_id=p_party_id
    and upper(coalesce(document_type,'INVOICE'))='INVOICE'
  for update;
  if not found then raise exception 'Source customer invoice not found in scope'; end if;
  if v_source.journal_entry_id is null then raise exception 'Source invoice is not posted'; end if;
  if p_amount > coalesce(v_source.total_amount,0)+0.005 then raise exception 'Credit amount exceeds source invoice total'; end if;

  select coalesce(sum(total_amount),0) into v_prior_credit
  from public.customer_invoices
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and party_id=p_party_id
    and document_type='CREDIT_NOTE'
    and credit_note_for_invoice_id=p_source_invoice_id
    and upper(coalesce(status,'')) not in ('CANCELLED','VOID');

  if v_prior_credit + p_amount > coalesce(v_source.total_amount,0)+0.005 then
    raise exception 'Credit amount exceeds remaining creditable invoice amount';
  end if;

  select * into v_ar
  from public.accounts_receivable
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and party_id=p_party_id
    and customer_invoice_id=p_source_invoice_id
  for update;
  if not found then raise exception 'Accounts receivable entry not found for source invoice'; end if;

  v_before := greatest(coalesce(v_ar.outstanding_balance,v_ar.amount,0),0);
  v_direct_apply := least(p_amount,v_before);
  v_after := greatest(v_before-v_direct_apply,0);
  v_available := greatest(p_amount-v_direct_apply,0);
  v_ratio := p_amount / nullif(v_source.total_amount,0);

  select jsonb_agg(jsonb_build_object(
    'account_id',jel.account_id,
    'debit',round(coalesce(jel.credit,0)*v_ratio,6),
    'credit',round(coalesce(jel.debit,0)*v_ratio,6),
    'department_id',jel.department_id,
    'cost_center_id',jel.cost_center_id,
    'party_id',p_party_id,
    'project_id',jel.project_id,
    'description','Credit note for '||v_source.invoice_number
  ) order by jel.line_number)
  into v_journal_lines
  from public.journal_entry_lines jel
  where jel.journal_entry_id=v_source.journal_entry_id;

  if v_journal_lines is null or jsonb_array_length(v_journal_lines)<2 then
    raise exception 'Source invoice journal lines unavailable for credit note reversal';
  end if;

  v_note_number := public.next_finance_document_number(p_organization_id,p_entity_id,'CREDIT_NOTE',coalesce(nullif(btrim(p_prefix),''),'CN'),p_credit_date);

  insert into public.customer_invoices(
    id,organization_id,entity_id,customer_id,party_id,invoice_number,invoice_date,due_date,
    subtotal,tax_amount,total_amount,outstanding_balance,outstanding_amount,status,notes,
    currency_code,exchange_rate,document_type,source_document_type,source_document_id,
    posted_at,credited_at,credit_note_for_invoice_id,created_by,created_at,updated_at
  ) values (
    p_credit_note_id,p_organization_id,p_entity_id,p_party_id,p_party_id,v_note_number,p_credit_date,p_credit_date,
    p_amount,0,p_amount,0,0,'POSTED',nullif(btrim(p_reason),''),
    upper(coalesce(v_source.currency_code,'THB')),coalesce(v_source.exchange_rate,1),'CREDIT_NOTE','CUSTOMER_INVOICE',p_source_invoice_id,
    now(),now(),p_source_invoice_id,p_created_by,now(),now()
  );

  insert into public.customer_invoice_lines(
    organization_id,entity_id,customer_invoice_id,description,quantity,unit_price,line_total,net_amount,gross_amount,tax_amount
  ) values (
    p_organization_id,p_entity_id,p_credit_note_id,
    'Credit note for '||v_source.invoice_number,1,p_amount,p_amount,p_amount,p_amount,0
  );

  select public.finance_post_journal_atomic(
    p_organization_id=>p_organization_id,
    p_entity_id=>p_entity_id,
    p_posting_date=>p_credit_date,
    p_document_date=>p_credit_date,
    p_journal_type=>'SYSTEM',
    p_reference=>'accounts_receivable:'||p_credit_note_id::text,
    p_source_module=>'accounts_receivable',
    p_source_document=>'CUSTOMER_CREDIT_NOTE_POSTED',
    p_source_document_id=>p_credit_note_id,
    p_description=>'Customer Credit Note '||v_note_number,
    p_currency_code=>upper(coalesce(v_source.currency_code,'THB')),
    p_exchange_rate=>coalesce(v_source.exchange_rate,1),
    p_lines=>v_journal_lines,
    p_created_by=>p_created_by,
    p_idempotency_key=>'accounting-event:CUSTOMER_CREDIT_NOTE:'||p_credit_note_id::text
  ) into v_journal;

  v_journal_id := nullif(v_journal->'journal'->>'id','')::uuid;
  if v_journal_id is null then raise exception 'Credit note posting did not return journal entry'; end if;

  update public.customer_invoices
  set journal_entry_id=v_journal_id,updated_at=now()
  where id=p_credit_note_id and organization_id=p_organization_id and entity_id=p_entity_id;

  insert into public.finance_customer_credits(
    id,organization_id,entity_id,party_id,credit_note_invoice_id,source_invoice_id,
    original_amount,available_amount,applied_amount,refunded_amount,currency_code,exchange_rate,status,created_by
  ) values (
    gen_random_uuid(),p_organization_id,p_entity_id,p_party_id,p_credit_note_id,p_source_invoice_id,
    p_amount,v_available,v_direct_apply,0,upper(coalesce(v_source.currency_code,'THB')),coalesce(v_source.exchange_rate,1),
    case when v_available<=0.005 then 'USED' when v_direct_apply>0 then 'PARTIALLY_USED' else 'OPEN' end,p_created_by
  ) returning * into v_credit;

  if v_direct_apply>0.005 then
    insert into public.finance_customer_credit_applications(
      organization_id,entity_id,party_id,customer_credit_id,target_invoice_id,amount,balance_before,balance_after,applied_by,idempotency_key,metadata
    ) values (
      p_organization_id,p_entity_id,p_party_id,v_credit.id,p_source_invoice_id,v_direct_apply,v_before,v_after,p_created_by,
      btrim(p_idempotency_key)||':source-apply',jsonb_build_object('kind','credit_note_source_application','credit_note_invoice_id',p_credit_note_id)
    );

    update public.accounts_receivable
    set outstanding_balance=v_after,status=case when v_after<=0.005 then 'PAID' else 'PARTIAL' end,updated_at=now()
    where id=v_ar.id;

    update public.customer_invoices
    set outstanding_balance=v_after,outstanding_amount=v_after,
        status=case when v_after<=0.005 then 'PAID' else 'PARTIAL' end,
        credited_at=now(),updated_at=now()
    where id=p_source_invoice_id and organization_id=p_organization_id and entity_id=p_entity_id;
  end if;

  v_result := jsonb_build_object(
    'success',true,
    'credit_note_id',p_credit_note_id,
    'credit_note_number',v_note_number,
    'customer_credit_id',v_credit.id,
    'source_invoice_id',p_source_invoice_id,
    'credit_amount',p_amount,
    'applied_to_source_invoice',v_direct_apply,
    'available_credit',v_available,
    'journal_entry_id',v_journal_id,
    'sales_order_reconciliation',public.commercial_reconcile_sales_order_payment_from_invoice(p_organization_id,p_entity_id,p_source_invoice_id)
  );

  perform public.finance_complete_idempotency(p_organization_id,p_entity_id,'CUSTOMER_CREDIT_NOTE',btrim(p_idempotency_key),v_result);
  return v_result;
end;
$$;

create or replace function public.finance_apply_customer_credit_idempotent(
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_customer_credit_id uuid,
  p_target_invoice_id uuid,
  p_amount numeric,
  p_applied_by uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.finance_customer_credits%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_ar public.accounts_receivable%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_before numeric;
  v_after numeric;
  v_credit_after numeric;
  v_result jsonb;
begin
  if p_customer_credit_id is null or p_target_invoice_id is null then raise exception 'customer_credit_id and target_invoice_id required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'amount must be greater than zero'; end if;
  if p_applied_by is null then raise exception 'applied_by required'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws('|',p_customer_credit_id::text,p_target_invoice_id::text,p_amount::text,p_party_id::text));
  v_existing := public.finance_claim_idempotency(p_organization_id,p_entity_id,'CUSTOMER_CREDIT_APPLY',btrim(p_idempotency_key),v_request_hash,p_customer_credit_id);
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||p_entity_id::text||':customer-credit:'||p_party_id::text,0));

  select * into v_credit
  from public.finance_customer_credits
  where id=p_customer_credit_id and organization_id=p_organization_id and entity_id=p_entity_id and party_id=p_party_id
  for update;
  if not found then raise exception 'Customer credit not found in scope'; end if;
  if v_credit.available_amount < p_amount-0.005 then raise exception 'Customer credit amount exceeds available balance'; end if;

  select * into v_invoice
  from public.customer_invoices
  where id=p_target_invoice_id and organization_id=p_organization_id and entity_id=p_entity_id and party_id=p_party_id
    and upper(coalesce(document_type,'INVOICE'))='INVOICE'
  for update;
  if not found then raise exception 'Target customer invoice not found in scope'; end if;
  if upper(coalesce(v_invoice.currency_code,'')) <> upper(coalesce(v_credit.currency_code,'')) then raise exception 'Customer credit currency does not match target invoice'; end if;

  select * into v_ar
  from public.accounts_receivable
  where organization_id=p_organization_id and entity_id=p_entity_id and party_id=p_party_id and customer_invoice_id=p_target_invoice_id
  for update;
  if not found then raise exception 'Accounts receivable entry not found for target invoice'; end if;

  v_before := greatest(coalesce(v_ar.outstanding_balance,v_ar.amount,0),0);
  if p_amount > v_before+0.005 then raise exception 'Customer credit application exceeds target invoice outstanding balance'; end if;
  v_after := greatest(v_before-p_amount,0);
  v_credit_after := greatest(v_credit.available_amount-p_amount,0);

  insert into public.finance_customer_credit_applications(
    organization_id,entity_id,party_id,customer_credit_id,target_invoice_id,amount,balance_before,balance_after,applied_by,idempotency_key,metadata
  ) values (
    p_organization_id,p_entity_id,p_party_id,p_customer_credit_id,p_target_invoice_id,p_amount,v_before,v_after,p_applied_by,btrim(p_idempotency_key),jsonb_build_object('kind','customer_credit_application')
  );

  update public.finance_customer_credits
  set available_amount=v_credit_after,
      applied_amount=applied_amount+p_amount,
      status=case when v_credit_after<=0.005 then 'USED' else 'PARTIALLY_USED' end,
      updated_at=now()
  where id=p_customer_credit_id and organization_id=p_organization_id and entity_id=p_entity_id;

  update public.accounts_receivable
  set outstanding_balance=v_after,status=case when v_after<=0.005 then 'PAID' else 'PARTIAL' end,updated_at=now()
  where id=v_ar.id;

  update public.customer_invoices
  set outstanding_balance=v_after,outstanding_amount=v_after,status=case when v_after<=0.005 then 'PAID' else 'PARTIAL' end,updated_at=now()
  where id=p_target_invoice_id and organization_id=p_organization_id and entity_id=p_entity_id;

  v_result := jsonb_build_object(
    'success',true,
    'customer_credit_id',p_customer_credit_id,
    'target_invoice_id',p_target_invoice_id,
    'applied_amount',p_amount,
    'credit_available_amount',v_credit_after,
    'invoice_outstanding_balance',v_after,
    'sales_order_reconciliation',public.commercial_reconcile_sales_order_payment_from_invoice(p_organization_id,p_entity_id,p_target_invoice_id)
  );

  perform public.finance_complete_idempotency(p_organization_id,p_entity_id,'CUSTOMER_CREDIT_APPLY',btrim(p_idempotency_key),v_result);
  return v_result;
end;
$$;

create or replace function public.finance_refund_customer_credit_idempotent(
  p_refund_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_customer_credit_id uuid,
  p_bank_account_id uuid,
  p_refund_date date,
  p_amount numeric,
  p_reference_number text,
  p_refunded_by uuid,
  p_journal_lines jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.finance_customer_credits%rowtype;
  v_bank record;
  v_existing jsonb;
  v_request_hash text;
  v_available_after numeric;
  v_journal jsonb;
  v_journal_id uuid;
  v_bank_ledger_id uuid;
  v_result jsonb;
begin
  if p_refund_id is null or p_customer_credit_id is null or p_bank_account_id is null then raise exception 'refund_id, customer_credit_id and bank_account_id required'; end if;
  if p_refund_date is null then raise exception 'refund_date required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'amount must be greater than zero'; end if;
  if p_refunded_by is null then raise exception 'refunded_by required'; end if;
  if p_journal_lines is null or jsonb_typeof(p_journal_lines)<>'array' or jsonb_array_length(p_journal_lines)<2 then raise exception 'balanced journal lines required'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws('|',p_customer_credit_id::text,p_bank_account_id::text,p_refund_date::text,p_amount::text,coalesce(btrim(p_reference_number),''),p_journal_lines::text));
  v_existing := public.finance_claim_idempotency(p_organization_id,p_entity_id,'CUSTOMER_CREDIT_REFUND',btrim(p_idempotency_key),v_request_hash,p_refund_id);
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||p_entity_id::text||':customer-credit:'||p_party_id::text,0));

  select * into v_credit
  from public.finance_customer_credits
  where id=p_customer_credit_id and organization_id=p_organization_id and entity_id=p_entity_id and party_id=p_party_id
  for update;
  if not found then raise exception 'Customer credit not found in scope'; end if;
  if v_credit.available_amount < p_amount-0.005 then raise exception 'Refund amount exceeds available customer credit'; end if;

  select id,coalesce(nullif(currency_code,''),nullif(currency,'')) as currency into v_bank
  from public.bank_accounts
  where id=p_bank_account_id and organization_id=p_organization_id and entity_id=p_entity_id;
  if not found then raise exception 'Bank account not found in scope'; end if;
  if upper(coalesce(v_bank.currency,'')) <> upper(coalesce(v_credit.currency_code,'')) then raise exception 'Bank account currency does not match customer credit'; end if;

  v_available_after := greatest(v_credit.available_amount-p_amount,0);

  select public.finance_post_journal_atomic(
    p_organization_id=>p_organization_id,
    p_entity_id=>p_entity_id,
    p_posting_date=>p_refund_date,
    p_document_date=>p_refund_date,
    p_journal_type=>'SYSTEM',
    p_reference=>'accounts_receivable:'||p_refund_id::text,
    p_source_module=>'accounts_receivable',
    p_source_document=>'CUSTOMER_CREDIT_REFUNDED',
    p_source_document_id=>p_refund_id,
    p_description=>'Customer Credit Refund '||coalesce(nullif(btrim(p_reference_number),''),p_refund_id::text),
    p_currency_code=>upper(v_credit.currency_code),
    p_exchange_rate=>v_credit.exchange_rate,
    p_lines=>p_journal_lines,
    p_created_by=>p_refunded_by,
    p_idempotency_key=>'accounting-event:CUSTOMER_CREDIT_REFUND:'||p_refund_id::text
  ) into v_journal;

  v_journal_id := nullif(v_journal->'journal'->>'id','')::uuid;
  if v_journal_id is null then raise exception 'Customer credit refund posting did not return journal entry'; end if;

  insert into public.bank_ledger(
    organization_id,entity_id,bank_account_id,transaction_type,reference_id,source_document,source_document_id,reference_number,
    amount,currency_code,exchange_rate,direction,journal_entry_id,created_at,updated_at
  ) values (
    p_organization_id,p_entity_id,p_bank_account_id,'CUSTOMER_CREDIT_REFUND',p_refund_id,'customer_credit_refund',p_refund_id,
    nullif(btrim(p_reference_number),''),p_amount,upper(v_credit.currency_code),v_credit.exchange_rate,'OUTFLOW',v_journal_id,now(),now()
  ) returning id into v_bank_ledger_id;

  insert into public.finance_customer_credit_refunds(
    id,organization_id,entity_id,party_id,customer_credit_id,bank_account_id,amount,currency_code,exchange_rate,
    journal_entry_id,bank_ledger_id,reference_number,refunded_by,idempotency_key,refunded_at
  ) values (
    p_refund_id,p_organization_id,p_entity_id,p_party_id,p_customer_credit_id,p_bank_account_id,p_amount,upper(v_credit.currency_code),v_credit.exchange_rate,
    v_journal_id,v_bank_ledger_id,nullif(btrim(p_reference_number),''),p_refunded_by,btrim(p_idempotency_key),now()
  );

  update public.finance_customer_credits
  set available_amount=v_available_after,
      refunded_amount=refunded_amount+p_amount,
      status=case when v_available_after<=0.005 and applied_amount<=0.005 then 'REFUNDED' when v_available_after<=0.005 then 'USED' else 'PARTIALLY_USED' end,
      updated_at=now()
  where id=p_customer_credit_id and organization_id=p_organization_id and entity_id=p_entity_id;

  v_result := jsonb_build_object(
    'success',true,
    'refund_id',p_refund_id,
    'customer_credit_id',p_customer_credit_id,
    'refunded_amount',p_amount,
    'available_amount',v_available_after,
    'journal_entry_id',v_journal_id,
    'bank_ledger_id',v_bank_ledger_id
  );

  perform public.finance_complete_idempotency(p_organization_id,p_entity_id,'CUSTOMER_CREDIT_REFUND',btrim(p_idempotency_key),v_result);
  return v_result;
end;
$$;

revoke all on function public.commercial_reconcile_sales_order_payment_from_invoice(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.finance_issue_customer_credit_note_idempotent(uuid,uuid,uuid,uuid,uuid,date,numeric,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finance_apply_customer_credit_idempotent(uuid,uuid,uuid,uuid,uuid,numeric,uuid,text) from public,anon,authenticated;
revoke all on function public.finance_refund_customer_credit_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,text,uuid,jsonb,text) from public,anon,authenticated;

grant execute on function public.commercial_reconcile_sales_order_payment_from_invoice(uuid,uuid,uuid) to service_role;
grant execute on function public.finance_issue_customer_credit_note_idempotent(uuid,uuid,uuid,uuid,uuid,date,numeric,text,uuid,text,text) to service_role;
grant execute on function public.finance_apply_customer_credit_idempotent(uuid,uuid,uuid,uuid,uuid,numeric,uuid,text) to service_role;
grant execute on function public.finance_refund_customer_credit_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,text,uuid,jsonb,text) to service_role;