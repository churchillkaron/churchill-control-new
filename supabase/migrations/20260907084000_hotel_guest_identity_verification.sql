-- Governed Hotel guest identity verification.
-- Identity remains an arrival attention signal, not a hard check-in blocker.
-- This migration adds append-only verification evidence while preserving the existing
-- hotel_guests.identity_verified_at projection used by arrival readiness.

create table if not exists public.hotel_guest_identity_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  booking_id uuid not null references public.hotel_bookings(id) on delete restrict,
  guest_id uuid not null references public.hotel_guests(id) on delete restrict,
  verified_at timestamptz not null default now(),
  verified_by_staff_account_id uuid not null,
  verification_method text not null,
  created_at timestamptz not null default now(),
  constraint hotel_guest_identity_verifications_method_check
    check (char_length(btrim(verification_method)) between 3 and 80)
);

create index if not exists hotel_guest_identity_verifications_guest_idx
  on public.hotel_guest_identity_verifications(organization_id, guest_id, verified_at desc);
create index if not exists hotel_guest_identity_verifications_booking_idx
  on public.hotel_guest_identity_verifications(organization_id, booking_id, verified_at desc);

alter table public.hotel_guest_identity_verifications enable row level security;
revoke all on table public.hotel_guest_identity_verifications from public, anon, authenticated;
grant select, insert on table public.hotel_guest_identity_verifications to service_role;

comment on table public.hotel_guest_identity_verifications is
  'Append-only Hotel evidence that a staff member verified a governed guest identity. No identity document contents are stored here.';
comment on column public.hotel_guest_identity_verifications.verification_method is
  'Non-sensitive verification method label only; document numbers or images must not be stored in this evidence row.';

create or replace function public.hotel_verify_guest_identity_guarded(
  p_organization_id uuid,
  p_booking_id uuid,
  p_verified_by_staff_account_id uuid,
  p_verification_method text default 'DOCUMENT_REVIEW'
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking public.hotel_bookings%rowtype;
  v_guest public.hotel_guests%rowtype;
  v_method text := upper(btrim(coalesce(p_verification_method, '')));
  v_verified_at timestamptz := now();
  v_evidence_id uuid;
  v_existing_evidence_id uuid;
begin
  if p_organization_id is null or p_booking_id is null then
    raise exception 'HOTEL_IDENTITY_VERIFY_SCOPE_REQUIRED';
  end if;
  if p_verified_by_staff_account_id is null then
    raise exception 'HOTEL_IDENTITY_VERIFY_STAFF_REQUIRED';
  end if;
  if char_length(v_method) < 3 or char_length(v_method) > 80 then
    raise exception 'HOTEL_IDENTITY_VERIFY_METHOD_INVALID';
  end if;

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.id = p_booking_id
  for update;

  if not found then
    raise exception 'HOTEL_IDENTITY_VERIFY_BOOKING_NOT_FOUND';
  end if;
  if upper(coalesce(v_booking.status, '')) not in ('RESERVED', 'CHECKED_IN') then
    raise exception 'HOTEL_IDENTITY_VERIFY_BOOKING_NOT_ACTIVE';
  end if;
  if v_booking.guest_id is null then
    raise exception 'HOTEL_IDENTITY_VERIFY_GUEST_REQUIRED';
  end if;

  select * into v_guest
  from public.hotel_guests g
  where g.organization_id = p_organization_id
    and g.id = v_booking.guest_id
  for update;

  if not found then
    raise exception 'HOTEL_IDENTITY_VERIFY_GUEST_NOT_FOUND';
  end if;

  if v_guest.identity_verified_at is not null then
    select e.id into v_existing_evidence_id
    from public.hotel_guest_identity_verifications e
    where e.organization_id = p_organization_id
      and e.guest_id = v_guest.id
    order by e.verified_at desc
    limit 1;

    return jsonb_build_object(
      'booking_id', v_booking.id,
      'guest_id', v_guest.id,
      'verified_at', v_guest.identity_verified_at,
      'evidence_id', v_existing_evidence_id,
      'already_verified', true
    );
  end if;

  insert into public.hotel_guest_identity_verifications (
    organization_id,
    booking_id,
    guest_id,
    verified_at,
    verified_by_staff_account_id,
    verification_method
  ) values (
    p_organization_id,
    v_booking.id,
    v_guest.id,
    v_verified_at,
    p_verified_by_staff_account_id,
    v_method
  )
  returning id into v_evidence_id;

  update public.hotel_guests
  set identity_verified_at = v_verified_at,
      updated_at = v_verified_at
  where organization_id = p_organization_id
    and id = v_guest.id
    and identity_verified_at is null;

  if not found then
    raise exception 'HOTEL_IDENTITY_VERIFY_GUEST_CHANGED';
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'guest_id', v_guest.id,
    'verified_at', v_verified_at,
    'evidence_id', v_evidence_id,
    'verification_method', v_method,
    'already_verified', false
  );
end;
$function$;

revoke execute on function public.hotel_verify_guest_identity_guarded(uuid,uuid,uuid,text) from public;
revoke execute on function public.hotel_verify_guest_identity_guarded(uuid,uuid,uuid,text) from anon;
revoke execute on function public.hotel_verify_guest_identity_guarded(uuid,uuid,uuid,text) from authenticated;
grant execute on function public.hotel_verify_guest_identity_guarded(uuid,uuid,uuid,text) to service_role;
