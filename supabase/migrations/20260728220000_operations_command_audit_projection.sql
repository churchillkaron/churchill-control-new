alter table public.operations_command_ledger
  add column if not exists record_id uuid null,
  add column if not exists actor_id uuid null;

update public.operations_command_ledger
   set record_id = nullif(coalesce(
         payload ->> 'record_id',
         payload ->> 'id',
         result ->> 'id'
       ), '')::uuid
 where record_id is null
   and nullif(coalesce(
         payload ->> 'record_id',
         payload ->> 'id',
         result ->> 'id'
       ), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.operations_command_ledger
   set actor_id = nullif(coalesce(
         payload ->> 'actor_id',
         payload ->> 'updated_by',
         payload ->> 'created_by',
         result ->> 'updated_by',
         result ->> 'created_by'
       ), '')::uuid
 where actor_id is null
   and nullif(coalesce(
         payload ->> 'actor_id',
         payload ->> 'updated_by',
         payload ->> 'created_by',
         result ->> 'updated_by',
         result ->> 'created_by'
       ), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

create index if not exists operations_command_ledger_record_idx
  on public.operations_command_ledger (
    organization_id,
    entity_id,
    period_id,
    capability_id,
    record_id,
    started_at desc
  )
  where record_id is not null;

create index if not exists operations_command_ledger_actor_idx
  on public.operations_command_ledger (organization_id, actor_id, started_at desc)
  where actor_id is not null;

create or replace function public.project_operations_command_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_record_id text;
  v_actor_id text;
begin
  v_record_id := nullif(coalesce(
    new.payload ->> 'record_id',
    new.payload ->> 'id',
    new.result ->> 'id'
  ), '');

  if new.record_id is null
     and v_record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    new.record_id := v_record_id::uuid;
  end if;

  v_actor_id := nullif(coalesce(
    new.payload ->> 'actor_id',
    new.payload ->> 'updated_by',
    new.payload ->> 'created_by',
    new.result ->> 'updated_by',
    new.result ->> 'created_by'
  ), '');

  if new.actor_id is null
     and v_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    new.actor_id := v_actor_id::uuid;
  end if;

  return new;
end;
$$;

drop trigger if exists operations_command_ledger_audit_projection on public.operations_command_ledger;
create trigger operations_command_ledger_audit_projection
before insert or update of payload, result, record_id, actor_id
on public.operations_command_ledger
for each row
execute function public.project_operations_command_audit_fields();

create or replace function public.prevent_operations_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'operations_events is immutable';
end;
$$;

drop trigger if exists operations_events_immutable_guard on public.operations_events;

update public.operations_events
   set actor_id = nullif(coalesce(
         payload #>> '{record,updated_by}',
         payload #>> '{record,created_by}',
         payload ->> 'actor_id'
       ), '')::uuid
 where actor_id is null
   and nullif(coalesce(
         payload #>> '{record,updated_by}',
         payload #>> '{record,created_by}',
         payload ->> 'actor_id'
       ), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

create trigger operations_events_immutable_guard
before update or delete on public.operations_events
for each row
execute function public.prevent_operations_event_mutation();

comment on column public.operations_command_ledger.record_id is
  'Indexed Operations record reference derived from the immutable command payload or result when the value is a valid UUID.';

comment on column public.operations_command_ledger.actor_id is
  'Authenticated Supabase user identifier responsible for the Operations command when the source value is a valid UUID.';

comment on function public.project_operations_command_audit_fields() is
  'Projects valid UUID record and actor identifiers from Operations command JSON into indexed audit columns without rejecting non-UUID source identifiers.';