begin;

create table if not exists public.compliance_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  asset_type text not null,
  asset_code text not null,
  name text not null,
  description text,
  manufacturer text,
  model text,
  serial_number text,
  registration_number text,
  reference_identifier text,
  location_text text,
  ownership_type text not null default 'OWNED',
  status text not null default 'ACTIVE',
  acquired_on date,
  acquisition_cost numeric,
  currency_code text,
  warranty_expires_on date,
  inspection_due_on date,
  maintenance_due_on date,
  finance_fixed_asset_id uuid,
  source_attachment_sha256 text,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_assets_type_check check (asset_type in ('VEHICLE','EQUIPMENT','PROPERTY','DIGITAL_ASSET')),
  constraint compliance_assets_ownership_check check (ownership_type in ('OWNED','LEASED','RENTED','LICENSED','OTHER')),
  constraint compliance_assets_status_check check (status in ('ACTIVE','INACTIVE','RETIRED','DISPOSED','LOST','UNDER_MAINTENANCE')),
  constraint compliance_assets_acquisition_cost_check check (acquisition_cost is null or acquisition_cost >= 0)
);

create unique index if not exists compliance_assets_entity_code_unique
  on public.compliance_assets (organization_id, entity_id, lower(asset_code));
create unique index if not exists compliance_assets_entity_serial_unique
  on public.compliance_assets (organization_id, entity_id, lower(serial_number))
  where serial_number is not null and btrim(serial_number) <> '';
create unique index if not exists compliance_assets_entity_registration_unique
  on public.compliance_assets (organization_id, entity_id, lower(registration_number))
  where registration_number is not null and btrim(registration_number) <> '';
create index if not exists compliance_assets_org_entity_type_idx
  on public.compliance_assets (organization_id, entity_id, asset_type, status);

alter table public.compliance_assets enable row level security;

create or replace function public.create_compliance_asset_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_asset_type text,
  p_asset_code text,
  p_name text,
  p_description text default null,
  p_manufacturer text default null,
  p_model text default null,
  p_serial_number text default null,
  p_registration_number text default null,
  p_reference_identifier text default null,
  p_location_text text default null,
  p_ownership_type text default 'OWNED',
  p_status text default 'ACTIVE',
  p_acquired_on date default null,
  p_acquisition_cost numeric default null,
  p_currency_code text default null,
  p_warranty_expires_on date default null,
  p_inspection_due_on date default null,
  p_maintenance_due_on date default null,
  p_finance_fixed_asset_id uuid default null,
  p_source_attachment_sha256 text default null,
  p_attributes jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns public.compliance_assets
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_asset public.compliance_assets%rowtype;
  v_type text := upper(btrim(coalesce(p_asset_type, '')));
  v_code text := btrim(coalesce(p_asset_code, ''));
  v_name text := btrim(coalesce(p_name, ''));
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  perform 1 from public.legal_entities where id = p_entity_id and organization_id = p_organization_id and coalesce(is_active,true) = true;
  if not found then raise exception 'COMPLIANCE_ASSET_ENTITY_SCOPE_MISMATCH'; end if;
  if v_type not in ('VEHICLE','EQUIPMENT','PROPERTY','DIGITAL_ASSET') then raise exception 'COMPLIANCE_ASSET_TYPE_INVALID'; end if;
  if v_code = '' or v_name = '' then raise exception 'COMPLIANCE_ASSET_CODE_AND_NAME_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text), hashtext(p_entity_id::text));
  if exists (select 1 from public.compliance_assets where organization_id=p_organization_id and entity_id=p_entity_id and lower(asset_code)=lower(v_code)) then
    raise exception 'COMPLIANCE_ASSET_CODE_EXISTS:%', v_code;
  end if;
  if nullif(btrim(coalesce(p_serial_number,'')),'') is not null and exists (
    select 1 from public.compliance_assets where organization_id=p_organization_id and entity_id=p_entity_id and lower(serial_number)=lower(btrim(p_serial_number))
  ) then raise exception 'COMPLIANCE_ASSET_SERIAL_EXISTS:%', btrim(p_serial_number); end if;
  if nullif(btrim(coalesce(p_registration_number,'')),'') is not null and exists (
    select 1 from public.compliance_assets where organization_id=p_organization_id and entity_id=p_entity_id and lower(registration_number)=lower(btrim(p_registration_number))
  ) then raise exception 'COMPLIANCE_ASSET_REGISTRATION_EXISTS:%', btrim(p_registration_number); end if;
  if p_finance_fixed_asset_id is not null and not exists (
    select 1 from public.fixed_assets f where f.id=p_finance_fixed_asset_id and f.organization_id=p_organization_id and coalesce(f.entity_id,f.legal_entity_id)=p_entity_id
  ) then raise exception 'COMPLIANCE_ASSET_FINANCE_LINK_SCOPE_MISMATCH'; end if;

  insert into public.compliance_assets (
    organization_id,entity_id,asset_type,asset_code,name,description,manufacturer,model,serial_number,registration_number,
    reference_identifier,location_text,ownership_type,status,acquired_on,acquisition_cost,currency_code,warranty_expires_on,
    inspection_due_on,maintenance_due_on,finance_fixed_asset_id,source_attachment_sha256,attributes,created_by
  ) values (
    p_organization_id,p_entity_id,v_type,v_code,v_name,nullif(btrim(coalesce(p_description,'')),''),nullif(btrim(coalesce(p_manufacturer,'')),''),
    nullif(btrim(coalesce(p_model,'')),''),nullif(btrim(coalesce(p_serial_number,'')),''),nullif(btrim(coalesce(p_registration_number,'')),''),
    nullif(btrim(coalesce(p_reference_identifier,'')),''),nullif(btrim(coalesce(p_location_text,'')),''),upper(btrim(coalesce(p_ownership_type,'OWNED'))),
    upper(btrim(coalesce(p_status,'ACTIVE'))),p_acquired_on,p_acquisition_cost,upper(nullif(btrim(coalesce(p_currency_code,'')),'')),p_warranty_expires_on,
    p_inspection_due_on,p_maintenance_due_on,p_finance_fixed_asset_id,nullif(lower(btrim(coalesce(p_source_attachment_sha256,''))),''),coalesce(p_attributes,'{}'::jsonb),p_created_by
  ) returning * into v_asset;
  return v_asset;
end;
$$;

revoke all on function public.create_compliance_asset_atomic(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,date,numeric,text,date,date,date,uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_compliance_asset_atomic(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,date,numeric,text,date,date,date,uuid,text,jsonb,uuid) to service_role;

commit;
