begin;

create table if not exists public.managed_media_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_service_id uuid null references public.organization_services(id) on delete set null,
  usage_id uuid null references public.platform_service_usage(id) on delete set null,
  provider text not null,
  service_id text not null default 'meta-ads',
  status text not null default 'RESERVED',
  campaign_name text not null,
  currency text not null,
  authorized_budget numeric(18,6) not null check (authorized_budget > 0),
  reserved_amount numeric(18,6) not null check (reserved_amount >= 0),
  settled_amount numeric(18,6) not null default 0 check (settled_amount >= 0),
  released_amount numeric(18,6) not null default 0 check (released_amount >= 0),
  provider_campaign_id text null,
  provider_ad_set_id text null,
  provider_creative_id text null,
  provider_ad_id text null,
  source_asset_id uuid null,
  destination text null,
  delivery_channels jsonb not null default '[]'::jsonb,
  targeting jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  provider_result jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint managed_media_campaigns_settlement_guard check (
    settled_amount + released_amount <= reserved_amount
  )
);

create index if not exists managed_media_campaigns_org_created_idx
  on public.managed_media_campaigns (organization_id, created_at desc);

create unique index if not exists managed_media_campaigns_provider_campaign_uidx
  on public.managed_media_campaigns (provider, provider_campaign_id)
  where provider_campaign_id is not null;

alter table public.managed_media_campaigns enable row level security;

revoke all on public.managed_media_campaigns from anon;
revoke all on public.managed_media_campaigns from authenticated;
grant select, insert, update, delete on public.managed_media_campaigns to service_role;

create or replace function public.settle_managed_media_campaign(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_cumulative_provider_spend numeric,
  p_settlement_key text,
  p_complete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.managed_media_campaigns%rowtype;
  v_cumulative numeric := round(coalesce(p_cumulative_provider_spend, 0), 6);
  v_delta numeric;
  v_unused numeric;
  v_charge_reference text;
  v_release_reference text;
begin
  if p_organization_id is null then raise exception 'organization_id required'; end if;
  if p_campaign_id is null then raise exception 'campaign_id required'; end if;
  if nullif(btrim(coalesce(p_settlement_key, '')), '') is null then
    raise exception 'settlement_key required';
  end if;

  select *
  into v_campaign
  from public.managed_media_campaigns
  where id = p_campaign_id
    and organization_id = p_organization_id
  for update;

  if not found then raise exception 'MANAGED_MEDIA_CAMPAIGN_NOT_FOUND'; end if;
  if v_cumulative < v_campaign.settled_amount then
    raise exception 'MANAGED_MEDIA_SPEND_CANNOT_DECREASE';
  end if;
  if v_cumulative > v_campaign.reserved_amount then
    raise exception 'MANAGED_MEDIA_SPEND_EXCEEDS_RESERVATION';
  end if;
  if v_campaign.status = 'COMPLETED' then
    if v_cumulative <> v_campaign.settled_amount then
      raise exception 'MANAGED_MEDIA_CAMPAIGN_ALREADY_COMPLETED';
    end if;
    return jsonb_build_object(
      'campaign', to_jsonb(v_campaign),
      'delta_charged', 0,
      'released', 0,
      'already_completed', true
    );
  end if;

  v_delta := round(v_cumulative - v_campaign.settled_amount, 6);

  if v_delta > 0 then
    v_charge_reference := v_campaign.id::text || ':spend:' || btrim(p_settlement_key);
    perform public.apply_wallet_transaction(
      p_organization_id,
      'CHARGE',
      v_delta,
      v_campaign.currency,
      v_campaign.provider,
      v_campaign.usage_id,
      null,
      v_charge_reference,
      'CHARGE:' || v_charge_reference,
      jsonb_build_object(
        'campaign_id', v_campaign.id,
        'provider_campaign_id', v_campaign.provider_campaign_id,
        'settlement_key', btrim(p_settlement_key),
        'cumulative_provider_spend', v_cumulative
      )
    );
  end if;

  v_unused := 0;
  if p_complete then
    v_unused := round(
      v_campaign.reserved_amount - v_cumulative - v_campaign.released_amount,
      6
    );

    if v_unused > 0 then
      v_release_reference := v_campaign.id::text || ':completion-release';
      perform public.apply_wallet_transaction(
        p_organization_id,
        'RELEASE',
        v_unused,
        v_campaign.currency,
        v_campaign.provider,
        null,
        null,
        v_release_reference,
        'RELEASE:' || v_release_reference,
        jsonb_build_object(
          'campaign_id', v_campaign.id,
          'provider_campaign_id', v_campaign.provider_campaign_id
        )
      );
    end if;
  end if;

  update public.managed_media_campaigns
  set
    settled_amount = v_cumulative,
    released_amount = released_amount + greatest(v_unused, 0),
    status = case when p_complete then 'COMPLETED' else status end,
    completed_at = case when p_complete then now() else completed_at end,
    updated_at = now()
  where id = v_campaign.id
    and organization_id = p_organization_id
  returning * into v_campaign;

  return jsonb_build_object(
    'campaign', to_jsonb(v_campaign),
    'delta_charged', greatest(v_delta, 0),
    'released', greatest(v_unused, 0),
    'already_completed', false
  );
end;
$$;

revoke all on function public.settle_managed_media_campaign(uuid, uuid, numeric, text, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_managed_media_campaign(uuid, uuid, numeric, text, boolean)
  to service_role;

comment on table public.managed_media_campaigns is
  'Organization-scoped ledger for Avantiqo-managed media budget reservation, provider execution, spend settlement and release.';

comment on function public.settle_managed_media_campaign(uuid, uuid, numeric, text, boolean) is
  'Atomically locks one managed media campaign, charges newly verified provider spend, releases unused prepaid funds at completion, and updates settlement evidence.';

notify pgrst, 'reload schema';

commit;
