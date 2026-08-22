-- Reconcile production Finance RLS hardening into source control.
-- Finance runtime access is server-side after requireOrganizationAccess + finance permission checks.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'vendors',
    'purchase_orders',
    'purchase_order_items',
    'goods_receipts',
    'goods_receipt_items',
    'accounts_payable',
    'ai_finance_memory',
    'budgets',
    'bank_statements',
    'vendor_invoices',
    'vendor_payments',
    'bank_ledger',
    'intercompany_transactions'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end
$$;
