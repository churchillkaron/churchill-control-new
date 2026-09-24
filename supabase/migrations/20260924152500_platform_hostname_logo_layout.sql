update public.organization_channel_assets
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('logo_layout','wide'), updated_at=now()
where channel_provider='avantiqo' and asset_type='platform_hostname'
  and external_id in ('app.churchillkaron.com','coleley.com');
