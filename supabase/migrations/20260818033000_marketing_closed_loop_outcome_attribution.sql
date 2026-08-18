alter table public.marketing_attribution
  add column if not exists marketing_campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists managed_media_campaign_id uuid references public.managed_media_campaigns(id) on delete set null,
  add column if not exists provider_campaign_id text,
  add column if not exists outcome_type text,
  add column if not exists qualified boolean not null default false,
  add column if not exists quantity numeric not null default 1,
  add column if not exists party_id uuid,
  add column if not exists lead_id uuid,
  add column if not exists reservation_id uuid,
  add column if not exists order_id uuid,
  add column if not exists invoice_id uuid,
  add column if not exists source_document_type text,
  add column if not exists source_document_id text,
  add column if not exists attribution_model text not null default 'DIRECT',
  add column if not exists confidence numeric not null default 1,
  add column if not exists idempotency_key text,
  add column if not exists occurred_at timestamptz not null default now();

update public.marketing_attribution
set outcome_type = coalesce(nullif(trim(outcome_type), ''), 'CONVERSION')
where outcome_type is null or trim(outcome_type) = '';

alter table public.marketing_attribution
  alter column outcome_type set default 'CONVERSION',
  alter column outcome_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marketing_attribution'::regclass
      and conname = 'marketing_attribution_confidence_check'
  ) then
    alter table public.marketing_attribution
      add constraint marketing_attribution_confidence_check
      check (confidence >= 0 and confidence <= 1);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marketing_attribution'::regclass
      and conname = 'marketing_attribution_quantity_check'
  ) then
    alter table public.marketing_attribution
      add constraint marketing_attribution_quantity_check
      check (quantity >= 0);
  end if;
end
$$;

create unique index if not exists marketing_attribution_org_idempotency_uidx
  on public.marketing_attribution (organization_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists marketing_attribution_marketing_campaign_idx
  on public.marketing_attribution (organization_id, marketing_campaign_id, occurred_at desc);

create index if not exists marketing_attribution_managed_media_idx
  on public.marketing_attribution (organization_id, managed_media_campaign_id, occurred_at desc);

create index if not exists marketing_attribution_provider_campaign_idx
  on public.marketing_attribution (organization_id, provider_id, provider_campaign_id, occurred_at desc);

comment on column public.marketing_attribution.marketing_campaign_id is
  'Avantiqo organization-scoped Marketing campaign that owns the business-outcome attribution.';
comment on column public.marketing_attribution.managed_media_campaign_id is
  'Optional governed paid-media execution record that contributed to the outcome.';
comment on column public.marketing_attribution.outcome_type is
  'Business outcome such as LEAD, QUALIFIED_LEAD, BOOKING, SALE, PAYMENT, REFUND or CANCELLATION.';
comment on column public.marketing_attribution.idempotency_key is
  'Organization-scoped deterministic key used to prevent duplicate business-outcome attribution.';
