insert into public.organization_services (
  id, organization_id, service_category_id, service_id, solution_id, package_id,
  status, managed_by, authorization_required, usage_enabled, billing_enabled,
  health, activated_at, suspended_at, created_at, updated_at, entity_id, party_id,
  metadata, default_provider_id, fallback_enabled, billing_mode, pricing_mode,
  budget_limit, budget_used, hard_budget_limit, default_currency, default_model,
  configuration, last_execution_at, total_requests, total_failures, total_cost
)
select
  gen_random_uuid(), o.organization_id, o.service_category_id, 'document.classify',
  o.solution_id, o.package_id, 'ACTIVE', 'avantiqo',
  o.authorization_required, true, o.billing_enabled, o.health,
  now(), null, now(), now(), o.entity_id, o.party_id,
  coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object(
    'source','owned_document_classification_activation',
    'enabled_at',now(),
    'owned_provider','avantiqo-image',
    'local_first',true
  ),
  'avantiqo-image', false, o.billing_mode, o.pricing_mode,
  o.budget_limit, o.budget_used, o.hard_budget_limit,
  coalesce(o.default_currency,'THB'), o.default_model,
  coalesce(o.configuration,'{}'::jsonb) || jsonb_build_object(
    'local_only',true,
    'paid_fallback_allowed',false
  ),
  null, 0, 0, 0
from public.organization_services o
where o.service_id='document.ocr'
  and o.status='ACTIVE'
  and not exists (
    select 1 from public.organization_services x
    where x.organization_id=o.organization_id
      and x.service_id='document.classify'
      and x.entity_id is not distinct from o.entity_id
      and x.status='ACTIVE'
  );
