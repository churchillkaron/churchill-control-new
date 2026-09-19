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
  maximum_supplier_cost_thb numeric(18,6),
  used_supplier_cost_thb numeric(18,6) not null default 0,
  approved_by uuid,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_modal_compute_approvals_org_status
  on public.modal_compute_approvals (organization_id,status,expires_at desc);

alter table public.modal_compute_approvals enable row level security;
revoke all on table public.modal_compute_approvals from public, anon, authenticated;
grant select, insert, update on table public.modal_compute_approvals to service_role;

create or replace function public.consume_modal_compute_approval(
  p_organization_id uuid,
  p_approval_id uuid,
  p_capability text,
  p_requested_supplier_cost_thb numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.modal_compute_approvals%rowtype;
  v_requested numeric := greatest(coalesce(p_requested_supplier_cost_thb,0),0);
  v_next_calls integer;
  v_next_cost numeric;
begin
  select * into v_row
  from public.modal_compute_approvals
  where id = p_approval_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'MODAL_COMPUTE_APPROVAL_NOT_FOUND';
  end if;

  if v_row.status <> 'APPROVED' then
    raise exception 'MODAL_COMPUTE_APPROVAL_NOT_ACTIVE:%', v_row.status;
  end if;

  if v_row.expires_at <= now() then
    update public.modal_compute_approvals
      set status='EXPIRED',updated_at=now()
      where id=v_row.id;
    raise exception 'MODAL_COMPUTE_APPROVAL_EXPIRED';
  end if;

  if v_row.capability <> '*' and v_row.capability <> p_capability then
    raise exception 'MODAL_COMPUTE_APPROVAL_CAPABILITY_MISMATCH';
  end if;

  v_next_calls := v_row.used_calls + 1;
  if v_next_calls > v_row.maximum_calls then
    update public.modal_compute_approvals
      set status='EXHAUSTED',updated_at=now()
      where id=v_row.id;
    raise exception 'MODAL_COMPUTE_APPROVAL_CALL_LIMIT_EXCEEDED';
  end if;

  v_next_cost := v_row.used_supplier_cost_thb + v_requested;
  if v_row.maximum_supplier_cost_thb is not null
     and v_next_cost > v_row.maximum_supplier_cost_thb then
    raise exception 'MODAL_COMPUTE_APPROVAL_COST_LIMIT_EXCEEDED';
  end if;

  update public.modal_compute_approvals
    set used_calls=v_next_calls,
        used_supplier_cost_thb=v_next_cost,
        status=case when v_next_calls >= maximum_calls then 'EXHAUSTED' else status end,
        updated_at=now()
    where id=v_row.id
    returning * into v_row;

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
$$;

revoke all on function public.consume_modal_compute_approval(uuid,uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.consume_modal_compute_approval(uuid,uuid,text,numeric) to service_role;
