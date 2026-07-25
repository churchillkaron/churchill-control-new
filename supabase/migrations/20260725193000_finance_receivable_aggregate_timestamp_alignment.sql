begin;

alter table if exists public.accounts_receivable
  add column if not exists updated_at timestamptz not null default now();

update public.accounts_receivable
set updated_at = coalesce(updated_at, now())
where updated_at is null;

comment on column public.accounts_receivable.updated_at is
  'Last mutation timestamp for the scoped Accounts Receivable aggregate.';

notify pgrst, 'reload schema';

commit;
