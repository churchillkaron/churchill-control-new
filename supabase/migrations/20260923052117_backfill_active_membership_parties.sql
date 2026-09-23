begin;

with candidates as (
  select distinct
    ou.organization_id,
    sa.id as staff_account_id,
    nullif(trim(sa.name), '') as staff_name,
    lower(trim(sa.email)) as staff_email
  from public.organization_users ou
  join public.staff_accounts sa
    on sa.id = ou.staff_account_id
  where ou.status = 'active'
    and sa.active = true
    and sa.auth_user_id is not null
    and nullif(trim(sa.email), '') is not null
    and not exists (
      select 1
      from public.employee_employment_assignments ea
      where ea.organization_id = ou.organization_id
        and ea.staff_account_id = sa.id
        and upper(coalesce(ea.status, '')) <> 'CANCELLED'
    )
    and not exists (
      select 1
      from public.parties p
      where p.organization_id = ou.organization_id
        and lower(coalesce(p.email, '')) = lower(trim(sa.email))
        and upper(coalesce(p.status, '')) = 'ACTIVE'
    )
)
insert into public.parties (
  organization_id,
  party_type,
  display_name,
  email,
  status
)
select
  c.organization_id,
  'person',
  coalesce(c.staff_name, split_part(c.staff_email, '@', 1)),
  c.staff_email,
  'ACTIVE'
from candidates c
where not exists (
  select 1
  from public.parties p
  where p.organization_id = c.organization_id
    and lower(coalesce(p.email, '')) = c.staff_email
    and upper(coalesce(p.status, '')) = 'ACTIVE'
);

update public.staff_accounts sa
set party_id = p.id
from public.parties p
where sa.party_id is null
  and sa.active = true
  and sa.active_organization_id = p.organization_id
  and lower(coalesce(sa.email, '')) = lower(coalesce(p.email, ''))
  and upper(coalesce(p.status, '')) = 'ACTIVE'
  and (
    select count(*)
    from public.parties p2
    where p2.organization_id = sa.active_organization_id
      and lower(coalesce(p2.email, '')) = lower(coalesce(sa.email, ''))
      and upper(coalesce(p2.status, '')) = 'ACTIVE'
  ) = 1;

commit;
