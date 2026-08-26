begin;

-- Test-only foundation for the isolated Secretary meeting certification workdir.
-- This is intentionally NOT a production migration. It supplies only the canonical
-- foreign-key parents that predate the repository's retained migration history, so
-- the real Secretary migrations can be replayed from zero without pulling Finance,
-- Operations, or production data into this local certification.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parties (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text null,
  legal_name text null,
  email text null,
  phone text null,
  party_type text null,
  status text null,
  address text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (id)
);

-- Test-only canonical Communications parents used by Secretary correspondence
-- behavior certification. These mirror only the columns consumed by the current
-- Communications repository; provider credentials and production channel data are
-- deliberately absent.
create table if not exists public.organization_channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  channel_type text not null,
  name text null,
  external_account_id text null,
  external_asset_id text null,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid null references public.organization_channel_connections(id) on delete set null,
  provider text not null,
  channel_type text not null,
  external_thread_id text null,
  external_participant_id text not null,
  external_participant_name text null,
  external_participant_address text null,
  customer_party_id uuid null references public.parties(id) on delete set null,
  subject text null,
  status text not null default 'OPEN' check (status in ('OPEN','ARCHIVED','CLOSED')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz null,
  last_inbound_at timestamptz null,
  last_outbound_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
  connection_id uuid null references public.organization_channel_connections(id) on delete set null,
  provider text not null,
  channel_type text not null,
  direction text not null check (direction in ('INBOUND','OUTBOUND')),
  message_type text not null default 'TEXT',
  external_message_id text null,
  sender_address text null,
  recipient_address text null,
  subject text null,
  body text null,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','DRAFT','QUEUED','SENDING','SENT','DELIVERED','READ','FAILED')),
  sent_by_party_id uuid null references public.parties(id) on delete set null,
  error_code text null,
  error_message text null,
  sent_at timestamptz null,
  received_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null references public.communication_messages(id) on delete cascade,
  storage_path text null,
  external_url text null,
  file_name text null,
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

alter table public.organizations enable row level security;
alter table public.parties enable row level security;
alter table public.organization_channel_connections enable row level security;
alter table public.communication_conversations enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_attachments enable row level security;

grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.parties to service_role;
grant select, insert, update, delete on public.organization_channel_connections to service_role;
grant select, insert, update, delete on public.communication_conversations to service_role;
grant select, insert, update, delete on public.communication_messages to service_role;
grant select, insert, update, delete on public.communication_attachments to service_role;

commit;
