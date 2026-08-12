alter table public.staff_shifts
  add column if not exists clock_in_latitude double precision,
  add column if not exists clock_in_longitude double precision,
  add column if not exists clock_in_accuracy_meters double precision,
  add column if not exists clock_in_distance_meters double precision,
  add column if not exists clock_in_location_captured_at timestamptz,
  add column if not exists clock_in_location_verified boolean;

alter table public.staff_attendance
  add column if not exists clock_in_latitude double precision,
  add column if not exists clock_in_longitude double precision,
  add column if not exists clock_in_accuracy_meters double precision,
  add column if not exists clock_in_distance_meters double precision,
  add column if not exists clock_in_location_captured_at timestamptz,
  add column if not exists clock_in_location_verified boolean;

alter table public.staff_shifts
  drop constraint if exists staff_shifts_clock_in_latitude_check,
  add constraint staff_shifts_clock_in_latitude_check
    check (clock_in_latitude is null or clock_in_latitude between -90 and 90),
  drop constraint if exists staff_shifts_clock_in_longitude_check,
  add constraint staff_shifts_clock_in_longitude_check
    check (clock_in_longitude is null or clock_in_longitude between -180 and 180),
  drop constraint if exists staff_shifts_clock_in_accuracy_check,
  add constraint staff_shifts_clock_in_accuracy_check
    check (clock_in_accuracy_meters is null or clock_in_accuracy_meters >= 0),
  drop constraint if exists staff_shifts_clock_in_distance_check,
  add constraint staff_shifts_clock_in_distance_check
    check (clock_in_distance_meters is null or clock_in_distance_meters >= 0);

alter table public.staff_attendance
  drop constraint if exists staff_attendance_clock_in_latitude_check,
  add constraint staff_attendance_clock_in_latitude_check
    check (clock_in_latitude is null or clock_in_latitude between -90 and 90),
  drop constraint if exists staff_attendance_clock_in_longitude_check,
  add constraint staff_attendance_clock_in_longitude_check
    check (clock_in_longitude is null or clock_in_longitude between -180 and 180),
  drop constraint if exists staff_attendance_clock_in_accuracy_check,
  add constraint staff_attendance_clock_in_accuracy_check
    check (clock_in_accuracy_meters is null or clock_in_accuracy_meters >= 0),
  drop constraint if exists staff_attendance_clock_in_distance_check,
  add constraint staff_attendance_clock_in_distance_check
    check (clock_in_distance_meters is null or clock_in_distance_meters >= 0);

create index if not exists staff_shifts_clock_in_location_review_idx
  on public.staff_shifts (organization_id, clock_in_location_verified, clock_in desc)
  where clock_in_location_captured_at is not null;

create index if not exists staff_attendance_clock_in_location_review_idx
  on public.staff_attendance (organization_id, clock_in_location_verified, shift_date desc)
  where clock_in_location_captured_at is not null;
