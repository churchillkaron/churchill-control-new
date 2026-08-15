create or replace function public.prevent_overlapping_staff_time_off_requests()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('PENDING', 'APPROVED')
     and exists (
       select 1
       from public.staff_time_off_requests r
       where r.organization_id = new.organization_id
         and r.staff_id = new.staff_id
         and r.id <> new.id
         and r.status in ('PENDING', 'APPROVED')
         and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
     ) then
    raise exception using
      errcode = '23505',
      message = 'Staff member already has an overlapping active time-off request';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_time_off_requests_prevent_overlap on public.staff_time_off_requests;
create trigger staff_time_off_requests_prevent_overlap
before insert or update of organization_id, staff_id, start_date, end_date, status
on public.staff_time_off_requests
for each row execute function public.prevent_overlapping_staff_time_off_requests();

revoke all on function public.prevent_overlapping_staff_time_off_requests() from public, anon, authenticated;
