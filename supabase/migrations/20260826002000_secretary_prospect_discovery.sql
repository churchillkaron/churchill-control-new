begin;

alter table public.secretary_job_steps
  drop constraint if exists secretary_job_steps_action_type_check;

alter table public.secretary_job_steps
  add constraint secretary_job_steps_action_type_check
  check (action_type in (
    'RESEARCH','DISCOVER_CONTACTS','CALL','MESSAGE','EMAIL',
    'CREATE_TASK','CREATE_EVENT','REVIEW','OTHER'
  ));

create table if not exists public.secretary_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  source_job_id uuid null references public.secretary_jobs(id) on delete set null,
  source_job_step_id uuid null references public.secretary_job_steps(id) on delete set null,
  party_id uuid null,
  discovery_key text not null,
  company_name text not null,
  website_url text null,
  normalized_domain text null,
  email text null,
  phone text null,
  status text not null default 'DISCOVERED'
    check (status in ('DISCOVERED','CONTACT_VERIFIED','MATERIALIZED','REJECTED')),
  confidence numeric(5,4) not null default 0
    check (confidence >= 0 and confidence <= 1),
  evidence_urls jsonb not null default '[]'::jsonb,
  evidence_claims jsonb not null default '[]'::jsonb,
  contact_evidence jsonb not null default '{}'::jsonb,
  materialized_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_prospects_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete set null,
  unique (organization_id, discovery_key)
);

create index if not exists secretary_prospects_job_idx
  on public.secretary_prospects (organization_id, source_job_id, status, created_at);

create index if not exists secretary_prospects_party_idx
  on public.secretary_prospects (organization_id, party_id)
  where party_id is not null;

create index if not exists secretary_prospects_domain_idx
  on public.secretary_prospects (organization_id, normalized_domain)
  where normalized_domain is not null;

alter table public.secretary_prospects enable row level security;
revoke all on public.secretary_prospects from anon, authenticated;
grant select, insert, update, delete on public.secretary_prospects to service_role;

comment on table public.secretary_prospects is
  'Evidence-backed companies discovered by Avantiqo Secretary before supplier/customer master conversion. Prospect materialization creates only a governed contact/party, never a procurement vendor or financial commitment.';

comment on column public.secretary_prospects.contact_evidence is
  'Verification evidence for public contact channels. Internet evidence informs contact discovery but never authorizes purchases, contracts or other business commitments.';

commit;
