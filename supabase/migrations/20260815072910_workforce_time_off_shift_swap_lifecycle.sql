create table if not exists public.staff_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  party_id uuid,
  leave_type text not null,
  attendance_classification text not null default 'APPROVED_LEAVE',
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'PENDING',
  requested_at timestamptz not null default now(),
  reviewed_by_staff_id uuid,
  reviewed_by_party_id uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_time_off_requests_staff_fkey foreign key (staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_time_off_requests_reviewer_fkey foreign key (reviewed_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_time_off_requests_date_check check (end_date >= start_date),
  constraint staff_time_off_requests_span_check check ((end_date - start_date) <= 366),
  constraint staff_time_off_requests_leave_type_check check (char_length(btrim(leave_type)) between 2 and 80),
  constraint staff_time_off_requests_reason_check check (char_length(btrim(reason)) between 3 and 1000),
  constraint staff_time_off_requests_classification_check check (attendance_classification in ('APPROVED_LEAVE', 'SICK_LEAVE')),
  constraint staff_time_off_requests_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

create table if not exists public.staff_shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  schedule_id uuid not null,
  requester_staff_id uuid not null,
  requester_party_id uuid,
  target_staff_id uuid not null,
  target_party_id uuid,
  shift_date date not null,
  start_time text not null,
  end_time text not null,
  reason text not null,
  status text not null default 'PENDING_TARGET',
  requested_at timestamptz not null default now(),
  target_response_notes text,
  target_responded_at timestamptz,
  reviewed_by_staff_id uuid,
  reviewed_by_party_id uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_shift_swap_requests_schedule_fkey foreign key (schedule_id) references public.staff_schedules(id) on delete restrict,
  constraint staff_shift_swap_requests_requester_fkey foreign key (requester_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_shift_swap_requests_target_fkey foreign key (target_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_shift_swap_requests_reviewer_fkey foreign key (reviewed_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_shift_swap_requests_distinct_staff_check check (requester_staff_id <> target_staff_id),
  constraint staff_shift_swap_requests_time_check check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint staff_shift_swap_requests_reason_check check (char_length(btrim(reason)) between 3 and 1000),
  constraint staff_shift_swap_requests_status_check check (status in ('PENDING_TARGET', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED'))
);

create unique index if not exists staff_time_off_requests_exact_active_unique on public.staff_time_off_requests (organization_id, staff_id, start_date, end_date) where status in ('PENDING', 'APPROVED');
create index if not exists staff_time_off_requests_org_staff_dates_idx on public.staff_time_off_requests (organization_id, staff_id, start_date, end_date, status);
create index if not exists staff_time_off_requests_org_status_idx on public.staff_time_off_requests (organization_id, status, start_date, end_date);
create unique index if not exists staff_shift_swap_requests_active_schedule_unique on public.staff_shift_swap_requests (organization_id, schedule_id) where status in ('PENDING_TARGET', 'PENDING_MANAGER');
create index if not exists staff_shift_swap_requests_org_requester_idx on public.staff_shift_swap_requests (organization_id, requester_staff_id, requested_at desc);
create index if not exists staff_shift_swap_requests_org_target_idx on public.staff_shift_swap_requests (organization_id, target_staff_id, requested_at desc);
create index if not exists staff_shift_swap_requests_org_status_idx on public.staff_shift_swap_requests (organization_id, status, shift_date);

create or replace function public.validate_staff_time_off_request_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_party uuid;
begin
  select active_organization_id, party_id into v_org, v_party from public.staff_accounts where id = new.staff_id;
  if not found or v_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Time-off request staff does not belong to organization';
  end if;
  if new.party_id is null then new.party_id := v_party;
  elsif v_party is not null and new.party_id is distinct from v_party then
    raise exception using errcode = '23514', message = 'Time-off request party does not match staff identity';
  end if;
  new.leave_type := btrim(new.leave_type);
  new.reason := btrim(new.reason);
  new.review_notes := nullif(btrim(coalesce(new.review_notes, '')), '');
  return new;
end;
$$;

create or replace function public.validate_staff_shift_swap_request_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_requester_org uuid; v_requester_party uuid; v_target_org uuid; v_target_party uuid; v_schedule public.staff_schedules%rowtype;
begin
  select active_organization_id, party_id into v_requester_org, v_requester_party from public.staff_accounts where id = new.requester_staff_id;
  select active_organization_id, party_id into v_target_org, v_target_party from public.staff_accounts where id = new.target_staff_id;
  if v_requester_org is distinct from new.organization_id or v_target_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Shift-swap participants must belong to the same organization';
  end if;
  select * into v_schedule from public.staff_schedules where id = new.schedule_id and organization_id = new.organization_id;
  if not found then raise exception using errcode = '23514', message = 'Shift-swap schedule does not belong to organization'; end if;
  if v_schedule.staff_id is distinct from new.requester_staff_id or v_schedule.shift_date is distinct from new.shift_date or v_schedule.start_time is distinct from new.start_time or v_schedule.end_time is distinct from new.end_time then
    raise exception using errcode = '23514', message = 'Shift-swap snapshot does not match published schedule';
  end if;
  if new.requester_party_id is null then new.requester_party_id := v_requester_party;
  elsif v_requester_party is not null and new.requester_party_id is distinct from v_requester_party then raise exception using errcode = '23514', message = 'Shift-swap requester party does not match staff identity'; end if;
  if new.target_party_id is null then new.target_party_id := v_target_party;
  elsif v_target_party is not null and new.target_party_id is distinct from v_target_party then raise exception using errcode = '23514', message = 'Shift-swap target party does not match staff identity'; end if;
  new.reason := btrim(new.reason);
  new.target_response_notes := nullif(btrim(coalesce(new.target_response_notes, '')), '');
  new.review_notes := nullif(btrim(coalesce(new.review_notes, '')), '');
  return new;
end;
$$;

create or replace function public.prevent_staff_time_off_request_core_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.organization_id is distinct from new.organization_id or old.staff_id is distinct from new.staff_id or old.party_id is distinct from new.party_id or old.leave_type is distinct from new.leave_type or old.attendance_classification is distinct from new.attendance_classification or old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date or old.reason is distinct from new.reason or old.requested_at is distinct from new.requested_at or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'Time-off request evidence is immutable; cancel and create a new request';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_staff_shift_swap_request_core_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.organization_id is distinct from new.organization_id or old.schedule_id is distinct from new.schedule_id or old.requester_staff_id is distinct from new.requester_staff_id or old.requester_party_id is distinct from new.requester_party_id or old.target_staff_id is distinct from new.target_staff_id or old.target_party_id is distinct from new.target_party_id or old.shift_date is distinct from new.shift_date or old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time or old.reason is distinct from new.reason or old.requested_at is distinct from new.requested_at or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'Shift-swap request evidence is immutable; cancel and create a new request';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_staff_workforce_request_delete()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception using errcode = '23514', message = 'Workforce request history is append/lifecycle evidence and cannot be deleted';
end;
$$;

drop trigger if exists staff_time_off_requests_validate_scope on public.staff_time_off_requests;
create trigger staff_time_off_requests_validate_scope before insert or update of staff_id, organization_id, party_id, leave_type, reason, review_notes on public.staff_time_off_requests for each row execute function public.validate_staff_time_off_request_scope();
drop trigger if exists staff_time_off_requests_prevent_core_mutation on public.staff_time_off_requests;
create trigger staff_time_off_requests_prevent_core_mutation before update on public.staff_time_off_requests for each row execute function public.prevent_staff_time_off_request_core_mutation();
drop trigger if exists staff_time_off_requests_set_updated_at on public.staff_time_off_requests;
create trigger staff_time_off_requests_set_updated_at before update on public.staff_time_off_requests for each row execute function public.set_updated_at();
drop trigger if exists staff_time_off_requests_prevent_delete on public.staff_time_off_requests;
create trigger staff_time_off_requests_prevent_delete before delete on public.staff_time_off_requests for each row execute function public.prevent_staff_workforce_request_delete();

drop trigger if exists staff_shift_swap_requests_validate_scope on public.staff_shift_swap_requests;
create trigger staff_shift_swap_requests_validate_scope before insert or update of organization_id, schedule_id, requester_staff_id, requester_party_id, target_staff_id, target_party_id, shift_date, start_time, end_time, reason, target_response_notes, review_notes on public.staff_shift_swap_requests for each row execute function public.validate_staff_shift_swap_request_scope();
drop trigger if exists staff_shift_swap_requests_prevent_core_mutation on public.staff_shift_swap_requests;
create trigger staff_shift_swap_requests_prevent_core_mutation before update on public.staff_shift_swap_requests for each row execute function public.prevent_staff_shift_swap_request_core_mutation();
drop trigger if exists staff_shift_swap_requests_set_updated_at on public.staff_shift_swap_requests;
create trigger staff_shift_swap_requests_set_updated_at before update on public.staff_shift_swap_requests for each row execute function public.set_updated_at();
drop trigger if exists staff_shift_swap_requests_prevent_delete on public.staff_shift_swap_requests;
create trigger staff_shift_swap_requests_prevent_delete before delete on public.staff_shift_swap_requests for each row execute function public.prevent_staff_workforce_request_delete();

create or replace function public.approve_staff_shift_swap_atomic(p_organization_id uuid, p_request_id uuid, p_manager_staff_id uuid, p_review_notes text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_request public.staff_shift_swap_requests%rowtype; v_schedule public.staff_schedules%rowtype; v_target public.staff_accounts%rowtype; v_manager public.staff_accounts%rowtype; v_conflict uuid; v_now timestamptz := now();
begin
  select * into v_request from public.staff_shift_swap_requests where id = p_request_id and organization_id = p_organization_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Shift-swap request not found'; end if;
  if v_request.status <> 'PENDING_MANAGER' then raise exception using errcode = '23514', message = 'Shift swap is not waiting for manager approval'; end if;
  select * into v_manager from public.staff_accounts where id = p_manager_staff_id and active_organization_id = p_organization_id and active is true;
  if not found then raise exception using errcode = '23514', message = 'Manager does not belong to organization'; end if;
  select * into v_target from public.staff_accounts where id = v_request.target_staff_id and active_organization_id = p_organization_id and active is true;
  if not found then raise exception using errcode = '23514', message = 'Replacement staff is no longer active in organization'; end if;
  select * into v_schedule from public.staff_schedules where id = v_request.schedule_id and organization_id = p_organization_id for update;
  if not found or v_schedule.status <> 'PUBLISHED' or v_schedule.staff_id is distinct from v_request.requester_staff_id or v_schedule.shift_date is distinct from v_request.shift_date or v_schedule.start_time is distinct from v_request.start_time or v_schedule.end_time is distinct from v_request.end_time then
    raise exception using errcode = '23514', message = 'Published schedule changed after swap request; review current roster';
  end if;
  if exists (select 1 from public.staff_shifts where organization_id = p_organization_id and schedule_id = v_schedule.id) or exists (select 1 from public.staff_attendance where organization_id = p_organization_id and schedule_id = v_schedule.id) then
    raise exception using errcode = '23514', message = 'Schedule already has workforce evidence and cannot be swapped';
  end if;
  select id into v_conflict from public.staff_schedules where organization_id = p_organization_id and staff_id = v_request.target_staff_id and shift_date = v_request.shift_date and id <> v_schedule.id limit 1;
  if v_conflict is not null then raise exception using errcode = '23505', message = 'Replacement staff already has a roster row on this date'; end if;
  update public.staff_schedules set staff_id = v_target.id, party_id = v_target.party_id, staff_name = coalesce(nullif(v_target.name, ''), v_target.email, 'Staff'), role = coalesce(v_target.role, v_target.position), department = v_target.department, created_by = p_manager_staff_id where id = v_schedule.id and organization_id = p_organization_id;
  update public.staff_shift_swap_requests set status = 'APPROVED', reviewed_by_staff_id = p_manager_staff_id, reviewed_by_party_id = v_manager.party_id, reviewed_at = v_now, review_notes = nullif(btrim(coalesce(p_review_notes, '')), '') where id = v_request.id and organization_id = p_organization_id;
  return jsonb_build_object('request_id', v_request.id, 'schedule_id', v_schedule.id, 'status', 'APPROVED', 'requester_staff_id', v_request.requester_staff_id, 'target_staff_id', v_request.target_staff_id, 'shift_date', v_request.shift_date, 'reviewed_at', v_now);
end;
$$;

alter table public.staff_time_off_requests enable row level security;
alter table public.staff_shift_swap_requests enable row level security;
drop policy if exists staff_time_off_requests_read on public.staff_time_off_requests;
create policy staff_time_off_requests_read on public.staff_time_off_requests for select to authenticated using (staff_id = public.current_staff_account_id() or public.can_manage_organization(organization_id));
drop policy if exists staff_shift_swap_requests_read on public.staff_shift_swap_requests;
create policy staff_shift_swap_requests_read on public.staff_shift_swap_requests for select to authenticated using (requester_staff_id = public.current_staff_account_id() or target_staff_id = public.current_staff_account_id() or public.can_manage_organization(organization_id));
revoke insert, update, delete on public.staff_time_off_requests from anon, authenticated;
revoke insert, update, delete on public.staff_shift_swap_requests from anon, authenticated;
grant select on public.staff_time_off_requests to authenticated;
grant select on public.staff_shift_swap_requests to authenticated;
grant select, insert, update on public.staff_time_off_requests to service_role;
grant select, insert, update on public.staff_shift_swap_requests to service_role;
grant execute on function public.approve_staff_shift_swap_atomic(uuid, uuid, uuid, text) to service_role;
revoke all on function public.approve_staff_shift_swap_atomic(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.validate_staff_time_off_request_scope() from public, anon, authenticated;
revoke all on function public.validate_staff_shift_swap_request_scope() from public, anon, authenticated;
revoke all on function public.prevent_staff_time_off_request_core_mutation() from public, anon, authenticated;
revoke all on function public.prevent_staff_shift_swap_request_core_mutation() from public, anon, authenticated;
revoke all on function public.prevent_staff_workforce_request_delete() from public, anon, authenticated;
