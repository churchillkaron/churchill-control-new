begin;

do $$
declare
  v text;
  views text[] := array[
    'trial_balance_view',
    'secure_audit_logs_view',
    'secure_goods_receipts_view',
    'secure_invoices_view',
    'secure_orders_view',
    'secure_payments_view',
    'profit_and_loss_view',
    'balance_sheet_view',
    'cashflow_view',
    'consolidated_trial_balance_view',
    'order_profit_view',
    'secure_inventory_view',
    'secure_inventory_transactions_view',
    'ar_aging_view'
  ];
begin
  foreach v in array views loop
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on table public.%I from public, anon, authenticated', v);
    execute format('grant select on table public.%I to service_role', v);
  end loop;
end
$$;

commit;
