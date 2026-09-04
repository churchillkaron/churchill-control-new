BEGIN;

CREATE OR REPLACE FUNCTION public.creative_apply_guarded_shot_set_revision_atomic(
  p_organization_id uuid,
  p_creative_project_id uuid,
  p_plan_fingerprint text,
  p_instruction text,
  p_revision_scope text[],
  p_changes jsonb,
  p_preserved_guards jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_guard jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_unique_count integer := 0;
  v_count integer := 0;
  v_shot public.creative_shots%ROWTYPE;
  v_expected_revision integer;
  v_current_revision integer;
  v_expected_updated_at timestamptz;
  v_result jsonb;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id required'; END IF;
  IF p_creative_project_id IS NULL THEN RAISE EXCEPTION 'creative_project_id required'; END IF;
  IF p_preserved_guards IS NULL OR jsonb_typeof(p_preserved_guards) <> 'array' THEN
    RAISE EXCEPTION 'preserved_guards must be a JSON array';
  END IF;
  IF jsonb_array_length(p_preserved_guards) > 50 THEN
    RAISE EXCEPTION 'preserved_guards must contain at most 50 shots';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_creative_project_id::text,
      0
    )
  );

  IF jsonb_array_length(p_preserved_guards) > 0 THEN
    SELECT
      array_agg((item->>'shot_id')::uuid ORDER BY (item->>'shot_id')::uuid),
      count(DISTINCT item->>'shot_id')
    INTO v_ids, v_unique_count
    FROM jsonb_array_elements(p_preserved_guards) AS source(item);

    IF v_ids IS NULL
       OR cardinality(v_ids) <> jsonb_array_length(p_preserved_guards)
       OR v_unique_count <> jsonb_array_length(p_preserved_guards)
    THEN
      RAISE EXCEPTION 'preserved shot_ids must be present, valid and unique';
    END IF;

    PERFORM 1
    FROM public.creative_shots AS shot
    WHERE shot.organization_id = p_organization_id
      AND shot.creative_project_id = p_creative_project_id
      AND shot.archived_at IS NULL
      AND shot.id = ANY(v_ids)
    ORDER BY shot.id
    FOR UPDATE;

    SELECT count(*) INTO v_count
    FROM public.creative_shots AS shot
    WHERE shot.organization_id = p_organization_id
      AND shot.creative_project_id = p_creative_project_id
      AND shot.archived_at IS NULL
      AND shot.id = ANY(v_ids);

    IF v_count <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'CREATIVE_ATOMIC_PRESERVED_SHOT_MISSING';
    END IF;

    FOR v_guard IN SELECT value FROM jsonb_array_elements(p_preserved_guards)
    LOOP
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_guard) AS keys(key)
        WHERE key NOT IN ('shot_id','expected_revision_number','expected_updated_at')
      ) THEN
        RAISE EXCEPTION 'unsupported preserved guard field';
      END IF;

      SELECT * INTO v_shot
      FROM public.creative_shots
      WHERE id = (v_guard->>'shot_id')::uuid
        AND organization_id = p_organization_id
        AND creative_project_id = p_creative_project_id
        AND archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CREATIVE_ATOMIC_PRESERVED_SHOT_MISSING';
      END IF;

      v_current_revision := COALESCE(NULLIF(v_shot.metadata->>'revision_number','')::integer, 0);
      v_expected_revision := NULLIF(v_guard->>'expected_revision_number','')::integer;
      IF v_expected_revision IS NULL OR v_current_revision <> v_expected_revision THEN
        RAISE EXCEPTION 'CREATIVE_ATOMIC_PRESERVED_SHOT_STALE_REVISION:%', v_shot.id;
      END IF;

      v_expected_updated_at := NULLIF(v_guard->>'expected_updated_at','')::timestamptz;
      IF v_expected_updated_at IS NULL OR v_shot.updated_at IS DISTINCT FROM v_expected_updated_at THEN
        RAISE EXCEPTION 'CREATIVE_ATOMIC_PRESERVED_SHOT_STALE_UPDATED_AT:%', v_shot.id;
      END IF;
    END LOOP;
  END IF;

  v_result := public.creative_apply_shot_set_revision_atomic(
    p_organization_id,
    p_creative_project_id,
    p_plan_fingerprint,
    p_instruction,
    p_revision_scope,
    p_changes
  );

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'preserved_shot_count', jsonb_array_length(p_preserved_guards),
    'preserved_shots_guarded', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.creative_apply_guarded_shot_set_revision_atomic(uuid, uuid, text, text, text[], jsonb, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creative_apply_guarded_shot_set_revision_atomic(uuid, uuid, text, text, text[], jsonb, jsonb)
TO service_role;

COMMIT;
