create or replace function public.operations_guard_petty_cash_request_immutability()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.entity_id is distinct from old.entity_id
    or new.fund_id is distinct from old.fund_id
    or new.source_application_id is distinct from old.source_application_id
    or new.requester_staff_id is distinct from old.requester_staff_id
    or new.purpose is distinct from old.purpose
    or new.requested_amount is distinct from old.requested_amount
    or new.currency_code is distinct from old.currency_code
    or new.requested_at is distinct from old.requested_at
    or new.request_idempotency_key is distinct from old.request_idempotency_key
  then raise exception 'Petty cash request source evidence is immutable'; end if;

  if old.status <> 'PENDING' and new.status is distinct from old.status then
    if not (old.status='APPROVED' and new.status='DISBURSED')
       and not (old.status='DISBURSED' and new.status='EVIDENCE_SUBMITTED')
       and not (old.status='EVIDENCE_SUBMITTED' and new.status='SETTLED') then
      raise exception 'Invalid petty cash request lifecycle transition';
    end if;
  end if;

  if old.status='PENDING' and new.status not in ('PENDING','APPROVED','REJECTED') then
    raise exception 'Invalid petty cash request decision transition';
  end if;

  if old.approved_by is not null and (
      new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.approved_amount is distinct from old.approved_amount
      or new.approval_notes is distinct from old.approval_notes
      or new.decision_idempotency_key is distinct from old.decision_idempotency_key
    ) then raise exception 'Petty cash approval evidence is immutable'; end if;

  if old.rejected_by is not null and (
      new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.decision_idempotency_key is distinct from old.decision_idempotency_key
    ) then raise exception 'Petty cash rejection evidence is immutable'; end if;

  if old.status='SETTLED' and row(new.*) is distinct from row(old.*) then
    raise exception 'Settled petty cash request is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.operations_guard_petty_cash_disbursement_immutability()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.entity_id is distinct from old.entity_id
    or new.fund_id is distinct from old.fund_id
    or new.request_id is distinct from old.request_id
    or new.amount is distinct from old.amount
    or new.currency_code is distinct from old.currency_code
    or new.disbursement_date is distinct from old.disbursement_date
    or new.disbursement_journal_id is distinct from old.disbursement_journal_id
    or new.disbursed_by is distinct from old.disbursed_by
    or new.disbursed_at is distinct from old.disbursed_at
    or new.disbursement_idempotency_key is distinct from old.disbursement_idempotency_key
  then raise exception 'Petty cash disbursement evidence is immutable'; end if;

  if old.status='OPEN' and new.status not in ('OPEN','EVIDENCE_SUBMITTED') then
    raise exception 'Invalid petty cash disbursement evidence transition';
  end if;
  if old.status='EVIDENCE_SUBMITTED' and new.status not in ('EVIDENCE_SUBMITTED','SETTLED') then
    raise exception 'Invalid petty cash disbursement settlement transition';
  end if;
  if old.status='SETTLED' and row(new.*) is distinct from row(old.*) then
    raise exception 'Settled petty cash disbursement is immutable';
  end if;

  if old.settlement_journal_id is not null and (
      new.settlement_date is distinct from old.settlement_date
      or new.settlement_reference is distinct from old.settlement_reference
      or new.settlement_journal_id is distinct from old.settlement_journal_id
      or new.settled_by is distinct from old.settled_by
      or new.settled_at is distinct from old.settled_at
      or new.cash_returned is distinct from old.cash_returned
      or new.settlement_idempotency_key is distinct from old.settlement_idempotency_key
    ) then raise exception 'Petty cash settlement evidence is immutable'; end if;
  return new;
end;
$$;

create or replace function public.operations_guard_petty_cash_insert_only()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception '% records are immutable after creation', tg_table_name;
end;
$$;

revoke all on function public.operations_guard_petty_cash_request_immutability() from public, anon, authenticated;
revoke all on function public.operations_guard_petty_cash_disbursement_immutability() from public, anon, authenticated;
revoke all on function public.operations_guard_petty_cash_insert_only() from public, anon, authenticated;
grant execute on function public.operations_guard_petty_cash_request_immutability() to service_role;
grant execute on function public.operations_guard_petty_cash_disbursement_immutability() to service_role;
grant execute on function public.operations_guard_petty_cash_insert_only() to service_role;

drop trigger if exists operations_petty_cash_requests_immutability on public.operations_petty_cash_requests;
create trigger operations_petty_cash_requests_immutability
before update on public.operations_petty_cash_requests
for each row execute function public.operations_guard_petty_cash_request_immutability();

drop trigger if exists operations_petty_cash_disbursements_immutability on public.operations_petty_cash_disbursements;
create trigger operations_petty_cash_disbursements_immutability
before update on public.operations_petty_cash_disbursements
for each row execute function public.operations_guard_petty_cash_disbursement_immutability();

drop trigger if exists operations_petty_cash_receipts_insert_only on public.operations_petty_cash_receipts;
create trigger operations_petty_cash_receipts_insert_only
before update or delete on public.operations_petty_cash_receipts
for each row execute function public.operations_guard_petty_cash_insert_only();

drop trigger if exists operations_petty_cash_replenishments_insert_only on public.operations_petty_cash_replenishments;
create trigger operations_petty_cash_replenishments_insert_only
before update or delete on public.operations_petty_cash_replenishments
for each row execute function public.operations_guard_petty_cash_insert_only();