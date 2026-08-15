create unique index if not exists staff_schedules_org_staff_date_unique
on public.staff_schedules (organization_id, staff_id, shift_date);

drop index if exists public.staff_schedules_org_staff_date_idx;

create or replace function public.prevent_staff_schedule_evidence_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  has_shift_evidence boolean;
  has_attendance_evidence boolean;
begin
  if not (
    old.organization_id is distinct from new.organization_id
    or old.staff_id is distinct from new.staff_id
    or old.party_id is distinct from new.party_id
    or old.shift_date is distinct from new.shift_date
    or old.start_time is distinct from new.start_time
    or old.end_time is distinct from new.end_time
    or old.shift_type is distinct from new.shift_type
    or old.status is distinct from new.status
  ) then
    return new;
  end if;

  select exists (
    select 1
    from public.staff_shifts
    where schedule_id = old.id
      and organization_id is not distinct from old.organization_id
  ) into has_shift_evidence;

  select exists (
    select 1
    from public.staff_attendance
    where schedule_id = old.id
      and organization_id is not distinct from old.organization_id
  ) into has_attendance_evidence;

  if has_shift_evidence or has_attendance_evidence then
    raise exception using
      errcode = '23514',
      message = 'staff_schedules roster fields cannot change after shift or attendance evidence exists; correct the workforce evidence instead';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_schedules_prevent_evidence_mutation
on public.staff_schedules;

create trigger staff_schedules_prevent_evidence_mutation
before update on public.staff_schedules
for each row
execute function public.prevent_staff_schedule_evidence_mutation();

revoke execute on function public.prevent_staff_schedule_evidence_mutation() from public;
revoke execute on function public.prevent_staff_schedule_evidence_mutation() from anon;
revoke execute on function public.prevent_staff_schedule_evidence_mutation() from authenticated;
