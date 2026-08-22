begin;

alter table public.finance_opening_balance_batches
  add column if not exists journal_entry_id uuid,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_opening_balance_batches_journal_fk'
      and conrelid = 'public.finance_opening_balance_batches'::regclass
  ) then
    alter table public.finance_opening_balance_batches
      add constraint finance_opening_balance_batches_journal_fk
      foreign key (journal_entry_id)
      references public.journal_entries(id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists finance_opening_balance_batches_journal_uidx
  on public.finance_opening_balance_batches (journal_entry_id)
  where journal_entry_id is not null;

commit;
