begin;

-- These predecessor columns remain in some upgraded databases from earlier
-- Finance workspace schemas. Canonical workspace forms now write the replacement
-- fields shown below. Preserve all legacy data and columns, but do not require
-- new canonical records to populate obsolete duplicate fields.
do $$
declare
  v_column record;
begin
  for v_column in
    select *
    from (
      values
        ('finance_statutory_filings', 'authority_code'),
        ('finance_scheduled_reports', 'schedule_expression'),
        ('finance_government_connections', 'authority_code'),
        ('finance_banking_integrations', 'bank_code'),
        ('finance_e_invoicing_settings', 'network_code')
    ) as legacy_columns(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_column.table_name
        and column_name = v_column.column_name
        and is_nullable = 'NO'
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
