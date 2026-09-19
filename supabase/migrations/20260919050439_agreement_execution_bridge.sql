begin;

create table if not exists public.business_agreement_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  source_kind text not null,
  source_id uuid null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  contact_party_id uuid null,
  agreement_type text not null,
  status text not null default 'DETECTED'
    check (status in ('DETECTED','BLOCKED','READY','EXECUTING','EXECUTED','FAILED','SUPERSEDED')),
  target_capability text null,
  target_action text null,
  normalized_facts jsonb not null default '{}'::jsonb,
  missing_facts jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  execution_result jsonb not null default '{}'::jsonb,
  last_error text null,
  detected_at timestamptz not null default now(),
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_agreement_execution_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (organization_id, source_key)
);

create index if not exists business_agreement_executions_status_idx
  on public.business_agreement_executions (organization_id, status, updated_at desc);

create index if not exists business_agreement_executions_conversation_idx
  on public.business_agreement_executions (organization_id, conversation_id, detected_at desc)
  where conversation_id is not null;

create unique index if not exists secretary_tasks_business_agreement_source_uidx
  on public.secretary_tasks ((metadata->>'business_agreement_source_key'))
  where metadata ? 'business_agreement_source_key';

alter table public.business_agreement_executions enable row level security;
revoke all on public.business_agreement_executions from anon, authenticated;
grant select, insert, update, delete on public.business_agreement_executions to service_role;

comment on table public.business_agreement_executions is
  'Server-owned durable bridge from explicit external business agreements to canonical governed Avantiqo execution. Source evidence never grants authority outside the registered target capability.';

commit;
