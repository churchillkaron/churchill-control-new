create or replace function public.prevent_staff_shift_raw_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.clock_in is distinct from old.clock_in then
    raise exception using
      errcode = '23514',
      message = 'Raw shift clock-in evidence is immutable';
  end if;

  if new.late_minutes is distinct from old.late_minutes
     or new.is_late is distinct from old.is_late then
    raise exception using
      errcode = '23514',
      message = 'Raw shift lateness evidence is immutable; record a manager correction instead';
  end if;

  if old.clock_out is not null then
    if new.clock_out is distinct from old.clock_out
       or new.worked_minutes is distinct from old.worked_minutes
       or new.overtime_minutes is distinct from old.overtime_minutes then
      raise exception using
        errcode = '23514',
        message = 'Completed raw shift evidence is immutable; record a manager correction instead';
    end if;
  elsif new.clock_out is null
        and (new.worked_minutes is distinct from old.worked_minutes
             or new.overtime_minutes is distinct from old.overtime_minutes) then
    raise exception using
      errcode = '23514',
      message = 'Raw worked and overtime minutes may only be finalized with clock-out';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_staff_attendance_raw_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.actual_start is distinct from old.actual_start then
    raise exception using
      errcode = '23514',
      message = 'Raw attendance clock-in evidence is immutable';
  end if;

  if new.late_minutes is distinct from old.late_minutes then
    raise exception using
      errcode = '23514',
      message = 'Raw attendance lateness evidence is immutable; record a manager correction instead';
  end if;

  if old.actual_end is not null and new.actual_end is distinct from old.actual_end then
    raise exception using
      errcode = '23514',
      message = 'Raw attendance clock-out evidence is immutable; record a manager correction instead';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_shifts_prevent_raw_evidence_mutation on public.staff_shifts;
create trigger staff_shifts_prevent_raw_evidence_mutation
before update on public.staff_shifts
for each row execute function public.prevent_staff_shift_raw_evidence_mutation();

drop trigger if exists staff_attendance_prevent_raw_evidence_mutation on public.staff_attendance;
create trigger staff_attendance_prevent_raw_evidence_mutation
before update on public.staff_attendance
for each row execute function public.prevent_staff_attendance_raw_evidence_mutation();

revoke all on function public.prevent_staff_shift_raw_evidence_mutation() from public, anon, authenticated;
revoke all on function public.prevent_staff_attendance_raw_evidence_mutation() from public, anon, authenticated;
