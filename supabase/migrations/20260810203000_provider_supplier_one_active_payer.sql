create unique index if not exists provider_supplier_billing_accounts_one_active_per_provider
on public.provider_supplier_billing_accounts (provider_id)
where status = 'ACTIVE';
