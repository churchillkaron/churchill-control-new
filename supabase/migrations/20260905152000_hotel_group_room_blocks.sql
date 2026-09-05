begin;

alter table public.hotel_groups
  add column if not exists cutoff_date date,
  add column if not exists block_mode text not null default 'DEDUCT',
  add column if not exists negotiated_rate_plan_id uuid references public.hotel_rate_plans(id) on delete set null,
  add column if not exists status_updated_at timestamptz not null default now();

create table if not exists public.hotel_group_room_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  group_id uuid not null references public.hotel_groups(id) on delete cascade,
  room_type text not null,
  stay_date date not null,
  allocated_rooms integer not null default 0 check (allocated_rooms >= 0),
  negotiated_rate numeric check (negotiated_rate is null or negotiated_rate >= 0),
  currency_code text not null default 'THB',
  deduct_inventory boolean not null default true,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_id, room_type, stay_date)
);

create index if not exists hotel_group_room_blocks_scope_idx
  on public.hotel_group_room_blocks(organization_id, property_id, group_id, stay_date, room_type);

alter table public.hotel_group_room_blocks enable row level security;
revoke all on table public.hotel_group_room_blocks from anon;
revoke insert, update, delete, truncate, references, trigger on table public.hotel_group_room_blocks from authenticated;
grant select on table public.hotel_group_room_blocks to authenticated;
grant all on table public.hotel_group_room_blocks to service_role;
drop policy if exists hotel_group_room_blocks_organization_read on public.hotel_group_room_blocks;
create policy hotel_group_room_blocks_organization_read
  on public.hotel_group_room_blocks
  for select to authenticated
  using (public.same_organization(organization_id));

commit;
