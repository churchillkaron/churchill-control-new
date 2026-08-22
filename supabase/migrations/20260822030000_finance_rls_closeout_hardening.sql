-- Finance close-out security hardening.
-- These relations are reached through authenticated server routes / service-role
-- repositories, but were still reported by the live Supabase security advisor
-- with row-level security disabled. Enabling RLS closes direct Data API exposure
-- without changing business data, capability contracts, or runtime ownership.

begin;

do $$
declare
  relation_name text;
  finance_relations constant text[] := array[
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
  ];
begin
  foreach relation_name in array finance_relations
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'alter table public.%I enable row level security',
        relation_name
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
