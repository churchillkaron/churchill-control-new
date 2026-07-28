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
       ), '') is not null;

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
       ), '') is not null;

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
begin
  new.record_id := coalesce(
    new.record_id,
    nullif(coalesce(
      new.payload ->> 'record_id',
      new.payload ->> 'id',
      new.result ->> 'id'
    ), '')::uuid
  );

  new.actor_id := coalesce(
    new.actor_id,
    nullif(coalesce(
      new.payload ->> 'actor_id',
      new.payload ->> 'updated_by',
      new.payload ->> 'created_by',
      new.result ->> 'updated_by',
      new.result ->> 'created_by'
    ), '')::uuid
  );

  return new;
end;
$$;

drop trigger if exists operations_command_ledger_audit_projection on public.operations_command_ledger;
create trigger operations_command_ledger_audit_projection
before insert or update of payload, result, record_id, actor_id
on public.operations_command_ledger
for each row
execute function public.project_operations_command_audit_fields();

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
       ), '') is not null;

comment on column public.operations_command_ledger.record_id is
  'Indexed Operations record reference derived from the immutable command payload or result.';

comment on column public.operations_command_ledger.actor_id is
  'Authenticated Supabase user identifier responsible for the Operations command.';

comment on function public.project_operations_command_audit_fields() is
  'Projects record and actor identifiers from Operations command JSON into indexed audit columns.';
