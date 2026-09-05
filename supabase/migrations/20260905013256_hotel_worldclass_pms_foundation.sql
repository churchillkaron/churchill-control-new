begin;

alter table public.hotel_rooms
  add column if not exists property_id uuid references public.hotel_properties(id) on delete restrict;
create index if not exists hotel_rooms_org_property_idx on public.hotel_rooms(organization_id, property_id);

alter table public.hotel_guests
  add column if not exists preferred_language text,
  add column if not exists vip_status text not null default 'STANDARD',
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists last_stay_at timestamptz;

create table if not exists public.hotel_rate_plans (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  code text not null, name text not null, currency_code text not null default 'THB', meal_plan text,
  refundable boolean not null default true, cancellation_policy jsonb not null default '{}'::jsonb,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, property_id, code)
);
create index if not exists hotel_rate_plans_org_property_idx on public.hotel_rate_plans(organization_id, property_id, active);

create table if not exists public.hotel_groups (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  name text not null, group_code text, contact_guest_id uuid references public.hotel_guests(id) on delete set null,
  arrival_date date, departure_date date, status text not null default 'PROSPECT', room_block integer not null default 0,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists hotel_groups_org_property_dates_idx on public.hotel_groups(organization_id, property_id, arrival_date, departure_date);

create table if not exists public.hotel_channel_connections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  provider text not null, display_name text not null, external_property_id text, status text not null default 'NOT_CONNECTED',
  credential_secret_ref text, capabilities jsonb not null default '{}'::jsonb, settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz, last_success_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, property_id, provider)
);
create index if not exists hotel_channel_connections_org_property_idx on public.hotel_channel_connections(organization_id, property_id, status);

alter table public.hotel_bookings
  add column if not exists property_id uuid references public.hotel_properties(id) on delete restrict,
  add column if not exists rate_plan_id uuid references public.hotel_rate_plans(id) on delete set null,
  add column if not exists group_id uuid references public.hotel_groups(id) on delete set null,
  add column if not exists channel_connection_id uuid references public.hotel_channel_connections(id) on delete set null,
  add column if not exists external_reservation_id text,
  add column if not exists currency_code text not null default 'THB',
  add column if not exists deposit_required numeric not null default 0,
  add column if not exists pre_arrival_status text not null default 'NOT_STARTED',
  add column if not exists registration_status text not null default 'NOT_STARTED',
  add column if not exists mobile_arrival_status text not null default 'NOT_STARTED',
  add column if not exists estimated_arrival_at timestamptz;
update public.hotel_bookings b set property_id = r.property_id from public.hotel_rooms r
where b.room_id = r.id and b.organization_id = r.organization_id and b.property_id is null and r.property_id is not null;
create index if not exists hotel_bookings_org_property_dates_idx on public.hotel_bookings(organization_id, property_id, check_in_date, check_out_date);
create index if not exists hotel_bookings_external_reservation_idx on public.hotel_bookings(organization_id, channel_connection_id, external_reservation_id);

create table if not exists public.hotel_rate_calendar (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  rate_plan_id uuid not null references public.hotel_rate_plans(id) on delete cascade,
  room_type text not null, stay_date date not null, rate_amount numeric not null default 0, inventory integer,
  min_stay integer not null default 1, max_stay integer, stop_sell boolean not null default false,
  closed_to_arrival boolean not null default false, closed_to_departure boolean not null default false,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, property_id, rate_plan_id, room_type, stay_date)
);
create index if not exists hotel_rate_calendar_scope_date_idx on public.hotel_rate_calendar(organization_id, property_id, stay_date, room_type);

create table if not exists public.hotel_channel_mappings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  connection_id uuid not null references public.hotel_channel_connections(id) on delete cascade,
  local_room_type text not null, external_room_type_id text not null,
  local_rate_plan_id uuid references public.hotel_rate_plans(id) on delete cascade, external_rate_plan_id text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (connection_id, local_room_type, external_room_type_id, local_rate_plan_id)
);
create index if not exists hotel_channel_mappings_org_connection_idx on public.hotel_channel_mappings(organization_id, connection_id, active);

create table if not exists public.hotel_channel_sync_jobs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  connection_id uuid references public.hotel_channel_connections(id) on delete cascade,
  sync_type text not null, status text not null default 'PENDING', date_from date, date_to date,
  change_summary jsonb not null default '{}'::jsonb, request_fingerprint text, provider_reference text,
  attempt_count integer not null default 0, last_error text, queued_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists hotel_channel_sync_jobs_queue_idx on public.hotel_channel_sync_jobs(status, queued_at);
create index if not exists hotel_channel_sync_jobs_scope_idx on public.hotel_channel_sync_jobs(organization_id, property_id, created_at desc);

create table if not exists public.hotel_folios (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid references public.hotel_properties(id) on delete restrict,
  booking_id uuid not null references public.hotel_bookings(id) on delete cascade,
  guest_id uuid references public.hotel_guests(id) on delete set null, folio_number text,
  currency_code text not null default 'THB', status text not null default 'OPEN', opened_at timestamptz not null default now(),
  closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, booking_id)
);
create index if not exists hotel_folios_org_status_idx on public.hotel_folios(organization_id, status, opened_at);

create table if not exists public.hotel_folio_lines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  folio_id uuid not null references public.hotel_folios(id) on delete cascade,
  line_type text not null, description text not null, amount numeric not null, tax_amount numeric not null default 0,
  service_date date not null default current_date, source_type text, source_id text, finance_reference_id uuid,
  metadata jsonb not null default '{}'::jsonb, voided_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists hotel_folio_lines_org_folio_idx on public.hotel_folio_lines(organization_id, folio_id, created_at);

create table if not exists public.hotel_room_moves (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  booking_id uuid not null references public.hotel_bookings(id) on delete cascade,
  from_room_id uuid references public.hotel_rooms(id) on delete set null,
  to_room_id uuid not null references public.hotel_rooms(id) on delete restrict,
  reason text, moved_by uuid, moved_at timestamptz not null default now()
);
create index if not exists hotel_room_moves_org_booking_idx on public.hotel_room_moves(organization_id, booking_id, moved_at desc);

create table if not exists public.hotel_pre_arrival_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  booking_id uuid not null references public.hotel_bookings(id) on delete cascade,
  token_hash text not null, status text not null default 'OPEN', registration_data jsonb not null default '{}'::jsonb,
  consent_data jsonb not null default '{}'::jsonb, expires_at timestamptz not null, completed_at timestamptz,
  created_at timestamptz not null default now(), unique (organization_id, token_hash)
);
create index if not exists hotel_pre_arrival_booking_idx on public.hotel_pre_arrival_sessions(organization_id, booking_id, status);

create table if not exists public.hotel_upsell_offers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  code text not null, name text not null, description text, price numeric not null default 0,
  currency_code text not null default 'THB', active boolean not null default true,
  inventory_policy jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, property_id, code)
);

create table if not exists public.hotel_booking_upsells (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  booking_id uuid not null references public.hotel_bookings(id) on delete cascade,
  offer_id uuid not null references public.hotel_upsell_offers(id) on delete restrict,
  quantity integer not null default 1, unit_price numeric not null, status text not null default 'ACCEPTED',
  created_at timestamptz not null default now(), unique (organization_id, booking_id, offer_id)
);

create table if not exists public.hotel_night_audits (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  business_date date not null, status text not null default 'OPEN', control_summary jsonb not null default '{}'::jsonb,
  opened_by uuid, opened_at timestamptz not null default now(), closed_by uuid, closed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, property_id, business_date)
);
create index if not exists hotel_night_audits_scope_idx on public.hotel_night_audits(organization_id, property_id, business_date desc);

create table if not exists public.hotel_forecast_snapshots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  forecast_date date not null, stay_date date not null, rooms_available integer not null default 0,
  rooms_sold integer not null default 0, occupancy_percent numeric not null default 0,
  room_revenue numeric not null default 0, adr numeric not null default 0, revpar numeric not null default 0,
  source text not null default 'SYSTEM', created_at timestamptz not null default now(),
  unique (organization_id, property_id, forecast_date, stay_date, source)
);
create index if not exists hotel_forecast_snapshots_scope_idx on public.hotel_forecast_snapshots(organization_id, property_id, forecast_date, stay_date);

do $$
declare
  t text;
  hotel_tables text[] := array[
    'hotel_bookings','hotel_concierge_requests','hotel_guest_requests','hotel_guests','hotel_housekeeping_tasks',
    'hotel_maintenance_requests','hotel_maintenance_tasks','hotel_properties','hotel_rooms','hotel_rate_plans','hotel_groups',
    'hotel_channel_connections','hotel_rate_calendar','hotel_channel_mappings','hotel_channel_sync_jobs','hotel_folios',
    'hotel_folio_lines','hotel_room_moves','hotel_pre_arrival_sessions','hotel_upsell_offers','hotel_booking_upsells',
    'hotel_night_audits','hotel_forecast_snapshots'
  ];
begin
  foreach t in array hotel_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon', t);
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t);
      execute format('grant select on table public.%I to authenticated', t);
      execute format('grant all on table public.%I to service_role', t);
      execute format('drop policy if exists %I on public.%I', t || '_organization_read', t);
      execute format('create policy %I on public.%I for select to authenticated using (public.same_organization(organization_id))', t || '_organization_read', t);
    end if;
  end loop;
end $$;

commit;
