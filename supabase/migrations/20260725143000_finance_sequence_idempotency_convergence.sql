begin;

create table if not exists public.document_number_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  document_type text not null,
  prefix text not null,
  year integer not null,
  month integer not null,
  last_number bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_number_sequences
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists document_type text,
  add column if not exists prefix text,
  add column if not exists year integer,
  add column if not exists month integer,
  add column if not exists last_number bigint default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.document_number_sequences
set id = gen_random_uuid()
where id is null;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by
        organization_id,
        coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
        lower(btrim(document_type)),
        year,
        month
      order by
        coalesce(last_number, 0) desc,
        updated_at desc nulls last,
        created_at desc nulls last
    ) as row_number
  from public.document_number_sequences
)
delete from public.document_number_sequences target
using ranked
where target.ctid = ranked.ctid
  and ranked.row_number > 1;

create unique index if not exists document_number_sequences_scope_unique
on public.document_number_sequences (
  organization_id,
  coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(document_type)),
  year,
  month
);

create or replace function public.finance_next_document_number(
  p_organization_id uuid,
  p_entity_id uuid,
  p_document_type text,
  p_prefix text,
  p_document_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer;
  v_month integer;
  v_sequence_id uuid;
  v_last_number bigint;
  v_next_number bigint;
  v_prefix text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if nullif(btrim(p_document_type), '') is null then
    raise exception 'document_type required';
  end if;

  if nullif(btrim(p_prefix), '') is null then
    raise exception 'document number prefix required';
  end if;

  if p_document_date is null then
    raise exception 'document date required';
  end if;

  if p_entity_id is not null then
    perform 1
    from public.legal_entities
    where id = p_entity_id
      and organization_id = p_organization_id;

    if not found then
      raise exception 'Entity is outside organization scope';
    end if;
  end if;

  v_year := extract(year from p_document_date)::integer;
  v_month := extract(month from p_document_date)::integer;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        '|',
        p_organization_id::text,
        coalesce(p_entity_id::text, 'organization'),
        lower(btrim(p_document_type)),
        v_year::text,
        v_month::text
      ),
      0
    )
  );

  select
    id,
    coalesce(last_number, 0),
    coalesce(nullif(btrim(prefix), ''), btrim(p_prefix))
  into
    v_sequence_id,
    v_last_number,
    v_prefix
  from public.document_number_sequences
  where organization_id = p_organization_id
    and entity_id is not distinct from p_entity_id
    and lower(btrim(document_type)) = lower(btrim(p_document_type))
    and year = v_year
    and month = v_month
  limit 1
  for update;

  if found then
    v_next_number := v_last_number + 1;

    update public.document_number_sequences
    set last_number = v_next_number,
        prefix = v_prefix,
        updated_at = now()
    where id = v_sequence_id;
  else
    v_next_number := 1;
    v_prefix := btrim(p_prefix);

    insert into public.document_number_sequences (
      organization_id,
      entity_id,
      document_type,
      prefix,
      year,
      month,
      last_number,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      lower(btrim(p_document_type)),
      v_prefix,
      v_year,
      v_month,
      v_next_number,
      now(),
      now()
    );
  end if;

  return
    v_prefix || '-' ||
    right(v_year::text, 2) ||
    lpad(v_month::text, 2, '0') ||
    lpad(v_next_number::text, 4, '0');
end;
$$;

create table if not exists public.finance_idempotency_keys (
  organization_id uuid not null,
  entity_id uuid not null,
  operation_type text not null,
  idempotency_key text not null,
  request_hash text not null,
  resource_id uuid,
  status text not null default 'PROCESSING',
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (
    organization_id,
    entity_id,
    operation_type,
    idempotency_key
  )
);

create or replace function public.finance_claim_idempotency(
  p_organization_id uuid,
  p_entity_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_request_hash text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_result jsonb;
  v_request_hash text;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if nullif(btrim(p_operation_type), '') is null then
    raise exception 'operation_type required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  insert into public.finance_idempotency_keys (
    organization_id,
    entity_id,
    operation_type,
    idempotency_key,
    request_hash,
    resource_id,
    status,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    upper(btrim(p_operation_type)),
    btrim(p_idempotency_key),
    p_request_hash,
    p_resource_id,
    'PROCESSING',
    now(),
    now()
  )
  on conflict do nothing;

  if found then
    return null;
  end if;

  select
    status,
    result,
    request_hash
  into
    v_status,
    v_result,
    v_request_hash
  from public.finance_idempotency_keys
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and operation_type = upper(btrim(p_operation_type))
    and idempotency_key = btrim(p_idempotency_key);

  if v_request_hash is distinct from p_request_hash then
    raise exception 'Idempotency key was reused with a different request';
  end if;

  if v_status = 'COMPLETED' and v_result is not null then
    return v_result;
  end if;

  raise exception 'Finance operation with this idempotency key is already in progress';
end;
$$;

create or replace function public.finance_complete_idempotency(
  p_organization_id uuid,
  p_entity_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.finance_idempotency_keys
  set status = 'COMPLETED',
      result = p_result,
      completed_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and operation_type = upper(btrim(p_operation_type))
    and idempotency_key = btrim(p_idempotency_key);

  if not found then
    raise exception 'Idempotency claim not found';
  end if;
end;
$$;

create or replace function public.finance_create_customer_invoice_idempotent(
  p_invoice_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_id uuid,
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
  p_created_by uuid,
  p_idempotency_key text,
  p_prefix text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result jsonb;
  v_invoice_number text;
  v_request_hash text;
begin
  v_request_hash := md5(concat_ws(
    '|',
    p_customer_id::text,
    p_invoice_date::text,
    coalesce(p_due_date::text, ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    p_subtotal::text,
    p_tax_amount::text,
    p_total_amount::text,
    coalesce(p_notes, ''),
    coalesce(p_lines, '[]'::jsonb)::text,
    coalesce(p_journal_lines, '[]'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_INVOICE_CREATE',
    p_idempotency_key,
    v_request_hash,
    p_invoice_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  v_invoice_number := public.finance_next_document_number(
    p_organization_id,
    p_entity_id,
    'invoice',
    p_prefix,
    p_invoice_date
  );

  v_result := public.finance_create_customer_invoice_atomic(
    p_invoice_id => p_invoice_id,
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_customer_id => p_customer_id,
    p_invoice_number => v_invoice_number,
    p_invoice_date => p_invoice_date,
    p_due_date => p_due_date,
    p_currency_code => p_currency_code,
    p_exchange_rate => p_exchange_rate,
    p_subtotal => p_subtotal,
    p_tax_amount => p_tax_amount,
    p_total_amount => p_total_amount,
    p_notes => p_notes,
    p_lines => p_lines,
    p_journal_lines => p_journal_lines,
    p_created_by => p_created_by
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_INVOICE_CREATE',
    p_idempotency_key,
    v_result
  );

  return v_result;
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
    p_invoice_id => p_invoice_id,
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_vendor_party_id => p_vendor_party_id,
    p_purchase_order_id => p_purchase_order_id,
    p_goods_receipt_id => p_goods_receipt_id,
    p_document_id => p_document_id,
    p_invoice_number => p_invoice_number,
    p_invoice_date => p_invoice_date,
    p_due_date => p_due_date,
    p_currency_code => p_currency_code,
    p_exchange_rate => p_exchange_rate,
    p_subtotal => p_subtotal,
    p_tax_amount => p_tax_amount,
    p_discount_amount => p_discount_amount,
    p_total_amount => p_total_amount,
    p_source => p_source,
    p_ai_extracted => p_ai_extracted,
    p_ocr_confidence => p_ocr_confidence,
    p_created_by => p_created_by,
    p_journal_lines => p_journal_lines
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

create or replace function public.finance_post_customer_payment_idempotent(
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
    coalesce(p_customer_id::text, ''),
    p_customer_invoice_id::text,
    p_payment_date::text,
    p_amount::text,
    btrim(p_payment_method),
    coalesce(p_reference_number, ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    coalesce(p_journal_lines, '[]'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_PAYMENT_POST',
    p_idempotency_key,
    v_request_hash,
    p_payment_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  v_result := public.finance_post_customer_payment_atomic(
    p_payment_id => p_payment_id,
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_customer_id => p_customer_id,
    p_customer_invoice_id => p_customer_invoice_id,
    p_payment_date => p_payment_date,
    p_amount => p_amount,
    p_payment_method => p_payment_method,
    p_reference_number => p_reference_number,
    p_paid_by => p_paid_by,
    p_currency_code => p_currency_code,
    p_exchange_rate => p_exchange_rate,
    p_journal_lines => p_journal_lines
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_PAYMENT_POST',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.finance_post_vendor_payment_idempotent(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_accounts_payable_id uuid,
  p_payment_method text,
  p_paid_by uuid,
  p_paid_at timestamptz,
  p_currency_code text,
  p_exchange_rate numeric,
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
    p_accounts_payable_id::text,
    btrim(p_payment_method),
    p_paid_at::date::text,
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    coalesce(p_journal_lines, '[]'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_PAYMENT_POST',
    p_idempotency_key,
    v_request_hash,
    p_payment_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  v_result := public.finance_post_vendor_payment_atomic(
    p_payment_id => p_payment_id,
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_accounts_payable_id => p_accounts_payable_id,
    p_payment_method => p_payment_method,
    p_paid_by => p_paid_by,
    p_paid_at => p_paid_at,
    p_currency_code => p_currency_code,
    p_exchange_rate => p_exchange_rate,
    p_journal_lines => p_journal_lines
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_PAYMENT_POST',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_next_document_number(uuid, uuid, text, text, date) from public;
revoke all on function public.finance_claim_idempotency(uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.finance_complete_idempotency(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.finance_create_customer_invoice_idempotent(uuid, uuid, uuid, uuid, date, date, text, numeric, numeric, numeric, numeric, text, jsonb, jsonb, uuid, text, text) from public;
revoke all on function public.finance_create_vendor_invoice_idempotent(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric, numeric, numeric, text, boolean, numeric, uuid, jsonb, text) from public;
revoke all on function public.finance_post_customer_payment_idempotent(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb, text) from public;
revoke all on function public.finance_post_vendor_payment_idempotent(uuid, uuid, uuid, uuid, text, uuid, timestamptz, text, numeric, jsonb, text) from public;

grant execute on function public.finance_next_document_number(uuid, uuid, text, text, date) to service_role;
grant execute on function public.finance_create_customer_invoice_idempotent(uuid, uuid, uuid, uuid, date, date, text, numeric, numeric, numeric, numeric, text, jsonb, jsonb, uuid, text, text) to service_role;
grant execute on function public.finance_create_vendor_invoice_idempotent(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric, numeric, numeric, text, boolean, numeric, uuid, jsonb, text) to service_role;
grant execute on function public.finance_post_customer_payment_idempotent(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb, text) to service_role;
grant execute on function public.finance_post_vendor_payment_idempotent(uuid, uuid, uuid, uuid, text, uuid, timestamptz, text, numeric, jsonb, text) to service_role;

commit;
