create or replace function public.enforce_time_off_request_entity()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_entity uuid;
  v_count integer;
begin
  select count(*), (array_agg(entity_id order by entity_id::text))[1]
    into v_count, v_entity
  from public.employee_employment_assignments
  where organization_id = new.organization_id
    and staff_account_id = new.staff_id
    and party_id is not distinct from new.party_id
    and effective_from <= new.start_date
    and (effective_to is null or effective_to >= new.end_date);

  if v_count <> 1 then
    raise exception using errcode='23514',
      message='Time-off request must fall entirely within one legal-employer assignment';
  end if;

  if new.entity_id is null then
    new.entity_id := v_entity;
  elsif new.entity_id is distinct from v_entity then
    raise exception using errcode='23514',
      message='Time-off request legal entity does not match employment assignment';
  end if;

  return new;
end
$function$;

create or replace function public.validate_staff_time_off_request_scope()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_party uuid;
begin
  select party_id
    into v_party
  from public.staff_accounts
  where id = new.staff_id
    and active = true;

  if not found then
    raise exception using errcode='23514',
      message='Time-off request staff account is not active';
  end if;
  if new.party_id is null then
    new.party_id := v_party;
  elsif v_party is not null and new.party_id is distinct from v_party then
    raise exception using errcode='23514',
      message='Time-off request party does not match staff identity';
  end if;

  new.leave_type := btrim(new.leave_type);
  new.reason := btrim(new.reason);
  new.review_notes := nullif(btrim(coalesce(new.review_notes, '')), '');
  return new;
end
$function$;
