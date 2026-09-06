-- Keep operational reservation cancellation separate from any later commercial settlement decision.
alter table public.hotel_bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_detail text;

comment on column public.hotel_bookings.cancelled_at is
  'When an unconsumed reservation was operationally cancelled. Does not imply refund, fee, forfeiture, or folio treatment.';
comment on column public.hotel_bookings.cancellation_reason is
  'Operator-selected reason for operational reservation cancellation.';
comment on column public.hotel_bookings.cancellation_detail is
  'Optional human explanation retained with cancellation evidence.';
