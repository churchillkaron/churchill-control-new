create or replace function public.prevent_staff_schedule_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'staff_schedules rows cannot be deleted; set status to CANCELLED instead';
end;
$$;

drop trigger if exists staff_schedules_prevent_delete on public.staff_schedules;

create trigger staff_schedules_prevent_delete
before delete on public.staff_schedules
for each row
execute function public.prevent_staff_schedule_hard_delete();

revoke execute on function public.prevent_staff_schedule_hard_delete() from public;
revoke execute on function public.prevent_staff_schedule_hard_delete() from anon;
revoke execute on function public.prevent_staff_schedule_hard_delete() from authenticated;
