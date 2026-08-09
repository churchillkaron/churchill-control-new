create unique index if not exists staff_shifts_one_open_per_staff
  on public.staff_shifts (organization_id, staff_id)
  where clock_out is null
    and organization_id is not null
    and staff_id is not null;

create index if not exists staff_shifts_schedule_idx
  on public.staff_shifts (organization_id, schedule_id)
  where schedule_id is not null;

create index if not exists staff_attendance_shift_idx
  on public.staff_attendance (organization_id, shift_id)
  where shift_id is not null;

create or replace function public.enforce_people_workforce_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_party uuid;
begin
  select active_organization_id, party_id
    into v_org, v_party
  from public.staff_accounts
  where id = new.staff_id;

  if not found then
    raise exception 'Unknown staff account %', new.staff_id;
  end if;

  if new.organization_id is null then
    new.organization_id := v_org;
  end if;

  if new.organization_id is null or v_org is null or new.organization_id <> v_org then
    raise exception 'Staff account % is not active in organization %', new.staff_id, new.organization_id;
  end if;

  if new.party_id is null then
    new.party_id := v_party;
  end if;

  if v_party is not null and new.party_id is distinct from v_party then
    raise exception 'party_id does not match staff account %', new.staff_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_schedules_enforce_people_scope on public.staff_schedules;
create trigger trg_staff_schedules_enforce_people_scope
before insert or update of staff_id, organization_id, party_id
on public.staff_schedules
for each row execute function public.enforce_people_workforce_scope();

drop trigger if exists trg_staff_shifts_enforce_people_scope on public.staff_shifts;
create trigger trg_staff_shifts_enforce_people_scope
before insert or update of staff_id, organization_id, party_id
on public.staff_shifts
for each row execute function public.enforce_people_workforce_scope();

drop trigger if exists trg_staff_attendance_enforce_people_scope on public.staff_attendance;
create trigger trg_staff_attendance_enforce_people_scope
before insert or update of staff_id, organization_id, party_id
on public.staff_attendance
for each row execute function public.enforce_people_workforce_scope();
