begin;

alter table public.tax_rules
  add column if not exists organization_id uuid,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists tax_rules_organization_scope_idx
  on public.tax_rules (organization_id, tax_regime, accounting_standard, tax_code, effective_from desc nulls last);

create unique index if not exists tax_rules_org_effective_code_uidx
  on public.tax_rules (
    organization_id,
    tax_regime,
    accounting_standard,
    tax_code,
    coalesce(effective_from, date '0001-01-01')
  )
  where organization_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_rules_rate_nonnegative_chk'
      and conrelid = 'public.tax_rules'::regclass
  ) then
    alter table public.tax_rules
      add constraint tax_rules_rate_nonnegative_chk
      check (tax_rate >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tax_rules_effective_dates_chk'
      and conrelid = 'public.tax_rules'::regclass
  ) then
    alter table public.tax_rules
      add constraint tax_rules_effective_dates_chk
      check (effective_to is null or effective_from is null or effective_to >= effective_from);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'vendor_invoice_lines_tax_rule_fk'
      and conrelid = 'public.vendor_invoice_lines'::regclass
  ) then
    alter table public.vendor_invoice_lines
      add constraint vendor_invoice_lines_tax_rule_fk
      foreign key (tax_code_id)
      references public.tax_rules(id)
      on delete restrict;
  end if;
end $$;

alter table public.tax_rules enable row level security;

revoke insert, update, delete on public.tax_rules from anon, authenticated;
grant select, insert, update, delete on public.tax_rules to service_role;

commit;
