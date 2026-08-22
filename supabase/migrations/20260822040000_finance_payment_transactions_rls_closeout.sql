-- Finance close-out: payment_transactions is an active Finance payment relation.
-- Finance accesses it through authenticated server routes/repositories.

begin;

alter table if exists public.payment_transactions
  enable row level security;

notify pgrst, 'reload schema';

commit;
