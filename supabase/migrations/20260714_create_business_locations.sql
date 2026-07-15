create table if not exists business_locations (

    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null
        references organizations(id) on delete cascade,

    code text not null,

    name text not null,

    location_type text not null,

    business_unit_id uuid,

    department_id uuid,

    status text not null default 'ACTIVE',

    address text,

    city text,

    province text,

    postal_code text,

    country text,

    timezone text,

    currency_code text,

    phone text,

    email text,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);

create index if not exists idx_business_locations_org
on business_locations(organization_id);

create index if not exists idx_business_locations_type
on business_locations(location_type);

create index if not exists idx_business_locations_status
on business_locations(status);
