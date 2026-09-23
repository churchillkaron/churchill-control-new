begin;

create or replace function public.finance_is_completed_customer_credit_event(
  p_operation_type text,
  p_resource_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_idempotency_keys event
    where event.operation_type = upper(btrim(p_operation_type))
      and event.resource_id = p_resource_id
      and event.status = 'COMPLETED'
      and event.operation_type in (
        'CUSTOMER_CREDIT_NOTE',
        'CUSTOMER_CREDIT_APPLY',
        'CUSTOMER_CREDIT_REFUND'
      )
  );
$$;

create or replace function public.guard_completed_customer_credit_idempotency()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if upper(coalesce(old.status, '')) <> 'COMPLETED'
     or old.operation_type not in (
       'CUSTOMER_CREDIT_NOTE',
       'CUSTOMER_CREDIT_APPLY',
       'CUSTOMER_CREDIT_REFUND'
     )
     or public.finance_is_completed_customer_credit_event(old.operation_type, old.resource_id) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'CUSTOMER_CREDIT_EVENT_EVIDENCE_IMMUTABLE';
end;
$$;

drop trigger if exists finance_customer_credit_event_evidence_immutability
  on public.finance_idempotency_keys;
create trigger finance_customer_credit_event_evidence_immutability
before update or delete on public.finance_idempotency_keys
for each row execute function public.guard_completed_customer_credit_idempotency();

create or replace function public.finance_is_completed_customer_credit_note(p_invoice_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_invoices invoice
    where invoice.id = p_invoice_id
      and upper(coalesce(invoice.document_type, '')) = 'CREDIT_NOTE'
      and public.finance_is_completed_customer_credit_event('CUSTOMER_CREDIT_NOTE', invoice.id)
  );
$$;

create or replace function public.guard_completed_customer_credit_note_header()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.finance_is_completed_customer_credit_note(old.id) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'CUSTOMER_CREDIT_NOTE_EVIDENCE_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.entity_id is distinct from old.entity_id
     or new.party_id is distinct from old.party_id
     or new.customer_id is distinct from old.customer_id
     or new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.due_date is distinct from old.due_date
     or new.subtotal is distinct from old.subtotal
     or new.tax_amount is distinct from old.tax_amount
     or new.total_amount is distinct from old.total_amount
     or new.outstanding_balance is distinct from old.outstanding_balance
     or new.outstanding_amount is distinct from old.outstanding_amount
     or new.status is distinct from old.status
     or new.notes is distinct from old.notes
     or new.currency_code is distinct from old.currency_code
     or new.exchange_rate is distinct from old.exchange_rate
     or new.document_type is distinct from old.document_type
     or new.source_document_type is distinct from old.source_document_type
     or new.source_document_id is distinct from old.source_document_id
     or new.journal_entry_id is distinct from old.journal_entry_id
     or new.posted_at is distinct from old.posted_at
     or new.credited_at is distinct from old.credited_at
     or new.credit_note_for_invoice_id is distinct from old.credit_note_for_invoice_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'CUSTOMER_CREDIT_NOTE_EVIDENCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists finance_customer_credit_note_header_evidence_immutability
  on public.customer_invoices;
create trigger finance_customer_credit_note_header_evidence_immutability
before update or delete on public.customer_invoices
for each row execute function public.guard_completed_customer_credit_note_header();

create or replace function public.guard_completed_customer_credit_note_line()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_invoice_id uuid;
  v_new_invoice_id uuid;
begin
  v_old_invoice_id := case when tg_op = 'INSERT' then null else old.customer_invoice_id end;
  v_new_invoice_id := case when tg_op = 'DELETE' then null else new.customer_invoice_id end;

  if (v_old_invoice_id is not null and public.finance_is_completed_customer_credit_note(v_old_invoice_id))
     or (v_new_invoice_id is not null and public.finance_is_completed_customer_credit_note(v_new_invoice_id)) then
    raise exception 'CUSTOMER_CREDIT_NOTE_LINE_EVIDENCE_IMMUTABLE';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists finance_customer_credit_note_line_evidence_immutability
  on public.customer_invoice_lines;
create trigger finance_customer_credit_note_line_evidence_immutability
before insert or update or delete on public.customer_invoice_lines
for each row execute function public.guard_completed_customer_credit_note_line();

create or replace function public.guard_customer_credit_balance_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$;
begin
  if tg_op = 'DELETE' then
    raise exception 'CUSTOMER_CREDIT_EVIDENCE_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.entity_id is distinct from old.entity_id
     or new.party_id is distinct from old.party_id
     or new.credit_note_invoice_id is distinct from old.credit_note_invoice_id
     or new.source_invoice_id is distinct from old.source_invoice_id
     or new.original_amount is distinct from old.original_amount
     or new.currency_code is distinct from old.currency_code
     or new.exchange_rate is distinct from old.exchange_rate
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or coalesce(new.available_amount, 0) < -0.005
     or coalesce(new.applied_amount, 0) < coalesce(old.applied_amount, 0) - 0.005
     or coalesce(new.refunded_amount, 0) < coalesce(old.refunded_amount, 0) - 0.005
     or coalesce(new.available_amount, 0) > coalesce(old.available_amount, 0) + 0.005
     or abs(
          coalesce(new.available_amount, 0)
          + coalesce(new.applied_amount, 0)
          + coalesce(new.refunded_amount, 0)
          - coalesce(new.original_amount, 0)
        ) > 0.005
     or (coalesce(new.available_amount, 0) > 0.005
         and upper(coalesce(new.status, '')) not in ('OPEN', 'PARTIALLY_USED'))
     or (coalesce(new.available_amount, 0) <= 0.005
         and upper(coalesce(new.status, '')) not in ('USED', 'REFUNDED'))
     or (upper(coalesce(old.status, '')) in ('USED', 'REFUNDED') and (
          new.status is distinct from old.status
          or new.available_amount is distinct from old.available_amount
          or new.applied_amount is distinct from old.applied_amount
          or new.refunded_amount is distinct from old.refunded_amount
        )) then
    raise exception 'CUSTOMER_CREDIT_BALANCE_EVIDENCE_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists finance_customer_credit_balance_integrity
  on public.finance_customer_credits;
create trigger finance_customer_credit_balance_integrity
before update or delete on public.finance_customer_credits
for each row execute function public.guard_customer_credit_balance_integrity();

create or replace function public.guard_customer_credit_application_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'CUSTOMER_CREDIT_APPLICATION_EVIDENCE_IMMUTABLE';
end;
$$;

drop trigger if exists finance_customer_credit_application_evidence_immutability
  on public.finance_customer_credit_applications;
create trigger finance_customer_credit_application_evidence_immutability
before update or delete on public.finance_customer_credit_applications
for each row execute function public.guard_customer_credit_application_evidence();

create or replace function public.guard_customer_credit_refund_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'CUSTOMER_CREDIT_REFUND_EVIDENCE_IMMUTABLE';
end;
$$;

drop trigger if exists finance_customer_credit_refund_evidence_immutability
  on public.finance_customer_credit_refunds;
create trigger finance_customer_credit_refund_evidence_immutability
before update or delete on public.finance_customer_credit_refunds
for each row execute function public.guard_customer_credit_refund_evidence();

create or replace function public.finance_is_completed_customer_credit_journal(p_journal_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.journal_entries journal
    where journal.id = p_journal_id
      and journal.source_document_id is not null
      and (
        (
          upper(coalesce(journal.source_document, '')) = 'CUSTOMER_CREDIT_NOTE_POSTED'
          and public.finance_is_completed_customer_credit_event('CUSTOMER_CREDIT_NOTE', journal.source_document_id)
        )
        or (
          upper(coalesce(journal.source_document, '')) = 'CUSTOMER_CREDIT_REFUNDED'
          and public.finance_is_completed_customer_credit_event('CUSTOMER_CREDIT_REFUND', journal.source_document_id)
        )
      )
  );
$$;

create or replace function public.guard_completed_customer_credit_journal_header()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.finance_is_completed_customer_credit_journal(old.id) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'CUSTOMER_CREDIT_JOURNAL_EVIDENCE_IMMUTABLE';
end;
$$;

drop trigger if exists finance_customer_credit_journal_header_evidence_immutability
  on public.journal_entries;
create trigger finance_customer_credit_journal_header_evidence_immutability
before update or delete on public.journal_entries
for each row execute function public.guard_completed_customer_credit_journal_header();

create or replace function public.guard_completed_customer_credit_journal_line()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_journal_id uuid;
begin
  v_journal_id := case when tg_op = 'DELETE' then old.journal_entry_id else new.journal_entry_id end;
  if public.finance_is_completed_customer_credit_journal(v_journal_id) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'CUSTOMER_CREDIT_JOURNAL_LINE_EVIDENCE_IMMUTABLE';
end;
$$;

drop trigger if exists finance_customer_credit_journal_line_evidence_immutability
  on public.journal_entry_lines;
create trigger finance_customer_credit_journal_line_evidence_immutability
before insert or update or delete on public.journal_entry_lines
for each row execute function public.guard_completed_customer_credit_journal_line();

create or replace function public.guard_completed_customer_credit_general_ledger()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_journal_id uuid;
begin
  v_journal_id := case when tg_op = 'DELETE' then old.journal_entry_id else new.journal_entry_id end;
  if public.finance_is_completed_customer_credit_journal(v_journal_id) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'CUSTOMER_CREDIT_GENERAL_LEDGER_EVIDENCE_IMMUTABLE';
end;
$$;

drop trigger if exists finance_customer_credit_general_ledger_evidence_immutability
  on public.general_ledger;
create trigger finance_customer_credit_general_ledger_evidence_immutability
before insert or update or delete on public.general_ledger
for each row execute function public.guard_completed_customer_credit_general_ledger();

create or replace function public.finance_is_completed_customer_credit_refund_bank_ledger(p_ledger_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.bank_ledger ledger
    where ledger.id = p_ledger_id
      and lower(coalesce(ledger.source_document, '')) = 'customer_credit_refund'
      and ledger.source_document_id is not null
      and public.finance_is_completed_customer_credit_event('CUSTOMER_CREDIT_REFUND', ledger.source_document_id)
  );
$$;

create or replace function public.guard_completed_customer_credit_refund_bank_ledger()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_period_changed boolean;
  v_statement_changed boolean;
  v_reconciled_at_changed boolean;
  v_reconciled_by_changed boolean;
begin
  if public.finance_is_completed_customer_credit_refund_bank_ledger(old.id) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'CUSTOMER_CREDIT_REFUND_BANK_EVIDENCE_IMMUTABLE';
  end if;

  v_period_changed := new.period_id is distinct from old.period_id;
  v_statement_changed := new.reconciled_statement_id is distinct from old.reconciled_statement_id;
  v_reconciled_at_changed := new.reconciled_at is distinct from old.reconciled_at;
  v_reconciled_by_changed := new.reconciled_by is distinct from old.reconciled_by;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.entity_id is distinct from old.entity_id
     or new.bank_account_id is distinct from old.bank_account_id
     or new.transaction_type is distinct from old.transaction_type
     or new.reference_id is distinct from old.reference_id
     or new.amount is distinct from old.amount
     or new.direction is distinct from old.direction
     or new.currency_code is distinct from old.currency_code
     or new.exchange_rate is distinct from old.exchange_rate
     or new.reference_number is distinct from old.reference_number
     or new.source_document is distinct from old.source_document
     or new.source_document_id is distinct from old.source_document_id
     or new.journal_entry_id is distinct from old.journal_entry_id
     or new.created_at is distinct from old.created_at
     or (v_period_changed and not (old.period_id is null and new.period_id is not null))
     or (v_statement_changed and not (old.reconciled_statement_id is null and new.reconciled_statement_id is not null))
     or (v_reconciled_at_changed and not (old.reconciled_at is null and new.reconciled_at is not null))
     or (v_reconciled_by_changed and not (old.reconciled_by is null and new.reconciled_by is not null))
     or (new.reconciled_statement_id is not null and (new.reconciled_at is null or new.reconciled_by is null)) then
    raise exception 'CUSTOMER_CREDIT_REFUND_BANK_EVIDENCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists finance_customer_credit_refund_bank_evidence_immutability
  on public.bank_ledger;
create trigger finance_customer_credit_refund_bank_evidence_immutability
before update or delete on public.bank_ledger
for each row execute function public.guard_completed_customer_credit_refund_bank_ledger();

create or replace function public.guard_completed_customer_credit_bank_statement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old_protected boolean := false;
  v_new_protected boolean := false;
begin
  if old.ledger_reference_id is not null then
    v_old_protected := public.finance_is_completed_customer_credit_refund_bank_ledger(old.ledger_reference_id);
  end if;

  if tg_op = 'DELETE' then
    if coalesce(old.matched, false) and v_old_protected then
      raise exception 'CUSTOMER_CREDIT_BANK_STATEMENT_EVIDENCE_IMMUTABLE';
    end if;
    return old;
  end if;

  if coalesce(old.matched, false) and v_old_protected then
    raise exception 'CUSTOMER_CREDIT_BANK_STATEMENT_EVIDENCE_IMMUTABLE';
  end if;

  if new.ledger_reference_id is not null then
    v_new_protected := public.finance_is_completed_customer_credit_refund_bank_ledger(new.ledger_reference_id);
  end if;

  if coalesce(new.matched, false) and v_new_protected then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.entity_id is distinct from old.entity_id
       or new.bank_account_id is distinct from old.bank_account_id
       or new.statement_import_id is distinct from old.statement_import_id
       or new.statement_line_number is distinct from old.statement_line_number
       or new.transaction_date is distinct from old.transaction_date
       or new.description is distinct from old.description
       or new.amount is distinct from old.amount
       or new.direction is distinct from old.direction
       or new.reference_number is distinct from old.reference_number
       or new.created_at is distinct from old.created_at
       or not (coalesce(old.matched, false) = false and new.matched = true)
       or not (old.ledger_reference_id is null and new.ledger_reference_id is not null)
       or not (old.matched_at is null and new.matched_at is not null)
       or (new.period_id is distinct from old.period_id
           and not (old.period_id is null and new.period_id is not null)) then
      raise exception 'CUSTOMER_CREDIT_BANK_STATEMENT_EVIDENCE_IMMUTABLE';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_customer_credit_bank_statement_evidence_immutability
  on public.bank_statements;
create trigger finance_customer_credit_bank_statement_evidence_immutability
before update or delete on public.bank_statements
for each row execute function public.guard_completed_customer_credit_bank_statement();

revoke all on function public.finance_is_completed_customer_credit_event(text,uuid) from public, anon, authenticated;
grant execute on function public.finance_is_completed_customer_credit_event(text,uuid) to service_role;
revoke all on function public.guard_completed_customer_credit_idempotency() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_idempotency() to service_role;
revoke all on function public.finance_is_completed_customer_credit_note(uuid) from public, anon, authenticated;
grant execute on function public.finance_is_completed_customer_credit_note(uuid) to service_role;
revoke all on function public.guard_completed_customer_credit_note_header() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_note_header() to service_role;
revoke all on function public.guard_completed_customer_credit_note_line() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_note_line() to service_role;
revoke all on function public.guard_customer_credit_balance_integrity() from public, anon, authenticated;
grant execute on function public.guard_customer_credit_balance_integrity() to service_role;
revoke all on function public.guard_customer_credit_application_evidence() from public, anon, authenticated;
grant execute on function public.guard_customer_credit_application_evidence() to service_role;
revoke all on function public.guard_customer_credit_refund_evidence() from public, anon, authenticated;
grant execute on function public.guard_customer_credit_refund_evidence() to service_role;
revoke all on function public.finance_is_completed_customer_credit_journal(uuid) from public, anon, authenticated;
grant execute on function public.finance_is_completed_customer_credit_journal(uuid) to service_role;
revoke all on function public.guard_completed_customer_credit_journal_header() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_journal_header() to service_role;
revoke all on function public.guard_completed_customer_credit_journal_line() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_journal_line() to service_role;
revoke all on function public.guard_completed_customer_credit_general_ledger() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_general_ledger() to service_role;
revoke all on function public.finance_is_completed_customer_credit_refund_bank_ledger(uuid) from public, anon, authenticated;
grant execute on function public.finance_is_completed_customer_credit_refund_bank_ledger(uuid) to service_role;
revoke all on function public.guard_completed_customer_credit_refund_bank_ledger() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_refund_bank_ledger() to service_role;
revoke all on function public.guard_completed_customer_credit_bank_statement() from public, anon, authenticated;
grant execute on function public.guard_completed_customer_credit_bank_statement() to service_role;

commit;
