create or replace function public.prevent_schedule_over_approved_time_off()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if upper(coalesce(new.status, '')) = 'PUBLISHED'
     and exists (
       select 1
       from public.staff_time_off_requests r
       where r.organization_id = new.organization_id
         and r.staff_id = new.staff_id
         and r.status = 'APPROVED'
         and new.shift_date between r.start_date and r.end_date
     ) then
    raise exception using
      errcode = '23514',
      message = 'Published schedule conflicts with approved time off',
      detail = format('staff_id=%s shift_date=%s', new.staff_id, new.shift_date);
  end if;

  return new;
end;
$$;

drop trigger if exists staff_schedules_prevent_approved_time_off_conflict on public.staff_schedules;
create trigger staff_schedules_prevent_approved_time_off_conflict
before insert or update of organization_id, staff_id, shift_date, status
on public.staff_schedules
for each row execute function public.prevent_schedule_over_approved_time_off();

revoke all on function public.prevent_schedule_over_approved_time_off() from public, anon, authenticated;
