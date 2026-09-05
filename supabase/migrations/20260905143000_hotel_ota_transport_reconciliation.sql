begin;

alter table if exists public.hotel_channel_connections
  add column if not exists provider_certified boolean not null default false,
  add column if not exists enabled boolean not null default false;

create table if not exists public.hotel_channel_transmissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  connection_id uuid not null references public.hotel_channel_connections(id) on delete cascade,
  sync_job_id uuid references public.hotel_channel_sync_jobs(id) on delete set null,
  provider text not null,
  idempotency_key text not null,
  transmission_type text not null default 'ARI',
  status text not null default 'SENT' check (status in ('QUEUED','SENT','ACKNOWLEDGED','REJECTED','FAILED')),
  request_fingerprint text not null,
  change_summary jsonb not null default '{}'::jsonb,
  item_count integer not null default 0 check (item_count >= 0),
  date_from date,
  date_to date,
  provider_message_id text,
  provider_ack_code text,
  provider_ack_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, connection_id, idempotency_key),
  check (date_to is null or date_from is null or date_to >= date_from)
);

create table if not exists public.hotel_channel_reservation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  connection_id uuid not null references public.hotel_channel_connections(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  external_reservation_id text not null,
  event_type text not null,
  event_version text,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','NORMALIZED','RECONCILED','MANUAL_REVIEW','REJECTED')),
  payload_fingerprint text not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  booking_id uuid references public.hotel_bookings(id) on delete set null,
  discrepancy_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_event_id)
);

create table if not exists public.hotel_channel_reservation_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  connection_id uuid not null references public.hotel_channel_connections(id) on delete cascade,
  reservation_event_id uuid not null references public.hotel_channel_reservation_events(id) on delete cascade,
  booking_id uuid references public.hotel_bookings(id) on delete set null,
  status text not null check (status in ('MATCHED','MISMATCH','MANUAL_REVIEW')),
  comparison jsonb not null default '{}'::jsonb,
  reconciled_by uuid,
  reconciled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists hotel_channel_transmissions_connection_created_idx
  on public.hotel_channel_transmissions (connection_id, created_at desc);
create index if not exists hotel_channel_transmissions_status_idx
  on public.hotel_channel_transmissions (organization_id, property_id, status, created_at desc);
create index if not exists hotel_channel_reservation_events_connection_received_idx
  on public.hotel_channel_reservation_events (connection_id, received_at desc);
create index if not exists hotel_channel_reservation_events_external_reservation_idx
  on public.hotel_channel_reservation_events (organization_id, provider, external_reservation_id);
create index if not exists hotel_channel_reconciliations_connection_idx
  on public.hotel_channel_reservation_reconciliations (connection_id, reconciled_at desc);
create index if not exists hotel_channel_reconciliations_event_idx
  on public.hotel_channel_reservation_reconciliations (reservation_event_id, reconciled_at desc);

comment on table public.hotel_channel_transmissions is
  'Hotel OTA transport evidence. Stores fingerprints and sanitized summaries only; provider credentials never belong here.';
comment on table public.hotel_channel_reservation_events is
  'Normalized OTA reservation inbox with provider event idempotency and canonical Hotel booking linkage.';
comment on table public.hotel_channel_reservation_reconciliations is
  'Append-only reconciliation evidence between inbound OTA reservation events and canonical Hotel bookings.';
comment on column public.hotel_channel_connections.provider_certified is
  'True only after the provider connectivity/onboarding certification requirement is satisfied.';
comment on column public.hotel_channel_connections.enabled is
  'Operator-approved distribution permission managed by the server-side connectivity workflow. This is not proof of provider connectivity.';

alter table public.hotel_channel_transmissions enable row level security;
alter table public.hotel_channel_reservation_events enable row level security;
alter table public.hotel_channel_reservation_reconciliations enable row level security;

revoke all on table public.hotel_channel_transmissions from anon, authenticated;
revoke all on table public.hotel_channel_reservation_events from anon, authenticated;
revoke all on table public.hotel_channel_reservation_reconciliations from anon, authenticated;
grant select, insert, update on table public.hotel_channel_transmissions to service_role;
grant select, insert, update on table public.hotel_channel_reservation_events to service_role;
grant select, insert on table public.hotel_channel_reservation_reconciliations to service_role;

create or replace function public.hotel_reconcile_channel_reservation_event(
  p_organization_id uuid,
  p_property_id uuid,
  p_connection_id uuid,
  p_reservation_event_id uuid,
  p_booking_id uuid,
  p_status text,
  p_comparison jsonb default '{}'::jsonb,
  p_reconciled_by uuid default null
)
returns public.hotel_channel_reservation_reconciliations
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_event public.hotel_channel_reservation_events%rowtype;
  v_result public.hotel_channel_reservation_reconciliations%rowtype;
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_now timestamptz := now();
begin
  if v_status not in ('MATCHED','MISMATCH','MANUAL_REVIEW') then
    raise exception 'Invalid Hotel reservation reconciliation status' using errcode = '22023';
  end if;

  select *
    into v_event
    from public.hotel_channel_reservation_events
   where id = p_reservation_event_id
     and organization_id = p_organization_id
     and property_id = p_property_id
     and connection_id = p_connection_id
   for update;

  if not found then
    raise exception 'Hotel reservation event not found for this channel' using errcode = 'P0002';
  end if;

  if p_booking_id is not null and not exists (
    select 1
      from public.hotel_bookings
     where id = p_booking_id
       and organization_id = p_organization_id
       and property_id = p_property_id
  ) then
    raise exception 'Canonical Hotel booking not found for reconciliation' using errcode = '23503';
  end if;

  insert into public.hotel_channel_reservation_reconciliations (
    organization_id,
    property_id,
    connection_id,
    reservation_event_id,
    booking_id,
    status,
    comparison,
    reconciled_by,
    reconciled_at
  ) values (
    p_organization_id,
    p_property_id,
    p_connection_id,
    p_reservation_event_id,
    p_booking_id,
    v_status,
    coalesce(p_comparison, '{}'::jsonb),
    p_reconciled_by,
    v_now
  )
  returning * into v_result;

  update public.hotel_channel_reservation_events
     set booking_id = p_booking_id,
         status = case when v_status = 'MATCHED' then 'RECONCILED' else 'MANUAL_REVIEW' end,
         discrepancy_summary = coalesce(p_comparison, '{}'::jsonb),
         reconciled_at = v_now,
         updated_at = v_now
   where id = p_reservation_event_id
     and organization_id = p_organization_id;

  return v_result;
end;
$$;

revoke execute on function public.hotel_reconcile_channel_reservation_event(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.hotel_reconcile_channel_reservation_event(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid) to service_role;

commit;
