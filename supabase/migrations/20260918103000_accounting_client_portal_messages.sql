begin;

create table if not exists public.accounting_client_portal_messages (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  portal_grant_id uuid references public.accounting_client_portal_grants(id) on delete set null,
  sender_type text not null check (sender_type in ('CLIENT','ACCOUNTING_FIRM')),
  sender_staff_id uuid references public.staff_accounts(id) on delete set null,
  sender_name text,
  sender_email text,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  read_by_client_at timestamptz,
  read_by_firm_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists accounting_client_portal_messages_engagement_idx
  on public.accounting_client_portal_messages (accounting_firm_id, engagement_id, created_at desc);
create index if not exists accounting_client_portal_messages_client_unread_idx
  on public.accounting_client_portal_messages (accounting_firm_id, engagement_id, read_by_client_at, created_at desc)
  where sender_type = 'ACCOUNTING_FIRM';
create index if not exists accounting_client_portal_messages_firm_unread_idx
  on public.accounting_client_portal_messages (accounting_firm_id, engagement_id, read_by_firm_at, created_at desc)
  where sender_type = 'CLIENT';

alter table public.accounting_client_portal_messages enable row level security;
revoke all on table public.accounting_client_portal_messages from anon, authenticated;
grant select, insert, update, delete on table public.accounting_client_portal_messages to service_role;

comment on table public.accounting_client_portal_messages is
  'Engagement-scoped client/accounting-firm conversation for the governed accounting client portal. This channel grants no general ERP access.';

commit;
