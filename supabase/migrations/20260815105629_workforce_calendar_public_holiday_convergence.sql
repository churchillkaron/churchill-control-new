create table if not exists public.workforce_calendar_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  calendar_date date not null,
  day_type text not null,
  name text not null,
  notes text,
  source_type text not null default 'MANUAL',
  source_reference text,
  status text not null default 'ACTIVE',
  created_by_staff_id uuid not null,
  created_by_party_id uuid,
  cancelled_by_staff_id uuid,
  cancelled_by_party_id uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workforce_calendar_days_entity_fkey foreign key (entity_id) references public.legal_entities(id) on delete restrict,
  constraint workforce_calendar_days_creator_fkey foreign key (created_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint workforce_calendar_days_canceller_fkey foreign key (cancelled_by_staff_id) references public.staff_accounts(id) on delete restrict,
  constraint workforce_calendar_days_type_check check (day_type in ('PUBLIC_HOLIDAY','ORGANIZATION_CLOSURE','WORKING_DAY_OVERRIDE')),
  constraint workforce_calendar_days_source_check check (source_type in ('MANUAL','IMPORT','AUTHORITY')),
  constraint workforce_calendar_days_status_check check (status in ('ACTIVE','CANCELLED')),
  constraint workforce_calendar_days_name_check check (char_length(btrim(name)) between 2 and 160),
  constraint workforce_calendar_days_notes_check check (notes is null or char_length(btrim(notes)) <= 1000),
  constraint workforce_calendar_days_source_reference_check check (source_reference is null or char_length(btrim(source_reference)) <= 500),
  constraint workforce_calendar_days_cancel_check check ((status = 'ACTIVE' and cancelled_by_staff_id is null and cancelled_at is null) or (status = 'CANCELLED' and cancelled_by_staff_id is not null and cancelled_at is not null))
);

create unique index if not exists workforce_calendar_days_active_unique
  on public.workforce_calendar_days (organization_id, entity_id, calendar_date, day_type)
  where status = 'ACTIVE';
create index if not exists workforce_calendar_days_org_entity_date_idx
  on public.workforce_calendar_days (organization_id, entity_id, calendar_date, status);
create index if not exists workforce_calendar_days_public_holiday_idx
  on public.workforce_calendar_days (organization_id, entity_id, calendar_date)
  where status = 'ACTIVE' and day_type = 'PUBLIC_HOLIDAY';

create or replace function public.validate_workforce_calendar_day_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity_org uuid;
  v_creator_org uuid;
  v_creator_party uuid;
  v_canceller_org uuid;
  v_canceller_party uuid;
begin
  select organization_id into v_entity_org
  from public.legal_entities
  where id = new.entity_id and is_active is true;

  if not found or v_entity_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Workforce calendar legal entity does not belong to organization';
  end if;

  select active_organization_id, party_id into v_creator_org, v_creator_party
  from public.staff_accounts
  where id = new.created_by_staff_id and active is true;

  if not found or v_creator_org is distinct from new.organization_id then
    raise exception using errcode = '23514', message = 'Workforce calendar creator does not belong to organization';
  end if;

  if new.created_by_party_id is null then
    new.created_by_party_id := v_creator_party;
  elsif v_creator_party is not null and new.created_by_party_id is distinct from v_creator_party then
    raise exception using errcode = '23514', message = 'Workforce calendar creator party does not match staff identity';
  end if;

  if new.cancelled_by_staff_id is not null then
    select active_organization_id, party_id into v_canceller_org, v_canceller_party
    from public.staff_accounts
    where id = new.cancelled_by_staff_id and active is true;

    if not found or v_canceller_org is distinct from new.organization_id then
      raise exception using errcode = '23514', message = 'Workforce calendar canceller does not belong to organization';
    end if;

    if new.cancelled_by_party_id is null then
      new.cancelled_by_party_id := v_canceller_party;
    elsif v_canceller_party is not null and new.cancelled_by_party_id is distinct from v_canceller_party then
      raise exception using errcode = '23514', message = 'Workforce calendar canceller party does not match staff identity';
    end if;
  end if;

  new.day_type := upper(btrim(new.day_type));
  new.source_type := upper(btrim(new.source_type));
  new.name := btrim(new.name);
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  new.source_reference := nullif(btrim(coalesce(new.source_reference, '')), '');
  return new;
end;
$$;

create or replace function public.prevent_workforce_calendar_day_core_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.entity_id is distinct from new.entity_id
    or old.calendar_date is distinct from new.calendar_date
    or old.day_type is distinct from new.day_type
    or old.name is distinct from new.name
    or old.notes is distinct from new.notes
    or old.source_type is distinct from new.source_type
    or old.source_reference is distinct from new.source_reference
    or old.created_by_staff_id is distinct from new.created_by_staff_id
    or old.created_by_party_id is distinct from new.created_by_party_id
    or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'Workforce calendar evidence is immutable; cancel and create a replacement day';
  end if;
  return new;
end;
$$;

drop trigger if exists workforce_calendar_days_validate_scope on public.workforce_calendar_days;
create trigger workforce_calendar_days_validate_scope
before insert or update of organization_id, entity_id, day_type, name, notes, source_type, source_reference, created_by_staff_id, created_by_party_id, cancelled_by_staff_id, cancelled_by_party_id
on public.workforce_calendar_days
for each row execute function public.validate_workforce_calendar_day_scope();

drop trigger if exists workforce_calendar_days_prevent_core_mutation on public.workforce_calendar_days;
create trigger workforce_calendar_days_prevent_core_mutation
before update on public.workforce_calendar_days
for each row execute function public.prevent_workforce_calendar_day_core_mutation();

drop trigger if exists workforce_calendar_days_set_updated_at on public.workforce_calendar_days;
create trigger workforce_calendar_days_set_updated_at
before update on public.workforce_calendar_days
for each row execute function public.set_updated_at();

alter table public.workforce_calendar_days enable row level security;

drop policy if exists workforce_calendar_days_read on public.workforce_calendar_days;
create policy workforce_calendar_days_read
on public.workforce_calendar_days
for select to authenticated
using (
  public.can_manage_organization(organization_id)
  or exists (
    select 1
    from public.staff_accounts sa
    where sa.id = public.current_staff_account_id()
      and sa.active is true
      and sa.active_organization_id = organization_id
  )
);

revoke insert, update, delete on public.workforce_calendar_days from anon, authenticated;
grant select on public.workforce_calendar_days to authenticated;
grant select, insert, update on public.workforce_calendar_days to service_role;
