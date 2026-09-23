begin;

-- Release security hardening for tables currently exposed by the Data API
-- without RLS. Preserve authenticated product behavior, but constrain every
-- organization-scoped row to an active organization membership.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'dishes',
    'recipe_items',
    'orders',
    'ai_usage_logs',
    'ai_intake_submissions',
    'table_sessions',
    'inventory_ledger',
    'prepared_inventory',
    'production_yield_logs',
    'ai_operations_memory',
    'ai_procurement_memory',
    'pos_realtime_events',
    'restaurant_tables',
    'supplier_prices',
    'restaurant_zones',
    'recipe_prepared_items',
    'waste_ledger'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('revoke all on table public.%I from public, anon', v_table);
      execute format('revoke all on table public.%I from authenticated', v_table);
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        v_table
      );
      execute format('grant all on table public.%I to service_role', v_table);

      execute format(
        'drop policy if exists %I on public.%I',
        v_table || '_authenticated_org_access',
        v_table
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select public.same_organization(organization_id))) with check ((select public.same_organization(organization_id)))',
        v_table || '_authenticated_org_access',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- business_entities is currently empty and has no organization_id column.
-- It is an internal finance consolidation table, so expose it only to server
-- authority instead of inventing a weaker cross-tenant policy.
alter table if exists public.business_entities enable row level security;
revoke all on table public.business_entities from public, anon, authenticated;
grant all on table public.business_entities to service_role;

notify pgrst, 'reload schema';

commit;
