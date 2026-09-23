-- Reconcile legacy production Hotel base schema with the current runtime contract.
-- Additive only: preserve existing production data, nullability, defaults and legacy columns.

alter table public.hotel_guests
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists passport_number text,
  add column if not exists date_of_birth date;

alter table public.hotel_housekeeping_tasks
  add column if not exists booking_id uuid references public.hotel_bookings(id) on delete set null,
  add column if not exists task_type text;

update public.hotel_housekeeping_tasks
set task_type = case
  when room_id is null then 'GENERAL'
  else 'CLEANING'
end
where task_type is null or btrim(task_type) = '';

alter table public.hotel_housekeeping_tasks
  alter column task_type set default 'CLEANING',
  alter column task_type set not null;

create index if not exists hotel_housekeeping_tasks_booking_type_idx
  on public.hotel_housekeeping_tasks (organization_id, booking_id, task_type, updated_at desc);

comment on column public.hotel_housekeeping_tasks.booking_id is
  'Canonical stay linkage for turnover and arrival-recovery Housekeeping work.';

comment on column public.hotel_housekeeping_tasks.task_type is
  'Housekeeping work classification. CLEANING is the governed room-turnover type used by Hotel readiness flows.';
