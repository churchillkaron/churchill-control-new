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

create unique index if not exists communication_conversations_external_thread_uidx
  on public.communication_conversations (organization_id, provider, connection_id, external_thread_id)
  where external_thread_id is not null;
create index if not exists communication_conversations_org_last_idx
  on public.communication_conversations (organization_id, last_message_at desc nulls last, updated_at desc);
create index if not exists communication_conversations_org_provider_idx
  on public.communication_conversations (organization_id, provider, status, last_message_at desc nulls last);
create index if not exists communication_conversations_customer_party_idx
  on public.communication_conversations (organization_id, customer_party_id)
  where customer_party_id is not null;

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
  status text not null default 'RECEIVED' check (status in ('RECEIVED','DRAFT','QUEUED','SENDING','SENT','DELIVERED','READ','FAILED')),
  sent_by_party_id uuid null references public.parties(id) on delete set null,
  error_code text null,
  error_message text null,
  sent_at timestamptz null,
  received_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists communication_messages_external_message_uidx
  on public.communication_messages (organization_id, provider, external_message_id)
  where external_message_id is not null;
create index if not exists communication_messages_conversation_created_idx
  on public.communication_messages (organization_id, conversation_id, created_at asc);
create index if not exists communication_messages_org_status_idx
  on public.communication_messages (organization_id, status, updated_at desc);

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

create index if not exists communication_attachments_message_idx
  on public.communication_attachments (organization_id, message_id, created_at asc);

alter table public.communication_conversations enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_attachments enable row level security;

revoke all on public.communication_conversations from anon, authenticated;
revoke all on public.communication_messages from anon, authenticated;
revoke all on public.communication_attachments from anon, authenticated;
grant select, insert, update, delete on public.communication_conversations to service_role;
grant select, insert, update, delete on public.communication_messages to service_role;
grant select, insert, update, delete on public.communication_attachments to service_role;

comment on table public.communication_conversations is 'Organization-scoped external business conversations normalized across connected channels.';
comment on table public.communication_messages is 'Normalized inbound and outbound business messages. Provider credentials never belong in this table.';
comment on table public.communication_attachments is 'Attachment references for normalized business communications; secrets are prohibited.';
