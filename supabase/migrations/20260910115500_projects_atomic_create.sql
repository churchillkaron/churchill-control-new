create or replace function public.create_project_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_code text,
  p_name text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_code text := btrim(coalesce(p_code, ''));
  v_name text := btrim(coalesce(p_name, ''));
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'PROJECT_SCOPE_REQUIRED'; end if;
  if v_code = '' or v_name = '' then raise exception 'PROJECT_CODE_AND_NAME_REQUIRED'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then raise exception 'PROJECT_DATE_RANGE_INVALID'; end if;

  perform 1 from public.legal_entities e
  where e.id = p_entity_id and e.organization_id = p_organization_id and coalesce(e.is_active, true) = true;
  if not found then raise exception 'PROJECT_ENTITY_SCOPE_MISMATCH'; end if;

  lock table public.projects in share row exclusive mode;
  if exists (
    select 1 from public.projects p
    where p.organization_id = p_organization_id
      and p.entity_id = p_entity_id
      and lower(btrim(coalesce(p.code,''))) = lower(v_code)
  ) then raise exception 'PROJECT_CODE_ALREADY_EXISTS'; end if;

  insert into public.projects (organization_id, entity_id, code, name, description, status, start_date, end_date)
  values (p_organization_id, p_entity_id, v_code, v_name, nullif(btrim(coalesce(p_description,'')),''), 'ACTIVE', p_start_date, p_end_date)
  returning * into v_project;

  return jsonb_build_object('status','CREATED','project',to_jsonb(v_project));
end;
$$;

revoke all on function public.create_project_atomic(uuid, uuid, text, text, text, date, date) from public, anon, authenticated;
grant execute on function public.create_project_atomic(uuid, uuid, text, text, text, date, date) to service_role;
