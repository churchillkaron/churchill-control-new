-- POS cash sessions cannot be opened or closed.
--
-- POSCashSessionAdapter inserts staff_id, staff_name and updated_at into
-- public.pos_shifts, and updates updated_at when closing. Postgres reports all
-- three as absent:
--
--   column pos_shifts.staff_id does not exist
--   column pos_shifts.staff_name does not exist
--   column pos_shifts.updated_at does not exist
--
-- so every open fails on three columns and every close fails on updated_at, with
-- undefined_column (42703), for every POS application. Because retail cash
-- checkout gates on an open cash session (settlement.ready), this also blocks
-- retail settlement.
--
-- public.pos_shifts predates this migration history and no migration has ever
-- created these columns, so this path has never worked rather than having
-- regressed. The adapter already reads opening_cash and closing_cash correctly,
-- which is why the read path behaves while the write path does not.
--
-- Staff attribution on a till is a financial control and belongs on the row, so
-- the schema is aligned to the adapter rather than the attribution removed.

alter table public.pos_shifts
  add column if not exists staff_id uuid,
  add column if not exists staff_name text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists pos_shifts_staff_idx
  on public.pos_shifts (organization_id, staff_id);

comment on column public.pos_shifts.staff_id is
  'Staff account or user that opened the cash session, for till accountability.';
comment on column public.pos_shifts.staff_name is
  'Denormalised operator name captured when the session was opened.';
