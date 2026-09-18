begin;

-- Converge accounting-practice work programs onto the canonical Finance period authority.
-- Existing practice references are mapped only when organization, entity and exact dates match.

do $$
begin
  if exists (
    select 1
    from public.accounting_engagement_runs r
    join public.financial_periods fp on fp.id = r.period_id
    left join public.accounting_periods ap
      on ap.organization_id = fp.organization_id
     and ap.entity_id = fp.entity_id
     and ap.start_date = fp.start_date
     and ap.end_date = fp.end_date
    where r.period_id is not null
      and ap.id is null
  ) then
    raise exception 'PRACTICE_PERIOD_CONVERGENCE_RUN_MAPPING_REQUIRED';
  end if;

  if exists (
    select 1
    from public.accounting_work_program_evidence_links e
    join public.financial_periods fp on fp.id = e.period_id
    left join public.accounting_periods ap
      on ap.organization_id = fp.organization_id
     and ap.entity_id = fp.entity_id
     and ap.start_date = fp.start_date
     and ap.end_date = fp.end_date
    where ap.id is null
  ) then
    raise exception 'PRACTICE_PERIOD_CONVERGENCE_EVIDENCE_MAPPING_REQUIRED';
  end if;
end;
$$;

create temporary table practice_period_convergence_map on commit drop as
select distinct
  fp.id as legacy_period_id,
  ap.id as accounting_period_id
from public.financial_periods fp
join public.accounting_periods ap
  on ap.organization_id = fp.organization_id
 and ap.entity_id = fp.entity_id
 and ap.start_date = fp.start_date
 and ap.end_date = fp.end_date;

alter table public.accounting_work_program_evidence_links
  drop constraint if exists accounting_work_program_evidence_links_period_id_fkey;

update public.accounting_engagement_runs r
set period_id = m.accounting_period_id
from practice_period_convergence_map m
where r.period_id = m.legacy_period_id;

update public.accounting_work_program_evidence_links e
set period_id = m.accounting_period_id,
    updated_at = now()
from practice_period_convergence_map m
where e.period_id = m.legacy_period_id;

alter table public.accounting_engagement_runs
  drop constraint if exists accounting_engagement_runs_period_id_fkey;
alter table public.accounting_engagement_runs
  add constraint accounting_engagement_runs_period_id_fkey
  foreign key (period_id) references public.accounting_periods(id) on delete restrict;

alter table public.accounting_work_program_evidence_links
  add constraint accounting_work_program_evidence_links_period_id_fkey
  foreign key (period_id) references public.accounting_periods(id) on delete cascade;

create or replace function public.validate_accounting_work_program_evidence_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  run_row public.accounting_engagement_runs%rowtype;
  item_row public.accounting_engagement_work_items%rowtype;
  document_organization_id uuid;
  entity_organization_id uuid;
  period_organization_id uuid;
  period_entity_id uuid;
begin
  new.evidence_category := lower(btrim(new.evidence_category));
  new.updated_at := now();

  select * into run_row
  from public.accounting_engagement_runs
  where id = new.run_id
    and accounting_firm_id = new.accounting_firm_id;

  if not found then
    raise exception 'EVIDENCE_RUN_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  if run_row.organization_id is null
     or run_row.entity_id is null
     or run_row.period_id is null then
    raise exception 'EVIDENCE_RUN_SCOPE_REQUIRED' using errcode = '23514';
  end if;

  if run_row.organization_id <> new.organization_id
     or run_row.entity_id <> new.entity_id
     or run_row.period_id <> new.period_id
     or run_row.engagement_id <> new.engagement_id then
    raise exception 'EVIDENCE_RUN_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  select * into item_row
  from public.accounting_engagement_work_items
  where id = new.work_item_id
    and run_id = new.run_id
    and accounting_firm_id = new.accounting_firm_id;

  if not found then
    raise exception 'EVIDENCE_WORK_ITEM_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  if item_row.entity_id is distinct from new.entity_id then
    raise exception 'EVIDENCE_WORK_ITEM_ENTITY_MISMATCH' using errcode = '23514';
  end if;

  select organization_id into document_organization_id
  from public.organization_documents
  where id = new.document_id;

  if not found or document_organization_id <> new.organization_id then
    raise exception 'EVIDENCE_DOCUMENT_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  select organization_id into entity_organization_id
  from public.legal_entities
  where id = new.entity_id;

  if not found or entity_organization_id <> new.organization_id then
    raise exception 'EVIDENCE_ENTITY_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  select organization_id, entity_id
    into period_organization_id, period_entity_id
  from public.accounting_periods
  where id = new.period_id;

  if not found
     or period_organization_id <> new.organization_id
     or period_entity_id <> new.entity_id then
    raise exception 'EVIDENCE_PERIOD_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.materialize_accounting_engagement_run(
  p_accounting_firm_id uuid,
  p_engagement_id uuid,
  p_template_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_run_key text,
  p_start_at timestamptz,
  p_due_at timestamptz,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_engagement public.accounting_engagements%rowtype;
  v_template public.accounting_work_program_templates%rowtype;
  v_profile public.accounting_client_profiles%rowtype;
  v_period public.accounting_periods%rowtype;
  v_run public.accounting_engagement_runs%rowtype;
  v_existing public.accounting_engagement_runs%rowtype;
  v_items integer := 0;
  v_requests integer := 0;
  v_budget_minutes integer := 0;
begin
  select * into v_engagement
  from public.accounting_engagements
  where id = p_engagement_id
    and accounting_firm_id = p_accounting_firm_id
    and status = 'ACTIVE';
  if not found then raise exception 'ENGAGEMENT_UNAVAILABLE'; end if;

  if p_entity_id is null then raise exception 'ENTITY_REQUIRED'; end if;
  if not exists (
    select 1
    from public.legal_entities
    where id = p_entity_id
      and organization_id = v_engagement.organization_id
  ) then
    raise exception 'ENTITY_SCOPE_MISMATCH';
  end if;

  select * into v_template
  from public.accounting_work_program_templates
  where id = p_template_id
    and status = 'ACTIVE'
    and (organization_id is null or organization_id = p_accounting_firm_id);
  if not found then raise exception 'TEMPLATE_UNAVAILABLE'; end if;

  if not exists (
    select 1
    from public.accounting_work_program_template_steps
    where template_id = p_template_id
      and active = true
  ) then
    raise exception 'TEMPLATE_HAS_NO_ACTIVE_STEPS';
  end if;

  select coalesce(sum(coalesce(budget_minutes, 0)), 0)::integer
    into v_budget_minutes
  from public.accounting_work_program_template_steps
  where template_id = p_template_id
    and active = true;

  if p_period_id is null then raise exception 'PERIOD_REQUIRED'; end if;
  select * into v_period
  from public.accounting_periods
  where id = p_period_id
    and organization_id = v_engagement.organization_id
    and entity_id = p_entity_id;
  if not found then raise exception 'PERIOD_SCOPE_MISMATCH'; end if;

  select * into v_profile
  from public.accounting_client_profiles
  where accounting_firm_id = p_accounting_firm_id
    and organization_id = v_engagement.organization_id;

  insert into public.accounting_engagement_runs (
    accounting_firm_id, organization_id, entity_id, engagement_id, template_id, period_id,
    run_key, cadence, status, start_at, due_at, created_by, metadata
  ) values (
    p_accounting_firm_id, v_engagement.organization_id, p_entity_id, p_engagement_id, p_template_id, p_period_id,
    p_run_key, v_template.cadence, 'PLANNED', p_start_at, p_due_at, p_created_by,
    jsonb_build_object(
      'template_version', v_template.version,
      'entity_id', p_entity_id,
      'source', 'recurring_materializer'
    )
  )
  on conflict (accounting_firm_id, engagement_id, run_key) do nothing
  returning * into v_run;

  if v_run.id is null then
    select * into v_existing
    from public.accounting_engagement_runs
    where accounting_firm_id = p_accounting_firm_id
      and engagement_id = p_engagement_id
      and run_key = p_run_key;

    return jsonb_build_object(
      'created', false,
      'run_id', v_existing.id,
      'status', 'ALREADY_EXISTS'
    );
  end if;

  insert into public.accounting_engagement_work_items (
    accounting_firm_id, organization_id, entity_id, run_id, template_step_id, step_key, sequence_no,
    title, description, work_type, required_role, assigned_to, status, start_at, due_at, blocked_reason,
    dependency_step_keys, capability_id, budget_minutes, metadata
  )
  select
    p_accounting_firm_id,
    v_engagement.organization_id,
    p_entity_id,
    v_run.id,
    s.id,
    s.step_key,
    s.sequence_no,
    s.title,
    s.description,
    s.work_type,
    s.required_role,
    case s.required_role
      when 'PREPARER' then v_profile.assigned_accountant_id
      when 'REVIEWER' then v_profile.assigned_reviewer_id
      when 'PARTNER' then v_profile.assigned_partner_id
      else null
    end,
    case when coalesce(array_length(s.dependency_step_keys, 1), 0) = 0 then 'READY' else 'NOT_STARTED' end,
    case when coalesce(array_length(s.dependency_step_keys, 1), 0) = 0 then p_start_at else null end,
    (case when s.due_anchor = 'RUN_START' then p_start_at else p_due_at end)
      + make_interval(days => coalesce(s.relative_due_days, 0)),
    null,
    coalesce(s.dependency_step_keys, array[]::text[]),
    s.capability_id,
    coalesce(s.budget_minutes, 0),
    jsonb_build_object(
      'template_version', v_template.version,
      'evidence_required', coalesce(s.evidence_required, false),
      'source', 'recurring_materializer'
    )
  from public.accounting_work_program_template_steps s
  where s.template_id = p_template_id
    and s.active = true
  order by s.sequence_no;
  get diagnostics v_items = row_count;

  insert into public.accounting_client_requests (
    accounting_firm_id, organization_id, entity_id, run_id, work_item_id, title, instructions,
    status, due_at, reminder_policy, created_by, metadata
  )
  select
    p_accounting_firm_id,
    v_engagement.organization_id,
    p_entity_id,
    v_run.id,
    i.id,
    i.title,
    i.description,
    'DRAFT',
    i.due_at,
    jsonb_build_object('mode', 'manual_until_sent'),
    p_created_by,
    jsonb_build_object('source', 'recurring_materializer')
  from public.accounting_engagement_work_items i
  where i.run_id = v_run.id
    and i.work_type = 'CLIENT_REQUEST';
  get diagnostics v_requests = row_count;

  insert into public.organization_audit_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    metadata
  ) values (
    p_accounting_firm_id,
    'accounting_engagement_run',
    v_run.id::text,
    'ACCOUNTING_RECURRING_RUN_CREATED',
    '{}'::jsonb,
    jsonb_build_object(
      'status', v_run.status,
      'run_key', p_run_key,
      'due_at', p_due_at
    ),
    jsonb_build_object(
      'source', 'recurring_materializer',
      'engagement_id', p_engagement_id,
      'client_organization_id', v_engagement.organization_id,
      'legal_entity_id', p_entity_id,
      'period_id', p_period_id,
      'template_id', p_template_id,
      'template_version', v_template.version,
      'run_key', p_run_key,
      'work_item_count', v_items,
      'client_request_count', v_requests,
      'budget_minutes', v_budget_minutes,
      'created_by', p_created_by,
      'no_external_message', true
    )
  );

  return jsonb_build_object(
    'created', true,
    'run_id', v_run.id,
    'status', 'CREATED',
    'work_items', v_items,
    'client_requests', v_requests,
    'budget_minutes', v_budget_minutes,
    'audit_action', 'ACCOUNTING_RECURRING_RUN_CREATED',
    'no_external_message', true
  );
end;
$$;

revoke all on function public.materialize_accounting_engagement_run(uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid) from public;
revoke all on function public.materialize_accounting_engagement_run(uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid) from anon;
revoke all on function public.materialize_accounting_engagement_run(uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid) from authenticated;
grant execute on function public.materialize_accounting_engagement_run(uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, uuid) to service_role;


revoke all on function public.validate_accounting_work_program_evidence_link() from public, anon, authenticated;
grant execute on function public.validate_accounting_work_program_evidence_link() to service_role;

commit;
