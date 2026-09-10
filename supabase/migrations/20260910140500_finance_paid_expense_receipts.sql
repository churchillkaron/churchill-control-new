begin;

create table if not exists public.finance_expense_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  supplier_party_id uuid null,
  receipt_number text null,
  receipt_date date not null,
  currency_code text not null,
  exchange_rate numeric not null default 1 check (exchange_rate > 0),
  payment_source_type text not null check (payment_source_type in ('BANK_ACCOUNT','CASH_LOCATION','FINANCE_ACCOUNT')),
  payment_source_id uuid not null,
  payment_account_id uuid not null,
  total_amount numeric not null check (total_amount > 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  evidence_document_id uuid null,
  evidence_checksum text null,
  journal_entry_id uuid null,
  idempotency_key text not null,
  status text not null default 'POSTED' check (status in ('POSTED','VOID')),
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_expense_receipts_idempotency_uq
  on public.finance_expense_receipts (organization_id, entity_id, idempotency_key);
create index if not exists finance_expense_receipts_scope_idx
  on public.finance_expense_receipts (organization_id, entity_id, receipt_date desc);
create index if not exists finance_expense_receipts_checksum_idx
  on public.finance_expense_receipts (organization_id, entity_id, evidence_checksum)
  where evidence_checksum is not null;

create table if not exists public.finance_expense_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  expense_receipt_id uuid not null references public.finance_expense_receipts(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  posting_account_id uuid not null,
  tax_account_id uuid null,
  description text not null,
  gross_amount numeric not null check (gross_amount > 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0 and tax_amount <= gross_amount),
  cost_center_id uuid null,
  department_id uuid null,
  project_id uuid null,
  created_at timestamptz not null default now(),
  unique (expense_receipt_id, line_number)
);

create index if not exists finance_expense_receipt_lines_scope_idx
  on public.finance_expense_receipt_lines (organization_id, entity_id, expense_receipt_id);

alter table public.finance_expense_receipts enable row level security;
alter table public.finance_expense_receipt_lines enable row level security;

create or replace function public.finance_create_paid_expense_receipt_atomic(
  p_receipt_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_supplier_party_id uuid,
  p_receipt_number text,
  p_receipt_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_payment_source_type text,
  p_payment_source_id uuid,
  p_payment_account_id uuid,
  p_evidence_document_id uuid,
  p_evidence_checksum text,
  p_lines jsonb,
  p_journal_lines jsonb,
  p_created_by uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.finance_expense_receipts%rowtype;
  v_line record;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_posting jsonb;
  v_journal_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_receipt_id is null or p_receipt_date is null then raise exception 'receipt_id and receipt_date required'; end if;
  if nullif(btrim(p_currency_code),'') is null then raise exception 'currency_code required'; end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then raise exception 'exchange_rate must be positive'; end if;
  if p_payment_source_type not in ('BANK_ACCOUNT','CASH_LOCATION','FINANCE_ACCOUNT') then raise exception 'unsupported payment source'; end if;
  if p_payment_source_id is null or p_payment_account_id is null then raise exception 'payment source and account required'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'idempotency_key required'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then raise exception 'receipt lines required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','paid-expense',p_organization_id,p_entity_id,p_idempotency_key),0));

  select * into v_existing from public.finance_expense_receipts
  where organization_id=p_organization_id and entity_id=p_entity_id and idempotency_key=p_idempotency_key limit 1;
  if found then return jsonb_build_object('receipt',to_jsonb(v_existing),'idempotentReplay',true); end if;

  perform 1 from public.legal_entities where id=p_entity_id and organization_id=p_organization_id;
  if not found then raise exception 'Entity does not belong to organization'; end if;

  perform 1 from public.chart_of_accounts where id=p_payment_account_id and organization_id=p_organization_id and entity_id=p_entity_id and coalesce(is_active,true)=true;
  if not found then raise exception 'Payment account is outside active organization/entity scope'; end if;

  for v_line in select value as item, ordinality as n from jsonb_array_elements(p_lines) with ordinality loop
    if nullif(btrim(v_line.item->>'description'),'') is null then raise exception 'line % description required',v_line.n; end if;
    if coalesce((v_line.item->>'gross_amount')::numeric,0) <= 0 then raise exception 'line % gross amount must be positive',v_line.n; end if;
    if coalesce((v_line.item->>'tax_amount')::numeric,0) < 0 or coalesce((v_line.item->>'tax_amount')::numeric,0) > (v_line.item->>'gross_amount')::numeric then raise exception 'line % tax amount invalid',v_line.n; end if;
    perform 1 from public.chart_of_accounts where id=(v_line.item->>'posting_account_id')::uuid and organization_id=p_organization_id and entity_id=p_entity_id and coalesce(is_active,true)=true;
    if not found then raise exception 'line % posting account is outside active scope',v_line.n; end if;
    if nullif(v_line.item->>'tax_account_id','') is not null then
      perform 1 from public.chart_of_accounts where id=(v_line.item->>'tax_account_id')::uuid and organization_id=p_organization_id and entity_id=p_entity_id and coalesce(is_active,true)=true;
      if not found then raise exception 'line % tax account is outside active scope',v_line.n; end if;
    end if;
    v_total := v_total + (v_line.item->>'gross_amount')::numeric;
    v_tax := v_tax + coalesce((v_line.item->>'tax_amount')::numeric,0);
  end loop;

  insert into public.finance_expense_receipts (
    id,organization_id,entity_id,supplier_party_id,receipt_number,receipt_date,currency_code,exchange_rate,
    payment_source_type,payment_source_id,payment_account_id,total_amount,tax_amount,evidence_document_id,
    evidence_checksum,idempotency_key,created_by
  ) values (
    p_receipt_id,p_organization_id,p_entity_id,p_supplier_party_id,nullif(btrim(p_receipt_number),''),p_receipt_date,upper(btrim(p_currency_code)),p_exchange_rate,
    p_payment_source_type,p_payment_source_id,p_payment_account_id,v_total,v_tax,p_evidence_document_id,
    nullif(btrim(p_evidence_checksum),''),p_idempotency_key,p_created_by
  );

  for v_line in select value as item, ordinality as n from jsonb_array_elements(p_lines) with ordinality loop
    insert into public.finance_expense_receipt_lines (
      organization_id,entity_id,expense_receipt_id,line_number,posting_account_id,tax_account_id,description,gross_amount,tax_amount,cost_center_id,department_id,project_id
    ) values (
      p_organization_id,p_entity_id,p_receipt_id,v_line.n,(v_line.item->>'posting_account_id')::uuid,nullif(v_line.item->>'tax_account_id','')::uuid,
      v_line.item->>'description',(v_line.item->>'gross_amount')::numeric,coalesce((v_line.item->>'tax_amount')::numeric,0),
      nullif(v_line.item->>'cost_center_id','')::uuid,nullif(v_line.item->>'department_id','')::uuid,nullif(v_line.item->>'project_id','')::uuid
    );
  end loop;

  v_posting := public.finance_post_journal_atomic(
    p_organization_id,p_entity_id,p_receipt_date,p_receipt_date,'GENERAL',coalesce(nullif(btrim(p_receipt_number),''),p_receipt_id::text),
    'expense_receipts','PAID_EXPENSE_RECEIPT',p_receipt_id,'Paid expense receipt',upper(btrim(p_currency_code)),p_exchange_rate,
    p_journal_lines,p_created_by,p_idempotency_key
  );
  v_journal_id := nullif(v_posting->'journal'->>'id','')::uuid;
  update public.finance_expense_receipts set journal_entry_id=v_journal_id,updated_at=now() where id=p_receipt_id;
  return jsonb_build_object('receipt',(select to_jsonb(r) from public.finance_expense_receipts r where r.id=p_receipt_id),'posting',v_posting,'idempotentReplay',false);
end;
$$;

revoke all on function public.finance_create_paid_expense_receipt_atomic(uuid,uuid,uuid,uuid,text,date,text,numeric,text,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.finance_create_paid_expense_receipt_atomic(uuid,uuid,uuid,uuid,text,date,text,numeric,text,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
