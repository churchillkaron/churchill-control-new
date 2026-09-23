create table if not exists public.staff_phone_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff_accounts(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  phone_hash text not null,
  phone_last4 text,
  verified_channel text not null check (verified_channel in ('WHATSAPP','SMS')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, staff_id)
);

create table if not exists public.staff_phone_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  staff_id uuid not null references public.staff_accounts(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  phone_hash text not null,
  phone_last4 text,
  code_hmac text not null,
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','EXPIRED','LOCKED','CANCELLED','DELIVERY_FAILED')),
  delivery_channel text check (delivery_channel in ('WHATSAPP','SMS')),
  delivery_status text,
  external_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  expires_at timestamptz not null,
  resend_after timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_phone_verification_challenges_staff_idx
  on public.staff_phone_verification_challenges (organization_id, staff_id, created_at desc);
create index if not exists staff_phone_verification_challenges_pending_idx
  on public.staff_phone_verification_challenges (organization_id, staff_id, status, expires_at desc);

alter table public.staff_phone_verifications enable row level security;
alter table public.staff_phone_verification_challenges enable row level security;

revoke all on table public.staff_phone_verifications from anon, authenticated;
revoke all on table public.staff_phone_verification_challenges from anon, authenticated;

grant all on table public.staff_phone_verifications to service_role;
grant all on table public.staff_phone_verification_challenges to service_role;

comment on table public.staff_phone_verifications is 'Server-only canonical proof that the current staff Party phone was verified.';
comment on table public.staff_phone_verification_challenges is 'Server-only hashed OTP challenges for staff phone verification. Raw OTP values are never persisted.';
