begin;

alter table public.system_events
  add column if not exists processed boolean not null default false,
  add column if not exists processing boolean not null default false,
  add column if not exists processed_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists last_failed_at timestamptz;

create index if not exists system_events_pending_idx
  on public.system_events (processed, processing, created_at);

create index if not exists system_events_org_idempotency_idx
  on public.system_events (organization_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_system_event_atomic(
  p_organization_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.system_events%rowtype;
  v_duplicate boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organizationId required';
  end if;

  if nullif(btrim(coalesce(p_type, '')), '') is null then
    raise exception 'event type required';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_organization_id::text || ':system-event:' || p_idempotency_key,
        0
      )
    );

    select *
    into v_event
    from public.system_events
    where organization_id = p_organization_id
      and idempotency_key = p_idempotency_key
    order by created_at asc
    limit 1;

    if found then
      v_duplicate := true;
    end if;
  end if;

  if not v_duplicate then
    insert into public.system_events (
      organization_id,
      type,
      payload,
      idempotency_key,
      processed,
      processing,
      attempt_count
    ) values (
      p_organization_id,
      btrim(p_type),
      coalesce(p_payload, '{}'::jsonb),
      nullif(btrim(coalesce(p_idempotency_key, '')), ''),
      false,
      false,
      0
    )
    returning * into v_event;
  end if;

  return jsonb_build_object(
    'success', true,
    'duplicate', v_duplicate,
    'event', to_jsonb(v_event)
  );
end;
$$;

create or replace function public.claim_system_events(
  p_limit integer default 50,
  p_organization_id uuid default null,
  p_event_id text default null,
  p_stale_after_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_stale_seconds integer := greatest(30, coalesce(p_stale_after_seconds, 300));
  v_events jsonb;
begin
  with candidates as (
    select event.id
    from public.system_events event
    where coalesce(event.processed, false) = false
      and (
        coalesce(event.processing, false) = false
        or event.processing_started_at is null
        or event.processing_started_at < now() - make_interval(secs => v_stale_seconds)
      )
      and (
        p_organization_id is null
        or event.organization_id = p_organization_id
      )
      and (
        p_event_id is null
        or event.id::text = p_event_id
      )
    order by event.created_at asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.system_events event
    set processing = true,
        processing_started_at = now(),
        attempt_count = coalesce(event.attempt_count, 0) + 1,
        last_error = null
    from candidates
    where event.id = candidates.id
    returning event.*
  )
  select coalesce(
    jsonb_agg(to_jsonb(claimed) order by claimed.created_at asc),
    '[]'::jsonb
  )
  into v_events
  from claimed;

  return v_events;
end;
$$;

revoke all on function public.record_system_event_atomic(uuid, text, jsonb, text)
  from public;
revoke all on function public.claim_system_events(integer, uuid, text, integer)
  from public;

grant execute on function public.record_system_event_atomic(uuid, text, jsonb, text)
  to service_role;
grant execute on function public.claim_system_events(integer, uuid, text, integer)
  to service_role;

commit;
