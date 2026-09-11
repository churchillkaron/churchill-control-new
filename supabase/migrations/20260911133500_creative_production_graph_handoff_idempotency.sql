create unique index if not exists creative_production_graphs_handoff_uidx
  on public.creative_production_graphs (
    organization_id,
    creative_project_id,
    (metadata->>'production_handoff_key')
  )
  where nullif(metadata->>'production_handoff_key', '') is not null;
