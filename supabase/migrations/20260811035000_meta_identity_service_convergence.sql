-- Meta identity service convergence.
-- Facebook/Instagram publishing services are enabled only where the organization owns the corresponding Meta channel asset.
-- Paid Meta Ads remains a separate PREPAID_MANAGED_MEDIA service.

begin;

insert into public.organization_services (
  organization_id,entity_id,service_category_id,service_id,package_id,status,managed_by,
  authorization_required,usage_enabled,billing_enabled,fallback_enabled,billing_mode,pricing_mode,
  budget_limit,budget_used,hard_budget_limit,default_currency,configuration,metadata,activated_at,created_at,updated_at
)
select distinct
  o.id,w.entity_id,'marketing-social','facebook','core','ACTIVE','avantiqo',
  true,true,true,false,'USAGE','PROVIDER',0,0,false,w.currency,'{}'::jsonb,
  jsonb_build_object(
    'provider','meta',
    'channel_type','social',
    'identity_required',true,
    'advertising_billing_separate',true
  ),
  now(),now(),now()
from public.organizations o
join public.organization_wallets w on w.organization_id=o.id
join public.organization_channel_assets a
  on a.organization_id=o.id
 and a.channel_provider='meta'
 and a.asset_type='facebook_page'
where not exists (
  select 1
  from public.organization_services s
  where s.organization_id=o.id and s.service_id='facebook'
);

update public.organization_services s
set
  entity_id=coalesce(s.entity_id,w.entity_id),
  managed_by='avantiqo',
  authorization_required=true,
  usage_enabled=true,
  billing_enabled=true,
  fallback_enabled=false,
  billing_mode='USAGE',
  pricing_mode='PROVIDER',
  default_currency=w.currency,
  metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object(
    'provider','meta',
    'channel_type','social',
    'identity_required',true,
    'advertising_billing_separate',true
  ),
  updated_at=now()
from public.organization_wallets w
where s.organization_id=w.organization_id
  and s.service_id='facebook'
  and exists (
    select 1
    from public.organization_channel_assets a
    where a.organization_id=s.organization_id
      and a.channel_provider='meta'
      and a.asset_type='facebook_page'
  );

insert into public.organization_services (
  organization_id,entity_id,service_category_id,service_id,package_id,status,managed_by,
  authorization_required,usage_enabled,billing_enabled,fallback_enabled,billing_mode,pricing_mode,
  budget_limit,budget_used,hard_budget_limit,default_currency,configuration,metadata,activated_at,created_at,updated_at
)
select distinct
  o.id,w.entity_id,'marketing-social','instagram','core','ACTIVE','avantiqo',
  true,true,true,false,'USAGE','PROVIDER',0,0,false,w.currency,'{}'::jsonb,
  jsonb_build_object(
    'provider','meta',
    'channel_type','social',
    'identity_required',true,
    'advertising_billing_separate',true
  ),
  now(),now(),now()
from public.organizations o
join public.organization_wallets w on w.organization_id=o.id
join public.organization_channel_assets a
  on a.organization_id=o.id
 and a.channel_provider='meta'
 and a.asset_type='instagram_business'
where not exists (
  select 1
  from public.organization_services s
  where s.organization_id=o.id and s.service_id='instagram'
);

update public.organization_services s
set
  entity_id=coalesce(s.entity_id,w.entity_id),
  managed_by='avantiqo',
  authorization_required=true,
  usage_enabled=true,
  billing_enabled=true,
  fallback_enabled=false,
  billing_mode='USAGE',
  pricing_mode='PROVIDER',
  default_currency=w.currency,
  metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object(
    'provider','meta',
    'channel_type','social',
    'identity_required',true,
    'advertising_billing_separate',true
  ),
  updated_at=now()
from public.organization_wallets w
where s.organization_id=w.organization_id
  and s.service_id='instagram'
  and exists (
    select 1
    from public.organization_channel_assets a
    where a.organization_id=s.organization_id
      and a.channel_provider='meta'
      and a.asset_type='instagram_business'
  );

commit;
