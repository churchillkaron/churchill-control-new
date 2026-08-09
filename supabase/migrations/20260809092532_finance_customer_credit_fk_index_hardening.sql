create index if not exists finance_customer_credits_org_party_fk_idx
  on public.finance_customer_credits(organization_id, party_id);
create index if not exists finance_customer_credits_credit_note_fk_idx
  on public.finance_customer_credits(credit_note_invoice_id);
create index if not exists finance_customer_credits_source_invoice_fk_idx
  on public.finance_customer_credits(source_invoice_id);

create index if not exists finance_customer_credit_applications_org_party_fk_idx
  on public.finance_customer_credit_applications(organization_id, party_id);
create index if not exists finance_customer_credit_applications_credit_fk_idx
  on public.finance_customer_credit_applications(customer_credit_id);
create index if not exists finance_customer_credit_applications_target_invoice_fk_idx
  on public.finance_customer_credit_applications(target_invoice_id);

create index if not exists finance_customer_credit_refunds_org_party_fk_idx
  on public.finance_customer_credit_refunds(organization_id, party_id);
create index if not exists finance_customer_credit_refunds_credit_fk_idx
  on public.finance_customer_credit_refunds(customer_credit_id);
create index if not exists finance_customer_credit_refunds_bank_fk_idx
  on public.finance_customer_credit_refunds(bank_account_id);
create index if not exists finance_customer_credit_refunds_journal_fk_idx
  on public.finance_customer_credit_refunds(journal_entry_id)
  where journal_entry_id is not null;
create index if not exists finance_customer_credit_refunds_bank_ledger_fk_idx
  on public.finance_customer_credit_refunds(bank_ledger_id)
  where bank_ledger_id is not null;