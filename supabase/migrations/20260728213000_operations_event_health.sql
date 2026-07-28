create or replace function public.get_operations_event_delivery_health(
  p_organization_id uuid,
  p_entity_id uuid default null,
  p_period_id uuid default null,
  p_dead_letter_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health jsonb;
  v_dead_letters jsonb;
  v_limit integer := greatest(1, least(coalesce(p_dead_letter_limit, 50), 200));
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'retry', count(*) filter (where status = 'retry'),
    'published', count(*) filter (where status = 'published'),
    'dead_letter', count(*) filter (where status = 'dead_letter'),
    'max_attempts', coalesce(max(attempts), 0),
    'oldest_waiting_at', min(occurred_at) filter (where status in ('pending', 'retry')),
    'last_published_at', max(published_at),
    'next_retry_at', min(next_attempt_at) filter (where status = 'retry')
  )
    into v_health
    from public.operations_event_outbox
   where organization_id = p_organization_id
     and entity_id is not distinct from p_entity_id
     and period_id is not distinct from p_period_id;

  select coalesce(jsonb_agg(to_jsonb(dead_letter_row) order by dead_letter_row.occurred_at desc), '[]'::jsonb)
    into v_dead_letters
    from (
      select
        id,
        event_type,
        aggregate_type,
        aggregate_id,
        attempts,
        last_error,
        occurred_at,
        next_attempt_at
      from public.operations_event_outbox
      where organization_id = p_organization_id
        and entity_id is not distinct from p_entity_id
        and period_id is not distinct from p_period_id
        and status = 'dead_letter'
      order by occurred_at desc
      limit v_limit
    ) dead_letter_row;

  return jsonb_build_object(
    'ok', true,
    'health', coalesce(v_health, '{}'::jsonb),
    'dead_letters', v_dead_letters
  );
end;
$$;

create or replace function public.retry_operations_dead_letter(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_outbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.operations_event_outbox%rowtype;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_outbox_id is null then
    raise exception 'outbox_id required';
  end if;

  update public.operations_event_outbox
     set status = 'retry',
         attempts = 0,
         next_attempt_at = now(),
         last_error = null,
         published_at = null
   where id = p_outbox_id
     and organization_id = p_organization_id
     and entity_id is not distinct from p_entity_id
     and period_id is not distinct from p_period_id
     and status = 'dead_letter'
   returning * into v_event;

  if not found then
    raise exception 'Operations dead-letter event not found in requested scope';
  end if;

  return jsonb_build_object(
    'ok', true,
    'outbox_id', v_event.id,
    'status', v_event.status,
    'next_attempt_at', v_event.next_attempt_at
  );
end;
$$;

revoke all on function public.get_operations_event_delivery_health(uuid, uuid, uuid, integer) from public;
revoke all on function public.retry_operations_dead_letter(uuid, uuid, uuid, uuid) from public;
grant execute on function public.get_operations_event_delivery_health(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.retry_operations_dead_letter(uuid, uuid, uuid, uuid) to service_role;

comment on function public.get_operations_event_delivery_health(uuid, uuid, uuid, integer) is
  'Returns scoped Operations outbox health and recent dead-letter events without loading the complete outbox into application memory.';

comment on function public.retry_operations_dead_letter(uuid, uuid, uuid, uuid) is
  'Requeues one scoped Operations dead-letter event for controlled redelivery.';
