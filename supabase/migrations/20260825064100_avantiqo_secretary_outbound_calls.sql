begin;

create table if not exists public.secretary_outbound_call_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_line_id uuid not null references public.secretary_phone_lines(id) on delete restrict,
  contact_party_id uuid null,
  requested_by_party_id uuid null,
  remote_address text not null,
  objective text not null,
  language text null,
  status text not null default 'PENDING'
    check (status in ('PENDING','CLAIMED','DIALING','CONNECTED','COMPLETED','FAILED','CANCELLED')),
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  claimed_at timestamptz null,
  lease_expires_at timestamptz null,
  claim_token uuid null,
  call_id uuid null references public.secretary_calls(id) on delete set null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_outbound_request_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  constraint secretary_outbound_request_actor_fkey
    foreign key (organization_id, requested_by_party_id)
    references public.parties (organization_id, id)
    on delete set null
);

create index if not exists secretary_outbound_call_requests_queue_idx
  on public.secretary_outbound_call_requests (status, scheduled_at, created_at)
  where status in ('PENDING','CLAIMED');
create index if not exists secretary_outbound_call_requests_org_idx
  on public.secretary_outbound_call_requests (organization_id, created_at desc);
create index if not exists secretary_outbound_call_requests_contact_idx
  on public.secretary_outbound_call_requests (organization_id, contact_party_id, created_at desc)
  where contact_party_id is not null;

alter table public.secretary_outbound_call_requests enable row level security;
revoke all on public.secretary_outbound_call_requests from anon, authenticated;
grant select, insert, update, delete on public.secretary_outbound_call_requests to service_role;

create or replace function public.secretary_claim_outbound_call_request(
  p_lease_seconds integer default 90
)
returns public.secretary_outbound_call_requests
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.secretary_outbound_call_requests%rowtype;
  v_token uuid := gen_random_uuid();
  v_lease integer := greatest(15, least(coalesce(p_lease_seconds, 90), 600));
begin
  select * into v_request
  from public.secretary_outbound_call_requests r
  where (
      r.status = 'PENDING'
      or (
        r.status = 'CLAIMED'
        and r.lease_expires_at is not null
        and r.lease_expires_at <= now()
      )
    )
    and r.scheduled_at <= now()
    and r.attempt_count < r.max_attempts
  order by r.scheduled_at asc, r.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.secretary_outbound_call_requests
  set status = 'CLAIMED',
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease),
      claim_token = v_token,
      updated_at = now(),
      last_error = null
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.secretary_claim_outbound_call_request(integer)
  from public, anon, authenticated;
grant execute on function public.secretary_claim_outbound_call_request(integer)
  to service_role;

comment on table public.secretary_outbound_call_requests is
  'Avantiqo-owned durable outbound-call orchestration. A phone transport may claim work, but it does not own the request, objective, contact, policy, conversation or result.';
comment on function public.secretary_claim_outbound_call_request(integer) is
  'Atomically leases one due Avantiqo Secretary outbound call request using SKIP LOCKED. Designed for one or many in-house transport workers.';

commit;
