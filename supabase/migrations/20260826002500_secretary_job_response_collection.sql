begin;

create table if not exists public.secretary_job_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.secretary_jobs(id) on delete cascade,
  job_step_id uuid not null references public.secretary_job_steps(id) on delete cascade,
  contact_party_id uuid not null,
  conversation_id uuid null references public.communication_conversations(id) on delete set null,
  outbound_message_id uuid null references public.communication_messages(id) on delete set null,
  outbound_call_request_id uuid null references public.secretary_outbound_call_requests(id) on delete set null,
  channel_type text not null check (channel_type in ('EMAIL','MESSAGE','CALL')),
  status text not null default 'AWAITING'
    check (status in ('AWAITING','RECEIVED','EXTRACTED','TIMED_OUT','CANCELLED','FAILED')),
  sent_at timestamptz not null,
  response_due_at timestamptz not null,
  inbound_message_id uuid null references public.communication_messages(id) on delete set null,
  received_at timestamptz null,
  response_body text null,
  extracted_terms jsonb not null default '{}'::jsonb,
  extraction_confidence numeric(5,4) null
    check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_job_responses_contact_fkey
    foreign key (organization_id, contact_party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (organization_id, job_step_id)
);

create index if not exists secretary_job_responses_pending_idx
  on public.secretary_job_responses (status, response_due_at, created_at)
  where status in ('AWAITING','RECEIVED');

create index if not exists secretary_job_responses_job_idx
  on public.secretary_job_responses (organization_id, job_id, status, created_at);

create table if not exists public.secretary_job_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.secretary_jobs(id) on delete cascade,
  comparison_kind text not null default 'SUPPLIER_QUOTE',
  status text not null default 'COMPLETED' check (status in ('COMPLETED','INSUFFICIENT_EVIDENCE')),
  criteria jsonb not null default '[]'::jsonb,
  ranked_options jsonb not null default '[]'::jsonb,
  recommendation text null,
  uncertainty jsonb not null default '[]'::jsonb,
  evidence_response_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_id, comparison_kind)
);

alter table public.secretary_job_responses enable row level security;
alter table public.secretary_job_comparisons enable row level security;
revoke all on public.secretary_job_responses from anon, authenticated;
revoke all on public.secretary_job_comparisons from anon, authenticated;
grant select, insert, update, delete on public.secretary_job_responses to service_role;
grant select, insert, update, delete on public.secretary_job_comparisons to service_role;

comment on table public.secretary_job_responses is
  'Durable response watchers for Secretary autonomous outreach. Outbound requests are sent first; replies are collected asynchronously before evidence extraction.';
comment on table public.secretary_job_comparisons is
  'Evidence-grounded comparison of Secretary job responses. Recommendations never authorize an order, payment, contract or acceptance of commercial terms.';

commit;
