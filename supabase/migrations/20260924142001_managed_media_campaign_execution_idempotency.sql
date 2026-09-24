begin;

create unique index if not exists managed_media_campaigns_marketing_campaign_provider_active_uidx
  on public.managed_media_campaigns (
    organization_id,
    provider,
    (metadata ->> 'marketing_campaign_id')
  )
  where nullif(btrim(metadata ->> 'marketing_campaign_id'), '') is not null
    and status in ('RESERVED', 'PAUSED', 'ACTIVE');

comment on index public.managed_media_campaigns_marketing_campaign_provider_active_uidx is
  'Prevents concurrent duplicate managed-media execution for one Marketing Campaign and provider while allowing failed or completed attempts to leave the active reservation set.';

commit;
