alter table public.organization_channel_connections
  add column if not exists authorized_by_party_id uuid references public.parties(id) on delete set null,
  add column if not exists authorized_at timestamptz;

create index if not exists organization_channel_connections_authorizer_idx
  on public.organization_channel_connections (organization_id, authorized_by_party_id)
  where authorized_by_party_id is not null;

alter table public.organization_channel_assets
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null,
  add column if not exists selected_by_party_id uuid references public.parties(id) on delete set null,
  add column if not exists selected_at timestamptz;

create index if not exists organization_channel_assets_entity_idx
  on public.organization_channel_assets (organization_id, entity_id, channel_provider)
  where entity_id is not null;

alter table public.organization_channel_connections enable row level security;
alter table public.organization_channel_assets enable row level security;

revoke all on table public.organization_channel_connections from anon, authenticated;
revoke all on table public.organization_channel_assets from anon, authenticated;

grant select, insert, update, delete on table public.organization_channel_connections to service_role;
grant select, insert, update, delete on table public.organization_channel_assets to service_role;
