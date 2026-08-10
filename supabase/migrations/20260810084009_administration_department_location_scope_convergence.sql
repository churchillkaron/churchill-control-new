alter table public.departments
  alter column organization_id set not null,
  alter column name set not null,
  alter column code set not null;

alter table public.departments
  add constraint departments_organization_id_fkey
  foreign key (organization_id)
  references public.organizations (id)
  on delete cascade;

alter table public.departments
  add constraint departments_organization_code_key
  unique (organization_id, code),
  add constraint departments_organization_id_id_key
  unique (organization_id, id);

alter table public.legal_entities
  add constraint legal_entities_organization_id_id_key
  unique (organization_id, id);

alter table public.departments
  add constraint departments_organization_entity_fkey
  foreign key (organization_id, entity_id)
  references public.legal_entities (organization_id, id)
  on delete restrict;

alter table public.business_locations
  add constraint business_locations_organization_department_fkey
  foreign key (organization_id, department_id)
  references public.departments (organization_id, id)
  on delete restrict;
