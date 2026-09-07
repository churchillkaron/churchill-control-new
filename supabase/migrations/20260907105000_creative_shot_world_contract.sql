-- Align creative_shots persistence with the canonical Shot document.
-- Optional rich world-state fields preserve compatibility with existing rows.

alter table public.creative_shots
  add column if not exists world_id text,
  add column if not exists world jsonb not null default '{}'::jsonb,
  add column if not exists spatial_geography jsonb,
  add column if not exists architecture_geometry jsonb,
  add column if not exists props jsonb not null default '[]'::jsonb,
  add column if not exists materials_surfaces jsonb,
  add column if not exists signage_readable_text jsonb,
  add column if not exists time_of_day jsonb,
  add column if not exists weather jsonb,
  add column if not exists atmosphere jsonb,
  add column if not exists background_population jsonb,
  add column if not exists scene_scale jsonb,
  add column if not exists world_reference_assets jsonb not null default '[]'::jsonb,
  add column if not exists world_override jsonb not null default '{}'::jsonb,
  add column if not exists simulation jsonb not null default '{}'::jsonb,
  add column if not exists compositing jsonb not null default '{}'::jsonb;

comment on column public.creative_shots.world is
  'Canonical structured world state preserved by the Creative Shot document.';
comment on column public.creative_shots.architecture_geometry is
  'Structured architectural and geometric continuity state for cinematic shot generation.';
comment on column public.creative_shots.world_reference_assets is
  'Reference asset descriptors for world continuity; provider exposure remains governed separately.';
