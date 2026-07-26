begin;

-- Canonical e-invoicing workspace writes sender_identifier. Older upgraded
-- databases may also retain routing_identifier as a predecessor column.
-- Preserve the legacy column and all existing values, but do not require new
-- canonical records to populate the obsolete duplicate field.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_e_invoicing_settings'
      and column_name = 'routing_identifier'
      and is_nullable = 'NO'
  ) then
    alter table public.finance_e_invoicing_settings
      alter column routing_identifier drop not null;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
