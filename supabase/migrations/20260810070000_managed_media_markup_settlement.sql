begin;

alter table public.managed_media_campaigns
  add column if not exists provider_spend_amount numeric(18,6) not null default 0 check (provider_spend_amount >= 0),
  add column if not exists platform_fee_amount numeric(18,6) not null default 0 check (platform_fee_amount >= 0);

update public.managed_media_campaigns
set provider_spend_amount = settled_amount
where provider_spend_amount = 0
  and settled_amount > 0;

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
  v_markup_percent numeric := 0;
  v_customer_cumulative numeric;
  v_platform_fee numeric;
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

  if coalesce(v_campaign.metadata->>'media_markup_percent', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_markup_percent := (v_campaign.metadata->>'media_markup_percent')::numeric;
  end if;

  if v_markup_percent < 0 then
    raise exception 'MANAGED_MEDIA_MARKUP_PERCENT_INVALID';
  end if;

  if v_cumulative < v_campaign.provider_spend_amount then
    raise exception 'MANAGED_MEDIA_SPEND_CANNOT_DECREASE';
  end if;
  if v_cumulative > v_campaign.authorized_budget then
    raise exception 'MANAGED_MEDIA_SPEND_EXCEEDS_PROVIDER_BUDGET';
  end if;

  v_platform_fee := round(v_cumulative * v_markup_percent / 100, 6);
  v_customer_cumulative := round(v_cumulative + v_platform_fee, 6);

  if v_customer_cumulative > v_campaign.reserved_amount then
    raise exception 'MANAGED_MEDIA_CUSTOMER_CHARGE_EXCEEDS_RESERVATION';
  end if;

  if v_campaign.status = 'COMPLETED' then
    if v_cumulative <> v_campaign.provider_spend_amount then
      raise exception 'MANAGED_MEDIA_CAMPAIGN_ALREADY_COMPLETED';
    end if;
    return jsonb_build_object(
      'campaign', to_jsonb(v_campaign),
      'delta_charged', 0,
      'released', 0,
      'already_completed', true
    );
  end if;

  v_delta := round(v_customer_cumulative - v_campaign.settled_amount, 6);

  if v_delta < 0 then
    raise exception 'MANAGED_MEDIA_CUSTOMER_CHARGE_CANNOT_DECREASE';
  end if;

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
        'cumulative_provider_spend', v_cumulative,
        'media_markup_percent', v_markup_percent,
        'cumulative_platform_fee', v_platform_fee,
        'cumulative_customer_charge', v_customer_cumulative,
        'provider_billed_to', 'AVANTIQO'
      )
    );
  end if;

  v_unused := 0;
  if p_complete then
    v_unused := round(
      v_campaign.reserved_amount - v_customer_cumulative - v_campaign.released_amount,
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
          'provider_campaign_id', v_campaign.provider_campaign_id,
          'provider_spend', v_cumulative,
          'platform_fee', v_platform_fee,
          'customer_charge', v_customer_cumulative
        )
      );
    end if;
  end if;

  update public.managed_media_campaigns
  set
    provider_spend_amount = v_cumulative,
    platform_fee_amount = v_platform_fee,
    settled_amount = v_customer_cumulative,
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

comment on column public.managed_media_campaigns.provider_spend_amount is
  'Cumulative media cost billed by the external advertising provider and payable by Avantiqo.';
comment on column public.managed_media_campaigns.platform_fee_amount is
  'Cumulative Avantiqo fee calculated from the campaign managed-media markup policy.';
comment on function public.settle_managed_media_campaign(uuid, uuid, numeric, text, boolean) is
  'Settles actual provider media spend plus configured Avantiqo markup against the customer prepaid wallet while keeping supplier spend and platform fee separate.';

notify pgrst, 'reload schema';
commit;
