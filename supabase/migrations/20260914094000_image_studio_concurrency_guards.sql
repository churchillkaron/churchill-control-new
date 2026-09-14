begin;

create or replace function public.create_image_studio_snapshot_atomic(
  p_id uuid,
  p_organization_id uuid,
  p_creative_project_id uuid,
  p_artboard_id uuid,
  p_snapshot_asset_id uuid default null,
  p_based_on_version_id uuid default null,
  p_status text default 'WORKING',
  p_summary text default '',
  p_snapshot jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns public.creative_image_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  created_row public.creative_image_versions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_artboard_id::text, 0));

  select coalesce(max(version_number), 0) + 1
    into next_version
    from public.creative_image_versions
   where organization_id = p_organization_id
     and creative_project_id = p_creative_project_id
     and artboard_id = p_artboard_id;

  insert into public.creative_image_versions (
    id, organization_id, creative_project_id, artboard_id,
    snapshot_asset_id, based_on_version_id, version_number,
    status, summary, snapshot, created_by
  ) values (
    p_id, p_organization_id, p_creative_project_id, p_artboard_id,
    p_snapshot_asset_id, p_based_on_version_id, next_version,
    p_status, p_summary, coalesce(p_snapshot, '{}'::jsonb), p_created_by
  )
  returning * into created_row;

  return created_row;
end;
$$;

revoke all on function public.create_image_studio_snapshot_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid
) from public;

grant execute on function public.create_image_studio_snapshot_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb, uuid
) to service_role;

commit;
