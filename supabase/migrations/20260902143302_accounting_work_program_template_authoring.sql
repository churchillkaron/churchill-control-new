begin;

alter table public.accounting_work_program_templates
  add column if not exists lineage_key text,
  add column if not exists source_template_id uuid references public.accounting_work_program_templates(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

update public.accounting_work_program_templates
set lineage_key = template_key
where lineage_key is null;

alter table public.accounting_work_program_templates
  alter column lineage_key set not null;

alter table public.accounting_work_program_template_steps
  add column if not exists required_skill_keys text[] not null default '{}';

create unique index if not exists accounting_work_program_one_active_version_uidx
  on public.accounting_work_program_templates (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lineage_key
  )
  where status = 'ACTIVE';

create or replace function public.guard_accounting_work_program_template_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system or old.status <> 'DRAFT' then
      raise exception 'WORK_PROGRAM_TEMPLATE_IMMUTABLE' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.is_system then
    raise exception 'SYSTEM_WORK_PROGRAM_TEMPLATE_IMMUTABLE' using errcode = 'P0001';
  end if;

  if old.status <> 'DRAFT' then
    if new.status = 'ARCHIVED'
       and old.status = 'ACTIVE'
       and new.id = old.id
       and new.organization_id is not distinct from old.organization_id
       and new.template_key = old.template_key
       and new.lineage_key = old.lineage_key
       and new.version = old.version
       and new.name = old.name
       and new.description is not distinct from old.description
       and new.service_key is not distinct from old.service_key
       and new.cadence = old.cadence
       and new.is_system = old.is_system
       and new.metadata = old.metadata
       and new.created_by is not distinct from old.created_by
       and new.created_at = old.created_at
       and new.source_template_id is not distinct from old.source_template_id
       and new.published_at is not distinct from old.published_at
       and new.published_by is not distinct from old.published_by then
      return new;
    end if;
    raise exception 'PUBLISHED_WORK_PROGRAM_TEMPLATE_IMMUTABLE' using errcode = 'P0001';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.template_key <> old.template_key
     or new.lineage_key <> old.lineage_key
     or new.version <> old.version
     or new.is_system <> old.is_system
     or new.source_template_id is distinct from old.source_template_id then
    raise exception 'WORK_PROGRAM_TEMPLATE_IDENTITY_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.guard_accounting_work_program_template_step_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.accounting_work_program_templates;
begin
  select * into v_template
  from public.accounting_work_program_templates
  where id = coalesce(new.template_id, old.template_id);

  if not found then
    raise exception 'WORK_PROGRAM_TEMPLATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_template.is_system or v_template.status <> 'DRAFT' then
    raise exception 'WORK_PROGRAM_TEMPLATE_STEPS_IMMUTABLE' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists accounting_work_program_template_immutability_guard on public.accounting_work_program_templates;
create trigger accounting_work_program_template_immutability_guard
before update or delete on public.accounting_work_program_templates
for each row execute function public.guard_accounting_work_program_template_immutability();

drop trigger if exists accounting_work_program_template_step_immutability_guard on public.accounting_work_program_template_steps;
create trigger accounting_work_program_template_step_immutability_guard
before insert or update or delete on public.accounting_work_program_template_steps
for each row execute function public.guard_accounting_work_program_template_step_immutability();

create or replace function public.clone_accounting_work_program_template(
  p_source_template_id uuid,
  p_accounting_firm_id uuid,
  p_actor uuid,
  p_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source public.accounting_work_program_templates;
  v_new_id uuid;
  v_next_version integer;
  v_lineage_key text;
begin
  select * into v_source
  from public.accounting_work_program_templates
  where id = p_source_template_id
    and status in ('ACTIVE','DRAFT','ARCHIVED')
    and (organization_id is null or organization_id = p_accounting_firm_id);

  if not found then
    raise exception 'WORK_PROGRAM_TEMPLATE_SOURCE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_lineage_key := coalesce(v_source.lineage_key, v_source.template_key);

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.accounting_work_program_templates
  where organization_id = p_accounting_firm_id
    and lineage_key = v_lineage_key;

  insert into public.accounting_work_program_templates (
    organization_id, template_key, lineage_key, name, description, service_key, cadence,
    version, status, is_system, source_template_id, metadata, created_by
  ) values (
    p_accounting_firm_id,
    v_source.template_key,
    v_lineage_key,
    coalesce(nullif(trim(p_name), ''), v_source.name),
    v_source.description,
    v_source.service_key,
    v_source.cadence,
    v_next_version,
    'DRAFT',
    false,
    v_source.id,
    coalesce(v_source.metadata, '{}'::jsonb) || jsonb_build_object('source', 'firm_template_clone', 'source_template_version', v_source.version),
    p_actor
  ) returning id into v_new_id;

  insert into public.accounting_work_program_template_steps (
    organization_id, template_id, step_key, sequence_no, title, description, work_type,
    required_role, relative_due_days, due_anchor, dependency_step_keys, capability_id,
    instructions, evidence_required, active, metadata, budget_minutes, required_skill_keys
  )
  select
    p_accounting_firm_id, v_new_id, step_key, sequence_no, title, description, work_type,
    required_role, relative_due_days, due_anchor, dependency_step_keys, capability_id,
    instructions, evidence_required, active, metadata, budget_minutes, required_skill_keys
  from public.accounting_work_program_template_steps
  where template_id = v_source.id
  order by sequence_no;

  return v_new_id;
end;
$$;

create or replace function public.save_accounting_work_program_template_draft(
  p_template_id uuid,
  p_accounting_firm_id uuid,
  p_actor uuid,
  p_name text,
  p_description text,
  p_service_key text,
  p_cadence text,
  p_metadata jsonb,
  p_steps jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.accounting_work_program_templates;
  v_step jsonb;
  v_keys text[];
  v_dependencies text[];
  v_key text;
  v_seq integer;
begin
  select * into v_template
  from public.accounting_work_program_templates
  where id = p_template_id
    and organization_id = p_accounting_firm_id
    and status = 'DRAFT'
    and is_system = false;

  if not found then
    raise exception 'WORK_PROGRAM_TEMPLATE_DRAFT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'WORK_PROGRAM_TEMPLATE_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if p_cadence not in ('WEEKLY','MONTHLY','QUARTERLY','ANNUAL','AD_HOC') then
    raise exception 'WORK_PROGRAM_TEMPLATE_CADENCE_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'WORK_PROGRAM_TEMPLATE_STEPS_REQUIRED' using errcode = 'P0001';
  end if;

  select array_agg(trim(value->>'step_key')) into v_keys
  from jsonb_array_elements(p_steps) value;

  if exists (
    select 1
    from unnest(v_keys) key
    where key is null or key = ''
  ) then
    raise exception 'WORK_PROGRAM_STEP_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  if (select count(*) from unnest(v_keys)) <> (select count(distinct key) from unnest(v_keys) key) then
    raise exception 'WORK_PROGRAM_STEP_KEYS_MUST_BE_UNIQUE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) value
    group by (value->>'sequence_no')::integer
    having count(*) > 1
  ) then
    raise exception 'WORK_PROGRAM_STEP_SEQUENCE_MUST_BE_UNIQUE' using errcode = 'P0001';
  end if;

  update public.accounting_work_program_templates
  set name = trim(p_name),
      description = nullif(trim(p_description), ''),
      service_key = nullif(trim(p_service_key), ''),
      cadence = p_cadence,
      metadata = coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
  where id = p_template_id;

  delete from public.accounting_work_program_template_steps where template_id = p_template_id;

  for v_step in select * from jsonb_array_elements(p_steps)
  loop
    v_key := trim(v_step->>'step_key');
    v_seq := (v_step->>'sequence_no')::integer;
    select coalesce(array_agg(trim(value)), '{}') into v_dependencies
    from jsonb_array_elements_text(coalesce(v_step->'dependency_step_keys', '[]'::jsonb)) value;

    if v_seq <= 0 then
      raise exception 'WORK_PROGRAM_STEP_SEQUENCE_INVALID' using errcode = 'P0001';
    end if;
    if v_key = any(v_dependencies) then
      raise exception 'WORK_PROGRAM_STEP_SELF_DEPENDENCY:%', v_key using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_dependencies) dep where not dep = any(v_keys)) then
      raise exception 'WORK_PROGRAM_STEP_DEPENDENCY_UNKNOWN:%', v_key using errcode = 'P0001';
    end if;

    insert into public.accounting_work_program_template_steps (
      organization_id, template_id, step_key, sequence_no, title, description, work_type,
      required_role, relative_due_days, due_anchor, dependency_step_keys, capability_id,
      instructions, evidence_required, active, metadata, budget_minutes, required_skill_keys
    ) values (
      p_accounting_firm_id,
      p_template_id,
      v_key,
      v_seq,
      trim(v_step->>'title'),
      nullif(trim(v_step->>'description'), ''),
      coalesce(nullif(v_step->>'work_type', ''), 'INTERNAL'),
      coalesce(nullif(v_step->>'required_role', ''), 'PREPARER'),
      coalesce((v_step->>'relative_due_days')::integer, 0),
      coalesce(nullif(v_step->>'due_anchor', ''), 'PERIOD_END'),
      v_dependencies,
      nullif(trim(v_step->>'capability_id'), ''),
      nullif(trim(v_step->>'instructions'), ''),
      coalesce((v_step->>'evidence_required')::boolean, false),
      coalesce((v_step->>'active')::boolean, true),
      coalesce(v_step->'metadata', '{}'::jsonb),
      greatest(0, coalesce((v_step->>'budget_minutes')::integer, 0)),
      coalesce(array(select trim(value) from jsonb_array_elements_text(coalesce(v_step->'required_skill_keys', '[]'::jsonb)) value where trim(value) <> ''), '{}')
    );
  end loop;

  return p_template_id;
end;
$$;

create or replace function public.publish_accounting_work_program_template(
  p_template_id uuid,
  p_accounting_firm_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.accounting_work_program_templates;
  v_step_count integer;
  v_cycle boolean;
begin
  select * into v_template
  from public.accounting_work_program_templates
  where id = p_template_id
    and organization_id = p_accounting_firm_id
    and status = 'DRAFT'
    and is_system = false
  for update;

  if not found then
    raise exception 'WORK_PROGRAM_TEMPLATE_DRAFT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select count(*) into v_step_count
  from public.accounting_work_program_template_steps
  where template_id = p_template_id and active = true;
  if v_step_count = 0 then
    raise exception 'WORK_PROGRAM_TEMPLATE_STEPS_REQUIRED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.accounting_work_program_template_steps s,
         unnest(s.dependency_step_keys) dep
    where s.template_id = p_template_id
      and not exists (
        select 1 from public.accounting_work_program_template_steps target
        where target.template_id = p_template_id and target.step_key = dep and target.active = true
      )
  ) then
    raise exception 'WORK_PROGRAM_TEMPLATE_DEPENDENCY_UNKNOWN' using errcode = 'P0001';
  end if;

  with recursive walk(start_key, current_key, path, cycle) as (
    select s.step_key, dep, array[s.step_key, dep], dep = s.step_key
    from public.accounting_work_program_template_steps s
    cross join lateral unnest(s.dependency_step_keys) dep
    where s.template_id = p_template_id and s.active = true
    union all
    select walk.start_key, dep, walk.path || dep, dep = any(walk.path)
    from walk
    join public.accounting_work_program_template_steps s
      on s.template_id = p_template_id and s.step_key = walk.current_key and s.active = true
    cross join lateral unnest(s.dependency_step_keys) dep
    where not walk.cycle
  )
  select coalesce(bool_or(cycle), false) into v_cycle from walk;

  if v_cycle then
    raise exception 'WORK_PROGRAM_TEMPLATE_DEPENDENCY_CYCLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.accounting_work_program_template_steps
    where template_id = p_template_id
      and active = true
      and (nullif(trim(title), '') is null or sequence_no <= 0 or budget_minutes < 0)
  ) then
    raise exception 'WORK_PROGRAM_TEMPLATE_STEP_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.accounting_work_program_template_steps
    where template_id = p_template_id
      and active = true
      and capability_id = 'documents'
      and evidence_required = true
      and not (
        metadata ? 'system_verification'
        and metadata->'system_verification'->>'mode' = 'DOCUMENT_CATEGORIES'
        and jsonb_typeof(metadata->'system_verification'->'categories') = 'array'
        and jsonb_array_length(metadata->'system_verification'->'categories') > 0
      )
  ) then
    raise exception 'WORK_PROGRAM_DOCUMENT_GATE_CONFIGURATION_REQUIRED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.accounting_work_program_template_steps
    where template_id = p_template_id
      and active = true
      and capability_id = 'statements'
      and evidence_required = true
      and not (
        metadata ? 'system_verification'
        and metadata->'system_verification'->>'mode' = 'FINANCIAL_REPORT_SET'
        and jsonb_typeof(metadata->'system_verification'->'reports') = 'array'
        and jsonb_array_length(metadata->'system_verification'->'reports') > 0
      )
  ) then
    raise exception 'WORK_PROGRAM_STATEMENT_GATE_CONFIGURATION_REQUIRED' using errcode = 'P0001';
  end if;

  update public.accounting_work_program_templates
  set status = 'ARCHIVED', archived_at = now(), archived_by = p_actor, updated_at = now()
  where organization_id = p_accounting_firm_id
    and lineage_key = v_template.lineage_key
    and status = 'ACTIVE'
    and id <> p_template_id;

  update public.accounting_work_program_templates
  set status = 'ACTIVE', published_at = now(), published_by = p_actor, updated_at = now()
  where id = p_template_id;

  return p_template_id;
end;
$$;

create or replace function public.archive_accounting_work_program_template(
  p_template_id uuid,
  p_accounting_firm_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.accounting_work_program_templates
  set status = 'ARCHIVED', archived_at = now(), archived_by = p_actor, updated_at = now()
  where id = p_template_id
    and organization_id = p_accounting_firm_id
    and status = 'ACTIVE'
    and is_system = false;

  if not found then
    raise exception 'WORK_PROGRAM_TEMPLATE_ACTIVE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return p_template_id;
end;
$$;

revoke all on function public.clone_accounting_work_program_template(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.save_accounting_work_program_template_draft(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.publish_accounting_work_program_template(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.archive_accounting_work_program_template(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.clone_accounting_work_program_template(uuid, uuid, uuid, text) to service_role;
grant execute on function public.save_accounting_work_program_template_draft(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.publish_accounting_work_program_template(uuid, uuid, uuid) to service_role;
grant execute on function public.archive_accounting_work_program_template(uuid, uuid, uuid) to service_role;

commit;
