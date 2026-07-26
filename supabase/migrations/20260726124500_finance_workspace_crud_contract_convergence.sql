begin;

-- Canonical Finance workspace forms write the replacement columns listed in
-- FinanceWorkspaceContracts. Earlier environments may still contain obsolete
-- duplicate columns with NOT NULL constraints. Preserve those columns and all
-- existing data, but stop requiring new canonical writes to populate them.
do $$
declare
  v_column record;
begin
  for v_column in
    select *
    from (
      values
        ('finance_revenue_recognition_schedules', 'description'),
        ('finance_statutory_filings', 'jurisdiction'),
        ('finance_scheduled_reports', 'report_definition_id'),
        ('finance_approval_workflows', 'workflow_code'),
        ('finance_government_connections', 'country_code'),
        ('finance_banking_integrations', 'bank_name'),
        ('finance_e_invoicing_settings', 'country_code')
    ) as legacy_columns(table_name, column_name)
  loop
    if to_regclass(format('public.%I', v_column.table_name)) is not null
       and exists (
         select 1
         from information_schema.columns column_row
         where column_row.table_schema = 'public'
           and column_row.table_name = v_column.table_name
           and column_row.column_name = v_column.column_name
           and column_row.is_nullable = 'NO'
       ) then
      execute format(
        'alter table public.%I alter column %I drop not null',
        v_column.table_name,
        v_column.column_name
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
