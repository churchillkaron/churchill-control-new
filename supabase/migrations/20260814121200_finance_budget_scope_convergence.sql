alter table public.finance_budgets
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists currency_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_budgets_entity_id_fkey'
      and conrelid = 'public.finance_budgets'::regclass
  ) then
    alter table public.finance_budgets
      add constraint finance_budgets_entity_id_fkey
      foreign key (entity_id)
      references public.legal_entities(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_budgets_period_id_fkey'
      and conrelid = 'public.finance_budgets'::regclass
  ) then
    alter table public.finance_budgets
      add constraint finance_budgets_period_id_fkey
      foreign key (period_id)
      references public.accounting_periods(id);
  end if;
end
$$;

create index if not exists finance_budgets_scope_idx
  on public.finance_budgets (organization_id, entity_id, period_id);
