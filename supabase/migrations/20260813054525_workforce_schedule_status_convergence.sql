alter table public.staff_schedules
  alter column status drop default;

alter table public.staff_schedules
  add constraint staff_schedules_status_canonical
  check (
    status is not null
    and status in ('PUBLISHED', 'CANCELLED')
  ) not valid;
