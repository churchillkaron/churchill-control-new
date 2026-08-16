begin;

create table if not exists public.employee_employment_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  staff_account_id uuid not null,
  party_id uuid not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'ACTIVE',
  source_type text not null default 'MANUAL',
  source_reference text,
  notes text,
  created_by_staff_id uuid,
  ended_by_staff_id uuid,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_employment_assignments_entity_fkey foreign key (entity_id) references public.legal_entities(id) on delete restrict,
  constraint employee_employment_assignments_staff_fkey foreign key (staff_account_id) references public.staff_accounts(id) on delete restrict,
  constraint employee_employment_assignments_party_fkey foreign key (party_id) references public.parties(id) on delete restrict,
  constraint employee_employment_assignments_created_by_fkey foreign key (created_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint employee_employment_assignments_ended_by_fkey foreign key (ended_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint employee_employment_assignments_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint employee_employment_assignments_status_check check (status in ('ACTIVE','ENDED')),
  constraint employee_employment_assignments_source_type_check check (source_type in ('MANUAL','COMPENSATION_BACKFILL')),
  constraint employee_employment_assignments_source_actor_check check (source_type <> 'MANUAL' or created_by_staff_id is not null),
  constraint employee_employment_assignments_active_end_check check (status <> 'ACTIVE' or (ended_by_staff_id is null and ended_at is null)),
  constraint employee_employment_assignments_notes_check check (notes is null or char_length(btrim(notes)) <= 1000)
);

create index if not exists employee_employment_assignments_org_entity_period_idx
  on public.employee_employment_assignments (organization_id, entity_id, effective_from, effective_to, staff_account_id);
create index if not exists employee_employment_assignments_org_staff_period_idx
  on public.employee_employment_assignments (organization_id, staff_account_id, effective_from, effective_to);
create unique index if not exists employee_employment_assignments_source_unique
  on public.employee_employment_assignments (organization_id, source_type, source_reference)
  where source_reference is not null;

create or replace function public.validate_employee_employment_assignment_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_staff_org uuid;
  v_staff_party uuid;
  v_party_org uuid;
  v_entity_org uuid;
  v_actor_org uuid;
begin
  select active_organization_id, party_id into v_staff_org, v_staff_party
  from public.staff_accounts where id = new.staff_account_id;
  if not found or v_staff_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Employment staff does not belong to organization';
  end if;
  if v_staff_party is null or v_staff_party is distinct from new.party_id then
    raise exception using errcode = '23514', message = 'Employment Party does not match staff identity';
  end if;
  select organization_id into v_party_org from public.parties where id = new.party_id;
  if not found or v_party_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Employment Party does not belong to organization';
  end if;
  select organization_id into v_entity_org from public.legal_entities where id = new.entity_id;
  if not found or v_entity_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Employment legal entity does not belong to organization';
  end if;
  if new.created_by_staff_id is not null then
    select active_organization_id into v_actor_org from public.staff_accounts where id = new.created_by_staff_id;
    if not found or v_actor_org is distinct from new.organization_id then
      raise exception using errcode = '23514', message = 'Employment creator does not belong to organization';
    end if;
  end if;
  new.status := upper(btrim(new.status));
  new.source_type := upper(btrim(new.source_type));
  new.source_reference := nullif(btrim(coalesce(new.source_reference, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create or replace function public.prevent_employee_employment_assignment_overlap()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (
    select 1 from public.employee_employment_assignments existing
    where existing.organization_id = new.organization_id
      and existing.staff_account_id = new.staff_account_id
      and existing.id is distinct from new.id
      and daterange(existing.effective_from, coalesce(existing.effective_to, date '9999-12-31'), '[]')
          && daterange(new.effective_from, coalesce(new.effective_to, date '9999-12-31'), '[]')
  ) then
    raise exception using errcode = '23514', message = 'Employee employment assignments cannot overlap across legal entities';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_employee_employment_assignment_core_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.organization_id is distinct from new.organization_id
     or old.entity_id is distinct from new.entity_id
     or old.staff_account_id is distinct from new.staff_account_id
     or old.party_id is distinct from new.party_id
     or old.effective_from is distinct from new.effective_from
     or old.source_type is distinct from new.source_type
     or old.source_reference is distinct from new.source_reference
     or old.notes is distinct from new.notes
     or old.created_by_staff_id is distinct from new.created_by_staff_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'Employment assignment evidence is immutable; end the assignment and create a new one';
  end if;
  if old.status = 'ENDED' and (
    old.status is distinct from new.status
    or old.effective_to is distinct from new.effective_to
    or old.ended_by_staff_id is distinct from new.ended_by_staff_id
    or old.ended_at is distinct from new.ended_at
  ) then
    raise exception using errcode = '23514', message = 'Ended employment assignment evidence is immutable';
  end if;
  if new.status = 'ENDED' and new.effective_to is null then
    raise exception using errcode = '23514', message = 'Ended employment assignment requires an effective end date';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_employment_assignments_validate_scope on public.employee_employment_assignments;
create trigger employee_employment_assignments_validate_scope before insert on public.employee_employment_assignments
for each row execute function public.validate_employee_employment_assignment_scope();
drop trigger if exists employee_employment_assignments_prevent_overlap on public.employee_employment_assignments;
create trigger employee_employment_assignments_prevent_overlap before insert or update of effective_to, status on public.employee_employment_assignments
for each row execute function public.prevent_employee_employment_assignment_overlap();
drop trigger if exists employee_employment_assignments_prevent_core_mutation on public.employee_employment_assignments;
create trigger employee_employment_assignments_prevent_core_mutation before update on public.employee_employment_assignments
for each row execute function public.prevent_employee_employment_assignment_core_mutation();
drop trigger if exists employee_employment_assignments_set_updated_at on public.employee_employment_assignments;
create trigger employee_employment_assignments_set_updated_at before update on public.employee_employment_assignments
for each row execute function public.set_updated_at();

create or replace function public.assign_employee_employment_entity_atomic(
  p_organization_id uuid,
  p_staff_account_id uuid,
  p_entity_id uuid,
  p_effective_from date,
  p_actor_staff_id uuid,
  p_notes text default null
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_entity public.legal_entities%rowtype;
  v_actor public.staff_accounts%rowtype;
  v_existing public.employee_employment_assignments%rowtype;
  v_created public.employee_employment_assignments%rowtype;
begin
  if p_organization_id is null or p_staff_account_id is null or p_entity_id is null then
    raise exception using errcode = '23514', message = 'organization, employee and legal entity are required';
  end if;
  if p_effective_from is null then raise exception using errcode = '23514', message = 'Employment effective date is required'; end if;
  if p_actor_staff_id is null then raise exception using errcode = '42501', message = 'Employment assignment requires an authenticated staff actor'; end if;

  select * into v_staff from public.staff_accounts
  where id = p_staff_account_id and active_organization_id = p_organization_id and active is true for update;
  if not found or v_staff.party_id is null then
    raise exception using errcode = '23514', message = 'Employee must be active with Party identity in organization';
  end if;

  select * into v_entity from public.legal_entities
  where id = p_entity_id and organization_id = p_organization_id and is_active is true;
  if not found then raise exception using errcode = '23514', message = 'Employment legal entity is not active in organization'; end if;

  select * into v_actor from public.staff_accounts
  where id = p_actor_staff_id and active_organization_id = p_organization_id and active is true;
  if not found then raise exception using errcode = '42501', message = 'Employment actor is not active in organization'; end if;

  select * into v_existing from public.employee_employment_assignments
  where organization_id = p_organization_id
    and staff_account_id = p_staff_account_id
    and effective_from <= p_effective_from
    and (effective_to is null or effective_to >= p_effective_from)
  order by effective_from desc limit 1 for update;

  if found and v_existing.entity_id = p_entity_id then
    return jsonb_build_object('success', true, 'unchanged', true, 'assignment', to_jsonb(v_existing));
  end if;

  if found then
    if v_existing.effective_from >= p_effective_from then
      raise exception using errcode = '23514', message = 'Employment transfer date must be after the current assignment start date';
    end if;
    update public.employee_employment_assignments
    set status = 'ENDED', effective_to = p_effective_from - 1, ended_by_staff_id = p_actor_staff_id,
        ended_at = now(), updated_at = now()
    where id = v_existing.id;
  end if;

  insert into public.employee_employment_assignments (
    organization_id, entity_id, staff_account_id, party_id, effective_from, effective_to,
    status, source_type, notes, created_by_staff_id
  ) values (
    p_organization_id, p_entity_id, p_staff_account_id, v_staff.party_id, p_effective_from, null,
    'ACTIVE', 'MANUAL', nullif(btrim(coalesce(p_notes, '')), ''), p_actor_staff_id
  ) returning * into v_created;

  return jsonb_build_object('success', true, 'unchanged', false, 'assignment', to_jsonb(v_created));
end;
$$;

create or replace function public.end_employee_employment_assignment_atomic(
  p_organization_id uuid,
  p_staff_account_id uuid,
  p_effective_to date,
  p_actor_staff_id uuid
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_actor public.staff_accounts%rowtype;
  v_existing public.employee_employment_assignments%rowtype;
begin
  if p_organization_id is null or p_staff_account_id is null or p_effective_to is null then
    raise exception using errcode = '23514', message = 'organization, employee and employment end date are required';
  end if;
  if p_actor_staff_id is null then raise exception using errcode = '42501', message = 'Employment end requires an authenticated staff actor'; end if;

  select * into v_staff from public.staff_accounts
  where id = p_staff_account_id and active_organization_id = p_organization_id for update;
  if not found then raise exception using errcode = '23514', message = 'Employee does not belong to organization'; end if;

  select * into v_actor from public.staff_accounts
  where id = p_actor_staff_id and active_organization_id = p_organization_id and active is true;
  if not found then raise exception using errcode = '42501', message = 'Employment actor is not active in organization'; end if;

  select * into v_existing from public.employee_employment_assignments
  where organization_id = p_organization_id and staff_account_id = p_staff_account_id
    and effective_from <= p_effective_to and (effective_to is null or effective_to >= p_effective_to)
  order by effective_from desc limit 1 for update;

  if not found then return jsonb_build_object('success', true, 'unchanged', true, 'assignment', null); end if;
  if v_existing.status = 'ENDED' then
    return jsonb_build_object('success', true, 'unchanged', true, 'assignment', to_jsonb(v_existing));
  end if;

  update public.employee_employment_assignments
  set status = 'ENDED', effective_to = p_effective_to, ended_by_staff_id = p_actor_staff_id,
      ended_at = now(), updated_at = now()
  where id = v_existing.id returning * into v_existing;

  return jsonb_build_object('success', true, 'unchanged', false, 'assignment', to_jsonb(v_existing));
end;
$$;

insert into public.employee_employment_assignments (
  organization_id, entity_id, staff_account_id, party_id, effective_from, effective_to,
  status, source_type, source_reference, notes, created_by_staff_id, created_at, updated_at
)
select
  profile.organization_id, profile.entity_id, profile.staff_account_id, staff.party_id,
  profile.effective_from, profile.effective_to,
  case when profile.effective_to is not null and profile.effective_to < current_date then 'ENDED' else 'ACTIVE' end,
  'COMPENSATION_BACKFILL', profile.id::text, null, null,
  coalesce(profile.created_at, now()), coalesce(profile.updated_at, profile.created_at, now())
from public.employee_compensation_profiles profile
join public.staff_accounts staff on staff.id = profile.staff_account_id and staff.active_organization_id = profile.organization_id
join public.legal_entities entity on entity.id = profile.entity_id and entity.organization_id = profile.organization_id
where profile.organization_id is not null and profile.entity_id is not null
  and profile.staff_account_id is not null and profile.effective_from is not null
  and staff.party_id is not null and (profile.party_id is null or profile.party_id = staff.party_id)
  and not exists (
    select 1 from public.employee_employment_assignments existing
    where existing.organization_id = profile.organization_id
      and existing.source_type = 'COMPENSATION_BACKFILL'
      and existing.source_reference = profile.id::text
  )
order by profile.organization_id, profile.staff_account_id, profile.effective_from, profile.id;

alter table public.employee_employment_assignments enable row level security;
drop policy if exists employee_employment_assignments_read on public.employee_employment_assignments;
create policy employee_employment_assignments_read on public.employee_employment_assignments
for select to authenticated using (
  staff_account_id = public.current_staff_account_id() or public.can_manage_organization(organization_id)
);
revoke insert, update, delete on public.employee_employment_assignments from anon, authenticated;
grant select on public.employee_employment_assignments to authenticated;
grant select, insert, update on public.employee_employment_assignments to service_role;
revoke all on function public.assign_employee_employment_entity_atomic(uuid, uuid, uuid, date, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_employee_employment_entity_atomic(uuid, uuid, uuid, date, uuid, text) to service_role;
revoke all on function public.end_employee_employment_assignment_atomic(uuid, uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.end_employee_employment_assignment_atomic(uuid, uuid, date, uuid) to service_role;
revoke all on function public.validate_employee_employment_assignment_scope() from public, anon, authenticated;
revoke all on function public.prevent_employee_employment_assignment_overlap() from public, anon, authenticated;
revoke all on function public.prevent_employee_employment_assignment_core_mutation() from public, anon, authenticated;

commit;
