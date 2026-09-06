-- Preserve booked stay terms while recording the actual early-departure decision separately.
alter table public.hotel_bookings
  add column if not exists actual_check_out_at timestamptz,
  add column if not exists early_departure_requested_at timestamptz,
  add column if not exists early_departure_business_date date,
  add column if not exists early_departure_reason text,
  add column if not exists early_departure_review_status text,
  add column if not exists early_departure_reviewed_at timestamptz,
  add column if not exists early_departure_review_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.hotel_bookings'::regclass
      and conname = 'hotel_bookings_early_departure_review_status_check'
  ) then
    alter table public.hotel_bookings
      add constraint hotel_bookings_early_departure_review_status_check
      check (early_departure_review_status is null or early_departure_review_status in ('REVIEW_REQUIRED', 'CONFIRMED'));
  end if;
end $$;

comment on column public.hotel_bookings.actual_check_out_at is
  'Actual governed room departure timestamp. The booked check_out_date remains the original scheduled stay truth.';
comment on column public.hotel_bookings.early_departure_requested_at is
  'When an in-house guest requested departure before the booked check_out_date.';
comment on column public.hotel_bookings.early_departure_business_date is
  'Server-derived date on which early departure was prepared. Never supplied by the browser.';
comment on column public.hotel_bookings.early_departure_reason is
  'Controlled operational reason for leaving before the booked departure.';
comment on column public.hotel_bookings.early_departure_review_status is
  'Commercial review gate only. CONFIRMED does not itself create a fee, refund, forfeiture, folio line, or payment.';
comment on column public.hotel_bookings.early_departure_reviewed_at is
  'When a human confirmed that current commercial treatment had been reviewed before early check-out.';
comment on column public.hotel_bookings.early_departure_review_note is
  'Human evidence describing the unused-night / refund / fee treatment reviewed before early check-out.';
