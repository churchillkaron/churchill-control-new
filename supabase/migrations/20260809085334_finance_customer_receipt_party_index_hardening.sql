begin;

create index if not exists finance_customer_payment_allocations_org_party_fk_idx
on public.finance_customer_payment_allocations (organization_id, party_id);

create index if not exists finance_customer_unapplied_cash_org_party_fk_idx
on public.finance_customer_unapplied_cash (organization_id, party_id);

create index if not exists customer_payments_reversal_journal_entry_idx
on public.customer_payments (reversal_journal_entry_id)
where reversal_journal_entry_id is not null;

commit;
