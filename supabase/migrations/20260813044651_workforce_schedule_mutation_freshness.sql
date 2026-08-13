alter table public.staff_schedules
  add column if not exists updated_at timestamptz;

update public.staff_schedules
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.staff_schedules
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists staff_schedules_set_updated_at on public.staff_schedules;

create trigger staff_schedules_set_updated_at
before update on public.staff_schedules
for each row
execute function public.set_updated_at();
