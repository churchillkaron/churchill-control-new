insert into public.provider_credentials (
  provider_id,
  credential_type,
  secret_reference,
  status,
  metadata
)
select
  'openai',
  'managed_api_key',
  'env:OPENAI_API_KEY',
  'ACTIVE',
  jsonb_build_object(
    'enabled', true,
    'purpose', 'AVANTIQO_MANAGED_AI',
    'priority', 100,
    'api_family', 'OPENAI_API',
    'managed_by', 'AVANTIQO'
  )
where not exists (
  select 1
  from public.provider_credentials
  where lower(provider_id) = 'openai'
    and lower(credential_type) = 'managed_api_key'
    and secret_reference = 'env:OPENAI_API_KEY'
    and upper(status) = 'ACTIVE'
    and upper(coalesce(metadata->>'purpose', '')) = 'AVANTIQO_MANAGED_AI'
);
