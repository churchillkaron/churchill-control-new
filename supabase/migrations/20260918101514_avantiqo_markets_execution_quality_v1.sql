begin;

create or replace function public.market_apply_paper_fill_with_quality(
  p_organization_id uuid,
  p_order_id uuid,
  p_fill_quantity numeric,
  p_fill_price numeric,
  p_fee_amount numeric default 0,
  p_slippage_bps numeric default 0,
  p_snapshot_id uuid default null,
  p_execution_quality jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_fill_id uuid;
begin
  v_result := public.market_apply_paper_fill(
    p_organization_id,
    p_order_id,
    p_fill_quantity,
    p_fill_price,
    p_fee_amount,
    p_slippage_bps,
    p_snapshot_id
  );

  v_fill_id := nullif(v_result ->> 'fill_id', '')::uuid;
  if v_fill_id is not null then
    update public.market_paper_fills
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'execution_quality',
        coalesce(p_execution_quality, '{}'::jsonb)
      )
    where id = v_fill_id
      and organization_id = p_organization_id;
  end if;

  return v_result || jsonb_build_object(
    'execution_quality', coalesce(p_execution_quality, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) to service_role;

comment on function public.market_apply_paper_fill_with_quality(
  uuid, uuid, numeric, numeric, numeric, numeric, uuid, jsonb
) is
  'Atomically applies one PAPER fill slice and attaches execution-quality evidence to that exact simulated fill. No live broker authority is involved.';

commit;
