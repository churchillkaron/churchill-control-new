begin;

create or replace function public.reconcile_creative_execution_step(
  p_step_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb,
  p_error jsonb default '{}'::jsonb,
  p_usage_ids jsonb default '[]'::jsonb,
  p_provider_call_count integer default 0
)
returns public.creative_execution_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_step public.creative_execution_steps;
  normalized_status text := upper(coalesce(trim(p_status), ''));
begin
  if normalized_status not in ('COMPLETED', 'AMBIGUOUS', 'FAILED') then
    raise exception 'CREATIVE_EXECUTION_STEP_RECONCILIATION_STATUS_INVALID';
  end if;

  update public.creative_execution_steps
  set
    status = normalized_status,
    result = coalesce(p_result, '{}'::jsonb),
    error = case
      when normalized_status = 'COMPLETED' then null
      else coalesce(p_error, '{}'::jsonb)
    end,
    usage_ids = coalesce(p_usage_ids, '[]'::jsonb),
    provider_call_count = greatest(0, coalesce(p_provider_call_count, 0)),
    completed_at = case
      when normalized_status in ('COMPLETED', 'AMBIGUOUS') then now()
      else completed_at
    end,
    lease_token = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_step_id
    and status in ('RUNNING', 'AMBIGUOUS', 'FAILED')
  returning * into updated_step;

  if not found then
    select * into updated_step
    from public.creative_execution_steps
    where id = p_step_id
      and status = normalized_status;
  end if;

  if not found then
    raise exception 'CREATIVE_EXECUTION_STEP_RECONCILIATION_REJECTED';
  end if;

  return updated_step;
end;
$$;

revoke all on function public.reconcile_creative_execution_step(uuid, text, jsonb, jsonb, jsonb, integer) from public;
grant execute on function public.reconcile_creative_execution_step(uuid, text, jsonb, jsonb, jsonb, integer) to service_role;

notify pgrst, 'reload schema';

commit;
