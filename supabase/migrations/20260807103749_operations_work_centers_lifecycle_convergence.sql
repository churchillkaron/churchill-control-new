alter table public.work_centers
  add column if not exists lifecycle_status text,
  add column if not exists updated_at timestamptz;

update public.work_centers
set lifecycle_status = case when active then 'active' else 'inactive' end
where lifecycle_status is null;

update public.work_centers
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.work_centers
  alter column lifecycle_status set default 'draft',
  alter column lifecycle_status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.work_centers
  drop constraint if exists work_centers_lifecycle_status_check;

alter table public.work_centers
  add constraint work_centers_lifecycle_status_check
  check (lifecycle_status in ('draft', 'active', 'inactive', 'archived'));

create unique index if not exists ux_work_centers_org_code
  on public.work_centers (organization_id, upper(trim(code)))
  where nullif(trim(code), '') is not null;

create or replace function public.sync_work_center_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_status is null then
      new.lifecycle_status := case when coalesce(new.active, false) then 'active' else 'draft' end;
    end if;
    new.active := new.lifecycle_status = 'active';
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    new.active := new.lifecycle_status = 'active';
  elsif new.active is distinct from old.active then
    new.lifecycle_status := case when new.active then 'active' else 'inactive' end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.sync_work_center_lifecycle() from public, anon, authenticated;
grant execute on function public.sync_work_center_lifecycle() to service_role;

drop trigger if exists trg_sync_work_center_lifecycle on public.work_centers;
create trigger trg_sync_work_center_lifecycle
before insert or update on public.work_centers
for each row execute function public.sync_work_center_lifecycle();

comment on column public.work_centers.lifecycle_status is
  'Canonical Operations master lifecycle status for a work centre. The active flag is retained as a routing compatibility projection.';
comment on column public.work_centers.updated_at is
  'Last canonical Operations lifecycle or master-data update timestamp.';
