alter table public.hotel_properties
  add column if not exists time_zone text,
  add column if not exists business_day_cutoff_minutes integer,
  add column if not exists operational_day_configured_at timestamptz;

alter table public.hotel_properties
  drop constraint if exists hotel_properties_business_day_cutoff_minutes_check;

alter table public.hotel_properties
  add constraint hotel_properties_business_day_cutoff_minutes_check
  check (
    business_day_cutoff_minutes is null
    or business_day_cutoff_minutes between 0 and 720
  );

comment on column public.hotel_properties.time_zone is
  'IANA timezone used to derive the property-local Hotel operational day. Null means compatibility fallback only; the runtime must not guess a timezone.';

comment on column public.hotel_properties.business_day_cutoff_minutes is
  'Minutes after local midnight before the Hotel business date rolls forward. Null is treated as 0 only in compatibility mode until explicitly configured.';

comment on column public.hotel_properties.operational_day_configured_at is
  'Timestamp when an operator last explicitly configured the property operational-day boundary.';
