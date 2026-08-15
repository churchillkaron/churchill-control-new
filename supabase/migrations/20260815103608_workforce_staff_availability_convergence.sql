create table if not exists public.staff_availability_patterns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  party_id uuid,
  weekday smallint not null,
  availability_type text not null default 'AVAILABLE',
  start_time text,
  end_time text,
  effective_from date not null,
  effective_to date,
  notes text,
  status text not null default 'ACTIVE',
  created_by_staff_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_availability_patterns_staff_fkey foreign key (staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_availability_patterns_creator_fkey foreign key (created_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_availability_patterns_weekday_check check (weekday between 0 and 6),
  constraint staff_availability_patterns_type_check check (availability_type in ('AVAILABLE', 'UNAVAILABLE')),
  constraint staff_availability_patterns_status_check check (status in ('ACTIVE', 'SUPERSEDED')),
  constraint staff_availability_patterns_effective_check check (effective_to is null or effective_to >= effective_from),
  constraint staff_availability_patterns_time_pair_check check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null)),
  constraint staff_availability_patterns_start_time_check check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint staff_availability_patterns_end_time_check check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint staff_availability_patterns_notes_check check (notes is null or char_length(btrim(notes)) <= 1000)
);

create table if not exists public.staff_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  party_id uuid,
  exception_date date not null,
  availability_type text not null,
  start_time text,
  end_time text,
  notes text,
  status text not null default 'ACTIVE',
  created_by_staff_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_availability_exceptions_staff_fkey foreign key (staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_availability_exceptions_creator_fkey foreign key (created_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint staff_availability_exceptions_type_check check (availability_type in ('AVAILABLE', 'UNAVAILABLE')),
  constraint staff_availability_exceptions_status_check check (status in ('ACTIVE', 'CANCELLED')),
  constraint staff_availability_exceptions_time_pair_check check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null)),
  constraint staff_availability_exceptions_start_time_check check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint staff_availability_exceptions_end_time_check check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint staff_availability_exceptions_notes_check check (notes is null or char_length(btrim(notes)) <= 1000)
);

create index if not exists staff_availability_patterns_org_staff_effective_idx on public.staff_availability_patterns (organization_id, staff_id, weekday, effective_from, effective_to) where status = 'ACTIVE';
create unique index if not exists staff_availability_patterns_exact_active_unique on public.staff_availability_patterns (organization_id, staff_id, weekday, availability_type, effective_from, coalesce(start_time, ''), coalesce(end_time, '')) where status = 'ACTIVE';
create index if not exists staff_availability_exceptions_org_staff_date_idx on public.staff_availability_exceptions (organization_id, staff_id, exception_date) where status = 'ACTIVE';
create unique index if not exists staff_availability_exceptions_exact_active_unique on public.staff_availability_exceptions (organization_id, staff_id, exception_date, availability_type, coalesce(start_time, ''), coalesce(end_time, '')) where status = 'ACTIVE';

create or replace function public.validate_staff_availability_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_party uuid; v_actor_org uuid;
begin
  select active_organization_id, party_id into v_org, v_party from public.staff_accounts where id = new.staff_id and active is true;
  if not found or v_org is distinct from new.organization_id then raise exception using errcode = '23514', message = 'Availability staff does not belong to organization'; end if;
  if new.party_id is null then new.party_id := v_party;
  elsif v_party is not null and new.party_id is distinct from v_party then raise exception using errcode = '23514', message = 'Availability party does not match staff identity'; end if;
  select active_organization_id into v_actor_org from public.staff_accounts where id = new.created_by_staff_id and active is true;
  if not found or v_actor_org is distinct from new.organization_id then raise exception using errcode = '23514', message = 'Availability actor does not belong to organization'; end if;
  new.availability_type := upper(btrim(new.availability_type));
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create or replace function public.prevent_staff_availability_pattern_core_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.organization_id is distinct from new.organization_id or old.staff_id is distinct from new.staff_id or old.party_id is distinct from new.party_id or old.weekday is distinct from new.weekday or old.availability_type is distinct from new.availability_type or old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time or old.effective_from is distinct from new.effective_from or old.notes is distinct from new.notes or old.created_by_staff_id is distinct from new.created_by_staff_id or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'Availability pattern evidence is immutable; create a new effective pattern instead';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_staff_availability_exception_core_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.organization_id is distinct from new.organization_id or old.staff_id is distinct from new.staff_id or old.party_id is distinct from new.party_id or old.exception_date is distinct from new.exception_date or old.availability_type is distinct from new.availability_type or old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time or old.notes is distinct from new.notes or old.created_by_staff_id is distinct from new.created_by_staff_id or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'Availability exception evidence is immutable; cancel and create a new exception';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_availability_patterns_validate_scope on public.staff_availability_patterns;
create trigger staff_availability_patterns_validate_scope before insert or update of organization_id, staff_id, party_id, availability_type, notes, created_by_staff_id on public.staff_availability_patterns for each row execute function public.validate_staff_availability_scope();
drop trigger if exists staff_availability_patterns_prevent_core_mutation on public.staff_availability_patterns;
create trigger staff_availability_patterns_prevent_core_mutation before update on public.staff_availability_patterns for each row execute function public.prevent_staff_availability_pattern_core_mutation();
drop trigger if exists staff_availability_patterns_set_updated_at on public.staff_availability_patterns;
create trigger staff_availability_patterns_set_updated_at before update on public.staff_availability_patterns for each row execute function public.set_updated_at();
drop trigger if exists staff_availability_exceptions_validate_scope on public.staff_availability_exceptions;
create trigger staff_availability_exceptions_validate_scope before insert or update of organization_id, staff_id, party_id, availability_type, notes, created_by_staff_id on public.staff_availability_exceptions for each row execute function public.validate_staff_availability_scope();
drop trigger if exists staff_availability_exceptions_prevent_core_mutation on public.staff_availability_exceptions;
create trigger staff_availability_exceptions_prevent_core_mutation before update on public.staff_availability_exceptions for each row execute function public.prevent_staff_availability_exception_core_mutation();
drop trigger if exists staff_availability_exceptions_set_updated_at on public.staff_availability_exceptions;
create trigger staff_availability_exceptions_set_updated_at before update on public.staff_availability_exceptions for each row execute function public.set_updated_at();

create or replace function public.replace_staff_availability_pattern(p_organization_id uuid, p_staff_id uuid, p_effective_from date, p_rules jsonb, p_actor_staff_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_staff public.staff_accounts%rowtype; v_actor public.staff_accounts%rowtype; v_rule jsonb; v_weekday integer; v_type text; v_start text; v_end text; v_notes text; v_inserted integer := 0; v_closed integer := 0; v_superseded integer := 0;
begin
  if p_effective_from is null then raise exception using errcode = '23514', message = 'Availability effective date is required'; end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then raise exception using errcode = '23514', message = 'Availability rules must be a JSON array'; end if;
  if jsonb_array_length(p_rules) > 28 then raise exception using errcode = '23514', message = 'Availability pattern supports at most 28 weekly rules'; end if;
  select * into v_staff from public.staff_accounts where id = p_staff_id and active_organization_id = p_organization_id and active is true;
  if not found then raise exception using errcode = '23514', message = 'Availability staff is not active in organization'; end if;
  select * into v_actor from public.staff_accounts where id = p_actor_staff_id and active_organization_id = p_organization_id and active is true;
  if not found or v_actor.id is distinct from v_staff.id then raise exception using errcode = '42501', message = 'Staff may update only their own availability pattern'; end if;
  update public.staff_availability_patterns set effective_to = p_effective_from - 1 where organization_id = p_organization_id and staff_id = p_staff_id and status = 'ACTIVE' and effective_from < p_effective_from and (effective_to is null or effective_to >= p_effective_from);
  get diagnostics v_closed = row_count;
  update public.staff_availability_patterns set status = 'SUPERSEDED' where organization_id = p_organization_id and staff_id = p_staff_id and status = 'ACTIVE' and effective_from >= p_effective_from;
  get diagnostics v_superseded = row_count;
  for v_rule in select value from jsonb_array_elements(p_rules) loop
    if coalesce(v_rule->>'weekday', '') !~ '^[0-6]$' then raise exception using errcode = '23514', message = 'Availability weekday must be between 0 and 6'; end if;
    v_weekday := (v_rule->>'weekday')::integer;
    v_type := upper(btrim(coalesce(v_rule->>'availabilityType', v_rule->>'availability_type', '')));
    v_start := nullif(btrim(coalesce(v_rule->>'startTime', v_rule->>'start_time', '')), '');
    v_end := nullif(btrim(coalesce(v_rule->>'endTime', v_rule->>'end_time', '')), '');
    v_notes := nullif(btrim(coalesce(v_rule->>'notes', '')), '');
    if v_type not in ('AVAILABLE', 'UNAVAILABLE') then raise exception using errcode = '23514', message = 'Availability type must be AVAILABLE or UNAVAILABLE'; end if;
    if (v_start is null) <> (v_end is null) then raise exception using errcode = '23514', message = 'Availability start and end times must be supplied together'; end if;
    if v_start is not null and (v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception using errcode = '23514', message = 'Availability times must use HH:MM format'; end if;
    if v_notes is not null and char_length(v_notes) > 1000 then raise exception using errcode = '23514', message = 'Availability notes are too long'; end if;
    insert into public.staff_availability_patterns (organization_id, staff_id, party_id, weekday, availability_type, start_time, end_time, effective_from, effective_to, notes, status, created_by_staff_id)
    values (p_organization_id, v_staff.id, v_staff.party_id, v_weekday, v_type, v_start, v_end, p_effective_from, null, v_notes, 'ACTIVE', p_actor_staff_id);
    v_inserted := v_inserted + 1;
  end loop;
  return jsonb_build_object('organization_id', p_organization_id, 'staff_id', p_staff_id, 'effective_from', p_effective_from, 'inserted_rules', v_inserted, 'closed_rules', v_closed, 'superseded_rules', v_superseded);
end;
$$;

alter table public.staff_availability_patterns enable row level security;
alter table public.staff_availability_exceptions enable row level security;
drop policy if exists staff_availability_patterns_read on public.staff_availability_patterns;
create policy staff_availability_patterns_read on public.staff_availability_patterns for select to authenticated using (staff_id = public.current_staff_account_id() or public.can_manage_organization(organization_id));
drop policy if exists staff_availability_exceptions_read on public.staff_availability_exceptions;
create policy staff_availability_exceptions_read on public.staff_availability_exceptions for select to authenticated using (staff_id = public.current_staff_account_id() or public.can_manage_organization(organization_id));
revoke insert, update, delete on public.staff_availability_patterns from anon, authenticated;
revoke insert, update, delete on public.staff_availability_exceptions from anon, authenticated;
grant select on public.staff_availability_patterns to authenticated;
grant select on public.staff_availability_exceptions to authenticated;
grant select, insert, update on public.staff_availability_patterns to service_role;
grant select, insert, update on public.staff_availability_exceptions to service_role;
revoke all on function public.replace_staff_availability_pattern(uuid, uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_staff_availability_pattern(uuid, uuid, date, jsonb, uuid) to service_role;

alter table public.staff_schedules
  add column if not exists availability_override_by_staff_id uuid,
  add column if not exists availability_override_at timestamptz,
  add column if not exists availability_override_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_schedules_availability_override_by_fkey' and conrelid = 'public.staff_schedules'::regclass) then
    alter table public.staff_schedules add constraint staff_schedules_availability_override_by_fkey foreign key (availability_override_by_staff_id) references public.staff_accounts(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_schedules_availability_override_check' and conrelid = 'public.staff_schedules'::regclass) then
    alter table public.staff_schedules add constraint staff_schedules_availability_override_check check ((availability_override_by_staff_id is null and availability_override_at is null and availability_override_reason is null) or (availability_override_by_staff_id is not null and availability_override_at is not null and availability_override_reason is not null and char_length(btrim(availability_override_reason)) between 3 and 1000)) not valid;
  end if;
end
$$;
