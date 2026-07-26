begin;

-- The canonical e-invoicing workspace owns only the columns listed below.
-- Upgraded databases can retain additional predecessor columns from earlier
-- schemas. Preserve every legacy column and its existing data, but remove
-- NOT NULL requirements from non-canonical columns so canonical form writes
-- cannot be blocked by obsolete duplicate fields.
do $$
declare
  v_column record;
begin
  for v_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_e_invoicing_settings'
      and is_nullable = 'NO'
      and column_name not in (
        'id',
        'organization_id',
        'network',
        'jurisdiction_code',
        'document_type',
        'sender_identifier',
        'status',
        'created_at',
        'updated_at'
      )
  loop
    execute format(
      'alter table public.finance_e_invoicing_settings alter column %I drop not null',
      v_column.column_name
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
