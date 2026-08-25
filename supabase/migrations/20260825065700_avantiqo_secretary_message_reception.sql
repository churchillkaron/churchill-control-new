begin;

create table if not exists public.secretary_contact_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null,
  provider text not null,
  channel_type text not null,
  external_participant_id text not null,
  external_address text null,
  display_name text null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_inbound_at timestamptz null,
  last_outbound_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_contact_channels_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (organization_id, provider, channel_type, external_participant_id)
);

create index if not exists secretary_contact_channels_party_idx
  on public.secretary_contact_channels (organization_id, party_id, updated_at desc);
create index if not exists secretary_contact_channels_address_idx
  on public.secretary_contact_channels (organization_id, external_address)
  where external_address is not null;

create table if not exists public.secretary_message_reception_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  inbound_message_id uuid not null references public.communication_messages(id) on delete cascade,
  contact_party_id uuid null,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','COMPLETED','FAILED','SKIPPED')),
  detected_language text null,
  decision_action text null,
  decision jsonb not null default '{}'::jsonb,
  action_result jsonb not null default '{}'::jsonb,
  response_message_id uuid null references public.communication_messages(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  completed_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_message_reception_contact_party_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (organization_id, inbound_message_id)
);

create index if not exists secretary_message_reception_claim_idx
  on public.secretary_message_reception_requests (status, available_at, created_at)
  where status in ('PENDING','FAILED');
create index if not exists secretary_message_reception_conversation_idx
  on public.secretary_message_reception_requests (organization_id, conversation_id, created_at desc);

alter table public.secretary_contact_channels enable row level security;
alter table public.secretary_message_reception_requests enable row level security;

revoke all on public.secretary_contact_channels from anon, authenticated;
revoke all on public.secretary_message_reception_requests from anon, authenticated;
grant select, insert, update, delete on public.secretary_contact_channels to service_role;
grant select, insert, update, delete on public.secretary_message_reception_requests to service_role;

create or replace function public.claim_secretary_message_reception(
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.secretary_message_reception_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lease uuid := gen_random_uuid();
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'SECRETARY_MESSAGE_WORKER_REQUIRED';
  end if;

  select id into v_id
  from public.secretary_message_reception_requests
  where
    status in ('PENDING','FAILED')
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
  update public.secretary_message_reception_requests
  set
    status = 'PROCESSING',
    attempt_count = attempt_count + 1,
    lease_token = v_lease,
    lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id),
    updated_at = now(),
    last_error = null
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_secretary_message_reception(text, integer) from public, anon, authenticated;
grant execute on function public.claim_secretary_message_reception(text, integer) to service_role;

comment on table public.secretary_contact_channels is
  'Channel identities mapped onto canonical public.parties for Avantiqo Secretary. This is an identity alias layer, not a second contact authority.';
comment on table public.secretary_message_reception_requests is
  'Durable Avantiqo-owned queue for restricted Secretary handling of normalized inbound Communications messages.';
comment on function public.claim_secretary_message_reception(text, integer) is
  'Atomically leases one due inbound written-message Secretary request to an internal worker using SKIP LOCKED.';

commit;
