-- Align creative_scenes persistence with the canonical Scene document.
-- These columns are optional so existing scene rows remain valid.
-- Rich world-state fields use jsonb because the runtime permits both structured
-- objects/arrays and scalar JSON values.

alter table public.creative_scenes
  add column if not exists world_id text,
  add column if not exists world jsonb not null default '{}'::jsonb,
  add column if not exists spatial_geography jsonb,
  add column if not exists architecture_geometry jsonb,
  add column if not exists production_design jsonb not null default '{}'::jsonb,
  add column if not exists materials_surfaces jsonb,
  add column if not exists signage_readable_text jsonb,
  add column if not exists time_of_day jsonb,
  add column if not exists weather jsonb,
  add column if not exists atmosphere jsonb,
  add column if not exists background_population jsonb,
  add column if not exists scene_scale jsonb,
  add column if not exists world_reference_assets jsonb not null default '[]'::jsonb;

comment on column public.creative_scenes.world is
  'Canonical structured scene-world state preserved by the Creative Scene document.';
comment on column public.creative_scenes.architecture_geometry is
  'Structured architectural and geometric continuity state for cinematic scene generation.';
comment on column public.creative_scenes.world_reference_assets is
  'Reference asset descriptors for scene-world continuity; provider exposure remains governed separately.';
