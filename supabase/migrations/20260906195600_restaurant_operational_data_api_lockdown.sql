begin;

-- Restaurant operational state is server-authoritative. Browser clients consume
-- authenticated Avantiqo API/runtime surfaces; they do not write these tables
-- directly through PostgREST. Keep public catalog concerns separate from this
-- operational boundary.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'orders',
    'order_items',
    'table_sessions',
    'restaurant_tables',
    'restaurant_zones',
    'kitchen_tickets',
    'bar_tickets',
    'payments',
    'restaurant_payment_allocations',
    'restaurant_settings',
    'restaurant_table_merges',
    'pos_shifts',
    'pos_payment_corrections'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
      execute format('grant all on table public.%I to service_role', v_table);
    end if;
  end loop;
end;
$$;

commit;
