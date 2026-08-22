begin;

alter table public.tax_rules
  add column if not exists tax_type text;

update public.tax_rules
set tax_type = case
  when upper(coalesce(tax_code, '')) like '%VAT%'
    or upper(coalesce(tax_name, '')) like '%VAT%' then 'VAT'
  when upper(coalesce(tax_code, '')) like 'WHT%'
    or upper(coalesce(tax_name, '')) like '%WITHHOLD%' then 'WITHHOLDING'
  else 'OTHER'
end
where tax_type is null or btrim(tax_type) = '';

alter table public.tax_rules
  alter column tax_type set default 'OTHER',
  alter column tax_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_rules_tax_type_chk'
      and conrelid = 'public.tax_rules'::regclass
  ) then
    alter table public.tax_rules
      add constraint tax_rules_tax_type_chk
      check (upper(tax_type) in ('VAT', 'WITHHOLDING', 'OTHER'));
  end if;
end $$;

create index if not exists tax_rules_org_type_effective_idx
  on public.tax_rules (organization_id, tax_type, tax_regime, effective_from desc nulls last)
  where is_active is true;

commit;
