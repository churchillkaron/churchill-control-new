create table if not exists public.modal_compute_cost_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_id uuid null references public.modal_compute_approvals(id) on delete set null,
  usage_id uuid not null unique,
  infrastructure_provider text not null,
  gpu text null,
  elapsed_seconds numeric(18,6) not null check (elapsed_seconds >= 0),
  gpu_rate_usd_per_second numeric(18,9) not null check (gpu_rate_usd_per_second >= 0),
  supplier_cost_usd numeric(18,9) not null check (supplier_cost_usd >= 0),
  fx_rate numeric(18,10) not null check (fx_rate > 0),
  fx_rate_id uuid null references public.finance_exchange_rates(id) on delete set null,
  settlement_currency text not null,
  supplier_cost_settlement_currency numeric(18,6) not null check (supplier_cost_settlement_currency >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.modal_compute_cost_settlements enable row level security;
revoke all on public.modal_compute_cost_settlements from anon, authenticated;

create or replace function public.settle_modal_compute_actual_cost(
  p_organization_id uuid,
  p_approval_id uuid,
  p_usage_id uuid,
  p_infrastructure_provider text,
  p_gpu text,
  p_elapsed_seconds numeric,
  p_gpu_rate_usd_per_second numeric,
  p_supplier_cost_usd numeric,
  p_fx_rate numeric,
  p_fx_rate_id uuid,
  p_settlement_currency text,
  p_supplier_cost_settlement_currency numeric,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_inserted public.modal_compute_cost_settlements%rowtype;
  v_existing public.modal_compute_cost_settlements%rowtype;
  v_approval public.modal_compute_approvals%rowtype;
  v_next_cost numeric;
  v_cap_exceeded boolean := false;
begin
  if p_organization_id is null or p_usage_id is null then
    raise exception 'MODAL_ACTUAL_COST_SCOPE_REQUIRED';
  end if;
  if coalesce(p_elapsed_seconds, -1) < 0
     or coalesce(p_gpu_rate_usd_per_second, -1) < 0
     or coalesce(p_supplier_cost_usd, -1) < 0
     or coalesce(p_fx_rate, 0) <= 0
     or coalesce(p_supplier_cost_settlement_currency, -1) < 0 then
    raise exception 'MODAL_ACTUAL_COST_VALUES_INVALID';
  end if;

  insert into public.modal_compute_cost_settlements (
    organization_id, approval_id, usage_id, infrastructure_provider, gpu,
    elapsed_seconds, gpu_rate_usd_per_second, supplier_cost_usd,
    fx_rate, fx_rate_id, settlement_currency, supplier_cost_settlement_currency, metadata
  ) values (
    p_organization_id, p_approval_id, p_usage_id, p_infrastructure_provider, p_gpu,
    p_elapsed_seconds, p_gpu_rate_usd_per_second, p_supplier_cost_usd,
    p_fx_rate, p_fx_rate_id, upper(p_settlement_currency), p_supplier_cost_settlement_currency,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (usage_id) do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_existing
    from public.modal_compute_cost_settlements
    where usage_id = p_usage_id;

    if v_existing.organization_id <> p_organization_id then
      raise exception 'MODAL_ACTUAL_COST_USAGE_SCOPE_MISMATCH';
    end if;

    return jsonb_build_object(
      'settled', true,
      'already_settled', true,
      'settlement_id', v_existing.id,
      'supplier_cost', v_existing.supplier_cost_settlement_currency,
      'currency', v_existing.settlement_currency
    );
  end if;

  if p_approval_id is not null then
    select * into v_approval
    from public.modal_compute_approvals
    where id = p_approval_id
      and organization_id = p_organization_id
    for update;

    if v_approval.id is null then
      raise exception 'MODAL_ACTUAL_COST_APPROVAL_NOT_FOUND';
    end if;

    v_next_cost := coalesce(v_approval.used_supplier_cost_thb, 0) + p_supplier_cost_settlement_currency;
    v_cap_exceeded := v_next_cost > v_approval.maximum_supplier_cost_thb + 0.000001;

    update public.modal_compute_approvals
    set used_supplier_cost_thb = v_next_cost,
        status = case when v_cap_exceeded then 'EXHAUSTED' else status end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'actual_supplier_cost_last_settled_at', now(),
          'actual_supplier_cost_basis', 'MODAL_GPU_ELAPSED_SECONDS',
          'supplier_cost_cap_exceeded', v_cap_exceeded,
          'supplier_cost_cap_overage_thb', greatest(0, v_next_cost - maximum_supplier_cost_thb)
        ),
        updated_at = now()
    where id = p_approval_id;
  end if;

  return jsonb_build_object(
    'settled', true,
    'already_settled', false,
    'settlement_id', v_inserted.id,
    'supplier_cost', v_inserted.supplier_cost_settlement_currency,
    'currency', v_inserted.settlement_currency,
    'approval_status', case
      when p_approval_id is null then null
      when v_cap_exceeded then 'EXHAUSTED'
      else v_approval.status
    end,
    'approval_used_supplier_cost_thb', v_next_cost,
    'supplier_cost_cap_exceeded', v_cap_exceeded
  );
end;
$$;

revoke all on function public.settle_modal_compute_actual_cost(
  uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,uuid,text,numeric,jsonb
) from public, anon, authenticated;
grant execute on function public.settle_modal_compute_actual_cost(
  uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,uuid,text,numeric,jsonb
) to service_role;
