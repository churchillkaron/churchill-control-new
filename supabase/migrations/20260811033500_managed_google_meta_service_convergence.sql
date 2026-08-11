-- Managed Google + Meta service convergence for all active real organizations.
-- No campaign creation, no provider billing attachment, and no media spend authorization.

begin;

-- Ensure Google Ads managed service exists for every active organization with a canonical wallet.
insert into public.organization_services (
  organization_id, entity_id, service_category_id, service_id, package_id,
  status, managed_by, authorization_required, usage_enabled, billing_enabled,
  default_provider_id, fallback_enabled, billing_mode, pricing_mode,
  budget_limit, budget_used, hard_budget_limit, default_currency,
  configuration, metadata, activated_at, created_at, updated_at
)
select
  o.id, w.entity_id, 'marketing-social', 'google-ads', 'growth',
  'ACTIVE', 'avantiqo', false, true, true,
  'google_ads', true, 'PREPAID_MANAGED_MEDIA', 'PROVIDER',
  0, 0, true, w.currency,
  '{}'::jsonb,
  jsonb_build_object(
    'provider','google_ads',
    'connection_model','AVANTIQO_MANAGED_ADVERTISER',
    'provider_billed_to','AVANTIQO',
    'customer_payment_source','AVANTIQO_PREPAID_WALLET',
    'media_activation_requires_approval',true,
    'media_spend_authorized',false
  ),
  now(), now(), now()
from public.organizations o
join public.organization_wallets w on w.organization_id=o.id
where lower(coalesce(o.status,'active'))='active'
  and upper(coalesce(o.organization_status,'ACTIVE'))='ACTIVE'
  and not exists (
    select 1 from public.organization_services s
    where s.organization_id=o.id and s.service_id='google-ads'
  );

update public.organization_services s
set
  entity_id = coalesce(s.entity_id, w.entity_id),
  managed_by = 'avantiqo',
  authorization_required = false,
  usage_enabled = true,
  billing_enabled = true,
  default_provider_id = 'google_ads',
  fallback_enabled = true,
  billing_mode = 'PREPAID_MANAGED_MEDIA',
  pricing_mode = 'PROVIDER',
  hard_budget_limit = true,
  default_currency = w.currency,
  metadata = coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'provider','google_ads',
    'connection_model','AVANTIQO_MANAGED_ADVERTISER',
    'provider_billed_to','AVANTIQO',
    'customer_payment_source','AVANTIQO_PREPAID_WALLET',
    'media_activation_requires_approval',true,
    'media_spend_authorized',false
  ),
  updated_at = now()
from public.organization_wallets w
where s.organization_id=w.organization_id
  and s.service_id='google-ads';

-- Ensure managed Meta advertising service exists for every active organization.
-- Do not copy a managed Meta ad account or credential between organizations.
insert into public.organization_services (
  organization_id, entity_id, service_category_id, service_id, package_id,
  status, managed_by, authorization_required, usage_enabled, billing_enabled,
  default_provider_id, fallback_enabled, billing_mode, pricing_mode,
  budget_limit, budget_used, hard_budget_limit, default_currency,
  configuration, metadata, activated_at, created_at, updated_at
)
select
  o.id, w.entity_id, 'marketing-social', 'meta-ads', 'growth',
  'ACTIVE', 'avantiqo', true, true, true,
  'meta', true, 'PREPAID_MANAGED_MEDIA', 'PROVIDER',
  0, 0, true, w.currency,
  '{}'::jsonb,
  jsonb_build_object(
    'provider','meta',
    'connection_model','MANAGED_PROVIDER_WITH_ORGANIZATION_CHANNEL',
    'provider_billed_to','AVANTIQO',
    'customer_payment_source','AVANTIQO_PREPAID_WALLET',
    'media_activation_requires_approval',true,
    'media_spend_authorized',false
  ),
  now(), now(), now()
from public.organizations o
join public.organization_wallets w on w.organization_id=o.id
where lower(coalesce(o.status,'active'))='active'
  and upper(coalesce(o.organization_status,'ACTIVE'))='ACTIVE'
  and not exists (
    select 1 from public.organization_services s
    where s.organization_id=o.id and s.service_id='meta-ads'
  );

update public.organization_services s
set
  entity_id = coalesce(s.entity_id, w.entity_id),
  managed_by = 'avantiqo',
  authorization_required = true,
  usage_enabled = true,
  billing_enabled = true,
  default_provider_id = 'meta',
  fallback_enabled = true,
  billing_mode = 'PREPAID_MANAGED_MEDIA',
  pricing_mode = 'PROVIDER',
  hard_budget_limit = true,
  default_currency = w.currency,
  metadata = coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
    'provider','meta',
    'connection_model','MANAGED_PROVIDER_WITH_ORGANIZATION_CHANNEL',
    'provider_billed_to','AVANTIQO',
    'customer_payment_source','AVANTIQO_PREPAID_WALLET',
    'media_activation_requires_approval',true,
    'media_spend_authorized',false
  ),
  updated_at = now()
from public.organization_wallets w
where s.organization_id=w.organization_id
  and s.service_id='meta-ads';

-- Restore unambiguous legacy Meta identity credentials into canonical Channel records.
-- The New Butterfly is intentionally excluded because the target organization is ambiguous.
with identity_map(organization_name, page_id) as (
  values
    ('Churchill Restaurant & Bar','112860474967'),
    ('Cole Ley Co., Ltd.','113408238398926'),
    ('PCS Adventure Holding Co., Ltd.','118739891119327'),
    ('Pest Control Phuket','109949861972047')
), resolved as (
  select
    o.id as organization_id,
    w.entity_id,
    pc.id as credential_id,
    pc.created_at as credential_created_at,
    pc.metadata->>'page_id' as page_id,
    nullif(btrim(pc.metadata->>'page_name'),'') as page_name,
    nullif(btrim(pc.metadata->>'instagram_business_id'),'') as instagram_business_id
  from identity_map m
  join public.organizations o on o.name=m.organization_name
  join public.organization_wallets w on w.organization_id=o.id
  join public.provider_credentials pc
    on pc.provider_id='meta'
   and pc.status='ACTIVE'
   and pc.metadata->>'page_id'=m.page_id
  where lower(coalesce(o.status,'active'))='active'
    and upper(coalesce(o.organization_status,'ACTIVE'))='ACTIVE'
)
insert into public.organization_channel_connections (
  organization_id, channel_type, provider, name,
  external_asset_id, credentials_reference, status, metadata,
  authorized_at, created_at, updated_at
)
select
  r.organization_id,
  'social',
  'meta',
  coalesce(r.page_name,'Meta'),
  r.page_id,
  r.credential_id::text,
  'ACTIVE',
  jsonb_build_object(
    'page_id',r.page_id,
    'page_name',r.page_name,
    'instagram_business_id',r.instagram_business_id,
    'advertising_billing_model','AVANTIQO_MANAGED',
    'identity_connection_model','MANAGED_ASSET_ASSIGNMENT',
    'restored_from_legacy_credential',true
  ),
  r.credential_created_at,
  now(),
  now()
from resolved r
where not exists (
  select 1 from public.organization_channel_connections c
  where c.organization_id=r.organization_id and c.provider='meta'
);

with identity_map(organization_name, page_id) as (
  values
    ('Churchill Restaurant & Bar','112860474967'),
    ('Cole Ley Co., Ltd.','113408238398926'),
    ('PCS Adventure Holding Co., Ltd.','118739891119327'),
    ('Pest Control Phuket','109949861972047')
), resolved as (
  select
    o.id as organization_id,
    pc.id as credential_id,
    pc.created_at as credential_created_at,
    pc.metadata->>'page_id' as page_id,
    nullif(btrim(pc.metadata->>'page_name'),'') as page_name,
    nullif(btrim(pc.metadata->>'instagram_business_id'),'') as instagram_business_id
  from identity_map m
  join public.organizations o on o.name=m.organization_name
  join public.provider_credentials pc
    on pc.provider_id='meta'
   and pc.status='ACTIVE'
   and pc.metadata->>'page_id'=m.page_id
)
update public.organization_channel_connections c
set
  credentials_reference=r.credential_id::text,
  status='ACTIVE',
  name=coalesce(c.name,r.page_name,'Meta'),
  external_asset_id=coalesce(c.external_asset_id,r.page_id),
  metadata=coalesce(c.metadata,'{}'::jsonb) || jsonb_build_object(
    'page_id',r.page_id,
    'page_name',r.page_name,
    'instagram_business_id',r.instagram_business_id,
    'advertising_billing_model','AVANTIQO_MANAGED',
    'identity_connection_model','MANAGED_ASSET_ASSIGNMENT',
    'restored_from_legacy_credential',true
  ),
  authorized_at=coalesce(c.authorized_at,r.credential_created_at),
  updated_at=now()
from resolved r
where c.organization_id=r.organization_id and c.provider='meta';

-- Facebook Page assets.
with identity_map(organization_name, page_id) as (
  values
    ('Churchill Restaurant & Bar','112860474967'),
    ('Cole Ley Co., Ltd.','113408238398926'),
    ('PCS Adventure Holding Co., Ltd.','118739891119327'),
    ('Pest Control Phuket','109949861972047')
), resolved as (
  select
    o.id as organization_id,
    w.entity_id,
    c.id as connection_id,
    pc.metadata->>'page_id' as page_id,
    nullif(btrim(pc.metadata->>'page_name'),'') as page_name,
    nullif(btrim(pc.metadata->>'instagram_business_id'),'') as instagram_business_id
  from identity_map m
  join public.organizations o on o.name=m.organization_name
  join public.organization_wallets w on w.organization_id=o.id
  join public.provider_credentials pc
    on pc.provider_id='meta' and pc.status='ACTIVE' and pc.metadata->>'page_id'=m.page_id
  join public.organization_channel_connections c
    on c.organization_id=o.id and c.provider='meta'
)
insert into public.organization_channel_assets (
  organization_id, connection_id, channel_provider, asset_type,
  external_id, name, entity_id, metadata, created_at, updated_at
)
select
  r.organization_id,r.connection_id,'meta','facebook_page',
  r.page_id,r.page_name,r.entity_id,
  jsonb_build_object(
    'instagram_business_id',r.instagram_business_id,
    'identity_connection_model','MANAGED_ASSET_ASSIGNMENT'
  ),
  now(),now()
from resolved r
where not exists (
  select 1 from public.organization_channel_assets a
  where a.channel_provider='meta' and a.external_id=r.page_id
);

with identity_map(organization_name, page_id) as (
  values
    ('Churchill Restaurant & Bar','112860474967'),
    ('Cole Ley Co., Ltd.','113408238398926'),
    ('PCS Adventure Holding Co., Ltd.','118739891119327'),
    ('Pest Control Phuket','109949861972047')
), resolved as (
  select
    o.id as organization_id,w.entity_id,c.id as connection_id,
    pc.metadata->>'page_id' as page_id,
    nullif(btrim(pc.metadata->>'instagram_business_id'),'') as instagram_business_id
  from identity_map m
  join public.organizations o on o.name=m.organization_name
  join public.organization_wallets w on w.organization_id=o.id
  join public.provider_credentials pc on pc.provider_id='meta' and pc.status='ACTIVE' and pc.metadata->>'page_id'=m.page_id
  join public.organization_channel_connections c on c.organization_id=o.id and c.provider='meta'
)
update public.organization_channel_assets a
set
  connection_id=r.connection_id,
  entity_id=coalesce(a.entity_id,r.entity_id),
  metadata=coalesce(a.metadata,'{}'::jsonb) || jsonb_build_object(
    'instagram_business_id',r.instagram_business_id,
    'identity_connection_model','MANAGED_ASSET_ASSIGNMENT'
  ),
  updated_at=now()
from resolved r
where a.organization_id=r.organization_id
  and a.channel_provider='meta'
  and a.external_id=r.page_id;

-- Instagram business assets only where the credential proves an Instagram business identity.
with identity_map(organization_name, page_id) as (
  values
    ('Churchill Restaurant & Bar','112860474967'),
    ('Cole Ley Co., Ltd.','113408238398926'),
    ('PCS Adventure Holding Co., Ltd.','118739891119327'),
    ('Pest Control Phuket','109949861972047')
), resolved as (
  select
    o.id as organization_id,w.entity_id,c.id as connection_id,
    pc.metadata->>'page_id' as page_id,
    nullif(btrim(pc.metadata->>'page_name'),'') as page_name,
    nullif(btrim(pc.metadata->>'instagram_business_id'),'') as instagram_business_id
  from identity_map m
  join public.organizations o on o.name=m.organization_name
  join public.organization_wallets w on w.organization_id=o.id
  join public.provider_credentials pc on pc.provider_id='meta' and pc.status='ACTIVE' and pc.metadata->>'page_id'=m.page_id
  join public.organization_channel_connections c on c.organization_id=o.id and c.provider='meta'
)
insert into public.organization_channel_assets (
  organization_id, connection_id, channel_provider, asset_type,
  external_id, name, entity_id, metadata, created_at, updated_at
)
select
  r.organization_id,r.connection_id,'meta','instagram_business',
  r.instagram_business_id,coalesce(r.page_name,'Meta') || ' Instagram',r.entity_id,
  jsonb_build_object(
    'facebook_page_id',r.page_id,
    'identity_connection_model','MANAGED_ASSET_ASSIGNMENT'
  ),
  now(),now()
from resolved r
where r.instagram_business_id is not null
  and not exists (
    select 1 from public.organization_channel_assets a
    where a.channel_provider='meta' and a.external_id=r.instagram_business_id
  );

with identity_map(organization_name, page_id) as (
  values
    ('Churchill Restaurant & Bar','112860474967'),
    ('Cole Ley Co., Ltd.','113408238398926'),
    ('PCS Adventure Holding Co., Ltd.','118739891119327'),
    ('Pest Control Phuket','109949861972047')
), resolved as (
  select
    o.id as organization_id,w.entity_id,c.id as connection_id,
    pc.metadata->>'page_id' as page_id,
    nullif(btrim(pc.metadata->>'instagram_business_id'),'') as instagram_business_id
  from identity_map m
  join public.organizations o on o.name=m.organization_name
  join public.organization_wallets w on w.organization_id=o.id
  join public.provider_credentials pc on pc.provider_id='meta' and pc.status='ACTIVE' and pc.metadata->>'page_id'=m.page_id
  join public.organization_channel_connections c on c.organization_id=o.id and c.provider='meta'
)
update public.organization_channel_assets a
set
  connection_id=r.connection_id,
  entity_id=coalesce(a.entity_id,r.entity_id),
  metadata=coalesce(a.metadata,'{}'::jsonb) || jsonb_build_object(
    'facebook_page_id',r.page_id,
    'identity_connection_model','MANAGED_ASSET_ASSIGNMENT'
  ),
  updated_at=now()
from resolved r
where r.instagram_business_id is not null
  and a.organization_id=r.organization_id
  and a.channel_provider='meta'
  and a.external_id=r.instagram_business_id;

commit;
