-- AVANTIQO CREATIVE BACKEND RUNTIME READINESS
-- Provides a service-role-only proof that the linked database contains the
-- exact runtime functions, identity indexes and private storage contract
-- required before any paid organisation-scoped smoke.

begin;

create or replace function public.creative_backend_runtime_readiness()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog, storage
as $$
with required_relations(check_id, relation_name) as (
  values
    ('table_creative_asset_nodes', 'public.creative_asset_nodes'),
    ('table_creative_production_tasks', 'public.creative_production_tasks'),
    ('table_organization_wallets', 'public.organization_wallets'),
    ('table_wallet_transactions', 'public.wallet_transactions')
),
relation_checks as (
  select
    check_id,
    to_regclass(relation_name) is not null as passed,
    relation_name as evidence
  from required_relations
),
required_procedures(check_id, signature) as (
  values
    (
      'rpc_apply_wallet_transaction',
      'public.apply_wallet_transaction(uuid,text,numeric,text,text,uuid,uuid,text,text,jsonb)'
    ),
    (
      'rpc_claim_creative_production_task',
      'public.claim_creative_production_task(uuid,uuid,text,integer)'
    ),
    (
      'rpc_heartbeat_creative_production_task',
      'public.heartbeat_creative_production_task(uuid,uuid,uuid,integer)'
    ),
    (
      'rpc_submit_creative_production_task',
      'public.submit_creative_production_task(uuid,uuid,uuid,text,jsonb)'
    ),
    (
      'rpc_fail_creative_production_task_attempt',
      'public.fail_creative_production_task_attempt(uuid,uuid,uuid,text,boolean,integer)'
    ),
    (
      'rpc_claim_creative_provider_completion',
      'public.claim_creative_provider_completion(uuid,uuid,text,text,text,integer)'
    ),
    (
      'rpc_record_creative_provider_progress',
      'public.record_creative_provider_progress(uuid,uuid,text,text,text,jsonb)'
    ),
    (
      'rpc_finalize_creative_production_task',
      'public.finalize_creative_production_task(uuid,uuid,text,jsonb,text,uuid)'
    ),
    (
      'rpc_claim_creative_publish_command',
      'public.claim_creative_publish_command(uuid,uuid,text,text,integer)'
    ),
    (
      'rpc_settle_creative_publish_command',
      'public.settle_creative_publish_command(uuid,uuid,text,uuid,uuid,text,jsonb)'
    ),
    (
      'rpc_claim_creative_publish_reconciliation',
      'public.claim_creative_publish_reconciliation(uuid,uuid,text,text,text,integer)'
    ),
    (
      'rpc_record_creative_publish_progress',
      'public.record_creative_publish_progress(uuid,uuid,text,text,text,jsonb)'
    ),
    (
      'rpc_settle_creative_publish_reconciliation',
      'public.settle_creative_publish_reconciliation(uuid,uuid,uuid,text,jsonb)'
    )
),
procedure_resolution as (
  select
    check_id,
    signature,
    to_regprocedure(signature) as procedure_oid
  from required_procedures
),
procedure_checks as (
  select
    check_id,
    coalesce(
      procedure_oid is not null
      and has_function_privilege('service_role', procedure_oid, 'EXECUTE')
      and not has_function_privilege('anon', procedure_oid, 'EXECUTE')
      and not has_function_privilege('authenticated', procedure_oid, 'EXECUTE'),
      false
    ) as passed,
    signature as evidence
  from procedure_resolution
),
required_indexes(check_id, index_name) as (
  values
    ('index_organization_wallet_identity', 'organization_wallets_organization_uidx'),
    ('index_wallet_transaction_idempotency', 'wallet_transactions_org_idempotency_uidx'),
    ('index_production_task_asset_identity', 'creative_asset_nodes_production_task_uidx'),
    ('index_production_output_identity', 'creative_asset_nodes_production_output_identity_uidx'),
    ('index_final_render_identity', 'creative_final_render_identity_uidx'),
    ('index_perceptual_qc_identity', 'creative_perceptual_qc_identity_uidx'),
    ('index_render_repair_identity', 'creative_render_repair_identity_uidx'),
    ('index_render_repair_execution_identity', 'creative_render_repair_execution_identity_uidx'),
    ('index_publish_command_identity', 'creative_publish_command_identity_unique'),
    ('index_publish_execution_identity', 'creative_publish_execution_identity_unique')
),
index_checks as (
  select
    required.check_id,
    exists (
      select 1
      from pg_indexes indexes
      where indexes.schemaname = 'public'
        and indexes.indexname = required.index_name
    ) as passed,
    required.index_name as evidence
  from required_indexes required
),
storage_checks as (
  select
    'storage_creative_assets_private'::text as check_id,
    exists (
      select 1
      from storage.buckets bucket
      where bucket.id = 'creative-assets'
        and bucket.name = 'creative-assets'
        and bucket.public = false
    ) as passed,
    'creative-assets public=false'::text as evidence
  union all
  select
    'storage_creative_assets_capacity',
    exists (
      select 1
      from storage.buckets bucket
      where bucket.id = 'creative-assets'
        and coalesce(bucket.file_size_limit, 0) >= 1073741824
    ),
    'creative-assets file_size_limit>=1073741824'
  union all
  select
    'storage_creative_assets_media_contract',
    exists (
      select 1
      from storage.buckets bucket
      where bucket.id = 'creative-assets'
        and coalesce(bucket.allowed_mime_types, array[]::text[]) @> array[
          'image/jpeg',
          'image/png',
          'image/webp',
          'video/mp4',
          'audio/mpeg',
          'application/octet-stream'
        ]::text[]
    ),
    'creative-assets canonical MIME types'
),
all_checks as (
  select * from relation_checks
  union all
  select * from procedure_checks
  union all
  select * from index_checks
  union all
  select * from storage_checks
)
select jsonb_build_object(
  'ready', coalesce(bool_and(passed), false),
  'checks', coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', check_id,
        'passed', passed,
        'evidence', evidence
      )
      order by check_id
    ),
    '[]'::jsonb
  ),
  'blocking_checks', coalesce(
    jsonb_agg(to_jsonb(check_id) order by check_id)
      filter (where not passed),
    '[]'::jsonb
  ),
  'evaluated_at', now()
)
from all_checks;
$$;

revoke all on function public.creative_backend_runtime_readiness()
  from public, anon, authenticated;

grant execute on function public.creative_backend_runtime_readiness()
  to service_role;

commit;
