begin;

-- Align older live Finance table shapes with the atomic document and close
-- runtimes already deployed. All changes are additive and preserve data.

alter table if exists public.customer_invoices
  add column if not exists entity_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists due_date date,
  add column if not exists currency_code text,
  add column if not exists exchange_rate numeric default 1,
  add column if not exists subtotal numeric default 0,
  add column if not exists tax_amount numeric default 0,
  add column if not exists total_amount numeric default 0,
  add column if not exists outstanding_amount numeric,
  add column if not exists outstanding_balance numeric,
  add column if not exists status text,
  add column if not exists notes text,
  add column if not exists created_by uuid,
  add column if not exists journal_entry_id uuid,
  add column if not exists updated_at timestamptz default now();

update public.customer_invoices
set exchange_rate = coalesce(exchange_rate, 1),
    outstanding_amount = coalesce(
      outstanding_amount,
      outstanding_balance,
      total_amount,
      0
    ),
    outstanding_balance = coalesce(
      outstanding_balance,
      outstanding_amount,
      total_amount,
      0
    ),
    updated_at = coalesce(updated_at, now());

create or replace function public.finance_sync_customer_invoice_outstanding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.outstanding_amount := coalesce(
      new.outstanding_amount,
      new.outstanding_balance,
      new.total_amount,
      0
    );
    new.outstanding_balance := coalesce(
      new.outstanding_balance,
      new.outstanding_amount,
      new.total_amount,
      0
    );
    return new;
  end if;

  if new.outstanding_amount is distinct from old.outstanding_amount
     and new.outstanding_balance is not distinct from old.outstanding_balance then
    new.outstanding_balance := new.outstanding_amount;
  elsif new.outstanding_balance is distinct from old.outstanding_balance
        and new.outstanding_amount is not distinct from old.outstanding_amount then
    new.outstanding_amount := new.outstanding_balance;
  elsif new.outstanding_amount is distinct from new.outstanding_balance then
    new.outstanding_balance := new.outstanding_amount;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_customer_invoice_outstanding_sync
on public.customer_invoices;

create trigger finance_customer_invoice_outstanding_sync
before insert or update of outstanding_amount, outstanding_balance, total_amount
on public.customer_invoices
for each row
execute function public.finance_sync_customer_invoice_outstanding();

alter table if exists public.vendor_invoices
  add column if not exists entity_id uuid,
  add column if not exists vendor_party_id uuid,
  add column if not exists purchase_order_id uuid,
  add column if not exists goods_receipt_id uuid,
  add column if not exists document_id uuid,
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists due_date date,
  add column if not exists currency_code text,
  add column if not exists exchange_rate numeric default 1,
  add column if not exists subtotal numeric default 0,
  add column if not exists tax_amount numeric default 0,
  add column if not exists discount_amount numeric default 0,
  add column if not exists total_amount numeric default 0,
  add column if not exists outstanding_amount numeric,
  add column if not exists source text,
  add column if not exists ai_extracted boolean default false,
  add column if not exists ocr_confidence numeric default 0,
  add column if not exists status text,
  add column if not exists received_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists journal_entry_id uuid,
  add column if not exists updated_at timestamptz default now();

update public.vendor_invoices
set exchange_rate = coalesce(exchange_rate, 1),
    outstanding_amount = coalesce(outstanding_amount, total_amount, 0),
    ai_extracted = coalesce(ai_extracted, false),
    ocr_confidence = coalesce(ocr_confidence, 0),
    updated_at = coalesce(updated_at, now());

alter table if exists public.audit_logs
  add column if not exists organization_id uuid,
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

-- The canonical journal poster stores created_by as text for compatibility with
-- historical service identities. Finance runtimes use auth UUIDs. This overload
-- preserves the canonical implementation and provides the UUID contract expected
-- by atomic invoice, payment, depreciation, FX, and close routines.
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
  p_created_by uuid,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.finance_post_journal_atomic(
    p_organization_id,
    p_entity_id,
    p_posting_date,
    p_document_date,
    p_journal_type,
    p_reference,
    p_source_module,
    p_source_document,
    p_source_document_id,
    p_description,
    p_currency_code,
    p_exchange_rate,
    p_lines,
    p_created_by::text,
    p_idempotency_key
  );
$$;

revoke all on function public.finance_post_journal_atomic(
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  numeric,
  jsonb,
  uuid,
  text
) from public;

grant execute on function public.finance_post_journal_atomic(
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  numeric,
  jsonb,
  uuid,
  text
) to service_role;

comment on function public.finance_post_journal_atomic(
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text,
  uuid,
  text,
  text,
  numeric,
  jsonb,
  uuid,
  text
) is
  'UUID actor overload for the canonical atomic journal posting function.';

notify pgrst, 'reload schema';

commit;
