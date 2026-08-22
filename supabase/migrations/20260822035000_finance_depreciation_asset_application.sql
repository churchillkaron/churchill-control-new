-- Retry-safe per-asset depreciation application.
-- Ledger posting remains the canonical finance entry; this SECURITY INVOKER
-- helper updates the fixed-asset subledger exactly once for each run/asset.

CREATE OR REPLACE FUNCTION public.apply_finance_depreciation_asset(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_run_id uuid,
  p_fixed_asset_id uuid,
  p_depreciation_date date,
  p_amount numeric,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_entry_id uuid;
  v_accumulated numeric;
  v_book_value numeric;
BEGIN
  IF p_organization_id IS NULL OR p_entity_id IS NULL OR p_run_id IS NULL
     OR p_fixed_asset_id IS NULL OR p_depreciation_date IS NULL THEN
    RAISE EXCEPTION 'Depreciation scope, run, asset and date are required';
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Depreciation amount must be greater than zero';
  END IF;

  IF NULLIF(BTRIM(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Depreciation idempotency key is required';
  END IF;

  SELECT id
    INTO v_existing_id
  FROM public.depreciation_entries
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  UPDATE public.fixed_assets
  SET
    accumulated_depreciation = LEAST(
      GREATEST(COALESCE(purchase_cost, 0) - COALESCE(salvage_value, 0), 0),
      COALESCE(accumulated_depreciation, 0) + p_amount
    ),
    current_book_value = GREATEST(
      COALESCE(salvage_value, 0),
      COALESCE(current_book_value, purchase_cost, 0) - p_amount
    ),
    updated_at = now()
  WHERE id = p_fixed_asset_id
    AND organization_id = p_organization_id
    AND entity_id = p_entity_id
  RETURNING accumulated_depreciation, current_book_value
  INTO v_accumulated, v_book_value;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixed asset not found in depreciation scope';
  END IF;

  INSERT INTO public.depreciation_entries (
    organization_id,
    entity_id,
    period_id,
    fixed_asset_id,
    depreciation_date,
    depreciation_amount,
    accumulated_depreciation,
    remaining_book_value,
    idempotency_key
  )
  VALUES (
    p_organization_id,
    p_entity_id,
    p_period_id,
    p_fixed_asset_id,
    p_depreciation_date,
    p_amount,
    v_accumulated,
    v_book_value,
    p_idempotency_key
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_finance_depreciation_asset(uuid, uuid, uuid, uuid, uuid, date, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_finance_depreciation_asset(uuid, uuid, uuid, uuid, uuid, date, numeric, text)
  TO service_role;
