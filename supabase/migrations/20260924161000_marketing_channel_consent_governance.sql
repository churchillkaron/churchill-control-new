begin;

create table if not exists public.marketing_channel_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null,
  channel text not null check (channel in ('email','whatsapp','line','telegram','sms','push')),
  consent_status text not null check (consent_status in ('OPTED_IN','OPTED_OUT','SUPPRESSED')),
  recipient_address text null,
  consent_source text not null,
  consent_evidence jsonb not null default '{}'::jsonb,
  opted_in_at timestamptz null,
  opted_out_at timestamptz null,
  suppression_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, party_id, channel),
  constraint marketing_channel_preferences_org_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  constraint marketing_channel_preferences_status_time_check check (
    (consent_status = 'OPTED_IN' and opted_in_at is not null and opted_out_at is null and suppression_reason is null)
    or (consent_status = 'OPTED_OUT' and opted_out_at is not null and suppression_reason is null)
    or (consent_status = 'SUPPRESSED' and suppression_reason is not null)
  )
);

create index if not exists marketing_channel_preferences_org_channel_status_idx
  on public.marketing_channel_preferences (organization_id, channel, consent_status, updated_at desc);

create index if not exists marketing_channel_preferences_org_party_idx
  on public.marketing_channel_preferences (organization_id, party_id, updated_at desc);

comment on table public.marketing_channel_preferences is
  'Organization-scoped, channel-specific marketing consent and suppression authority. Campaign delivery must require OPTED_IN for the exact channel; operational communications remain governed separately.';

alter table public.marketing_channel_preferences enable row level security;
revoke all on table public.marketing_channel_preferences from public, anon, authenticated;

commit;
