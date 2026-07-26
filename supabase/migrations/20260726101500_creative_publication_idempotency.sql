begin;

with ranked_commands as (
  select
    id,
    row_number() over (
      partition by organization_id, metadata ->> 'publish_command_identity'
      order by created_at asc nulls last, id asc
    ) as row_number
  from public.creative_asset_nodes
  where type = 'PUBLISH_COMMAND'
    and coalesce(metadata ->> 'publish_command_identity', '') <> ''
)
update public.creative_asset_nodes node
set
  status = 'ARCHIVED',
  metadata = coalesce(node.metadata, '{}'::jsonb) || jsonb_build_object(
    'archived_reason', 'duplicate_publish_command_identity',
    'archived_by_migration', '20260726101500'
  ),
  updated_at = now()
from ranked_commands
where node.id = ranked_commands.id
  and ranked_commands.row_number > 1;

with ranked_executions as (
  select
    id,
    row_number() over (
      partition by organization_id, metadata ->> 'publish_execution_identity'
      order by created_at asc nulls last, id asc
    ) as row_number
  from public.creative_asset_nodes
  where type = 'PUBLISH_EXECUTION'
    and coalesce(metadata ->> 'publish_execution_identity', '') <> ''
)
update public.creative_asset_nodes node
set
  status = 'ARCHIVED',
  metadata = coalesce(node.metadata, '{}'::jsonb) || jsonb_build_object(
    'archived_reason', 'duplicate_publish_execution_identity',
    'archived_by_migration', '20260726101500'
  ),
  updated_at = now()
from ranked_executions
where node.id = ranked_executions.id
  and ranked_executions.row_number > 1;

drop index if exists public.creative_publish_command_identity_uidx;
create unique index creative_publish_command_identity_uidx
  on public.creative_asset_nodes (
    organization_id,
    (metadata ->> 'publish_command_identity')
  )
  where type = 'PUBLISH_COMMAND'
    and status <> 'ARCHIVED'
    and coalesce(metadata ->> 'publish_command_identity', '') <> '';

drop index if exists public.creative_publish_execution_identity_uidx;
create unique index creative_publish_execution_identity_uidx
  on public.creative_asset_nodes (
    organization_id,
    (metadata ->> 'publish_execution_identity')
  )
  where type = 'PUBLISH_EXECUTION'
    and status <> 'ARCHIVED'
    and coalesce(metadata ->> 'publish_execution_identity', '') <> '';

comment on index public.creative_publish_command_identity_uidx is
  'One active publish command per organization, release-readiness identity and configured target.';

comment on index public.creative_publish_execution_identity_uidx is
  'One active publish execution claim per organization and publish command.';

commit;
