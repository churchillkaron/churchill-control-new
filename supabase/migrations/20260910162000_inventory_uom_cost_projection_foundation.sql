-- Neutral inventory UOM + operational purchase-cost projection foundation.
alter table public.inventory_uoms
  add column if not exists dimension text,
  add column if not exists factor_to_base numeric,
  add column if not exists is_system boolean not null default false;

alter table public.inventory_uoms
  drop constraint if exists inventory_uoms_dimension_check;
alter table public.inventory_uoms
  add constraint inventory_uoms_dimension_check
  check (dimension is null or dimension in ('MASS','VOLUME','COUNT','PACKAGE','OTHER'));

alter table public.inventory_uoms
  drop constraint if exists inventory_uoms_factor_positive;
alter table public.inventory_uoms
  add constraint inventory_uoms_factor_positive
  check (factor_to_base is null or factor_to_base > 0);

create unique index if not exists ux_inventory_uoms_system_abbreviation
  on public.inventory_uoms (lower(abbreviation))
  where organization_id is null and is_system = true and abbreviation is not null;

insert into public.inventory_uoms (organization_id,name,abbreviation,dimension,factor_to_base,is_system)
select null,v.name,v.abbreviation,v.dimension,v.factor_to_base,true
from (values
  ('Milligram','mg','MASS',0.001::numeric),
  ('Gram','g','MASS',1::numeric),
  ('Kilogram','kg','MASS',1000::numeric),
  ('Millilitre','ml','VOLUME',1::numeric),
  ('Litre','l','VOLUME',1000::numeric),
  ('Each','ea','COUNT',1::numeric)
) as v(name,abbreviation,dimension,factor_to_base)
where not exists (
  select 1 from public.inventory_uoms u
  where u.organization_id is null and lower(u.abbreviation)=lower(v.abbreviation)
);
insert into public.inventory_uoms (organization_id,name,abbreviation,dimension,factor_to_base,is_system)
select null,v.name,v.abbreviation,'PACKAGE',null,true
from (values
  ('Case','case'),('Pack','pack'),('Box','box'),('Bottle','bottle'),
  ('Can','can'),('Bag','bag'),('Tray','tray'),('Dozen','dozen')
) as v(name,abbreviation)
where not exists (
  select 1 from public.inventory_uoms u
  where u.organization_id is null and lower(u.abbreviation)=lower(v.abbreviation)
);

create unique index if not exists ux_inventory_items_organization_id_id
  on public.inventory_items (organization_id,id)
  where organization_id is not null;

create table if not exists public.inventory_item_uom_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id uuid not null,
  from_uom_id uuid not null references public.inventory_uoms(id),
  factor_to_item_base numeric not null check (factor_to_item_base > 0),
  source_type text,
  source_reference text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,entity_id,item_id,from_uom_id),
  foreign key (organization_id,item_id)
    references public.inventory_items(organization_id,id)
);

create index if not exists idx_inventory_item_uom_conversions_item
  on public.inventory_item_uom_conversions (organization_id,entity_id,item_id);
alter table public.inventory_items
  add column if not exists cost_source_type text,
  add column if not exists cost_source_id uuid,
  add column if not exists cost_source_reference text,
  add column if not exists cost_effective_at timestamptz,
  add column if not exists cost_updated_at timestamptz;

alter table public.recipe_items
  add column if not exists uom_id uuid references public.inventory_uoms(id);

alter table public.supplier_prices
  add column if not exists uom_id uuid references public.inventory_uoms(id);

alter table public.vendor_invoice_lines
  add column if not exists source_item_code text,
  add column if not exists source_uom_text text,
  add column if not exists uom_id uuid references public.inventory_uoms(id),
  add column if not exists factor_to_item_base numeric,
  add column if not exists base_unit_cost numeric;

comment on column public.inventory_items.cost is
  'Operational current purchase cost per inventory item base UOM; accounting valuation remains in inventory ledger/valuation snapshots.';
comment on column public.vendor_invoice_lines.factor_to_item_base is
  'Exact source-UOM quantity multiplier into the inventory item base UOM; null means conversion unresolved.';
comment on column public.vendor_invoice_lines.base_unit_cost is
  'Derived operational cost per inventory item base UOM when item and UOM conversion are exact; null means costing evidence unresolved.';
create unique index if not exists ux_legal_entities_organization_id_id
  on public.legal_entities (organization_id,id)
  where organization_id is not null;

alter table public.dishes
  add column if not exists entity_id uuid;
alter table public.recipe_items
  add column if not exists entity_id uuid;

alter table public.dishes
  drop constraint if exists dishes_entity_org_fk;
alter table public.dishes
  add constraint dishes_entity_org_fk
  foreign key (organization_id,entity_id)
  references public.legal_entities (organization_id,id);

alter table public.recipe_items
  drop constraint if exists recipe_items_entity_org_fk;
alter table public.recipe_items
  add constraint recipe_items_entity_org_fk
  foreign key (organization_id,entity_id)
  references public.legal_entities (organization_id,id);

with resolved as (
  select ri.organization_id,ri.dish_id,min(ii.entity_id::text)::uuid as entity_id
  from public.recipe_items ri
  join public.inventory_items ii
    on ii.organization_id=ri.organization_id and ii.id=ri.item_id
  where ii.entity_id is not null
  group by ri.organization_id,ri.dish_id
  having count(distinct ii.entity_id)=1
)
update public.dishes d set entity_id=r.entity_id
from resolved r
where d.organization_id=r.organization_id and d.id=r.dish_id and d.entity_id is null;
update public.recipe_items ri
set entity_id=d.entity_id
from public.dishes d
where d.organization_id=ri.organization_id
  and d.id=ri.dish_id
  and d.entity_id is not null
  and ri.entity_id is null;

create index if not exists idx_recipe_items_org_entity_item
  on public.recipe_items (organization_id,entity_id,item_id);
create index if not exists idx_dishes_org_entity
  on public.dishes (organization_id,entity_id);

comment on column public.dishes.entity_id is
  'Legal entity owning the dish/recipe. Null is legacy unresolved state only.';
comment on column public.recipe_items.entity_id is
  'Legal entity owning the recipe component. New writes must match dish and inventory item entity.';