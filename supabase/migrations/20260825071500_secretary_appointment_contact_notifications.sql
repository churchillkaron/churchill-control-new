begin;

create table if not exists public.secretary_appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_event_id uuid not null references public.secretary_calendar_events(id) on delete cascade,
  contact_party_id uuid not null,
  notification_kind text not null
    check (notification_kind in ('CONFIRMATION','RESCHEDULED','CANCELLED','REMINDER')),
  reminder_minutes_before integer null,
  event_starts_at timestamptz not null,
  event_status text not null,
  dedupe_key text not null,
  available_at timestamptz not null default now(),
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','SENT','SKIPPED','FAILED','SUPERSEDED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  message_id uuid null references public.communication_messages(id) on delete set null,
  sent_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_appointment_notifications_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (organization_id, dedupe_key)
);

create index if not exists secretary_appointment_notifications_claim_idx
  on public.secretary_appointment_notifications (status, available_at, created_at)
  where status in ('PENDING','FAILED');
create index if not exists secretary_appointment_notifications_event_idx
  on public.secretary_appointment_notifications (organization_id, calendar_event_id, created_at desc);

alter table public.secretary_appointment_notifications enable row level security;
revoke all on public.secretary_appointment_notifications from anon, authenticated;
grant select, insert, update, delete on public.secretary_appointment_notifications to service_role;

create or replace function public.secretary_queue_appointment_state_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_reference text;
  v_key text;
begin
  if new.event_type <> 'APPOINTMENT' or new.contact_party_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status in ('TENTATIVE','CONFIRMED') then
    v_kind := 'CONFIRMATION';
  elsif tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    v_kind := 'CANCELLED';
  elsif tg_op = 'UPDATE'
    and new.status in ('TENTATIVE','CONFIRMED')
    and old.status in ('TENTATIVE','CONFIRMED')
    and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at)
  then
    v_kind := 'RESCHEDULED';
  else
    return new;
  end if;

  v_reference := coalesce(new.self_service_reference::text, new.id::text);
  v_key := lower(v_kind) || ':' || v_reference || ':' || new.starts_at::text || ':' || new.status;

  insert into public.secretary_appointment_notifications (
    organization_id,
    calendar_event_id,
    contact_party_id,
    notification_kind,
    event_starts_at,
    event_status,
    dedupe_key,
    available_at,
    metadata
  ) values (
    new.organization_id,
    new.id,
    new.contact_party_id,
    v_kind,
    new.starts_at,
    new.status,
    v_key,
    now(),
    jsonb_build_object(
      'self_service_reference', new.self_service_reference,
      'timezone', new.timezone,
      'location', new.location,
      'source', new.source,
      'external_authority_used', false
    )
  )
  on conflict (organization_id, dedupe_key) do nothing;

  if v_kind in ('RESCHEDULED','CANCELLED') then
    update public.secretary_appointment_notifications
    set status = 'SUPERSEDED',
        lease_token = null,
        lease_expires_at = null,
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'superseded_by_event_state', v_kind,
          'superseded_at', now()
        )
    where organization_id = new.organization_id
      and calendar_event_id = new.id
      and notification_kind = 'REMINDER'
      and status in ('PENDING','FAILED')
      and event_starts_at is distinct from new.starts_at;
  end if;

  return new;
end;
$$;

revoke all on function public.secretary_queue_appointment_state_notification() from public, anon, authenticated;

drop trigger if exists secretary_calendar_event_contact_notification on public.secretary_calendar_events;
create trigger secretary_calendar_event_contact_notification
after insert or update of status, starts_at, ends_at on public.secretary_calendar_events
for each row
execute function public.secretary_queue_appointment_state_notification();

create or replace function public.secretary_materialize_appointment_reminders(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_created integer := 0;
  v_superseded integer := 0;
  v_row record;
  v_minutes integer;
  v_offsets jsonb;
begin
  update public.secretary_appointment_notifications n
  set status = 'SUPERSEDED',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now(),
      metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object('superseded_at', now())
  from public.secretary_calendar_events e
  where n.organization_id = e.organization_id
    and n.calendar_event_id = e.id
    and n.notification_kind = 'REMINDER'
    and n.status in ('PENDING','FAILED')
    and (e.status = 'CANCELLED' or n.event_starts_at is distinct from e.starts_at);
  get diagnostics v_superseded = row_count;

  for v_row in
    select
      e.id,
      e.organization_id,
      e.contact_party_id,
      e.self_service_reference,
      e.starts_at,
      e.status,
      e.timezone,
      e.location,
      coalesce(s.booking_policy->'reminder_minutes_before', '[1440,120]'::jsonb) as reminder_offsets
    from public.secretary_calendar_events e
    left join public.secretary_settings s on s.organization_id = e.organization_id
    where e.event_type = 'APPOINTMENT'
      and e.status in ('TENTATIVE','CONFIRMED')
      and e.contact_party_id is not null
      and e.starts_at > p_now
      and e.starts_at <= p_now + interval '2 days'
  loop
    v_offsets := case
      when jsonb_typeof(v_row.reminder_offsets) = 'array' then v_row.reminder_offsets
      else '[1440,120]'::jsonb
    end;

    for v_minutes in
      select greatest(5, least(10080, value::integer))
      from jsonb_array_elements_text(v_offsets)
      where value ~ '^[0-9]+$'
    loop
      if p_now >= v_row.starts_at - make_interval(mins => v_minutes) then
        insert into public.secretary_appointment_notifications (
          organization_id,
          calendar_event_id,
          contact_party_id,
          notification_kind,
          reminder_minutes_before,
          event_starts_at,
          event_status,
          dedupe_key,
          available_at,
          metadata
        ) values (
          v_row.organization_id,
          v_row.id,
          v_row.contact_party_id,
          'REMINDER',
          v_minutes,
          v_row.starts_at,
          v_row.status,
          'reminder:' || v_row.self_service_reference::text || ':' || v_row.starts_at::text || ':' || v_minutes::text,
          p_now,
          jsonb_build_object(
            'self_service_reference', v_row.self_service_reference,
            'timezone', v_row.timezone,
            'location', v_row.location,
            'external_authority_used', false
          )
        )
        on conflict (organization_id, dedupe_key) do nothing;
        if found then
          v_created := v_created + 1;
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'created', v_created,
    'superseded', v_superseded,
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_materialize_appointment_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.secretary_materialize_appointment_reminders(timestamptz)
  to service_role;

create or replace function public.claim_secretary_appointment_notification(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.secretary_appointment_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lease uuid := gen_random_uuid();
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'SECRETARY_APPOINTMENT_NOTIFICATION_WORKER_REQUIRED';
  end if;

  select id into v_id
  from public.secretary_appointment_notifications
  where status in ('PENDING','FAILED')
    and attempt_count < max_attempts
    and available_at <= now()
    and (lease_expires_at is null or lease_expires_at <= now())
  order by available_at asc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.secretary_appointment_notifications
  set status = 'PROCESSING',
      attempt_count = attempt_count + 1,
      lease_token = v_lease,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id),
      last_error = null,
      updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_secretary_appointment_notification(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_secretary_appointment_notification(text, integer)
  to service_role;

comment on table public.secretary_appointment_notifications is
  'Avantiqo-owned appointment contact-notification ledger. Avantiqo owns confirmation/reminder/change timing; Communications is transport/history only.';
comment on function public.secretary_materialize_appointment_reminders(timestamptz) is
  'Materializes configurable contact appointment reminders from Avantiqo calendar state. Default offsets are 24 hours and 2 hours if policy does not specify reminder_minutes_before.';

commit;
