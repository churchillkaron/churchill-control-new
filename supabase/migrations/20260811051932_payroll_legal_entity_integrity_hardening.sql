begin;

do $$
begin
  if exists (
    select 1
    from public.payroll_records
    where organization_id is null
       or entity_id is null
       or staff_id is null
       or payroll_month is null
  ) then
    raise exception 'payroll_records contains records missing required payroll scope';
  end if;

  if exists (
    select 1
    from public.payroll_records pr
    left join public.legal_entities le
      on le.id = pr.entity_id
     and le.organization_id = pr.organization_id
    where le.id is null
  ) then
    raise exception 'payroll_records contains organization/entity scope mismatches';
  end if;

  if exists (
    select 1
    from public.payroll_records
    group by organization_id, entity_id, staff_id, payroll_month
    having count(*) > 1
  ) then
    raise exception 'payroll_records contains duplicate staff payroll rows within an organization/entity/month';
  end if;
end
$$;

alter table public.payroll_records
  alter column organization_id set not null,
  alter column entity_id set not null,
  alter column staff_id set not null,
  alter column payroll_month set not null;

alter table public.payroll_records
  add constraint payroll_records_payroll_month_format_check
  check (payroll_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') not valid;

alter table public.payroll_records
  validate constraint payroll_records_payroll_month_format_check;

alter table public.payroll_records
  add constraint payroll_records_organization_id_fkey
  foreign key (organization_id)
  references public.organizations(id)
  on delete restrict
  not valid;

alter table public.payroll_records
  validate constraint payroll_records_organization_id_fkey;

alter table public.payroll_records
  validate constraint payroll_records_entity_id_fkey;

alter table public.payroll_records
  validate constraint payroll_records_staff_id_fkey;

alter table public.payroll_records
  add constraint payroll_records_organization_entity_fkey
  foreign key (organization_id, entity_id)
  references public.legal_entities(organization_id, id)
  on delete restrict
  not valid;

alter table public.payroll_records
  validate constraint payroll_records_organization_entity_fkey;

alter table public.payroll_records
  add constraint payroll_records_scope_staff_month_key
  unique (organization_id, entity_id, staff_id, payroll_month);

commit;
