create table if not exists public.operations_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique,
  organization_id uuid not null,
  entity_id uuid null,
  period_id uuid null,
  domain text not null default 'operations',
  event_type text not null,
  capability_id text null,
  command text null,
  aggregate_type text null,
  aggregate_id text null,
  actor_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists operations_events_scope_idx
  on public.operations_events (organization_id, entity_id, period_id, occurred_at desc);

create index if not exists operations_events_capability_idx
  on public.operations_events (organization_id, capability_id, occurred_at desc);

create index if not exists operations_events_aggregate_idx
  on public.operations_events (organization_id, aggregate_type, aggregate_id, occurred_at desc);

create index if not exists operations_events_actor_idx
  on public.operations_events (organization_id, actor_id, occurred_at desc)
  where actor_id is not null;

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
create trigger operations_events_immutable_guard
before update or delete on public.operations_events
for each row
execute function public.prevent_operations_event_mutation();

create or replace function public.publish_operations_event_batch(
  p_organization_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.operations_event_outbox%rowtype;
  v_attempts integer;
  v_published integer := 0;
  v_failed integer := 0;
  v_dead_letter integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_next_status text;
  v_next_attempt timestamptz;
begin
  for v_event in
    select *
      from public.operations_event_outbox
     where status in ('pending', 'retry')
       and (next_attempt_at is null or next_attempt_at <= now())
       and (p_organization_id is null or organization_id = p_organization_id)
     order by occurred_at asc, id asc
     for update skip locked
     limit v_limit
  loop
    begin
      update public.operations_event_outbox
         set status = 'processing',
             attempts = coalesce(attempts, 0) + 1,
             last_error = null
       where id = v_event.id
       returning attempts into v_attempts;

      insert into public.operations_events (
        outbox_id,
        organization_id,
        entity_id,
        period_id,
        domain,
        event_type,
        capability_id,
        command,
        aggregate_type,
        aggregate_id,
        actor_id,
        payload,
        occurred_at,
        published_at
      ) values (
        v_event.id,
        v_event.organization_id,
        v_event.entity_id,
        v_event.period_id,
        coalesce(nullif(v_event.domain, ''), 'operations'),
        v_event.event_type,
        nullif(v_event.payload ->> 'capability_id', ''),
        nullif(v_event.payload ->> 'command', ''),
        v_event.aggregate_type,
        v_event.aggregate_id,
        nullif(coalesce(
          v_event.payload #>> '{record,updated_by}',
          v_event.payload #>> '{record,created_by}',
          v_event.payload ->> 'actor_id'
        ), '')::uuid,
        v_event.payload,
        v_event.occurred_at,
        now()
      )
      on conflict (outbox_id) do nothing;

      update public.operations_event_outbox
         set status = 'published',
             published_at = now(),
             next_attempt_at = null,
             last_error = null
       where id = v_event.id;

      v_published := v_published + 1;
    exception
      when others then
        v_attempts := coalesce(v_event.attempts, 0) + 1;
        v_next_status := case when v_attempts >= 8 then 'dead_letter' else 'retry' end;
        v_next_attempt := case
          when v_next_status = 'dead_letter' then null
          else now() + make_interval(
            secs => least(
              3600,
              (30 * power(2, least(greatest(v_attempts - 1, 0), 7)))::integer
            )
          )
        end;

        update public.operations_event_outbox
           set status = v_next_status,
               attempts = v_attempts,
               last_error = jsonb_build_object(
                 'message', sqlerrm,
                 'sqlstate', sqlstate,
                 'failed_at', now()
               ),
               next_attempt_at = v_next_attempt
         where id = v_event.id;

        v_failed := v_failed + 1;
        if v_next_status = 'dead_letter' then
          v_dead_letter := v_dead_letter + 1;
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'published', v_published,
    'failed', v_failed,
    'dead_letter', v_dead_letter,
    'organization_id', p_organization_id,
    'limit', v_limit
  );
end;
$$;

revoke all on table public.operations_events from anon, authenticated;
revoke all on function public.publish_operations_event_batch(uuid, integer) from public;
grant select on table public.operations_events to service_role;
grant execute on function public.publish_operations_event_batch(uuid, integer) to service_role;

comment on table public.operations_events is
  'Immutable, published Operations domain-event stream projected from the transactional outbox.';

comment on function public.publish_operations_event_batch(uuid, integer) is
  'Publishes retryable Operations outbox events into the immutable internal event stream using bounded exponential backoff and dead-letter handling.';
