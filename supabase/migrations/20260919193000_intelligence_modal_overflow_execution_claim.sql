-- Reconstruct the already-live generic Modal approval contract so clean/new
-- environments do not depend on production-only schema drift.
create table if not exists public.modal_compute_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'modal',
  capability text not null,
  infrastructure_provider text,
  reason text not null,
  status text not null default 'APPROVED' check (status in ('APPROVED','EXHAUSTED','REVOKED','EXPIRED')),
  maximum_calls integer not null default 1 check (maximum_calls > 0 and maximum_calls <= 100),
  used_calls integer not null default 0 check (used_calls >= 0),
  maximum_supplier_cost_thb numeric,
  used_supplier_cost_thb numeric not null default 0,
  approved_by uuid,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modal_compute_approvals enable row level security;
revoke all on public.modal_compute_approvals from anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on public.modal_compute_approvals to service_role;

create or replace function public.consume_modal_compute_approval(
  p_organization_id uuid,
  p_approval_id uuid,
  p_capability text,
  p_requested_supplier_cost_thb numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row public.modal_compute_approvals%rowtype;
  v_requested numeric := greatest(coalesce(p_requested_supplier_cost_thb,0),0);
  v_next_calls integer;
  v_next_cost numeric;
begin
  select * into v_row from public.modal_compute_approvals
  where id=p_approval_id and organization_id=p_organization_id for update;
  if not found then raise exception 'MODAL_COMPUTE_APPROVAL_NOT_FOUND'; end if;
  if v_row.status <> 'APPROVED' then raise exception 'MODAL_COMPUTE_APPROVAL_NOT_ACTIVE:%',v_row.status; end if;
  if v_row.expires_at <= now() then
    update public.modal_compute_approvals set status='EXPIRED',updated_at=now() where id=v_row.id;
    raise exception 'MODAL_COMPUTE_APPROVAL_EXPIRED';
  end if;
  if v_row.capability <> '*' and v_row.capability <> p_capability then
    raise exception 'MODAL_COMPUTE_APPROVAL_CAPABILITY_MISMATCH';
  end if;
  v_next_calls:=v_row.used_calls+1;
  if v_next_calls>v_row.maximum_calls then
    update public.modal_compute_approvals set status='EXHAUSTED',updated_at=now() where id=v_row.id;
    raise exception 'MODAL_COMPUTE_APPROVAL_CALL_LIMIT_EXCEEDED';
  end if;
  v_next_cost:=v_row.used_supplier_cost_thb+v_requested;
  if v_row.maximum_supplier_cost_thb is not null and v_next_cost>v_row.maximum_supplier_cost_thb then
    raise exception 'MODAL_COMPUTE_APPROVAL_COST_LIMIT_EXCEEDED';
  end if;
  update public.modal_compute_approvals
    set used_calls=v_next_calls,
        used_supplier_cost_thb=v_next_cost,
        status=case when v_next_calls>=maximum_calls then 'EXHAUSTED' else status end,
        updated_at=now()
    where id=v_row.id returning * into v_row;
  return jsonb_build_object(
    'approval_id',v_row.id,
    'organization_id',v_row.organization_id,
    'capability',v_row.capability,
    'status',v_row.status,
    'maximum_calls',v_row.maximum_calls,
    'used_calls',v_row.used_calls,
    'maximum_supplier_cost_thb',v_row.maximum_supplier_cost_thb,
    'used_supplier_cost_thb',v_row.used_supplier_cost_thb,
    'expires_at',v_row.expires_at
  );
end;
$function$;

revoke all on function public.consume_modal_compute_approval(uuid,uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.consume_modal_compute_approval(uuid,uuid,text,numeric) to service_role;

create table if not exists public.intelligence_modal_overflow_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_id text not null,
  request_fingerprint text not null,
  party_id uuid,
  entity_id uuid,
  requested_by_user_id uuid,
  capability text not null,
  execution_lane text not null check (execution_lane in ('fast','deep')),
  reason_code text not null check (reason_code in (
    'LOCAL_CONTEXT_CAPACITY_EXCEEDED',
    'LOCAL_OUTPUT_CAPACITY_EXCEEDED',
    'LOCAL_GPU_MEMORY_INSUFFICIENT',
    'LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED'
  )),
  explanation text not null,
  local_evidence jsonb not null default '{}'::jsonb,
  proposed_supplier_cost_thb numeric not null check (proposed_supplier_cost_thb > 0),
  cost_policy jsonb not null default '{}'::jsonb,
  status text not null default 'PROPOSED' check (status in ('PROPOSED','APPROVED','REJECTED','EXPIRED','CONSUMED','CANCELLED')),
  approval_id uuid references public.modal_compute_approvals(id) on delete restrict,
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, usage_id)
);

create index if not exists intelligence_modal_overflow_proposals_status_idx
  on public.intelligence_modal_overflow_proposals(organization_id, status, created_at desc);

alter table public.intelligence_modal_overflow_proposals enable row level security;
revoke all on public.intelligence_modal_overflow_proposals from anon, authenticated;
grant select, insert, update on public.intelligence_modal_overflow_proposals to service_role;

create or replace function public.approve_intelligence_modal_overflow_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_approved_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_proposal public.intelligence_modal_overflow_proposals%rowtype;
  v_approval public.modal_compute_approvals%rowtype;
begin
  select * into v_proposal
  from public.intelligence_modal_overflow_proposals
  where id = p_proposal_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_NOT_FOUND'; end if;

  if v_proposal.status = 'APPROVED' and v_proposal.approval_id is not null then
    select * into v_approval from public.modal_compute_approvals
    where id = v_proposal.approval_id and organization_id = p_organization_id;
    if found then
      return jsonb_build_object(
        'proposal_id', v_proposal.id,
        'approval_id', v_approval.id,
        'organization_id', v_proposal.organization_id,
        'execution_lane', v_proposal.execution_lane,
        'reason_code', v_proposal.reason_code,
        'maximum_supplier_cost_thb', v_approval.maximum_supplier_cost_thb,
        'status', v_approval.status,
        'expires_at', v_approval.expires_at
      );
    end if;
  end if;

  if v_proposal.status <> 'PROPOSED' then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_NOT_APPROVABLE:%', v_proposal.status;
  end if;
  if v_proposal.expires_at <= now() then
    update public.intelligence_modal_overflow_proposals
      set status='EXPIRED', updated_at=now()
      where id=v_proposal.id;
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_EXPIRED';
  end if;

  insert into public.modal_compute_approvals (
    organization_id, provider, capability, infrastructure_provider, reason,
    status, maximum_calls, used_calls, maximum_supplier_cost_thb,
    used_supplier_cost_thb, approved_by, approved_at, expires_at, metadata
  ) values (
    v_proposal.organization_id,
    'modal',
    v_proposal.capability,
    'MODAL_H100_ASYNC_V1',
    v_proposal.explanation,
    'APPROVED',
    1,
    0,
    v_proposal.proposed_supplier_cost_thb,
    0,
    p_approved_by,
    now(),
    v_proposal.expires_at,
    jsonb_build_object(
      'purpose', 'INTELLIGENCE_MODAL_OVERFLOW',
      'proposal_id', v_proposal.id,
      'request_fingerprint', v_proposal.request_fingerprint,
      'overflow_only', true,
      'local_first_required', true,
      'automatic_fallback_allowed', false,
      'intelligence_lane', v_proposal.execution_lane,
      'reason_code', v_proposal.reason_code,
      'one_paid_job_only', true,
      'provider_job_submission_requires_local_insufficiency_proof', true,
      'cost_policy', v_proposal.cost_policy
    )
  ) returning * into v_approval;

  update public.intelligence_modal_overflow_proposals
  set status='APPROVED', approval_id=v_approval.id, approved_by=p_approved_by,
      approved_at=now(), updated_at=now()
  where id=v_proposal.id;

  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'approval_id', v_approval.id,
    'organization_id', v_proposal.organization_id,
    'execution_lane', v_proposal.execution_lane,
    'reason_code', v_proposal.reason_code,
    'maximum_supplier_cost_thb', v_approval.maximum_supplier_cost_thb,
    'status', v_approval.status,
    'expires_at', v_approval.expires_at
  );
end;
$function$;

revoke all on function public.approve_intelligence_modal_overflow_proposal(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_intelligence_modal_overflow_proposal(uuid,uuid,uuid) to service_role;

create table if not exists public.intelligence_modal_overflow_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_id uuid not null references public.modal_compute_approvals(id) on delete restrict,
  usage_id text not null,
  capability text not null,
  execution_lane text not null check (execution_lane in ('fast','deep')),
  reason_code text not null check (reason_code in (
    'LOCAL_CONTEXT_CAPACITY_EXCEEDED',
    'LOCAL_OUTPUT_CAPACITY_EXCEEDED',
    'LOCAL_GPU_MEMORY_INSUFFICIENT',
    'LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED'
  )),
  infrastructure_provider text not null default 'MODAL_H100_ASYNC_V1',
  requested_supplier_cost_thb numeric not null check (requested_supplier_cost_thb > 0),
  status text not null default 'RESERVED' check (status in ('RESERVED','SUBMITTED','SUBMISSION_UNCERTAIN','SETTLEMENT_UNCERTAIN','COMPLETED','FAILED','CANCELLED')),
  provider_job_id text,
  provider_function text,
  provider_model text,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  terminal_metadata jsonb not null default '{}'::jsonb,
  actual_supplier_cost_thb numeric check (actual_supplier_cost_thb is null or actual_supplier_cost_thb >= 0),
  modal_elapsed_seconds numeric check (modal_elapsed_seconds is null or modal_elapsed_seconds >= 0),
  settlement_wall_seconds numeric check (settlement_wall_seconds is null or settlement_wall_seconds >= 0),
  settlement_thb_per_second numeric check (settlement_thb_per_second is null or settlement_thb_per_second > 0),
  reserved_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (approval_id),
  unique (provider_job_id)
);

create unique index if not exists intelligence_modal_overflow_executions_usage_id_uidx
  on public.intelligence_modal_overflow_executions(organization_id, usage_id);

alter table public.intelligence_modal_overflow_executions enable row level security;

revoke all on public.intelligence_modal_overflow_executions from anon, authenticated;
grant select, insert, update on public.intelligence_modal_overflow_executions to service_role;

create or replace function public.claim_intelligence_modal_overflow_execution(
  p_organization_id uuid,
  p_approval_id uuid,
  p_usage_id text,
  p_request_fingerprint text,
  p_capability text,
  p_execution_lane text,
  p_reason_code text,
  p_infrastructure_provider text,
  p_requested_supplier_cost_thb numeric,
  p_local_capacity_checked boolean,
  p_local_attempted boolean,
  p_local_failure_code text,
  p_local_assessment_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_approval public.modal_compute_approvals%rowtype;
  v_execution public.intelligence_modal_overflow_executions%rowtype;
  v_requested numeric := greatest(coalesce(p_requested_supplier_cost_thb,0),0);
  v_metadata jsonb;
begin
  if nullif(trim(p_usage_id),'') is null then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_USAGE_ID_REQUIRED';
  end if;
  if nullif(trim(p_request_fingerprint),'') is null then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_REQUEST_FINGERPRINT_REQUIRED';
  end if;
  if p_execution_lane not in ('fast','deep') then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_LANE_INVALID';
  end if;
  if v_requested <= 0 then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_COST_REQUIRED';
  end if;

  if p_reason_code not in (
    'LOCAL_CONTEXT_CAPACITY_EXCEEDED',
    'LOCAL_OUTPUT_CAPACITY_EXCEEDED',
    'LOCAL_GPU_MEMORY_INSUFFICIENT',
    'LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED'
  ) then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_REASON_INVALID';
  end if;
  if coalesce(p_local_capacity_checked,false) is not true and coalesce(p_local_attempted,false) is not true then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_LOCAL_PROOF_REQUIRED';
  end if;
  if p_reason_code = 'LOCAL_GPU_MEMORY_INSUFFICIENT' and (
    coalesce(p_local_attempted,false) is not true or
    coalesce(p_local_failure_code,'') !~* '(out.?of.?memory|oom|gpu.?memory|vram)'
  ) then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_GPU_MEMORY_PROOF_REQUIRED';
  end if;
  if p_reason_code = 'LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED' and nullif(trim(coalesce(p_local_assessment_reference,'')),'') is null then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_LOCAL_ASSESSMENT_REQUIRED';
  end if;
  select * into v_approval
  from public.modal_compute_approvals
  where id = p_approval_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'MODAL_COMPUTE_APPROVAL_NOT_FOUND'; end if;
  if v_approval.provider <> 'modal' then raise exception 'MODAL_COMPUTE_APPROVAL_PROVIDER_INVALID'; end if;
  if v_approval.status <> 'APPROVED' then raise exception 'MODAL_COMPUTE_APPROVAL_NOT_ACTIVE:%', v_approval.status; end if;
  if v_approval.expires_at <= now() then
    update public.modal_compute_approvals set status='EXPIRED', updated_at=now() where id=v_approval.id;
    raise exception 'MODAL_COMPUTE_APPROVAL_EXPIRED';
  end if;
  if v_approval.capability <> p_capability then raise exception 'MODAL_COMPUTE_APPROVAL_CAPABILITY_MISMATCH'; end if;
  if coalesce(v_approval.infrastructure_provider,'') <> p_infrastructure_provider then
    raise exception 'MODAL_COMPUTE_APPROVAL_INFRASTRUCTURE_MISMATCH';
  end if;

  v_metadata := coalesce(v_approval.metadata,'{}'::jsonb);
  if v_metadata->>'purpose' <> 'INTELLIGENCE_MODAL_OVERFLOW' then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_PURPOSE_INVALID'; end if;
  if nullif(v_metadata->>'proposal_id','') is null then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_BINDING_REQUIRED'; end if;
  if coalesce(v_metadata->>'request_fingerprint','') <> p_request_fingerprint then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_REQUEST_FINGERPRINT_MISMATCH'; end if;
  if coalesce((v_metadata->>'overflow_only')::boolean,false) is not true then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_SCOPE_INVALID'; end if;
  if coalesce((v_metadata->>'local_first_required')::boolean,false) is not true then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_LOCAL_FIRST_REQUIRED'; end if;
  if coalesce((v_metadata->>'automatic_fallback_allowed')::boolean,true) is not false then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_AUTOMATIC_FALLBACK_FORBIDDEN'; end if;
  if v_metadata->>'intelligence_lane' <> p_execution_lane then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_LANE_MISMATCH'; end if;
  if v_metadata->>'reason_code' <> p_reason_code then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REASON_MISMATCH'; end if;
  if v_approval.maximum_calls <> 1 or v_approval.used_calls <> 0 then raise exception 'INTELLIGENCE_MODAL_OVERFLOW_ONE_JOB_APPROVAL_REQUIRED'; end if;
  if v_approval.maximum_supplier_cost_thb is null or v_requested > v_approval.maximum_supplier_cost_thb then
    raise exception 'MODAL_COMPUTE_APPROVAL_COST_LIMIT_EXCEEDED';
  end if;

  insert into public.intelligence_modal_overflow_executions (
    organization_id, approval_id, usage_id, capability, execution_lane, reason_code,
    infrastructure_provider, requested_supplier_cost_thb, status, metadata
  ) values (
    p_organization_id, p_approval_id, trim(p_usage_id), p_capability, p_execution_lane, p_reason_code,
    p_infrastructure_provider, v_requested, 'RESERVED',
    jsonb_build_object(
      'approval_expiry', v_approval.expires_at,
      'request_fingerprint', p_request_fingerprint,
      'local_first_required', true,
      'automatic_fallback_allowed', false,
      'one_paid_job_only', true,
      'local_capacity_checked', coalesce(p_local_capacity_checked,false),
      'local_attempted', coalesce(p_local_attempted,false),
      'local_failure_code', nullif(trim(coalesce(p_local_failure_code,'')),''),
      'local_assessment_reference', nullif(trim(coalesce(p_local_assessment_reference,'')),'')
    )
  ) returning * into v_execution;

  update public.modal_compute_approvals
  set used_calls = 1,
      used_supplier_cost_thb = v_requested,
      status = 'EXHAUSTED',
      updated_at = now()
  where id = v_approval.id;

  update public.intelligence_modal_overflow_proposals
  set status='CONSUMED', updated_at=now()
  where id=(v_metadata->>'proposal_id')::uuid
    and organization_id=p_organization_id
    and approval_id=v_approval.id
    and status='APPROVED';
  if not found then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_CONSUMPTION_BINDING_FAILED';
  end if;

  return jsonb_build_object(
    'execution_claim_id', v_execution.id,
    'approval_id', v_execution.approval_id,
    'organization_id', v_execution.organization_id,
    'usage_id', v_execution.usage_id,
    'request_fingerprint', p_request_fingerprint,
    'capability', v_execution.capability,
    'execution_lane', v_execution.execution_lane,
    'reason_code', v_execution.reason_code,
    'requested_supplier_cost_thb', v_execution.requested_supplier_cost_thb,
    'status', v_execution.status
  );
exception
  when unique_violation then
    raise exception 'INTELLIGENCE_MODAL_OVERFLOW_EXECUTION_ALREADY_CLAIMED';
end;
$function$;

revoke all on function public.claim_intelligence_modal_overflow_execution(uuid,uuid,text,text,text,text,text,text,numeric,boolean,boolean,text,text) from public, anon, authenticated;
grant execute on function public.claim_intelligence_modal_overflow_execution(uuid,uuid,text,text,text,text,text,text,numeric,boolean,boolean,text,text) to service_role;
