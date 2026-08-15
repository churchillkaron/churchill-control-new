create table if not exists public.staff_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  party_id uuid,
  shift_id uuid not null,
  schedule_id uuid,
  correction_no integer not null,
  supersedes_correction_id uuid,
  raw_clock_in timestamptz not null,
  raw_clock_out timestamptz not null,
  raw_worked_minutes integer not null default 0,
  raw_overtime_minutes integer not null default 0,
  raw_late_minutes integer not null default 0,
  corrected_clock_in timestamptz not null,
  corrected_clock_out timestamptz not null,
  corrected_worked_minutes integer not null,
  corrected_overtime_minutes integer not null default 0,
  corrected_late_minutes integer not null default 0,
  corrected_is_late boolean,
  late_threshold_minutes integer,
  correction_reason text not null,
  approved_by_staff_id uuid not null,
  approved_by_party_id uuid,
  approved_by_name text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint staff_attendance_corrections_staff_fkey
    foreign key (staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_attendance_corrections_shift_fkey
    foreign key (shift_id) references public.staff_shifts(id) on delete restrict,
  constraint staff_attendance_corrections_schedule_fkey
    foreign key (schedule_id) references public.staff_schedules(id) on delete restrict,
  constraint staff_attendance_corrections_approver_fkey
    foreign key (approved_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_attendance_corrections_supersedes_fkey
    foreign key (supersedes_correction_id) references public.staff_attendance_corrections(id) on delete restrict,
  constraint staff_attendance_corrections_reason_check
    check (char_length(btrim(correction_reason)) between 3 and 1000),
  constraint staff_attendance_corrections_worked_check
    check (corrected_worked_minutes > 0 and corrected_worked_minutes <= 2160),
  constraint staff_attendance_corrections_overtime_check
    check (corrected_overtime_minutes >= 0),
  constraint staff_attendance_corrections_late_check
    check (corrected_late_minutes >= 0),
  constraint staff_attendance_corrections_threshold_check
    check (late_threshold_minutes is null or late_threshold_minutes >= 0),
  constraint staff_attendance_corrections_time_order_check
    check (corrected_clock_out > corrected_clock_in),
  constraint staff_attendance_corrections_unique_revision
    unique (organization_id, shift_id, correction_no),
  constraint staff_attendance_corrections_supersedes_unique
    unique (supersedes_correction_id)
);

create index if not exists staff_attendance_corrections_org_staff_time_idx
  on public.staff_attendance_corrections (organization_id, staff_id, approved_at desc);

create index if not exists staff_attendance_corrections_org_shift_time_idx
  on public.staff_attendance_corrections (organization_id, shift_id, correction_no desc);

create or replace function public.validate_staff_attendance_correction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shift public.staff_shifts%rowtype;
  v_manager_org uuid;
  v_manager_party uuid;
  v_latest public.staff_attendance_corrections%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || new.shift_id::text, 0));

  select *
    into v_shift
  from public.staff_shifts
  where id = new.shift_id
    and organization_id = new.organization_id
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction shift does not belong to organization';
  end if;

  if v_shift.clock_out is null
     or (upper(coalesce(v_shift.shift_status, '')) <> 'COMPLETED' and v_shift.clock_out is null) then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction requires completed raw shift evidence';
  end if;

  if v_shift.is_valid is false
     or upper(coalesce(v_shift.approval_status, '')) in ('PENDING', 'REJECTED') then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction requires approved shift evidence';
  end if;

  if new.staff_id is distinct from v_shift.staff_id
     or new.party_id is distinct from v_shift.party_id
     or new.schedule_id is distinct from v_shift.schedule_id then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction workforce scope does not match shift evidence';
  end if;

  if new.raw_clock_in is distinct from v_shift.clock_in
     or new.raw_clock_out is distinct from v_shift.clock_out
     or new.raw_worked_minutes is distinct from coalesce(v_shift.worked_minutes, 0)
     or new.raw_overtime_minutes is distinct from coalesce(v_shift.overtime_minutes, 0)
     or new.raw_late_minutes is distinct from coalesce(v_shift.late_minutes, 0) then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction raw snapshot must equal immutable shift evidence';
  end if;

  select active_organization_id, party_id
    into v_manager_org, v_manager_party
  from public.staff_accounts
  where id = new.approved_by_staff_id;

  if not found or v_manager_org is distinct from new.organization_id then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction approver does not belong to organization';
  end if;

  if new.approved_by_party_id is null then
    new.approved_by_party_id := v_manager_party;
  elsif v_manager_party is not null and new.approved_by_party_id is distinct from v_manager_party then
    raise exception using
      errcode = '23514',
      message = 'Attendance correction approver party does not match staff identity';
  end if;

  select *
    into v_latest
  from public.staff_attendance_corrections
  where organization_id = new.organization_id
    and shift_id = new.shift_id
  order by correction_no desc
  limit 1;

  if found then
    if new.supersedes_correction_id is distinct from v_latest.id then
      raise exception using
        errcode = '23514',
        message = 'Attendance correction must supersede the latest correction revision';
    end if;
    new.correction_no := v_latest.correction_no + 1;
  else
    if new.supersedes_correction_id is not null then
      raise exception using
        errcode = '23514',
        message = 'First attendance correction cannot supersede another correction';
    end if;
    new.correction_no := 1;
  end if;

  new.correction_reason := btrim(new.correction_reason);
  new.approved_by_name := btrim(new.approved_by_name);
  new.approved_at := coalesce(new.approved_at, now());
  new.created_at := coalesce(new.created_at, now());

  return new;
end;
$$;

create or replace function public.prevent_staff_attendance_correction_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'Attendance correction evidence is append-only';
end;
$$;

drop trigger if exists staff_attendance_corrections_validate_insert
  on public.staff_attendance_corrections;
create trigger staff_attendance_corrections_validate_insert
before insert on public.staff_attendance_corrections
for each row execute function public.validate_staff_attendance_correction();

drop trigger if exists staff_attendance_corrections_prevent_mutation
  on public.staff_attendance_corrections;
create trigger staff_attendance_corrections_prevent_mutation
before update or delete on public.staff_attendance_corrections
for each row execute function public.prevent_staff_attendance_correction_mutation();

alter table public.staff_attendance_corrections enable row level security;

drop policy if exists staff_attendance_corrections_read
  on public.staff_attendance_corrections;
create policy staff_attendance_corrections_read
on public.staff_attendance_corrections
for select
to authenticated
using (
  staff_id = public.current_staff_account_id()
  or public.can_manage_organization(organization_id)
);

drop policy if exists staff_attendance_corrections_manage
  on public.staff_attendance_corrections;
create policy staff_attendance_corrections_manage
on public.staff_attendance_corrections
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

revoke update, delete on public.staff_attendance_corrections from anon, authenticated;
grant select on public.staff_attendance_corrections to authenticated;
grant insert on public.staff_attendance_corrections to authenticated;

revoke all on function public.validate_staff_attendance_correction() from public, anon, authenticated;
revoke all on function public.prevent_staff_attendance_correction_mutation() from public, anon, authenticated;
