create table if not exists public.business_partner_product_evidence (
  id uuid primary key default gen_random_uuid(),
  learning_organization_id uuid not null,
  source_organization_fingerprint text not null check (length(source_organization_fingerprint) = 64),
  event_fingerprint text not null check (length(event_fingerprint) = 64),
  mission_family text not null,
  knowledge_domain text not null,
  capability_family text not null,
  lifecycle_state text not null,
  friction_class text not null,
  failure_mode_code text null,
  capability_count integer not null default 0 check (capability_count >= 0),
  external_wait_used boolean not null default false,
  recovery_used boolean not null default false,
  business_effect_verified boolean not null default false,
  key_id text not null,
  evidence_mac text not null check (length(evidence_mac) = 64),
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (learning_organization_id, event_fingerprint)
);

create index if not exists business_partner_product_evidence_pattern_idx
  on public.business_partner_product_evidence
  (learning_organization_id, mission_family, friction_class, observed_at desc);

create index if not exists business_partner_product_evidence_failure_idx
  on public.business_partner_product_evidence
  (learning_organization_id, failure_mode_code, observed_at desc)
  where failure_mode_code is not null;

alter table public.business_partner_product_evidence enable row level security;
revoke all on public.business_partner_product_evidence from anon, authenticated;
comment on table public.business_partner_product_evidence is
  'Service-role-only de-identified structural Business Partner mission evidence. Contains no raw mission text, payload, output, customer identifiers or execution authority.';
